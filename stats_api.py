# -*- coding: utf-8 -*-
"""Статистика платформы: общая, AI-модуль, расход токенов, операционный дашборд (ТЗ п.9)."""
import os
import shutil
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends

import db
from auth import require_permission
from permissions import ROLES, STATUSES

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _one(conn, sql, params=()) -> int:
    return conn.execute(sql, params).fetchone()[0]


def _daily(conn, table: str, value: str = "COUNT(*)", where: str = "") -> dict:
    """Суточные значения за последние 30 дней: {'2026-08-04': 3, ...}."""
    rows = conn.execute(
        f"SELECT substr(created_at, 1, 10) d, {value} v FROM {table} "
        f"{('WHERE ' + where) if where else ''} "
        "GROUP BY d ORDER BY d DESC LIMIT 30"
    ).fetchall()
    return {r["d"]: r["v"] for r in rows}


@router.get("/overview")
def overview(user: dict = Depends(require_permission("stats.view"))):
    conn = db.connect()
    try:
        by_status = {
            r["status"]: r["c"]
            for r in conn.execute("SELECT status, COUNT(*) c FROM books GROUP BY status").fetchall()
        }
        by_grade = db.rows_to_dicts(conn.execute(
            "SELECT grade, COUNT(*) c FROM books WHERE grade != '' GROUP BY grade "
            "ORDER BY CAST(grade AS INTEGER)").fetchall())
        by_subject = db.rows_to_dicts(conn.execute(
            "SELECT subject, COUNT(*) c FROM books WHERE subject != '' GROUP BY subject ORDER BY c DESC"
        ).fetchall())
        by_role = db.rows_to_dicts(conn.execute(
            "SELECT role, COUNT(*) c FROM users GROUP BY role ORDER BY c DESC").fetchall())
        return {
            "books_total": _one(conn, "SELECT COUNT(*) FROM books"),
            "books_published": by_status.get("published", 0) + by_status.get("approved", 0),
            "books_draft": by_status.get("draft", 0),
            "users_total": _one(conn, "SELECT COUNT(*) FROM users WHERE active = 1"),
            "authors_total": _one(conn, "SELECT COUNT(*) FROM users WHERE role IN ('author','coauthor') AND active = 1"),
            "versions_total": _one(conn, "SELECT COUNT(*) FROM versions"),
            "changes_total": _one(conn, "SELECT COUNT(*) FROM history"),
            "subjects_used": _one(conn, "SELECT COUNT(DISTINCT subject) FROM books WHERE subject != ''"),
            "grades_used": _one(conn, "SELECT COUNT(DISTINCT grade) FROM books WHERE grade != ''"),
            "last_update": conn.execute("SELECT MAX(updated_at) FROM books").fetchone()[0] or "",
            "books_daily": _daily(conn, "books"),
            "by_status": [
                {"status": s, "title": STATUSES.get(s, s), "count": c} for s, c in by_status.items()
            ],
            "by_grade": by_grade,
            "by_subject": by_subject,
            "by_role": by_role,
        }
    finally:
        conn.close()


@router.get("/ai")
def ai_stats(user: dict = Depends(require_permission("stats.view"))):
    conn = db.connect()
    try:
        total = _one(conn, "SELECT COUNT(*) FROM ai_jobs")
        done = _one(conn, "SELECT COUNT(*) FROM ai_jobs WHERE status = 'done'")
        avg_ms = conn.execute(
            "SELECT AVG(duration_ms) FROM ai_jobs WHERE status = 'done' AND duration_ms > 0"
        ).fetchone()[0] or 0
        return {
            "jobs_total": total,
            "jobs_done": done,
            "jobs_error": _one(conn, "SELECT COUNT(*) FROM ai_jobs WHERE status = 'error'"),
            "ocr_jobs": _one(conn, "SELECT COUNT(*) FROM ai_jobs WHERE ocr_used = 1"),
            "pages_processed": _one(conn, "SELECT COALESCE(SUM(pages),0) FROM ai_jobs"),
            "success_rate": round(done / total * 100, 1) if total else 0,
            "avg_duration_ms": int(avg_ms),
            "jobs_daily": _daily(conn, "ai_jobs"),
            "ocr_daily": _daily(conn, "ai_jobs", where="ocr_used = 1"),
        }
    finally:
        conn.close()


