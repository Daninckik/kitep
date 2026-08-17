# -*- coding: utf-8 -*-
"""Конструктор учебников: CRUD, структура, версии, комментарии, согласование."""
import html as html_mod
import json
import os
import re
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

import db
from auth import get_current_user, require_permission
from permissions import PIPELINE_BY_CODE, PIPELINE_STAGES, ROLES, STATUSES, WORKFLOW, user_can
from state_pages import get_state_pages

DEFAULT_SUBJECTS = [
    "Кыргызский язык", "Кыргызская литература", "Русский язык", "Русская литература",
    "Английский язык", "Математика", "Алгебра", "Геометрия", "Информатика",
    "Естествознание", "Физика", "Химия", "Биология", "География",
    "История", "Человек и общество", "Музыка", "ИЗО", "Технология", "Физическая культура",
    "Родиноведение", "Этика", "Допризывная подготовка",
]
DEFAULT_GRADES = [str(g) for g in range(1, 12)]

router = APIRouter(prefix="/api/books", tags=["books"])


def _sid() -> str:
    return uuid.uuid4().hex[:8]


def default_content(title: str, subject: str, grade: str, language: str) -> dict:
    """Структура по образцу государственных учебников КР (kitep.edu.kg)."""
    return {
        "titul": {
            "title": title, "subtitle": "", "subject": subject, "grade": grade,
            "language": language, "year": "", "publisher": "", "isbn": "", "grif": "",
        },
        "people": {"authors": [], "coauthors": [], "editors": [], "proofreaders": [], "reviewers": []},
        "statePages": {"anthem": True, "gerb": True, "flag": True},
        "annotation": "",
        # Обращение к ученикам и условные обозначения — как в госучебниках kitep.edu.kg
        "intro": "",
        "legend": [
            {"symbol": "Ты узнаешь", "meaning": "Цели параграфа — что ученик будет знать и уметь"},
            {"symbol": "Подумай", "meaning": "Вводный вопрос, жизненная ситуация — зачем это нужно"},
            {"symbol": "Пример", "meaning": "Разобранный пример с пошаговым решением"},
            {"symbol": "Запомни", "meaning": "Правило, определение, главный вывод"},
            {"symbol": "Задания", "meaning": "Практические задания (по уровням сложности)"},
            {"symbol": "Домашнее задание", "meaning": "Работа для самостоятельного выполнения"},
            {"symbol": "Вопросы", "meaning": "Контрольные вопросы для самопроверки"},
        ],
        "chapters": [{
            "id": _sid(), "title": "Глава 1",
            "sections": [{
                "id": _sid(), "kind": "paragraph", "title": "§ 1. Новый параграф",
                "goals": "", "motivation": "", "body": "", "examples": "", "summary": "",
                "tasks": "", "homework": "", "questions": "", "test": "",
            }],
        }],
        "glossary": [],
        "bibliography": [],
        "appendices": [],
        "qr": [],
    }


def _load_book(conn, book_id: int):
    row = conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Учебник не найден")
    return row


def _members(conn, book_id: int) -> list:
    return db.rows_to_dicts(conn.execute(
        "SELECT m.user_id, m.member_role, u.name, u.login, u.role AS system_role "
        "FROM book_members m JOIN users u ON u.id = m.user_id WHERE m.book_id = ?",
        (book_id,),
    ).fetchall())


def _can_edit(conn, book, user) -> bool:
    if user_can(user, "books.edit_any"):
        return True
    if not user_can(user, "books.edit"):
        return False
    if book["created_by"] == user["id"]:
        return True
    row = conn.execute(
        "SELECT 1 FROM book_members WHERE book_id = ? AND user_id = ?",
        (book["id"], user["id"]),
    ).fetchone()
    return row is not None


def _check_edit(conn, book, user):
    if not _can_edit(conn, book, user):
        raise HTTPException(403, "Вы не участник этого учебника")
    if book["status"] in ("approved", "published") and not user_can(user, "workflow.ministry"):
        raise HTTPException(409, "Учебник утверждён — редактирование заблокировано")


# Пока книга «редактируется», её видят только участники; на этапах согласования —
# ещё и эксперты своего этапа; готовые (гриф/публикация) — все.
_STAGE_PERM = {
    "editorial": "workflow.editorial", "methodist": "workflow.methodist",
    "lawyer": "workflow.lawyer", "reviewer": "workflow.reviewer",
    "ministry": "workflow.ministry",
}


