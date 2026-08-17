# -*- coding: utf-8 -*-
"""Административная панель (ТЗ п.10): пользователи, роли, справочники,
стандарты, госшаблоны, настройки OCR/AI, журналы, резервные копии."""
import json
import re
import sqlite3
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

import db
import permissions
from auth import get_current_user, hash_password, parse_extra_roles, require_permission
from books_api import DEFAULT_GRADES, DEFAULT_SUBJECTS
from permissions import PERM_LABELS, ROLES, STATUSES, DEFAULT_ROLE_PERMISSIONS, effective_permissions
from state_pages import get_state_pages

BACKUPS = db.DATA_DIR / "backups"
BACKUPS.mkdir(exist_ok=True)
IMG_DIR = Path(__file__).parent / "static" / "img"

router = APIRouter(prefix="/api/users", tags=["admin"])


def _check_target_role(actor: dict, role: str):
    if role not in ROLES:
        raise HTTPException(400, "Неизвестная роль")
    # админ не может создавать/менять админов и суперадминов — только суперадмин
    if role in ("admin", "superadmin") and actor["role"] != "superadmin":
        raise HTTPException(403, "Управлять администраторами может только суперадминистратор")


class UserCreate(BaseModel):
    login: str
    name: str
    password: str
    role: str
    extra_roles: list[str] | None = None
    email: str | None = None
    bio: str | None = None


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    extra_roles: list[str] | None = None
    active: bool | None = None
    password: str | None = None
    email: str | None = None
    bio: str | None = None


def _clean_extra_roles(actor: dict, extra: list, main_role: str) -> str:
    """Валидация списка дополнительных ролей -> JSON для хранения."""
    out = []
    for r in extra:
        if r == main_role or r in out:
            continue
        _check_target_role(actor, r)
        out.append(r)
    return json.dumps(out, ensure_ascii=False)


def _user_row_dict(r) -> dict:
    d = dict(r)
    extra = parse_extra_roles(r)
    d.pop("extra_roles", None)
    d["extra_roles"] = extra
    d["active"] = bool(d["active"])
    d["role_title"] = ROLES.get(d["role"], d["role"])
    d["roles"] = [{"code": x, "title": ROLES.get(x, x)} for x in [d["role"], *extra]]
    return d


@router.get("")
def list_users(user: dict = Depends(require_permission("admin.users"))):
    conn = db.connect()
    try:
        rows = conn.execute(
            "SELECT u.*, "
            " (SELECT COUNT(*) FROM book_members m WHERE m.user_id = u.id) AS books_count, "
            " (SELECT COUNT(*) FROM books b WHERE b.created_by = u.id) AS created_count, "
            " (SELECT MAX(a.created_at) FROM audit a WHERE a.user_id = u.id) AS last_action_at "
            "FROM users u ORDER BY u.id").fetchall()
        out = []
        for r in rows:
            d = _user_row_dict(r)
            d.pop("password_hash", None)
            out.append(d)
        return out
    finally:
        conn.close()


@router.post("")
def create_user(body: UserCreate, user: dict = Depends(require_permission("admin.users"))):
    login = body.login.strip().lower()
    if not login or not body.name.strip():
        raise HTTPException(400, "Укажите логин и имя")
    if len(body.password) < 6:
        raise HTTPException(400, "Пароль — минимум 6 символов")
    _check_target_role(user, body.role)
    conn = db.connect()
    try:
        if conn.execute("SELECT 1 FROM users WHERE login = ?", (login,)).fetchone():
            raise HTTPException(409, "Логин уже занят")
        extra_json = _clean_extra_roles(user, body.extra_roles or [], body.role)
        cur = conn.execute(
            "INSERT INTO users (login, name, password_hash, role, extra_roles, active, created_at, email, bio) "
            "VALUES (?,?,?,?,?,1,?,?,?)",
            (login, body.name.strip(), hash_password(body.password), body.role, extra_json, db.now(),
             (body.email or "").strip(), (body.bio or "").strip()),
        )
        conn.commit()
        db.add_audit(user["id"], "user", f"Создан пользователь {login} ({body.role})")
        return {"id": cur.lastrowid}
    finally:
        conn.close()