@router.get("/tokens")
def token_stats(user: dict = Depends(require_permission("stats.view"))):
    conn = db.connect()
    try:
        totals = conn.execute(
            "SELECT COUNT(*) requests, COALESCE(SUM(input_tokens),0) input_tokens, "
            "COALESCE(SUM(output_tokens),0) output_tokens, COALESCE(SUM(cost_usd),0) cost_usd "
            "FROM ai_usage"
        ).fetchone()
        by_user = db.rows_to_dicts(conn.execute(
            "SELECT u.name, COUNT(*) requests, SUM(a.input_tokens) input_tokens, "
            "SUM(a.output_tokens) output_tokens, ROUND(SUM(a.cost_usd), 4) cost_usd "
            "FROM ai_usage a JOIN users u ON u.id = a.user_id "
            "GROUP BY a.user_id ORDER BY cost_usd DESC").fetchall())
        by_book = db.rows_to_dicts(conn.execute(
            "SELECT COALESCE(b.title, '— без привязки —') title, COUNT(*) requests, "
            "SUM(a.input_tokens) input_tokens, SUM(a.output_tokens) output_tokens, "
            "ROUND(SUM(a.cost_usd), 4) cost_usd "
            "FROM ai_usage a LEFT JOIN books b ON b.id = a.book_id "
            "GROUP BY a.book_id ORDER BY cost_usd DESC").fetchall())
        def _cost_since(days: int) -> float:
            return conn.execute(
                "SELECT COALESCE(SUM(cost_usd),0) FROM ai_usage WHERE created_at >= date('now', ?)",
                (f"-{days} days",),
            ).fetchone()[0]

        return {
            "requests": totals["requests"],
            "input_tokens": totals["input_tokens"],
            "output_tokens": totals["output_tokens"],
            "cost_usd": round(totals["cost_usd"], 4),
            "cost_today": round(_cost_since(0), 4),
            "cost_week": round(_cost_since(7), 4),
            "cost_month": round(_cost_since(30), 4),
            "cost_daily": _daily(conn, "ai_usage", value="ROUND(SUM(cost_usd), 4)"),
            "by_user": by_user,
            "by_book": by_book,
        }
    finally:
        conn.close()


