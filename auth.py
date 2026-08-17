# -*- coding: utf-8 -*-
"""Аутентификация: пароли (PBKDF2), сессии, зависимости FastAPI."""
import hashlib
import json
import os
import re
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

import db
from permissions import ROLES, effective_permissions_multi, user_can

SESSION_TTL = 14 * 24 * 3600  # 14 дней
_ITERATIONS = 200_000

# ------------------------------------------------------------------
# РЕЖИМ РАЗРАБОТКИ: вход без логина и пароля — любой запрос считается
# запросом суперадминистратора. Когда проект будет готов, вернуть
# авторизацию: поставить DEV_AUTO_LOGIN = False (или env DEV_AUTO_LOGIN=0).
# ------------------------------------------------------------------
DEV_AUTO_LOGIN = os.environ.get("DEV_AUTO_LOGIN", "1") == "1"

router = APIRouter(prefix="/api/auth", tags=["auth"])


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _ITERATIONS)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$")
    except ValueError:
        return False
    calc = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _ITERATIONS)
    return secrets.compare_digest(calc.hex(), digest)


def ensure_superadmin():
    """Первый запуск: создаёт суперадминистратора admin/admin123."""
    conn = db.connect()
    try:
        if conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"] == 0:
            password = os.environ.get("ADMIN_PASSWORD", "admin123")
            conn.execute(
                "INSERT INTO users (login, name, password_hash, role, active, created_at) "
                "VALUES (?,?,?,?,1,?)",
                ("admin", "Суперадминистратор", hash_password(password), "superadmin", db.now()),
            )
            conn.commit()
            print(f"[init] Создан суперадминистратор: login=admin password={password}")
    finally:
        conn.close()


def parse_extra_roles(row) -> list:
    """Дополнительные роли пользователя из колонки extra_roles (JSON-список)."""
    try:
        raw = row["extra_roles"] if "extra_roles" in row.keys() else "[]"
        return [r for r in json.loads(raw or "[]") if r in ROLES and r != row["role"]]
    except (ValueError, TypeError):
        return []


def _user_public(row) -> dict:
    extra = parse_extra_roles(row)
    all_roles = [row["role"], *extra]
    return {
        "id": row["id"], "login": row["login"], "name": row["name"],
        "role": row["role"], "role_title": ROLES.get(row["role"], row["role"]),
        "extra_roles": extra,
        "roles": [{"code": r, "title": ROLES.get(r, r)} for r in all_roles],
        "active": bool(row["active"]), "created_at": row["created_at"],
        "email": (row["email"] if "email" in row.keys() else "") or "",
        "bio": (row["bio"] if "bio" in row.keys() else "") or "",
        "perms": sorted(effective_permissions_multi(all_roles)),
    }


def _dev_superadmin() -> dict:
    conn = db.connect()
    try:
        row = conn.execute(
            "SELECT * FROM users WHERE role = 'superadmin' ORDER BY id LIMIT 1"
        ).fetchone()
        if not row:
            raise HTTPException(500, "В базе нет суперадминистратора")
        return _user_public(row)
    finally:
        conn.close()


def get_current_user(request: Request) -> dict:
    token = request.cookies.get("session") or ""
    if not token:
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:]
    if not token:
        if DEV_AUTO_LOGIN:
            return _dev_superadmin()
        raise HTTPException(401, "Требуется вход в систему")
    conn = db.connect()
    try:
        row = conn.execute(
            "SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE s.token = ?", (token,),
        ).fetchone()
        if not row or row["expires_at"] < time.time():
            if DEV_AUTO_LOGIN:
                return _dev_superadmin()
            raise HTTPException(401, "Сессия истекла, войдите заново")
        if not row["active"]:
            raise HTTPException(403, "Учётная запись отключена")
        return _user_public(row)
    finally:
        conn.close()


def require_permission(perm: str):
    def dep(user: dict = Depends(get_current_user)) -> dict:
        if not user_can(user, perm):
            raise HTTPException(403, "Недостаточно прав для этого действия")
        return user
    return dep