@router.put("/{user_id}")
def update_user(user_id: int, body: UserUpdate, user: dict = Depends(require_permission("admin.users"))):
    conn = db.connect()
    try:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Пользователь не найден")
        if row["role"] in ("admin", "superadmin") and user["role"] != "superadmin":
            raise HTTPException(403, "Управлять администраторами может только суперадминистратор")
        if row["role"] == "superadmin" and user_id != user["id"]:
            raise HTTPException(403, "Суперадминистратора нельзя изменить")
        if body.role is not None:
            _check_target_role(user, body.role)
            conn.execute("UPDATE users SET role = ? WHERE id = ?", (body.role, user_id))
        if body.extra_roles is not None:
            main_role = body.role if body.role is not None else row["role"]
            extra_json = _clean_extra_roles(user, body.extra_roles, main_role)
            conn.execute("UPDATE users SET extra_roles = ? WHERE id = ?", (extra_json, user_id))
        if body.name is not None:
            conn.execute("UPDATE users SET name = ? WHERE id = ?", (body.name.strip(), user_id))
        if body.email is not None:
            conn.execute("UPDATE users SET email = ? WHERE id = ?", (body.email.strip(), user_id))
        if body.bio is not None:
            conn.execute("UPDATE users SET bio = ? WHERE id = ?", (body.bio.strip(), user_id))
        if body.active is not None:
            if user_id == user["id"] and not body.active:
                raise HTTPException(400, "Нельзя отключить самого себя")
            conn.execute("UPDATE users SET active = ? WHERE id = ?", (int(body.active), user_id))
            if not body.active:
                conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        if body.password:
            if len(body.password) < 6:
                raise HTTPException(400, "Пароль — минимум 6 символов")
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                         (hash_password(body.password), user_id))
        conn.commit()
        db.add_audit(user["id"], "user", f"Изменён пользователь {row['login']}")
        return {"ok": True}
    finally:
        conn.close()


@router.get("/directory")
def directory(user: dict = Depends(require_permission("books.view"))):
    """Краткий справочник пользователей — для выбора участников книги."""
    conn = db.connect()
    try:
        rows = conn.execute(
            "SELECT id, name, login, role FROM users WHERE active = 1 ORDER BY name").fetchall()
        return [
            {**dict(r), "role_title": ROLES.get(r["role"], r["role"])} for r in rows
        ]
    finally:
        conn.close()


@router.get("/{user_id}/profile")
def user_profile(user_id: int, user: dict = Depends(require_permission("admin.users"))):
    """Страница пользователя: роли, книги, сводка и последние действия."""
    conn = db.connect()
    try:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Пользователь не найден")
        u = _user_row_dict(row)
        u.pop("password_hash", None)

        books = db.rows_to_dicts(conn.execute(
            "SELECT b.id, b.title, b.subject, b.grade, b.status, m.member_role, b.updated_at "
            "FROM book_members m JOIN books b ON b.id = m.book_id "
            "WHERE m.user_id = ? ORDER BY b.updated_at DESC", (user_id,)).fetchall())
        for b in books:
            b["status_title"] = STATUSES.get(b["status"], b["status"])

        created_count = conn.execute(
            "SELECT COUNT(*) c FROM books WHERE created_by = ?", (user_id,)).fetchone()["c"]

        audit_rows = db.rows_to_dicts(conn.execute(
            "SELECT action, details, created_at FROM audit WHERE user_id = ? "
            "ORDER BY id DESC LIMIT 15", (user_id,)).fetchall())
        hist_rows = db.rows_to_dicts(conn.execute(
            "SELECT h.action, h.details, h.created_at, b.title AS book_title "
            "FROM history h JOIN books b ON b.id = h.book_id "
            "WHERE h.user_id = ? ORDER BY h.id DESC LIMIT 15", (user_id,)).fetchall())
        # одно событие часто пишется и в history, и в audit — оставляем версию с книгой
        seen = {(h["details"], h["created_at"][:16]) for h in hist_rows}
        audit_rows = [a for a in audit_rows if (a["details"], a["created_at"][:16]) not in seen]
        activity = sorted(audit_rows + hist_rows, key=lambda x: x["created_at"], reverse=True)[:20]

        return {
            "user": u,
            "created_count": created_count,
            "member_count": len(books),
            "books": books,
            "activity": activity,
        }
    finally:
        conn.close()


