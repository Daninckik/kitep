# -*- coding: utf-8 -*-
"""ГИС «Китеп» — платформа создания и экспертизы школьных учебников КР.

Запуск:  python -m uvicorn app:app --port 8077
Открыть: http://127.0.0.1:8077          — платформа (вход: admin / admin123)
         http://127.0.0.1:8077/checker  — модуль проверки книг по Закону № 185

AI-анализ требует переменной окружения ANTHROPIC_API_KEY.
"""
import asyncio
import json
import os
import re
import time
import uuid
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import db
import permissions
from admin_api import router as admin_router
from admin_api import sys_router as admin_sys_router
from ai_api import apply_ocr_settings, run_ai_on_pages
from ai_api import router as ai_router
from ai_writer import router as ai_writer_router
from analyzer import analyze
from auth import ensure_superadmin, get_current_user, require_permission
from auth import router as auth_router
from books_api import router as books_router
from extractors import SUPPORTED, extract
from scans_api import router as scans_router
from state_pages import get_state_pages
from stats_api import router as stats_router

BASE = Path(__file__).parent
UPLOADS = BASE / "uploads"
REPORTS = BASE / "reports"
UPLOADS.mkdir(exist_ok=True)
REPORTS.mkdir(exist_ok=True)

MAX_SIZE = 100 * 1024 * 1024  # 100 МБ

app = FastAPI(title="ГИС «Китеп» — учебники Кыргызской Республики")


@app.middleware("http")
async def no_cache_static(request: Request, call_next):
    """На время разработки не даём браузеру кешировать интерфейс —
    после каждого обновления кода все видят свежую версию без Ctrl+F5."""
    response = await call_next(request)
    p = request.url.path
    if p.startswith("/static") or p in ("/", "/checker"):
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response

db.init_db()
ensure_superadmin()
permissions.load_overrides()

app.include_router(auth_router)
app.include_router(books_router)
app.include_router(scans_router)
app.include_router(ai_router)
app.include_router(ai_writer_router)
app.include_router(stats_router)
app.include_router(admin_router)
app.include_router(admin_sys_router)


@app.get("/api/state-pages")
def state_pages():
    return get_state_pages()


# ======================================================================
# Модуль проверки книг по нормам КР (Закон № 185) — прежний функционал
# ======================================================================

def _safe_name(name: str) -> str:
    name = os.path.basename(name or "book")
    return re.sub(r"[^\w.\-() а-яА-ЯёЁүөңҮӨҢ]", "_", name)[:150]


def _sniff_ext(data: bytes) -> str | None:
    """Определяет формат книги по содержимому (для файлов без расширения)."""
    if data[:5] == b"%PDF-":
        return ".pdf"
    if data[:8] == b"AT&TFORM":
        return ".djvu"
    if data[:5] == b"{\\rtf":
        return ".rtf"
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    if data[:4] in (b"II*\x00", b"MM\x00*"):
        return ".tiff"
    if data[:2] == b"PK":
        import io
        import zipfile

        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                names = set(z.namelist())
                if any(n.startswith("word/") for n in names):
                    return ".docx"
                if "mimetype" in names and b"epub" in z.read("mimetype"):
                    return ".epub"
                if "META-INF/container.xml" in names:
                    return ".epub"
                inner = (".fb2", ".docx", ".rtf", ".html", ".htm", ".txt", ".pdf")
                if any(n.lower().endswith(inner) for n in names):
                    return ".zip"
        except Exception:
            return None
        return None
    head = None
    for enc in ("utf-8", "utf-16", "cp1251"):
        try:
            head = data[:4000].decode(enc)
            break
        except (UnicodeDecodeError, UnicodeError):
            continue
    if head:
        low = head.lower()
        if "<fictionbook" in low:
            return ".fb2"
        if "<html" in low or "<!doctype html" in low:
            return ".html"
    for enc in ("utf-8", "utf-16"):
        try:
            decoded = data.decode(enc)
        except (UnicodeDecodeError, UnicodeError):
            continue
        if "\x00" in decoded:
            continue
        sample = decoded[:8000]
        printable = sum(1 for c in sample if c.isprintable() or c in "\n\r\t ")
        if sample and printable / len(sample) > 0.92:
            return ".txt"
    sample = data[:8000].decode("cp1251", "ignore")
    if sample:
        printable = sum(1 for c in sample if c.isprintable() or c in "\n\r\t ")
        if printable / len(sample) > 0.92:
            return ".txt"
    return None