def _can_see(conn, book, user) -> bool:
    if book["status"] in ("approved", "published"):
        return True
    if user_can(user, "books.edit_any"):
        return True
    perm = _STAGE_PERM.get(book["status"])
    if perm and user_can(user, perm):
        return True
    return _can_edit(conn, book, user)


# ---------- Справочники ----------

@router.get("/meta")
def meta(user: dict = Depends(get_current_user)):
    return {
        "roles": ROLES,
        "statuses": STATUSES,
        "workflow": {k: [{"to": t, "perm": p, "label": l} for t, p, l in v] for k, v in WORKFLOW.items()},
        "state_pages": get_state_pages(),
        "subjects": db.get_setting("subjects", DEFAULT_SUBJECTS),
        "grades": db.get_setting("grades", DEFAULT_GRADES),
    }


# ---------- CRUD ----------

class BookCreate(BaseModel):
    title: str
    subject: str = ""
    grade: str = ""
    language: str = "кыргызский"


@router.get("")
def list_books(user: dict = Depends(require_permission("books.view"))):
    conn = db.connect()
    try:
        rows = conn.execute(
            "SELECT b.*, u.name AS author_name, "
            " (SELECT COUNT(*) FROM versions v WHERE v.book_id = b.id) AS versions_count, "
            " (SELECT COUNT(*) FROM comments c WHERE c.book_id = b.id AND c.resolved = 0) AS open_comments "
            "FROM books b JOIN users u ON u.id = b.created_by ORDER BY b.updated_at DESC"
        ).fetchall()
        out = []
        for r in rows:
            if not _can_see(conn, r, user):
                continue  # чужая незавершённая книга — не показываем
            d = db.book_row_to_dict(r)
            d["status_title"] = STATUSES.get(d["status"], d["status"])
            d["can_edit"] = _can_edit(conn, r, user)
            out.append(d)
        return out
    finally:
        conn.close()


@router.post("")
def create_book(body: BookCreate, user: dict = Depends(require_permission("books.create"))):
    if not body.title.strip():
        raise HTTPException(400, "Укажите название учебника")
    content = default_content(body.title.strip(), body.subject, body.grade, body.language)
    conn = db.connect()
    try:
        cur = conn.execute(
            "INSERT INTO books (title, subject, grade, language, status, content, created_by, created_at, updated_at) "
            "VALUES (?,?,?,?, 'draft', ?, ?, ?, ?)",
            (body.title.strip(), body.subject, body.grade, body.language,
             json.dumps(content, ensure_ascii=False), user["id"], db.now(), db.now()),
        )
        book_id = cur.lastrowid
        conn.execute(
            "INSERT INTO book_members (book_id, user_id, member_role) VALUES (?,?,?)",
            (book_id, user["id"], "Автор"),
        )
        db.add_history(conn, book_id, user["id"], "create", f"Создан учебник «{body.title.strip()}»")
        conn.commit()
        db.add_audit(user["id"], "book", f"Создан учебник «{body.title.strip()}»")
        return {"id": book_id}
    finally:
        conn.close()


@router.get("/{book_id}")
def get_book(book_id: int, user: dict = Depends(require_permission("books.view"))):
    conn = db.connect()
    try:
        row = _load_book(conn, book_id)
        if not _can_see(conn, row, user):
            raise HTTPException(403, "Учебник ещё редактируется — доступен только участникам")
        d = db.book_row_to_dict(row, with_content=True)
        d["status_title"] = STATUSES.get(d["status"], d["status"])
        d["pipeline"] = _pipeline_summary(conn, book_id)
        d["members"] = _members(conn, book_id)
        d["can_edit"] = _can_edit(conn, row, user)
        d["transitions"] = [
            {"to": t, "label": l, "to_title": STATUSES.get(t, t)}
            for t, p, l in WORKFLOW.get(d["status"], [])
            if user_can(user, p)
        ]
        return d
    finally:
        conn.close()


class ContentBody(BaseModel):
    content: dict
    title: str | None = None
    subject: str | None = None
    grade: str | None = None
    language: str | None = None