# ======================================================================
# Системное администрирование
# ======================================================================
sys_router = APIRouter(prefix="/api/admin", tags=["admin-system"])


# ---------- Роли и права ----------

@sys_router.get("/roles")
def roles_matrix(user: dict = Depends(require_permission("admin.system"))):
    conn = db.connect()
    try:
        users_by_role: dict = {}
        for r in conn.execute("SELECT role, extra_roles FROM users WHERE active = 1").fetchall():
            for code in {r["role"], *parse_extra_roles(r)}:
                users_by_role[code] = users_by_role.get(code, 0) + 1
        last_activity = {
            r["role"]: r["m"]
            for r in conn.execute(
                "SELECT u.role, MAX(a.created_at) m FROM audit a "
                "JOIN users u ON u.id = a.user_id GROUP BY u.role").fetchall()
        }
    finally:
        conn.close()
    return {
        "perms": PERM_LABELS,
        "roles": {code: title for code, title in ROLES.items() if code != "superadmin"},
        "matrix": {
            code: sorted(effective_permissions(code))
            for code in ROLES if code != "superadmin"
        },
        "defaults": {
            code: sorted(p) for code, p in DEFAULT_ROLE_PERMISSIONS.items() if code != "superadmin"
        },
        "users": users_by_role,
        "last_activity": last_activity,
        "editable": user["role"] == "superadmin",
    }


class MatrixBody(BaseModel):
    matrix: dict


@sys_router.put("/roles")
def save_roles_matrix(body: MatrixBody, user: dict = Depends(get_current_user)):
    if user["role"] != "superadmin":
        raise HTTPException(403, "Права ролей меняет только суперадминистратор")
    permissions.save_overrides(body.matrix)
    db.add_audit(user["id"], "roles", "Изменена матрица прав ролей")
    return {"ok": True}


@sys_router.post("/roles/reset")
def reset_roles_matrix(user: dict = Depends(get_current_user)):
    if user["role"] != "superadmin":
        raise HTTPException(403, "Права ролей меняет только суперадминистратор")
    db.set_setting("role_permissions", {})
    permissions.load_overrides()
    db.add_audit(user["id"], "roles", "Матрица прав сброшена к стандартной")
    return {"ok": True}


# ---------- Справочники: предметы и классы ----------

@sys_router.get("/dictionaries")
def get_dictionaries(user: dict = Depends(require_permission("books.view"))):
    return {
        "subjects": db.get_setting("subjects", DEFAULT_SUBJECTS),
        "grades": db.get_setting("grades", DEFAULT_GRADES),
    }


class DictBody(BaseModel):
    subjects: list[str]
    grades: list[str]


@sys_router.put("/dictionaries")
def save_dictionaries(body: DictBody, user: dict = Depends(require_permission("admin.system"))):
    subjects = [s.strip() for s in body.subjects if s.strip()]
    grades = [g.strip() for g in body.grades if g.strip()]
    if not subjects or not grades:
        raise HTTPException(400, "Списки предметов и классов не могут быть пустыми")
    db.set_setting("subjects", subjects)
    db.set_setting("grades", grades)
    db.add_audit(user["id"], "dict", f"Справочники: {len(subjects)} предметов, {len(grades)} классов")
    return {"ok": True}


# ---------- Образовательные стандарты ----------