@router.get("/ops")
def ops_dashboard(user: dict = Depends(require_permission("stats.view"))):
    """Операционный дашборд: работа команды сегодня, проблемные места,
    топы по ролям, лента активности, здоровье системы."""
    conn = db.connect()
    try:
        today = db.now()[:10]
        cutoff30 = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S")
        cutoff14 = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%d %H:%M:%S")

        team = {
            "edits_today": _one(conn, "SELECT COUNT(*) FROM history WHERE created_at >= ?", (today,)),
            "comments_today": _one(conn, "SELECT COUNT(*) FROM comments WHERE created_at >= ?", (today,)),
            "versions_today": _one(conn, "SELECT COUNT(*) FROM versions WHERE created_at >= ?", (today,)),
            "approvals_today": _one(conn, "SELECT COUNT(*) FROM approvals WHERE created_at >= ?", (today,)),
            "active_users_today": _one(
                conn, "SELECT COUNT(DISTINCT user_id) FROM audit WHERE created_at >= ? AND user_id IS NOT NULL",
                (today,)),
        }

        # ---- Проблемные места ----
        in_work = "b.status NOT IN ('approved','published')"
        attention = [
            {"key": "no_editor", "level": "warn",
             "label": "без редактора/корректора",
             "count": _one(conn,
                f"SELECT COUNT(*) FROM books b WHERE {in_work} AND NOT EXISTS "
                "(SELECT 1 FROM book_members m WHERE m.book_id = b.id "
                " AND m.member_role IN ('Редактор','Главный редактор','Корректор'))")},
            {"key": "lawyer_queue", "level": "warn",
             "label": "ждут юридическую экспертизу",
             "count": _one(conn, "SELECT COUNT(*) FROM books WHERE status = 'lawyer'")},
            {"key": "ministry_queue", "level": "warn",
             "label": "ждут экспертизу Министерства",
             "count": _one(conn, "SELECT COUNT(*) FROM books WHERE status = 'ministry'")},
            {"key": "stale", "level": "warn",
             "label": "более 30 дней без изменений",
             "count": _one(conn,
                f"SELECT COUNT(*) FROM books b WHERE {in_work} AND b.updated_at < ?", (cutoff30,))},
            {"key": "open_comments", "level": "info",
             "label": "неснятых замечаний",
             "count": _one(conn, "SELECT COUNT(*) FROM comments WHERE resolved = 0")},
            {"key": "ai_errors", "level": "err",
             "label": "AI/OCR-обработок с ошибкой за 14 дней",
             "count": _one(conn,
                "SELECT COUNT(*) FROM ai_jobs WHERE status = 'error' AND created_at >= ?", (cutoff14,))},
        ]

        # ---- Топ активности по группам ролей (30 дней) ----
        def _top(roles: tuple):
            marks = ",".join("?" * len(roles))
            rows = conn.execute(
                "SELECT u.name, u.role, COUNT(*) c FROM history h JOIN users u ON u.id = h.user_id "
                f"WHERE h.created_at >= ? AND u.role IN ({marks}) "
                "GROUP BY h.user_id ORDER BY c DESC LIMIT 3",
                (cutoff30, *roles)).fetchall()
            return [{**dict(r), "role_title": ROLES.get(r["role"], r["role"])} for r in rows]

        tops = {
            "authors": _top(("author", "coauthor")),
            "editors": _top(("editor", "chief_editor", "proofreader")),
            "experts": _top(("methodist", "lawyer", "reviewer", "ministry")),
            "admins": _top(("superadmin", "admin")),
        }

        # ---- Лента активности ----
        activity = db.rows_to_dicts(conn.execute(
            "SELECT h.action, h.details, h.created_at, u.name AS user_name, u.role AS user_role, "
            " b.title AS book_title "
            "FROM history h LEFT JOIN users u ON u.id = h.user_id JOIN books b ON b.id = h.book_id "
            "ORDER BY h.id DESC LIMIT 15").fetchall())

        # ---- Здоровье системы ----
        health = []
        try:
            n = _one(conn, "SELECT COUNT(*) FROM books")
            size_mb = db.DB_PATH.stat().st_size / 1024 / 1024
            health.append({"key": "db", "label": "База данных", "status": "ok",
                           "note": f"SQLite · {n} книг · {size_mb:.1f} МБ"})
        except Exception as e:
            health.append({"key": "db", "label": "База данных", "status": "err", "note": str(e)[:120]})
        try:
            import pytesseract
            ver = str(pytesseract.get_tesseract_version()).splitlines()[0]
            health.append({"key": "ocr", "label": "OCR (Tesseract)", "status": "ok", "note": f"версия {ver}"})
        except Exception as e:
            health.append({"key": "ocr", "label": "OCR (Tesseract)", "status": "err",
                           "note": "недоступен: " + str(e)[:100]})
        try:
            from ai_api import ai_settings
            s = ai_settings()
            key = os.environ.get("ANTHROPIC_API_KEY") or s.get("api_key") or ""
            if key:
                health.append({"key": "ai", "label": "AI-сервис (Claude)", "status": "ok",
                               "note": f"ключ задан · модель {s.get('model', '')}"})
            else:
                health.append({"key": "ai", "label": "AI-сервис (Claude)", "status": "warn",
                               "note": "ключ не задан — AI-анализ отключён"})
        except Exception as e:
            health.append({"key": "ai", "label": "AI-сервис (Claude)", "status": "err", "note": str(e)[:120]})
        try:
            base = db.BASE
            bad = [d for d in ("uploads", "reports", "data") if not os.access(base / d, os.W_OK)]
            if bad:
                health.append({"key": "fs", "label": "Хранилище файлов", "status": "err",
                               "note": "нет записи: " + ", ".join(bad)})
            else:
                health.append({"key": "fs", "label": "Хранилище файлов", "status": "ok",
                               "note": "uploads, reports, data — запись доступна"})
        except Exception as e:
            health.append({"key": "fs", "label": "Хранилище файлов", "status": "err", "note": str(e)[:120]})
        try:
            du = shutil.disk_usage(str(db.BASE))
            free_gb = du.free / 1024 ** 3
            health.append({"key": "disk", "label": "Диск", "status": "ok" if free_gb > 2 else "warn",
                           "note": f"свободно {free_gb:.1f} ГБ"})
        except Exception:
            pass

        return {"team": team, "attention": attention, "tops": tops,
                "activity": activity, "health": health}
    finally:
        conn.close()


@router.get("/analytics")
def analytics(user: dict = Depends(require_permission("stats.view"))):
    """Нижний блок дашборда: топ авторов, топ учебников, активность."""
    conn = db.connect()
    try:
        top_authors = db.rows_to_dicts(conn.execute(
            "SELECT u.name, COUNT(*) c FROM ai_jobs j JOIN users u ON u.id = j.user_id "
            "GROUP BY j.user_id ORDER BY c DESC LIMIT 3").fetchall())
        top_books = db.rows_to_dicts(conn.execute(
            "SELECT b.title, COUNT(*) c FROM history h JOIN books b ON b.id = h.book_id "
            "GROUP BY h.book_id ORDER BY c DESC LIMIT 3").fetchall())
        active_users = db.rows_to_dicts(conn.execute(
            "SELECT u.name, COUNT(*) c FROM audit a JOIN users u ON u.id = a.user_id "
            "WHERE a.created_at >= date('now', '-30 days') "
            "GROUP BY a.user_id ORDER BY c DESC LIMIT 3").fetchall())
        return {"top_authors": top_authors, "top_books": top_books, "active_users": active_users}
    finally:
        conn.close()