@router.put("/{book_id}/content")
def save_content(book_id: int, body: ContentBody, user: dict = Depends(get_current_user)):
    """Автосохранение: обновляет рабочее содержимое (без создания версии)."""
    conn = db.connect()
    try:
        book = _load_book(conn, book_id)
        _check_edit(conn, book, user)
        titul = body.content.get("titul", {})
        conn.execute(
            "UPDATE books SET content = ?, title = ?, subject = ?, grade = ?, language = ?, updated_at = ? "
            "WHERE id = ?",
            (json.dumps(body.content, ensure_ascii=False),
             body.title or titul.get("title") or book["title"],
             body.subject if body.subject is not None else titul.get("subject", book["subject"]),
             body.grade if body.grade is not None else titul.get("grade", book["grade"]),
             body.language if body.language is not None else titul.get("language", book["language"]),
             db.now(), book_id),
        )
        conn.commit()
        return {"ok": True, "saved_at": db.now()}
    finally:
        conn.close()


@router.delete("/{book_id}")
def delete_book(book_id: int, user: dict = Depends(require_permission("books.delete"))):
    conn = db.connect()
    try:
        book = _load_book(conn, book_id)
        conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
        conn.commit()
        _drop_cover_files(book_id)
        db.add_audit(user["id"], "book", f"Удалён учебник «{book['title']}»")
        return {"ok": True}
    finally:
        conn.close()


# ---------- Фото на обложке ----------
# Файл кладём в static/covers (том — переживает пересборку), URL — в books.cover_url.

_COVER_EXTS = (".jpg", ".jpeg", ".png", ".webp")


def _covers_dir():
    d = db.BASE / "static" / "covers"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _drop_cover_files(book_id: int):
    for old in _covers_dir().glob(f"book{book_id}-*"):
        try:
            old.unlink()
        except OSError:
            pass