class StandardBody(BaseModel):
    title: str
    subject: str = ""
    grade: str = ""
    url: str = ""
    text: str = ""


@sys_router.get("/standards")
def list_standards(user: dict = Depends(require_permission("books.view"))):
    conn = db.connect()
    try:
        rows = conn.execute(
            "SELECT id, title, subject, grade, url, length(text) AS text_len, created_at "
            "FROM standards ORDER BY subject, id").fetchall()
        return db.rows_to_dicts(rows)
    finally:
        conn.close()


@sys_router.get("/standards/{std_id}")
def get_standard(std_id: int, user: dict = Depends(require_permission("books.view"))):
    conn = db.connect()
    try:
        row = conn.execute("SELECT * FROM standards WHERE id = ?", (std_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Стандарт не найден")
        return dict(row)
    finally:
        conn.close()


@sys_router.post("/standards")
def create_standard(body: StandardBody, user: dict = Depends(require_permission("admin.system"))):
    if not body.title.strip():
        raise HTTPException(400, "Укажите название стандарта")
    conn = db.connect()
    try:
        cur = conn.execute(
            "INSERT INTO standards (title, subject, grade, url, text, created_at) VALUES (?,?,?,?,?,?)",
            (body.title.strip(), body.subject, body.grade, body.url, body.text, db.now()),
        )
        conn.commit()
        db.add_audit(user["id"], "standard", f"Добавлен стандарт «{body.title.strip()}»")
        return {"id": cur.lastrowid}
    finally:
        conn.close()


@sys_router.put("/standards/{std_id}")
def update_standard(std_id: int, body: StandardBody, user: dict = Depends(require_permission("admin.system"))):
    conn = db.connect()
    try:
        if not conn.execute("SELECT 1 FROM standards WHERE id = ?", (std_id,)).fetchone():
            raise HTTPException(404, "Стандарт не найден")
        conn.execute(
            "UPDATE standards SET title=?, subject=?, grade=?, url=?, text=? WHERE id=?",
            (body.title.strip(), body.subject, body.grade, body.url, body.text, std_id),
        )
        conn.commit()
        db.add_audit(user["id"], "standard", f"Изменён стандарт «{body.title.strip()}»")
        return {"ok": True}
    finally:
        conn.close()


@sys_router.delete("/standards/{std_id}")
def delete_standard(std_id: int, user: dict = Depends(require_permission("admin.system"))):
    conn = db.connect()
    try:
        conn.execute("DELETE FROM standards WHERE id = ?", (std_id,))
        conn.commit()
        db.add_audit(user["id"], "standard", f"Удалён стандарт #{std_id}")
        return {"ok": True}
    finally:
        conn.close()


# ---------- Государственные шаблоны ----------

@sys_router.get("/state-templates")
def get_state_templates(user: dict = Depends(require_permission("admin.system"))):
    return get_state_pages()


class StateTemplatesBody(BaseModel):
    pages: dict


@sys_router.put("/state-templates")
def save_state_templates(body: StateTemplatesBody, user: dict = Depends(require_permission("admin.system"))):
    allowed = {
        "anthem": {"title", "title_ru", "music", "lyrics", "text_kg", "text_ru"},
        "gerb": {"title", "title_ru"},
        "flag": {"title", "title_ru"},
    }
    clean = {}
    for key, patch in (body.pages or {}).items():
        if key in allowed and isinstance(patch, dict):
            clean[key] = {k: str(v) for k, v in patch.items() if k in allowed[key]}
    current = db.get_setting("state_pages", {}) or {}
    for key, patch in clean.items():
        current.setdefault(key, {}).update(patch)
    db.set_setting("state_pages", current)
    db.add_audit(user["id"], "state", "Изменены государственные шаблоны")
    return get_state_pages()


@sys_router.post("/state-templates/image/{kind}")
async def upload_state_image(kind: str, file: UploadFile = File(...),
                             user: dict = Depends(require_permission("admin.system"))):
    if kind not in ("flag", "gerb"):
        raise HTTPException(400, "kind: flag или gerb")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in (".svg", ".png", ".jpg", ".jpeg", ".webp"):
        raise HTTPException(415, "Допустимы SVG, PNG, JPG, WEBP")
    data = await file.read()
    if not data or len(data) > 5 * 1024 * 1024:
        raise HTTPException(413, "Файл пустой или больше 5 МБ")
    fname = f"custom-{kind}{ext}"
    (IMG_DIR / fname).write_bytes(data)
    current = db.get_setting("state_pages", {}) or {}
    current.setdefault(kind, {})["image"] = f"/static/img/{fname}?v={int(time.time())}"
    db.set_setting("state_pages", current)
    db.add_audit(user["id"], "state", f"Загружено изображение: {kind} ({file.filename})")
    return {"image": current[kind]["image"]}


# ---------- Настройки OCR и AI ----------

@sys_router.get("/settings")
def get_system_settings(user: dict = Depends(require_permission("admin.system"))):
    import os

    from ai_api import MODEL_PRICES, ai_settings, ocr_settings
    ai = ai_settings()
    key = os.environ.get("ANTHROPIC_API_KEY") or ai["api_key"]
    return {
        "ocr": ocr_settings(),
        "ai": {
            "model": ai["model"],
            "max_chars": ai["max_chars"],
            "use_standards": ai["use_standards"],
            "models": {m: {"in": p[0], "out": p[1]} for m, p in MODEL_PRICES.items()},
            "key_set": bool(key),
            "key_source": "env" if os.environ.get("ANTHROPIC_API_KEY") else ("db" if ai["api_key"] else ""),
            "key_masked": ("…" + key[-4:]) if key else "",
        },
    }


class SettingsBody(BaseModel):
    ocr: dict | None = None
    ai: dict | None = None


@sys_router.put("/settings")
def save_system_settings(body: SettingsBody, user: dict = Depends(require_permission("admin.system"))):
    from ai_api import MODEL_PRICES, OCR_LANG_CODES
    if body.ocr is not None:
        langs = [x for x in body.ocr.get("langs", []) if x in OCR_LANG_CODES]
        if not langs:
            raise HTTPException(400, "Выберите хотя бы один язык OCR")
        max_pages = max(1, min(1000, int(body.ocr.get("max_pages", 200))))
        db.set_setting("ocr", {"langs": langs, "max_pages": max_pages})
    if body.ai is not None:
        cur = db.get_setting("ai", {}) or {}
        model = body.ai.get("model", cur.get("model", ""))
        if model and model not in MODEL_PRICES:
            raise HTTPException(400, "Неизвестная модель")
        cur["model"] = model
        cur["max_chars"] = max(10_000, min(400_000, int(body.ai.get("max_chars", cur.get("max_chars", 120_000)))))
        cur["use_standards"] = bool(body.ai.get("use_standards", cur.get("use_standards", True)))
        new_key = body.ai.get("api_key")
        if new_key is not None and new_key != "":
            if not new_key.strip().startswith("sk-or-"):
                raise HTTPException(400, "Нужен ключ OpenRouter (sk-or-…) — система работает только через OpenRouter")
            cur["api_key"] = new_key.strip()
        if body.ai.get("clear_key"):
            cur["api_key"] = ""
        db.set_setting("ai", cur)
    db.add_audit(user["id"], "settings", "Изменены настройки OCR/AI")
    return {"ok": True}


# ---------- Журналы ----------

@sys_router.get("/logs")
def action_logs(user: dict = Depends(require_permission("admin.system"))):
    conn = db.connect()
    try:
        rows = conn.execute(
            "SELECT a.action, a.details, a.created_at, u.name AS user_name "
            "FROM audit a LEFT JOIN users u ON u.id = a.user_id "
            "ORDER BY a.id DESC LIMIT 300").fetchall()
        return db.rows_to_dicts(rows)
    finally:
        conn.close()


@sys_router.get("/history")
def global_history(user: dict = Depends(require_permission("admin.system"))):
    conn = db.connect()
    try:
        rows = conn.execute(
            "SELECT h.action, h.details, h.created_at, u.name AS user_name, b.title AS book_title "
            "FROM history h LEFT JOIN users u ON u.id = h.user_id "
            "JOIN books b ON b.id = h.book_id "
            "ORDER BY h.id DESC LIMIT 300").fetchall()
        return db.rows_to_dicts(rows)
    finally:
        conn.close()


# ---------- Управление учебниками ----------

class ForceStatusBody(BaseModel):
    status: str
    comment: str = ""


@sys_router.put("/books/{book_id}/status")
def force_book_status(book_id: int, body: ForceStatusBody,
                      user: dict = Depends(require_permission("admin.system"))):
    if body.status not in STATUSES:
        raise HTTPException(400, "Неизвестный статус")
    conn = db.connect()
    try:
        book = conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
        if not book:
            raise HTTPException(404, "Учебник не найден")
        conn.execute("UPDATE books SET status = ?, updated_at = ? WHERE id = ?",
                     (body.status, db.now(), book_id))
        db.add_history(conn, book_id, user["id"], "status",
                       f"Статус изменён администратором: {STATUSES.get(book['status'])} → "
                       f"{STATUSES.get(body.status)}. {body.comment}".strip())
        conn.commit()
        db.add_audit(user["id"], "book", f"Статус «{book['title']}» → {STATUSES.get(body.status)}")
        return {"ok": True}
    finally:
        conn.close()


# ---------- Резервное копирование ----------

def _safe_backup_name(name: str) -> str:
    if not re.fullmatch(r"kitep-\d{8}-\d{6}\.db", name):
        raise HTTPException(400, "Некорректное имя копии")
    return name


@sys_router.get("/backups")
def list_backups(user: dict = Depends(require_permission("admin.system"))):
    items = []
    for f in sorted(BACKUPS.glob("kitep-*.db"), reverse=True):
        items.append({"name": f.name, "size": f.stat().st_size,
                      "created_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(f.stat().st_mtime))})
    return items


@sys_router.post("/backups")
def create_backup(user: dict = Depends(require_permission("admin.system"))):
    name = f"kitep-{time.strftime('%Y%m%d-%H%M%S')}.db"
    src = db.connect()
    try:
        dst = sqlite3.connect(BACKUPS / name)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    db.add_audit(user["id"], "backup", f"Создана резервная копия {name}")
    return {"name": name}


@sys_router.get("/backups/{name}/download")
def download_backup(name: str, user: dict = Depends(require_permission("admin.system"))):
    name = _safe_backup_name(name)
    path = BACKUPS / name
    if not path.exists():
        raise HTTPException(404, "Копия не найдена")
    return FileResponse(path, filename=name, media_type="application/octet-stream")


@sys_router.post("/backups/{name}/restore")
def restore_backup(name: str, user: dict = Depends(get_current_user)):
    if user["role"] != "superadmin":
        raise HTTPException(403, "Восстановление из копии — только суперадминистратор")
    name = _safe_backup_name(name)
    path = BACKUPS / name
    if not path.exists():
        raise HTTPException(404, "Копия не найдена")
    src = sqlite3.connect(path)
    try:
        dst = db.connect()
        try:
            src.backup(dst)
            dst.commit()
        finally:
            dst.close()
    finally:
        src.close()
    permissions.load_overrides()
    db.add_audit(user["id"], "backup", f"База восстановлена из копии {name}")
    return {"ok": True}


@sys_router.delete("/backups/{name}")
def delete_backup(name: str, user: dict = Depends(require_permission("admin.system"))):
    name = _safe_backup_name(name)
    (BACKUPS / name).unlink(missing_ok=True)
    db.add_audit(user["id"], "backup", f"Удалена резервная копия {name}")
    return {"ok": True}
