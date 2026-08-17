# -*- coding: utf-8 -*-
"""SQLite-хранилище платформы (пользователи, книги, версии, AI-журнал)."""
import json
import sqlite3
import time
from pathlib import Path

BASE = Path(__file__).parent
DATA_DIR = BASE / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "kitep.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    extra_roles TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    grade TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'кыргызский',
    status TEXT NOT NULL DEFAULT 'draft',
    content TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS book_members (
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    member_role TEXT NOT NULL,
    PRIMARY KEY (book_id, user_id)
);
CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    content TEXT NOT NULL,
    author_id INTEGER NOT NULL REFERENCES users(id),
    comment TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    section_id TEXT NOT NULL DEFAULT '',
    user_id INTEGER NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    decision TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    book_id INTEGER REFERENCES books(id),
    filename TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'done',
    pages INTEGER NOT NULL DEFAULT 0,
    ocr_used INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    result TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS standards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    grade TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    filename TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    grade TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'русский',
    status TEXT NOT NULL DEFAULT 'processing',
    error TEXT NOT NULL DEFAULT '',
    pages_total INTEGER NOT NULL DEFAULT 0,
    pages_done INTEGER NOT NULL DEFAULT 0,
    book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scan_pages (
    scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    page_no INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    verified INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (scan_id, page_no)
);
CREATE TABLE IF NOT EXISTS scan_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pipeline (
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL DEFAULT '',
    done_at TEXT NOT NULL DEFAULT '',
    done_by INTEGER REFERENCES users(id),
    assignee_id INTEGER REFERENCES users(id),
    due_date TEXT NOT NULL DEFAULT '',
    checklist TEXT NOT NULL DEFAULT '{}',
    note TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (book_id, stage)
);
CREATE TABLE IF NOT EXISTS ai_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    book_id INTEGER REFERENCES books(id),
    job_id INTEGER REFERENCES ai_jobs(id),
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    created_at TEXT NOT NULL
);
"""


def now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = connect()
    conn.executescript(SCHEMA)
    # миграции существующих баз (без Alembic — точечные ALTER)
    try:
        conn.execute("ALTER TABLE users ADD COLUMN extra_roles TEXT NOT NULL DEFAULT '[]'")
    except sqlite3.OperationalError:
        pass  # колонка уже есть
    for _col in ("email", "bio"):
        try:
            conn.execute(f"ALTER TABLE users ADD COLUMN {_col} TEXT NOT NULL DEFAULT ''")
        except sqlite3.OperationalError:
            pass  # колонка уже есть
    try:
        conn.execute("ALTER TABLE books ADD COLUMN cover_url TEXT NOT NULL DEFAULT ''")
    except sqlite3.OperationalError:
        pass  # колонка уже есть
    try:
        conn.execute("ALTER TABLE scans ADD COLUMN structure TEXT NOT NULL DEFAULT ''")
    except sqlite3.OperationalError:
        pass  # колонка уже есть
    try:
        # неудаляемый оригинал распознанного текста: правки живут в text,
        # text_orig хранит результат OCR — случайно стёртое всегда можно вернуть
        conn.execute("ALTER TABLE scan_pages ADD COLUMN text_orig TEXT NOT NULL DEFAULT ''")
        conn.execute("UPDATE scan_pages SET text_orig = text")  # существующим сканам оригинал = текущий текст
    except sqlite3.OperationalError:
        pass  # колонка уже есть
    # дефолтные образовательные стандарты КР — один раз (флаг в settings,
    # чтобы намеренно удалённые администратором записи не возвращались)
    try:
        if not conn.execute("SELECT 1 FROM settings WHERE key = 'standards_seeded'").fetchone():
            if conn.execute("SELECT COUNT(*) FROM standards").fetchone()[0] == 0:
                from standards_seed import DEFAULT_STANDARDS
                conn.executemany(
                    "INSERT INTO standards (title, subject, grade, url, text, created_at) VALUES (?,?,?,?,?,?)",
                    [(s["title"], s.get("subject", ""), s.get("grade", ""), s.get("url", ""),
                      s["text"].strip(), now()) for s in DEFAULT_STANDARDS],
                )
            conn.execute("INSERT INTO settings (key, value) VALUES ('standards_seeded', '1')")
    except Exception:
        pass  # засев не должен ронять старт приложения
    conn.commit()
    conn.close()


def rows_to_dicts(rows) -> list:
    return [dict(r) for r in rows]


def add_history(conn, book_id: int, user_id, action: str, details: str = ""):
    conn.execute(
        "INSERT INTO history (book_id, user_id, action, details, created_at) VALUES (?,?,?,?,?)",
        (book_id, user_id, action, details, now()),
    )


def add_scan_history(conn, scan_id: int, user_id, action: str):
    """Общая история оцифровки: кто что сделал со сканом. Повторы одного и того же
    действия тем же человеком в течение 15 минут схлопываются (автосейв не спамит)."""
    last = conn.execute(
        "SELECT action, created_at FROM scan_history WHERE scan_id = ? AND user_id = ? "
        "ORDER BY id DESC LIMIT 1", (scan_id, user_id),
    ).fetchone()
    if last and last["action"] == action:
        try:
            prev = time.mktime(time.strptime(last["created_at"], "%Y-%m-%d %H:%M:%S"))
            if time.time() - prev < 900:
                conn.execute(
                    "UPDATE scan_history SET created_at = ? WHERE scan_id = ? AND user_id = ? "
                    "AND action = ? AND created_at = ?",
                    (now(), scan_id, user_id, action, last["created_at"]),
                )
                return
        except ValueError:
            pass
    conn.execute(
        "INSERT INTO scan_history (scan_id, user_id, action, created_at) VALUES (?,?,?,?)",
        (scan_id, user_id, action, now()),
    )


def get_setting(key: str, default=None):
    conn = connect()
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default
    finally:
        conn.close()


def set_setting(key: str, value):
    conn = connect()
    try:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, json.dumps(value, ensure_ascii=False)),
        )
        conn.commit()
    finally:
        conn.close()


def add_audit(user_id, action: str, details: str = ""):
    """Глобальный журнал действий (админ-панель)."""
    conn = connect()
    try:
        conn.execute(
            "INSERT INTO audit (user_id, action, details, created_at) VALUES (?,?,?,?)",
            (user_id, action, details[:500], now()),
        )
        conn.commit()
    finally:
        conn.close()


def book_row_to_dict(row, with_content: bool = False) -> dict:
    d = dict(row)
    if with_content:
        d["content"] = json.loads(d["content"])
    else:
        d.pop("content", None)
    return d