# ---- самостоятельная регистрация ----
# роли делятся на три группы: сам выбирает / нужна проверка администратора /
# назначает только администратор (в регистрации недоступны)
SELF_ROLES = {"author", "coauthor"}
APPROVAL_ROLES = {"editor", "chief_editor", "proofreader", "methodist", "lawyer", "reviewer"}


class RegisterBody(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str = ""
    password: str
    role: str
    org: str = ""
    position: str = ""
    department: str = ""


@router.post("/register")
def register(body: RegisterBody, response: Response):
    first, last = body.first_name.strip(), body.last_name.strip()
    if not first or not last:
        raise HTTPException(400, "Укажите имя и фамилию")
    email = body.email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(400, "Укажите корректную рабочую почту")
    if len(body.password) < 6:
        raise HTTPException(400, "Пароль — минимум 6 символов")
    role = body.role.strip()
    if role in SELF_ROLES:
        pending = False
    elif role in APPROVAL_ROLES:
        pending = True
    else:
        raise HTTPException(400, "Эта роль назначается только администратором")
    name = f"{first} {last}"[:120]
    bio_bits = []
    if body.org.strip():
        bio_bits.append(f"Организация: {body.org.strip()}")
    if body.position.strip():
        bio_bits.append(f"Должность: {body.position.strip()}")
    if body.department.strip():
        bio_bits.append(f"Подразделение: {body.department.strip()}")
    if body.phone.strip():
        bio_bits.append(f"Телефон: {body.phone.strip()}")
    bio = " · ".join(bio_bits)[:500]
    conn = db.connect()
    try:
        if conn.execute("SELECT 1 FROM users WHERE login = ? OR email = ?", (email, email)).fetchone():
            raise HTTPException(400, "Такая почта уже зарегистрирована — попробуйте войти")
        cur = conn.execute(
            "INSERT INTO users (login, name, password_hash, role, extra_roles, active, created_at, email, bio) "
            "VALUES (?,?,?,?, '[]', ?, ?, ?, ?)",
            (email, name, hash_password(body.password), role,
             0 if pending else 1, db.now(), email, bio),
        )
        user_id = cur.lastrowid
        if pending:
            conn.commit()
            db.add_audit(user_id, "register",
                         f"Заявка на роль «{ROLES.get(role, role)}» — ждёт подтверждения администратора")
            return {"status": "pending", "role_title": ROLES.get(role, role)}
        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)",
            (token, user_id, db.now(), time.time() + SESSION_TTL),
        )
        conn.commit()
        response.set_cookie("session", token, max_age=SESSION_TTL, httponly=True, samesite="lax")
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        db.add_audit(user_id, "register", f"Зарегистрировался с ролью «{ROLES.get(role, role)}»")
        return {"status": "active", "user": _user_public(row)}
    finally:
        conn.close()


class LoginBody(BaseModel):
    login: str
    password: str


@router.post("/login")
def login(body: LoginBody, response: Response):
    conn = db.connect()
    try:
        lg = body.login.strip().lower()
        row = conn.execute("SELECT * FROM users WHERE login = ? OR (email != '' AND email = ?)",
                           (lg, lg)).fetchone()
        if not row or not verify_password(body.password, row["password_hash"]):
            raise HTTPException(401, "Неверный логин или пароль")
        if not row["active"]:
            raise HTTPException(403, "Учётная запись отключена")
        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)",
            (token, row["id"], db.now(), time.time() + SESSION_TTL),
        )
        conn.commit()
        response.set_cookie(
            "session", token, max_age=SESSION_TTL, httponly=True, samesite="lax",
        )
        db.add_audit(row["id"], "login", f"Вход в систему: {row['login']}")
        return {"user": _user_public(row), "token": token}
    finally:
        conn.close()


@router.post("/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get("session")
    if token:
        conn = db.connect()
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
        conn.close()
    response.delete_cookie("session")
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user