def _known_unsupported(data: bytes) -> str | None:
    if data[:8] == b"AT&TFORM":
        import shutil
        if shutil.which("ddjvu"):
            return None  # DJVU поддержан (docker-образ с djvulibre)
        return (
            "Это DjVu. Конвертируйте его в PDF (любой онлайн-конвертер djvu→pdf) "
            "и загрузите снова — сканированные страницы мы распознаем сами."
        )
    if len(data) > 68 and data[60:68] == b"BOOKMOBI":
        return (
            "Это MOBI (формат Kindle). Конвертируйте книгу в EPUB или FB2 — "
            "например, бесплатной программой Calibre — и загрузите снова."
        )
    return None


@app.post("/api/analyze")
async def analyze_book(
    request: Request,
    file: UploadFile = File(...),
    age_group: str = Form(""),
    ai: str = Form(""),
    subject: str = Form(""),
):
    """Проверка книги: чек-лист по Закону № 185 + (опционально) OCR/AI-анализ
    соответствия требованиям к школьным учебникам КР (настройки — в админ-панели)."""
    if age_group not in ("", "7-10", "11-14", "15-18"):
        age_group = ""
    name = _safe_name(file.filename)
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(413, "Файл больше 100 МБ")
    if not data:
        raise HTTPException(400, "Пустой файл")

    ext = Path(name).suffix.lower()
    if ext not in SUPPORTED:
        hint = _known_unsupported(data)
        if hint:
            raise HTTPException(415, hint)
        sniffed = _sniff_ext(data)
        if sniffed:
            ext = sniffed
            name = f"{name}{ext}" if not Path(name).suffix else name
        else:
            raise HTTPException(
                415,
                f"Формат {ext or '(без расширения)'} не поддерживается, и по содержимому "
                f"файл не похож ни на один из форматов: {', '.join(sorted(SUPPORTED))}",
            )

    book_id = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    saved = UPLOADS / f"{book_id}{ext}"
    saved.write_bytes(data)

    # AI-анализ привязан к пользователю — определяем его ДО ухода в поток
    ai_user = None
    if ai == "1":
        try:
            ai_user = get_current_user(request)
        except HTTPException:
            ai_user = None

    # ⚠️ OCR и AI занимают минуты — выполняем в ПОТОКЕ, иначе event loop
    # блокируется и сервер не отдаёт даже старые отчёты, пока идёт проверка
    def _heavy():
        apply_ocr_settings()
        pages, notes = extract(str(saved), ext)
        if not pages:
            return None
        report = analyze(pages, age_group)
        report["notes"] = notes
        report.update(
            {
                "id": book_id,
                "filename": name,
                "size": len(data),
                "checked_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
        )
        if ai == "1":
            if ai_user is None:
                report["ai"] = {"error": "AI-анализ доступен только после входа в систему"}
            else:
                report["ai"] = run_ai_on_pages(pages, notes, name, subject, ai_user["id"])
        return report

    try:
        report = await asyncio.to_thread(_heavy)
    except Exception as e:
        saved.unlink(missing_ok=True)
        raise HTTPException(422, f"Не удалось извлечь текст: {e}")
    if report is None:
        saved.unlink(missing_ok=True)
        raise HTTPException(
            422,
            "Не удалось получить текст: страницы не распознались даже через OCR. "
            "Проверьте качество скана или найдите текстовую версию книги.",
        )

    (REPORTS / f"{book_id}.json").write_text(
        json.dumps(report, ensure_ascii=False), encoding="utf-8"
    )
    return JSONResponse(report)


@app.get("/api/reports")
def list_reports():
    items = []
    for f in sorted(REPORTS.glob("*.json"), reverse=True):
        try:
            r = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        items.append(
            {
                "id": r["id"],
                "filename": r["filename"],
                "checked_at": r["checked_at"],
                "verdict": r["verdict"],
                "age_label": r.get("age_label", "не указан"),
                "pages": r["pages"],
                "hits": sum(c["hits"] for c in r["categories"]),
            }
        )
    return items


@app.get("/api/reports/{report_id}")
def get_report(report_id: str):
    f = REPORTS / f"{_safe_name(report_id)}.json"
    if not f.exists():
        raise HTTPException(404, "Отчёт не найден")
    return json.loads(f.read_text(encoding="utf-8"))


@app.delete("/api/reports/{report_id}")
def delete_report(report_id: str):
    rid = _safe_name(report_id)
    f = REPORTS / f"{rid}.json"
    if not f.exists():
        raise HTTPException(404, "Отчёт не найден")
    f.unlink()
    for upload in UPLOADS.glob(f"{rid}.*"):
        upload.unlink(missing_ok=True)
    return {"ok": True}


# ======================================================================
# Фронтенд
# ======================================================================

@app.get("/")
def index():
    return FileResponse(BASE / "static" / "platform.html")


@app.get("/checker")
def checker():
    return FileResponse(BASE / "static" / "index.html")


app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")