@router.post("/{book_id}/cover")
async def upload_cover(book_id: int, file: UploadFile = File(...),
                       user: dict = Depends(get_current_user)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _COVER_EXTS:
        raise HTTPException(400, "Подойдёт JPG, PNG или WebP")
    raw = await file.read()
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(400, "Фото слишком большое (до 8 МБ)")
    conn = db.connect()
    try:
        book = _load_book(conn, book_id)
        _check_edit(conn, book, user)
        _drop_cover_files(book_id)
        name = f"book{book_id}-{uuid.uuid4().hex[:8]}{ext}"
        (_covers_dir() / name).write_bytes(raw)
        url = f"/static/covers/{name}"
        conn.execute("UPDATE books SET cover_url = ?, updated_at = ? WHERE id = ?",
                     (url, db.now(), book_id))
        db.add_history(conn, book_id, user["id"], "cover", "Загружено фото на обложку")
        conn.commit()
        return {"cover_url": url}
    finally:
        conn.close()


@router.post("/{book_id}/image")
async def upload_book_image(book_id: int, file: UploadFile = File(...),
                            user: dict = Depends(get_current_user)):
    """Иллюстрация для текста книги — вставляется в параграф из редактора."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _COVER_EXTS:
        raise HTTPException(400, "Подойдёт JPG, PNG или WebP")
    raw = await file.read()
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(400, "Картинка слишком большая (до 8 МБ)")
    conn = db.connect()
    try:
        book = _load_book(conn, book_id)
        _check_edit(conn, book, user)
        d = db.BASE / "static" / "img" / "books"
        d.mkdir(parents=True, exist_ok=True)
        name = f"bk{book_id}-{uuid.uuid4().hex[:8]}{ext}"
        (d / name).write_bytes(raw)
        db.add_history(conn, book_id, user["id"], "edit", "Добавлена иллюстрация в текст книги")
        conn.commit()
        return {"url": f"/static/img/books/{name}"}
    finally:
        conn.close()


@router.delete("/{book_id}/cover")
def delete_cover(book_id: int, user: dict = Depends(get_current_user)):
    conn = db.connect()
    try:
        book = _load_book(conn, book_id)
        _check_edit(conn, book, user)
        _drop_cover_files(book_id)
        conn.execute("UPDATE books SET cover_url = '', updated_at = ? WHERE id = ?",
                     (db.now(), book_id))
        db.add_history(conn, book_id, user["id"], "cover", "Фото с обложки убрано")
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------- Версии ----------

class VersionBody(BaseModel):
    comment: str = ""


@router.get("/{book_id}/versions")
def list_versions(book_id: int, user: dict = Depends(require_permission("books.view"))):
    conn = db.connect()
    try:
        _load_book(conn, book_id)
        return db.rows_to_dicts(conn.execute(
            "SELECT v.id, v.number, v.comment, v.created_at, u.name AS author "
            "FROM versions v JOIN users u ON u.id = v.author_id "
            "WHERE v.book_id = ? ORDER BY v.number DESC", (book_id,),
        ).fetchall())
    finally:
        conn.close()


@router.post("/{book_id}/versions")
def create_version(book_id: int, body: VersionBody, user: dict = Depends(require_permission("books.versions"))):
    conn = db.connect()
    try:
        book = _load_book(conn, book_id)
        _check_edit(conn, book, user)
        num = conn.execute(
            "SELECT COALESCE(MAX(number), 0) + 1 n FROM versions WHERE book_id = ?", (book_id,)
        ).fetchone()["n"]
        conn.execute(
            "INSERT INTO versions (book_id, number, content, author_id, comment, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (book_id, num, book["content"], user["id"], body.comment, db.now()),
        )
        db.add_history(conn, book_id, user["id"], "version", f"Сохранена версия №{num}. {body.comment}".strip())
        conn.commit()
        return {"number": num}
    finally:
        conn.close()


@router.post("/{book_id}/versions/{number}/restore")
def restore_version(book_id: int, number: int, user: dict = Depends(require_permission("books.versions"))):
    conn = db.connect()
    try:
        book = _load_book(conn, book_id)
        _check_edit(conn, book, user)
        row = conn.execute(
            "SELECT content FROM versions WHERE book_id = ? AND number = ?", (book_id, number)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Версия не найдена")
        conn.execute("UPDATE books SET content = ?, updated_at = ? WHERE id = ?",
                     (row["content"], db.now(), book_id))
        db.add_history(conn, book_id, user["id"], "restore", f"Восстановлена версия №{number}")
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------- История и комментарии ----------

@router.get("/{book_id}/history")
def get_history(book_id: int, user: dict = Depends(require_permission("books.view"))):
    conn = db.connect()
    try:
        _load_book(conn, book_id)
        return db.rows_to_dicts(conn.execute(
            "SELECT h.action, h.details, h.created_at, u.name AS user_name "
            "FROM history h LEFT JOIN users u ON u.id = h.user_id "
            "WHERE h.book_id = ? ORDER BY h.id DESC LIMIT 200", (book_id,),
        ).fetchall())
    finally:
        conn.close()


class CommentBody(BaseModel):
    text: str
    section_id: str = ""


@router.get("/{book_id}/comments")
def list_comments(book_id: int, user: dict = Depends(require_permission("books.view"))):
    conn = db.connect()
    try:
        _load_book(conn, book_id)
        return db.rows_to_dicts(conn.execute(
            "SELECT c.id, c.section_id, c.text, c.resolved, c.created_at, u.name AS user_name, u.role "
            "FROM comments c JOIN users u ON u.id = c.user_id "
            "WHERE c.book_id = ? ORDER BY c.id DESC", (book_id,),
        ).fetchall())
    finally:
        conn.close()


@router.post("/{book_id}/comments")
def add_comment(book_id: int, body: CommentBody, user: dict = Depends(require_permission("books.comment"))):
    if not body.text.strip():
        raise HTTPException(400, "Пустой комментарий")
    conn = db.connect()
    try:
        _load_book(conn, book_id)
        conn.execute(
            "INSERT INTO comments (book_id, section_id, user_id, text, created_at) VALUES (?,?,?,?,?)",
            (book_id, body.section_id, user["id"], body.text.strip(), db.now()),
        )
        db.add_history(conn, book_id, user["id"], "comment", body.text.strip()[:120])
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.post("/{book_id}/comments/{comment_id}/resolve")
def resolve_comment(book_id: int, comment_id: int, user: dict = Depends(require_permission("books.comment"))):
    conn = db.connect()
    try:
        conn.execute("UPDATE comments SET resolved = 1 WHERE id = ? AND book_id = ?", (comment_id, book_id))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------- Участники ----------

class MemberBody(BaseModel):
    user_id: int
    member_role: str  # Автор / Соавтор / Редактор / Корректор / Рецензент ...


@router.post("/{book_id}/members")
def add_member(book_id: int, body: MemberBody, user: dict = Depends(require_permission("books.members"))):
    conn = db.connect()
    try:
        book = _load_book(conn, book_id)
        _check_edit(conn, book, user)
        if not conn.execute("SELECT 1 FROM users WHERE id = ?", (body.user_id,)).fetchone():
            raise HTTPException(404, "Пользователь не найден")
        conn.execute(
            "INSERT OR REPLACE INTO book_members (book_id, user_id, member_role) VALUES (?,?,?)",
            (book_id, body.user_id, body.member_role),
        )
        db.add_history(conn, book_id, user["id"], "member", f"Добавлен участник ({body.member_role})")
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/{book_id}/members/{member_id}")
def remove_member(book_id: int, member_id: int, user: dict = Depends(require_permission("books.members"))):
    conn = db.connect()
    try:
        conn.execute("DELETE FROM book_members WHERE book_id = ? AND user_id = ?", (book_id, member_id))
        db.add_history(conn, book_id, user["id"], "member", "Участник удалён")
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------- Согласование ----------

class StatusBody(BaseModel):
    to: str
    comment: str = ""


@router.post("/{book_id}/status")
def change_status(book_id: int, body: StatusBody, user: dict = Depends(get_current_user)):
    conn = db.connect()
    try:
        book = _load_book(conn, book_id)
        allowed = WORKFLOW.get(book["status"], [])
        match = next((x for x in allowed if x[0] == body.to), None)
        if not match:
            raise HTTPException(400, f"Недопустимый переход из «{STATUSES.get(book['status'])}»")
        _, perm, label = match
        if not user_can(user, perm):
            raise HTTPException(403, "Ваша роль не участвует в этом этапе согласования")
        conn.execute("UPDATE books SET status = ?, updated_at = ? WHERE id = ?",
                     (body.to, db.now(), book_id))
        conn.execute(
            "INSERT INTO approvals (book_id, stage, user_id, decision, comment, created_at) VALUES (?,?,?,?,?,?)",
            (book_id, book["status"], user["id"], body.to, body.comment, db.now()),
        )
        db.add_history(conn, book_id, user["id"], "status",
                       f"{label}: {STATUSES.get(book['status'])} → {STATUSES.get(body.to)}. {body.comment}".strip())
        conn.commit()
        return {"status": body.to, "status_title": STATUSES.get(body.to)}
    finally:
        conn.close()


@router.get("/{book_id}/approvals")
def list_approvals(book_id: int, user: dict = Depends(require_permission("books.view"))):
    conn = db.connect()
    try:
        _load_book(conn, book_id)
        return db.rows_to_dicts(conn.execute(
            "SELECT a.stage, a.decision, a.comment, a.created_at, u.name AS user_name, u.role "
            "FROM approvals a JOIN users u ON u.id = a.user_id "
            "WHERE a.book_id = ? ORDER BY a.id DESC", (book_id,),
        ).fetchall())
    finally:
        conn.close()


# ---------- Редакционно-издательский конвейер ----------
# Реальный процесс (рукопись → редактирование → вёрстка → дизайн → корректура →
# худ. редакция → ОЭПК → печать/электронка) как последовательные этапы с ролями,
# сроками и чек-листами стандартов. Строки создаются лениво при первом запросе.

def _pipeline_rows(conn, book_id: int) -> dict:
    conn.executemany(
        "INSERT OR IGNORE INTO pipeline (book_id, stage) VALUES (?, ?)",
        [(book_id, s["code"]) for s in PIPELINE_STAGES],
    )
    conn.commit()
    return {
        r["stage"]: dict(r) for r in conn.execute(
            "SELECT * FROM pipeline WHERE book_id = ?", (book_id,)
        ).fetchall()
    }


def _stage_can_work(user: dict, stage: dict) -> bool:
    """Работать на этапе может носитель роли этапа (осн. или доп.) либо управляющий."""
    if user_can(user, "pipeline.manage"):
        return True
    if not user_can(user, "pipeline.work"):
        return False
    roles = {user.get("role")} | set(user.get("extra_roles") or [])
    return bool(roles & set(stage["roles"]))


def _pipeline_state(conn, book_id: int, user: dict) -> list:
    rows = _pipeline_rows(conn, book_id)
    today = db.now()[:10]
    out = []
    active_found = False
    for st in PIPELINE_STAGES:
        r = rows.get(st["code"], {})
        done = bool(r.get("done"))
        if done:
            status = "done"
        elif not active_found:
            status = "active"
            active_found = True
        else:
            status = "pending"
        checked = {}
        try:
            checked = json.loads(r.get("checklist") or "{}")
        except ValueError:
            pass
        due = r.get("due_date") or ""
        out.append({
            "code": st["code"], "title": st["title"], "desc": st["desc"],
            "roles": st["roles"],
            "role_titles": [ROLES.get(x, x) for x in st["roles"]],
            "status": status,
            "started_at": r.get("started_at") or "",
            "done_at": r.get("done_at") or "",
            "assignee_id": r.get("assignee_id"),
            "due_date": due,
            "overdue": bool(due) and status != "done" and due < today,
            "note": r.get("note") or "",
            "checklist": [
                {"i": i, "text": t, "done": bool(checked.get(str(i)))}
                for i, t in enumerate(st["checklist"])
            ],
            "can_work": _stage_can_work(user, st),
        })
    # имена исполнителей одним запросом
    ids = [s["assignee_id"] for s in out if s["assignee_id"]]
    names = {}
    if ids:
        q = ",".join("?" * len(ids))
        names = {r["id"]: r["name"] for r in conn.execute(
            f"SELECT id, name FROM users WHERE id IN ({q})", ids).fetchall()}
    for s in out:
        s["assignee_name"] = names.get(s["assignee_id"], "")
    return out


def _pipeline_summary(conn, book_id: int) -> dict:
    """Короткая сводка для шапки редактора: «Этап N из M»."""
    rows = _pipeline_rows(conn, book_id)
    total = len(PIPELINE_STAGES)
    done = sum(1 for s in PIPELINE_STAGES if rows.get(s["code"], {}).get("done"))
    cur = next((s for s in PIPELINE_STAGES if not rows.get(s["code"], {}).get("done")), None)
    today = db.now()[:10]
    due = (rows.get(cur["code"], {}).get("due_date") or "") if cur else ""
    return {
        "done": done, "total": total,
        "stage": cur["code"] if cur else "",
        "title": cur["title"] if cur else "Конвейер завершён",
        "index": done + 1 if cur else total,
        "overdue": bool(due) and due < today,
    }


@router.get("/{book_id}/pipeline")
def get_pipeline(book_id: int, user: dict = Depends(require_permission("books.view"))):
    conn = db.connect()
    try:
        book = _load_book(conn, book_id)
        if not _can_see(conn, book, user):
            raise HTTPException(403, "Учебник ещё редактируется — доступен только участникам")
        return {
            "stages": _pipeline_state(conn, book_id, user),
            "summary": _pipeline_summary(conn, book_id),
            "can_manage": user_can(user, "pipeline.manage"),
        }
    finally:
        conn.close()


class PipelineEdit(BaseModel):
    assignee_id: int | None = None
    due_date: str | None = None      # YYYY-MM-DD или ""
    checklist: dict | None = None    # {"0": true, ...}
    note: str | None = None


@router.put("/{book_id}/pipeline/{stage}")
def edit_pipeline_stage(book_id: int, stage: str, body: PipelineEdit,
                        user: dict = Depends(get_current_user)):
    st = PIPELINE_BY_CODE.get(stage)
    if not st:
        raise HTTPException(404, "Этап не найден")
    conn = db.connect()
    try:
        _load_book(conn, book_id)
        _pipeline_rows(conn, book_id)
        manage = user_can(user, "pipeline.manage")
        # исполнитель и срок — только управляющий; чек-лист и заметка — работающий на этапе
        if body.assignee_id is not None or body.due_date is not None:
            if not manage:
                raise HTTPException(403, "Назначать исполнителей и сроки может главный редактор или администратор")
        if (body.checklist is not None or body.note is not None) and not _stage_can_work(user, st):
            raise HTTPException(403, "Ваша роль не работает на этом этапе")
        sets, vals = [], []
        if body.assignee_id is not None:
            sets.append("assignee_id = ?")
            vals.append(body.assignee_id or None)
        if body.due_date is not None:
            if body.due_date and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", body.due_date):
                raise HTTPException(400, "Срок — в формате ГГГГ-ММ-ДД")
            sets.append("due_date = ?")
            vals.append(body.due_date)
        if body.checklist is not None:
            n = len(st["checklist"])
            clean = {str(k): bool(v) for k, v in body.checklist.items()
                     if str(k).isdigit() and int(k) < n}
            sets.append("checklist = ?")
            vals.append(json.dumps(clean))
        if body.note is not None:
            sets.append("note = ?")
            vals.append(body.note.strip()[:500])
        if sets:
            vals += [book_id, stage]
            conn.execute(f"UPDATE pipeline SET {', '.join(sets)} WHERE book_id = ? AND stage = ?", vals)
            conn.commit()
        return {"stages": _pipeline_state(conn, book_id, user),
                "summary": _pipeline_summary(conn, book_id), "can_manage": manage}
    finally:
        conn.close()


class PipelineAction(BaseModel):
    action: str  # start | done | reopen
    comment: str = ""


@router.post("/{book_id}/pipeline/{stage}/action")
def pipeline_action(book_id: int, stage: str, body: PipelineAction,
                    user: dict = Depends(get_current_user)):
    st = PIPELINE_BY_CODE.get(stage)
    if not st:
        raise HTTPException(404, "Этап не найден")
    conn = db.connect()
    try:
        _load_book(conn, book_id)
        rows = _pipeline_rows(conn, book_id)
        cur = next((s["code"] for s in PIPELINE_STAGES if not rows[s["code"]]["done"]), None)
        if body.action in ("start", "done"):
            if stage != cur:
                raise HTTPException(409, "Конвейер последовательный: сначала завершите предыдущий этап")
            if not _stage_can_work(user, st):
                raise HTTPException(403, "Ваша роль не работает на этом этапе")
        if body.action == "start":
            conn.execute("UPDATE pipeline SET started_at = ? WHERE book_id = ? AND stage = ? AND started_at = ''",
                         (db.now(), book_id, stage))
            db.add_history(conn, book_id, user["id"], "pipeline", f"Этап «{st['title']}» взят в работу")
        elif body.action == "done":
            try:
                checked = json.loads(rows[stage]["checklist"] or "{}")
            except ValueError:
                checked = {}
            missing = [t for i, t in enumerate(st["checklist"]) if not checked.get(str(i))]
            if missing:
                raise HTTPException(409, f"Чек-лист стандартов не закрыт: {missing[0]}")
            conn.execute(
                "UPDATE pipeline SET done = 1, done_at = ?, done_by = ?, "
                "started_at = CASE WHEN started_at = '' THEN ? ELSE started_at END "
                "WHERE book_id = ? AND stage = ?",
                (db.now(), user["id"], db.now(), book_id, stage))
            db.add_history(conn, book_id, user["id"], "pipeline",
                           f"Этап «{st['title']}» завершён. {body.comment}".strip())
        elif body.action == "reopen":
            if not user_can(user, "pipeline.manage"):
                raise HTTPException(403, "Возврат этапа — право главного редактора или администратора")
            # возвращаем этап и всё, что после него
            codes = [s["code"] for s in PIPELINE_STAGES]
            tail = codes[codes.index(stage):]
            q = ",".join("?" * len(tail))
            conn.execute(
                f"UPDATE pipeline SET done = 0, done_at = '', done_by = NULL "
                f"WHERE book_id = ? AND stage IN ({q})", [book_id] + tail)
            db.add_history(conn, book_id, user["id"], "pipeline",
                           f"Возврат на этап «{st['title']}». {body.comment}".strip())
        else:
            raise HTTPException(400, "Неизвестное действие")
        conn.commit()
        return {"stages": _pipeline_state(conn, book_id, user),
                "summary": _pipeline_summary(conn, book_id),
                "can_manage": user_can(user, "pipeline.manage")}
    finally:
        conn.close()


# ---------- Экспорт / импорт ----------

@router.get("/{book_id}/export")
def export_book(book_id: int, user: dict = Depends(require_permission("books.view"))):
    conn = db.connect()
    try:
        book = _load_book(conn, book_id)
        return {
            "format": "kitep-kg-book",
            "version": 1,
            "title": book["title"],
            "subject": book["subject"],
            "grade": book["grade"],
            "language": book["language"],
            "content": json.loads(book["content"]),
        }
    finally:
        conn.close()


class ImportBody(BaseModel):
    data: dict


@router.post("/import")
def import_book(body: ImportBody, user: dict = Depends(require_permission("books.create"))):
    data = body.data
    if data.get("format") != "kitep-kg-book" or "content" not in data:
        raise HTTPException(400, "Файл не похож на экспорт учебника этой системы")
    conn = db.connect()
    try:
        cur = conn.execute(
            "INSERT INTO books (title, subject, grade, language, status, content, created_by, created_at, updated_at) "
            "VALUES (?,?,?,?, 'draft', ?, ?, ?, ?)",
            (data.get("title", "Импортированный учебник"), data.get("subject", ""),
             data.get("grade", ""), data.get("language", ""),
             json.dumps(data["content"], ensure_ascii=False), user["id"], db.now(), db.now()),
        )
        book_id = cur.lastrowid
        conn.execute("INSERT INTO book_members (book_id, user_id, member_role) VALUES (?,?, 'Автор')",
                     (book_id, user["id"]))
        db.add_history(conn, book_id, user["id"], "import", "Импорт учебника из файла")
        conn.commit()
        return {"id": book_id}
    finally:
        conn.close()


# ---- Импорт готовой книги файлом (PDF/DOCX/FB2/EPUB/TXT и т.д.) → редактируемый учебник ----

def _paras_to_html(paras: list) -> str:
    return "".join(f"<p>{html_mod.escape(p)}</p>" for p in paras)


def _chapters_from_text(text: str) -> list:
    """Режем извлечённый текст на главы/параграфы, чтобы книгу можно было править в конструкторе."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if len(paras) < 3:  # PDF часто отдаёт текст без пустых строк — режем по строкам
        paras = [p.strip() for p in text.split("\n") if p.strip()]
    if not paras:
        paras = [text.strip()]
    # параграф книги ~4000 символов, не более 120 параграфов всего
    sections, buf, size = [], [], 0
    for p in paras:
        buf.append(p)
        size += len(p)
        if size >= 4000:
            sections.append(buf)
            buf, size = [], 0
        if len(sections) >= 120:
            break
    if buf and len(sections) < 120:
        sections.append(buf)
    chapters = []
    per = 6  # параграфов в главе
    for ci in range(0, len(sections), per):
        chunk = sections[ci:ci + per]
        secs = []
        for si, sec in enumerate(chunk):
            first = re.sub(r"\s+", " ", sec[0])[:60].strip()
            secs.append({
                "id": _sid(), "kind": "paragraph",
                "title": f"§ {ci + si + 1}. {first}{'…' if len(sec[0]) > 60 else ''}",
                "goals": "", "motivation": "", "body": _paras_to_html(sec),
                "examples": "", "summary": "", "tasks": "", "homework": "", "questions": "", "test": "",
            })
        chapters.append({"id": _sid(), "title": f"Часть {ci // per + 1}", "sections": secs})
    return chapters


@router.post("/import-file")
async def import_book_file(
    file: UploadFile = File(...),
    title: str = Form(""),
    subject: str = Form(""),
    grade: str = Form(""),
    language: str = Form(""),
    user: dict = Depends(require_permission("books.create")),
):
    import extractors
    name = file.filename or "книга"
    ext = os.path.splitext(name)[1].lower()  # с точкой — как ключи extractors.SUPPORTED
    if ext not in extractors.SUPPORTED:
        raise HTTPException(400, f"Формат {ext or '?'} не поддерживается")
    raw = await file.read()
    if len(raw) > 80 * 1024 * 1024:
        raise HTTPException(400, "Файл слишком большой (до 80 МБ)")
    tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    try:
        tmp.write(raw)
        tmp.close()
        pages, notes = extractors.extract(tmp.name, ext)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 — отдаём причину пользователю
        raise HTTPException(400, f"Не удалось прочитать файл: {e}")
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
    text = "\n\n".join(p.get("text", "") for p in pages).strip()
    if not text:
        raise HTTPException(400, "В файле не нашлось текста (возможно, это скан без распознавания)")
    book_title = (title.strip() or os.path.splitext(name)[0])[:200]
    content = default_content(book_title, subject, grade, language or "русский")
    content["chapters"] = _chapters_from_text(text)
    conn = db.connect()
    try:
        cur = conn.execute(
            "INSERT INTO books (title, subject, grade, language, status, content, created_by, created_at, updated_at) "
            "VALUES (?,?,?,?, 'draft', ?, ?, ?, ?)",
            (book_title, subject, grade, language or "русский",
             json.dumps(content, ensure_ascii=False), user["id"], db.now(), db.now()),
        )
        book_id = cur.lastrowid
        conn.execute("INSERT INTO book_members (book_id, user_id, member_role) VALUES (?,?, 'Автор')",
                     (book_id, user["id"]))
        db.add_history(conn, book_id, user["id"], "import",
                       f"Импорт из файла {name} ({len(pages)} фрагм., {len(text)} символов)")
        conn.commit()
        return {"id": book_id, "pages": len(pages), "chars": len(text), "notes": notes[:5]}
    finally:
        conn.close()
