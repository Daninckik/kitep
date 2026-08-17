# -*- coding: utf-8 -*-
"""Оцифровка сканированных книг: постраничное распознавание + вычитка.

Загруженный скан (PDF / DjVu / фото страниц / ZIP с фото) обрабатывается в фоне:
каждая страница сохраняется картинкой (uploads/scans/<id>/page_NNNN.jpg) и
распознаётся — текстовый слой PDF, если он есть, иначе OCR. Дальше в интерфейсе
вычитка: слева оригинал страницы, справа распознанный текст; проверенные
страницы собираются в обычный учебник конструктора.
"""
import json
import os
import re
import shutil
import subprocess
import threading
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

import db
import extractors
from auth import require_permission
from books_api import _chapters_from_text, _paras_to_html, _sid, default_content
from permissions import user_can

BASE = Path(__file__).parent
SCANS_DIR = BASE / "uploads" / "scans"
SCANS_DIR.mkdir(parents=True, exist_ok=True)

MAX_SIZE = 120 * 1024 * 1024   # 120 МБ — сканы тяжёлые
DISPLAY_MAX_SIDE = 1700        # длинная сторона картинки страницы для просмотра

ALLOWED = {".pdf", ".djvu", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp", ".zip"}

router = APIRouter(prefix="/api/scans", tags=["scans"])


# ---------------------------------------------------------------- обработка

def _scan_dir(scan_id: int) -> Path:
    return SCANS_DIR / str(scan_id)


def _page_path(scan_id: int, n: int) -> Path:
    return _scan_dir(scan_id) / f"page_{n:04d}.jpg"


def _save_display(img, path: Path):
    """PIL.Image -> компактный JPEG для просмотра в вычитке."""
    im = img
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    w, h = im.size
    if max(w, h) > DISPLAY_MAX_SIDE:
        k = DISPLAY_MAX_SIDE / max(w, h)
        im = im.resize((int(w * k), int(h * k)))
    im.save(path, "JPEG", quality=82)


def _log(scan_id: int, user_id, action: str):
    """Запись в общую историю оцифровки (отдельным подключением)."""
    conn = db.connect()
    try:
        db.add_scan_history(conn, scan_id, user_id, action)
        conn.commit()
    finally:
        conn.close()


def _set_total(conn, scan_id: int, total: int):
    conn.execute("UPDATE scans SET pages_total = ?, updated_at = ? WHERE id = ?",
                 (total, db.now(), scan_id))
    conn.commit()


def _put_pages(conn, scan_id: int, items: list, done: int):
    """items: [(page_no, text)] — страницы готовы, двигаем прогресс."""
    conn.executemany(
        # text_orig = тот же распознанный текст: неизменяемый оригинал OCR
        "INSERT OR REPLACE INTO scan_pages (scan_id, page_no, text, text_orig, verified) VALUES (?,?,?,?,0)",
        [(scan_id, n, t, t) for n, t in items],
    )
    conn.execute("UPDATE scans SET pages_done = ?, updated_at = ? WHERE id = ?",
                 (done, db.now(), scan_id))
    conn.commit()


def _process_pdf(conn, scan_id: int, src: str):
    import pypdfium2 as pdfium
    from pypdf import PdfReader

    # текстовый слой (если PDF не «немой» скан) — быстрее и точнее OCR
    layer: list = []
    try:
        reader = PdfReader(src)
        for page in reader.pages:
            try:
                layer.append(page.extract_text() or "")
            except Exception:
                layer.append("")
    except Exception:
        layer = []

    pdf = pdfium.PdfDocument(src)
    try:
        total = min(len(pdf), extractors.OCR_MAX_PAGES)
        _set_total(conn, scan_id, total)
        batch = extractors.OCR_WORKERS * 2
        done = 0
        for b in range(0, total, batch):
            idxs = list(range(b, min(b + batch, total)))
            images = [pdf[i].render(scale=2.0).to_pil() for i in idxs]
            for i, img in zip(idxs, images):
                _save_display(img, _page_path(scan_id, i + 1))
            texts = {i: (layer[i] if i < len(layer) else "") for i in idxs}
            need = [j for j, i in enumerate(idxs)
                    if len(texts[i].strip()) < extractors.OCR_MIN_CHARS_PER_PAGE]
            if need:
                ocr = extractors._ocr_batch([images[j] for j in need])
                for j, txt in zip(need, ocr):
                    if txt.strip():
                        texts[idxs[j]] = txt
            done = idxs[-1] + 1
            _put_pages(conn, scan_id, [(i + 1, texts[i].strip()) for i in idxs], done)
    finally:
        pdf.close()


def _process_images(conn, scan_id: int, raws: list):
    """raws: список bytes картинок — каждая = страница."""
    import io as _io

    from PIL import Image

    raws = raws[:extractors.OCR_MAX_PAGES]
    _set_total(conn, scan_id, len(raws))
    batch = extractors.OCR_WORKERS * 2
    for b in range(0, len(raws), batch):
        chunk = raws[b:b + batch]
        images = []
        for raw in chunk:
            img = Image.open(_io.BytesIO(raw))
            img.load()
            images.append(img)
        for j, img in enumerate(images):
            _save_display(img, _page_path(scan_id, b + j + 1))
        texts = extractors._ocr_batch(images)
        _put_pages(conn, scan_id,
                   [(b + j + 1, (t or "").strip()) for j, t in enumerate(texts)],
                   b + len(chunk))


def _process_scan(scan_id: int, src: str, ext: str):
    """Фоновый поток: рендерим страницы + распознаём текст."""
    conn = db.connect()
    tmp_pdf = None
    try:
        from ai_api import apply_ocr_settings
        apply_ocr_settings()  # актуальные языки и лимит страниц из админки

        if ext == ".djvu":
            if not shutil.which("ddjvu"):
                raise ValueError("для DjVu нужна утилита ddjvu (запустите систему в Docker)")
            tmp_pdf = f"{src}.conv.pdf"
            subprocess.run(["ddjvu", "-format=pdf", "-quality=85", src, tmp_pdf],
                           check=True, capture_output=True, timeout=900)
            src, ext = tmp_pdf, ".pdf"

        if ext == ".pdf":
            _process_pdf(conn, scan_id, src)
        elif ext == ".zip":
            with zipfile.ZipFile(src) as z:
                names = sorted(
                    n for n in z.namelist()
                    if not n.endswith("/") and Path(n).suffix.lower() in
                    (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp")
                )
                if not names:
                    raise ValueError("в ZIP-архиве не нашлось фотографий страниц")
                raws = [z.read(n) for n in names]
            _process_images(conn, scan_id, raws)
        else:  # одиночная картинка
            _process_images(conn, scan_id, [open(src, "rb").read()])

        row = conn.execute("SELECT pages_done FROM scans WHERE id = ?", (scan_id,)).fetchone()
        if not row or not row["pages_done"]:
            raise ValueError("не удалось получить ни одной страницы")
        conn.execute("UPDATE scans SET status = 'ready', updated_at = ? WHERE id = ?",
                     (db.now(), scan_id))
        conn.commit()
    except Exception as e:  # noqa: BLE001 — причина уходит пользователю в карточку
        msg = str(e)
        if isinstance(e, subprocess.CalledProcessError):
            msg = "не удалось прочитать DjVu: " + e.stderr.decode("utf-8", "ignore")[:200]
        try:
            conn.execute("UPDATE scans SET status = 'error', error = ?, updated_at = ? WHERE id = ?",
                         (msg[:500], db.now(), scan_id))
            conn.commit()
        except Exception:
            pass
    finally:
        if tmp_pdf and os.path.exists(tmp_pdf):
            os.unlink(tmp_pdf)
        conn.close()


def _chapters_from_structure(pages: list, structure: dict) -> list:
    """Главы/параграфы по структуре от ИИ: режем текст по диапазонам страниц скана.

    pages: строки scan_pages (page_no, text) по порядку. Диапазон параграфа —
    от его page_from до page_from следующего параграфа (или конца главы/книги).
    """
    by_no = {p["page_no"]: (p["text"] or "").strip() for p in pages}
    max_no = max(by_no) if by_no else 0

    def pages_text(a: int, b: int) -> str:
        return "\n\n".join(by_no.get(n, "") for n in range(a, b + 1) if by_no.get(n)).strip()

    chapters_in = [c for c in structure.get("chapters", []) if c.get("title")]
    chapters = []
    for ci, ch in enumerate(chapters_in):
        ch_from = max(1, int(ch.get("page_from") or 1))
        ch_to = (max(1, int(chapters_in[ci + 1].get("page_from") or 1)) - 1
                 if ci + 1 < len(chapters_in) else max_no)
        secs_in = [x for x in ch.get("sections", []) if x.get("title")]
        if not secs_in:  # глава без параграфов — весь её текст одним параграфом
            secs_in = [{"title": ch["title"], "page_from": ch_from}]
        secs = []
        for si, sec in enumerate(secs_in):
            s_from = max(ch_from, int(sec.get("page_from") or ch_from))
            s_to = (max(ch_from, int(secs_in[si + 1].get("page_from") or ch_from)) - 1
                    if si + 1 < len(secs_in) else ch_to)
            body_text = pages_text(s_from, max(s_from, s_to))
            secs.append({
                "id": _sid(), "kind": "paragraph", "title": sec["title"][:200],
                "goals": "", "motivation": "",
                "body": _paras_to_html([x for x in re.split(r"\n\s*\n", body_text) if x.strip()]),
                "examples": "", "summary": "", "tasks": "", "homework": "",
                "questions": "", "test": "",
            })
        chapters.append({"id": _sid(), "title": ch["title"][:200], "sections": secs})
    return chapters or _chapters_from_text("\n\n".join(by_no.values()))


# ---------------------------------------------------------------- endpoints

@router.get("")
def list_scans(user: dict = Depends(require_permission("books.view"))):
    conn = db.connect()
    try:
        rows = conn.execute(
            "SELECT s.*, u.name AS creator_name, b.title AS book_title, "
            " (SELECT COUNT(*) FROM scan_pages p WHERE p.scan_id = s.id AND p.verified = 1) AS verified_count "
            "FROM scans s JOIN users u ON u.id = s.created_by "
            "LEFT JOIN books b ON b.id = s.book_id "
            "ORDER BY s.id DESC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.post("")
async def create_scan(
    file: UploadFile = File(...),
    title: str = Form(""),
    subject: str = Form(""),
    grade: str = Form(""),
    language: str = Form("русский"),
    user: dict = Depends(require_permission("books.create")),
):
    name = file.filename or "скан"
    ext = Path(name).suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(400, f"Формат {ext or '?'} не подходит для оцифровки. "
                                 "Нужен скан: PDF, DjVu, ZIP с фото или изображения страниц.")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Пустой файл")
    if len(raw) > MAX_SIZE:
        raise HTTPException(400, "Файл слишком большой (до 120 МБ)")

    scan_title = (title.strip() or Path(name).stem)[:200]
    conn = db.connect()
    try:
        cur = conn.execute(
            "INSERT INTO scans (title, filename, subject, grade, language, status, created_by, created_at, updated_at) "
            "VALUES (?,?,?,?,?, 'processing', ?, ?, ?)",
            (scan_title, name[:200], subject, grade, language or "русский",
             user["id"], db.now(), db.now()),
        )
        scan_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()

    d = _scan_dir(scan_id)
    d.mkdir(parents=True, exist_ok=True)
    src = d / f"original{ext}"
    src.write_bytes(raw)

    threading.Thread(target=_process_scan, args=(scan_id, str(src), ext), daemon=True).start()
    db.add_audit(user["id"], "scan", f"Загружен скан «{scan_title}» ({name})")
    _log(scan_id, user["id"], f"загрузил скан ({name})")
    return {"id": scan_id}


@router.get("/{scan_id}")
def get_scan(scan_id: int, user: dict = Depends(require_permission("books.view"))):
    conn = db.connect()
    try:
        row = conn.execute(
            "SELECT s.*, u.name AS creator_name, b.title AS book_title "
            "FROM scans s JOIN users u ON u.id = s.created_by "
            "LEFT JOIN books b ON b.id = s.book_id WHERE s.id = ?",
            (scan_id,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Скан не найден")
        d = dict(row)
        d["pages"] = db.rows_to_dicts(conn.execute(
            "SELECT page_no, verified, LENGTH(text) AS chars "
            "FROM scan_pages WHERE scan_id = ? ORDER BY page_no", (scan_id,),
        ).fetchall())
        try:
            d["structure"] = json.loads(d["structure"]) if d.get("structure") else None
        except Exception:
            d["structure"] = None
        return d
    finally:
        conn.close()


@router.get("/{scan_id}/img/{page_no}")
def get_page_image(scan_id: int, page_no: int, user: dict = Depends(require_permission("books.view"))):
    p = _page_path(scan_id, page_no)
    if not p.exists():
        raise HTTPException(404, "Страница не найдена")
    return FileResponse(p, media_type="image/jpeg",
                        headers={"Cache-Control": "private, max-age=86400"})


@router.get("/{scan_id}/page/{page_no}")
def get_page(scan_id: int, page_no: int, user: dict = Depends(require_permission("books.view"))):
    conn = db.connect()
    try:
        row = conn.execute(
            "SELECT text, text_orig, verified FROM scan_pages WHERE scan_id = ? AND page_no = ?",
            (scan_id, page_no),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Страница не найдена")
        return dict(row)
    finally:
        conn.close()


class PageBody(BaseModel):
    text: str | None = None
    verified: bool | None = None


@router.put("/{scan_id}/page/{page_no}")
def save_page(scan_id: int, page_no: int, body: PageBody,
              user: dict = Depends(require_permission("books.edit"))):
    conn = db.connect()
    try:
        row = conn.execute(
            "SELECT text, verified FROM scan_pages WHERE scan_id = ? AND page_no = ?",
            (scan_id, page_no),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Страница не найдена")
        if body.text is not None and body.text != row["text"]:
            conn.execute("UPDATE scan_pages SET text = ? WHERE scan_id = ? AND page_no = ?",
                         (body.text, scan_id, page_no))
            db.add_scan_history(conn, scan_id, user["id"], f"исправил текст страницы {page_no}")
        if body.verified is not None and bool(body.verified) != bool(row["verified"]):
            conn.execute("UPDATE scan_pages SET verified = ? WHERE scan_id = ? AND page_no = ?",
                         (1 if body.verified else 0, scan_id, page_no))
            if body.verified:
                db.add_scan_history(conn, scan_id, user["id"], f"отметил страницу {page_no} проверенной")
        conn.execute("UPDATE scans SET updated_at = ? WHERE id = ?", (db.now(), scan_id))
        conn.commit()
        return {"ok": True, "saved_at": db.now()}
    finally:
        conn.close()


@router.post("/{scan_id}/page/{page_no}/restore")
def restore_page(scan_id: int, page_no: int,
                 user: dict = Depends(require_permission("books.edit"))):
    """Вернуть неизменяемый оригинал OCR — спасение от случайного удаления текста."""
    conn = db.connect()
    try:
        row = conn.execute(
            "SELECT text_orig FROM scan_pages WHERE scan_id = ? AND page_no = ?",
            (scan_id, page_no),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Страница не найдена")
        conn.execute("UPDATE scan_pages SET text = ?, verified = 0 WHERE scan_id = ? AND page_no = ?",
                     (row["text_orig"], scan_id, page_no))
        db.add_scan_history(conn, scan_id, user["id"], f"вернул оригинал распознавания страницы {page_no}")
        conn.execute("UPDATE scans SET updated_at = ? WHERE id = ?", (db.now(), scan_id))
        conn.commit()
        return {"ok": True, "text": row["text_orig"]}
    finally:
        conn.close()


@router.get("/{scan_id}/history")
def scan_history(scan_id: int, user: dict = Depends(require_permission("books.view"))):
    """Общая история оцифровки: видна всем — кто что сделал со сканом."""
    conn = db.connect()
    try:
        rows = conn.execute(
            "SELECT h.action, h.created_at, u.name AS user_name "
            "FROM scan_history h JOIN users u ON u.id = h.user_id "
            "WHERE h.scan_id = ? ORDER BY h.id DESC LIMIT 120", (scan_id,),
        ).fetchall()
        return db.rows_to_dicts(rows)
    finally:
        conn.close()


# ------------------------------------------------- операции со страницами

def _require_ready(conn, scan_id: int):
    scan = conn.execute("SELECT * FROM scans WHERE id = ?", (scan_id,)).fetchone()
    if not scan:
        raise HTTPException(404, "Скан не найден")
    if scan["status"] != "ready":
        raise HTTPException(409, "Дождитесь окончания распознавания")
    return scan


class RotateBody(BaseModel):
    deg: int = 90  # 90 = по часовой, -90 = против, 180 = вверх ногами


@router.post("/{scan_id}/page/{page_no}/rotate")
def rotate_page(scan_id: int, page_no: int, body: RotateBody,
                user: dict = Depends(require_permission("books.edit"))):
    if body.deg not in (90, -90, 180):
        raise HTTPException(400, "Поворот только на 90, -90 или 180 градусов")
    p = _page_path(scan_id, page_no)
    if not p.exists():
        raise HTTPException(404, "Страница не найдена")
    from PIL import Image
    with Image.open(p) as img:
        img.load()
        # PIL.rotate крутит ПРОТИВ часовой — знак меняем, чтобы deg=90 был «по часовой»
        rot = img.rotate(-body.deg, expand=True)
    _save_display(rot, p)
    conn = db.connect()
    try:
        db.add_scan_history(conn, scan_id, user["id"], f"повернул страницу {page_no}")
        conn.execute("UPDATE scans SET updated_at = ? WHERE id = ?", (db.now(), scan_id))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


def _renumber_files(scan_id: int, mapping: dict):
    """mapping: {старый page_no: новый page_no} — переименование через tmp-имена."""
    d = _scan_dir(scan_id)
    for old in mapping:
        src = _page_path(scan_id, old)
        if src.exists():
            src.rename(d / f"tmp_{old:04d}.jpg")
    for old, new in mapping.items():
        tmp = d / f"tmp_{old:04d}.jpg"
        if tmp.exists():
            tmp.rename(_page_path(scan_id, new))


def _renumber_rows(conn, scan_id: int, mapping: dict):
    """Перенумерация строк scan_pages без конфликтов составного PK (через минус)."""
    for old, new in mapping.items():
        conn.execute("UPDATE scan_pages SET page_no = ? WHERE scan_id = ? AND page_no = ?",
                     (-new, scan_id, old))
    conn.execute("UPDATE scan_pages SET page_no = -page_no WHERE scan_id = ? AND page_no < 0",
                 (scan_id,))


@router.delete("/{scan_id}/page/{page_no}")
def delete_page(scan_id: int, page_no: int,
                user: dict = Depends(require_permission("books.edit"))):
    conn = db.connect()
    try:
        scan = _require_ready(conn, scan_id)
        total = scan["pages_total"] or 0
        if total <= 1:
            raise HTTPException(400, "Нельзя удалить единственную страницу скана")
        if not conn.execute("SELECT 1 FROM scan_pages WHERE scan_id = ? AND page_no = ?",
                            (scan_id, page_no)).fetchone():
            raise HTTPException(404, "Страница не найдена")
        conn.execute("DELETE FROM scan_pages WHERE scan_id = ? AND page_no = ?",
                     (scan_id, page_no))
        mapping = {n: n - 1 for n in range(page_no + 1, total + 1)}
        _renumber_rows(conn, scan_id, mapping)
        conn.execute("UPDATE scans SET pages_total = ?, pages_done = ?, updated_at = ? WHERE id = ?",
                     (total - 1, total - 1, db.now(), scan_id))
        conn.commit()
    finally:
        conn.close()
    p = _page_path(scan_id, page_no)
    if p.exists():
        p.unlink()
    _renumber_files(scan_id, mapping)
    db.add_audit(user["id"], "scan", f"Скан #{scan_id}: удалена страница {page_no}")
    _log(scan_id, user["id"], f"удалил страницу {page_no}")
    return {"ok": True, "pages_total": total - 1}


class ReorderBody(BaseModel):
    order: list[int]  # текущие номера страниц в НОВОМ порядке


@router.post("/{scan_id}/pages/reorder")
def reorder_pages(scan_id: int, body: ReorderBody,
                  user: dict = Depends(require_permission("books.edit"))):
    conn = db.connect()
    try:
        scan = _require_ready(conn, scan_id)
        total = scan["pages_total"] or 0
        if sorted(body.order) != list(range(1, total + 1)):
            raise HTTPException(400, "Порядок должен содержать каждую страницу ровно один раз")
        mapping = {old: i + 1 for i, old in enumerate(body.order) if old != i + 1}
        if not mapping:
            return {"ok": True}
        _renumber_rows(conn, scan_id, mapping)
        conn.execute("UPDATE scans SET updated_at = ? WHERE id = ?", (db.now(), scan_id))
        conn.commit()
    finally:
        conn.close()
    _renumber_files(scan_id, mapping)
    db.add_audit(user["id"], "scan", f"Скан #{scan_id}: изменён порядок страниц")
    _log(scan_id, user["id"], "изменил порядок страниц")
    return {"ok": True}


@router.post("/{scan_id}/page/{page_no}/replace")
async def replace_page(scan_id: int, page_no: int, file: UploadFile = File(...),
                       user: dict = Depends(require_permission("books.edit"))):
    """Замена страницы новым фото/сканом: картинка перерисовывается, текст — заново OCR."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"):
        raise HTTPException(400, "Замена — только изображением страницы (JPG/PNG/TIFF/WebP)")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Пустой файл")
    if len(raw) > MAX_SIZE:
        raise HTTPException(400, "Файл слишком большой")
    conn = db.connect()
    try:
        _require_ready(conn, scan_id)
        if not conn.execute("SELECT 1 FROM scan_pages WHERE scan_id = ? AND page_no = ?",
                            (scan_id, page_no)).fetchone():
            raise HTTPException(404, "Страница не найдена")
        import io as _io

        from PIL import Image

        from ai_api import apply_ocr_settings
        apply_ocr_settings()
        img = Image.open(_io.BytesIO(raw))
        img.load()
        _save_display(img, _page_path(scan_id, page_no))
        text = (extractors._ocr_batch([img])[0] or "").strip()
        # новая страница = новый оригинал OCR
        conn.execute("UPDATE scan_pages SET text = ?, text_orig = ?, verified = 0 WHERE scan_id = ? AND page_no = ?",
                     (text, text, scan_id, page_no))
        db.add_scan_history(conn, scan_id, user["id"], f"заменил страницу {page_no} новым файлом")
        conn.execute("UPDATE scans SET updated_at = ? WHERE id = ?", (db.now(), scan_id))
        conn.commit()
    finally:
        conn.close()
    db.add_audit(user["id"], "scan", f"Скан #{scan_id}: заменена страница {page_no}")
    return {"ok": True, "text": text}


# ------------------------------------------------- проверка качества OCR

# те же приметы OCR-мусора, что и в вычитке на фронте (SUS_RE в platform.js)
_SUS_RE = re.compile(
    r"[А-Яа-яЁёӨөҮүҢң][A-Za-z]|[A-Za-z][А-Яа-яЁёӨөҮүҢң]"
    r"|[А-Яа-яЁёӨөҮүҢң][0-9]|[0-9][А-Яа-яЁёӨөҮүҢң]|[|¦№]{2,}|[©®™]"
)
EMPTY_CHARS = 20    # меньше — считаем страницу пустой
WEAK_CHARS = 200    # меньше — подозрительно мало текста (плохое качество скана)


@router.get("/{scan_id}/quality")
def quality_report(scan_id: int, user: dict = Depends(require_permission("books.view"))):
    conn = db.connect()
    try:
        scan = conn.execute("SELECT * FROM scans WHERE id = ?", (scan_id,)).fetchone()
        if not scan:
            raise HTTPException(404, "Скан не найден")
        rows = conn.execute(
            "SELECT page_no, text, verified FROM scan_pages WHERE scan_id = ? ORDER BY page_no",
            (scan_id,),
        ).fetchall()
    finally:
        conn.close()
    empty, weak, sus_pages = [], [], []
    sus_total = words_total = 0
    for r in rows:
        t = (r["text"] or "").strip()
        words_total += len(t.split())
        if len(t) < EMPTY_CHARS:
            empty.append(r["page_no"])
            continue
        if len(t) < WEAK_CHARS:
            weak.append(r["page_no"])
        n_sus = len(_SUS_RE.findall(t))
        if n_sus:
            sus_pages.append({"page": r["page_no"], "count": n_sus})
            sus_total += n_sus
    total = len(rows)
    recognized = total - len(empty)
    return {
        "pages_total": total,
        "verified": sum(1 for r in rows if r["verified"]),
        "empty_pages": empty,
        "weak_pages": weak,
        "sus_total": sus_total,
        "sus_pages": sorted(sus_pages, key=lambda x: -x["count"])[:50],
        "words_total": words_total,
        "recognized_pct": round(recognized / total * 100, 1) if total else 0.0,
    }


# ------------------------------------------------- ИИ: структура учебника

STRUCTURE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "title": {"type": "string"},
        "authors": {"type": "array", "items": {"type": "string"}},
        "subject": {"type": "string"},
        "grade": {"type": "string"},
        "language": {"type": "string"},
        "publisher": {"type": "string"},
        "year": {"type": "string"},
        "isbn": {"type": "string"},
        "chapters": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "title": {"type": "string"},
                    "page_from": {"type": "integer"},
                    "sections": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "title": {"type": "string"},
                                "page_from": {"type": "integer"},
                            },
                            "required": ["title", "page_from"],
                        },
                    },
                },
                "required": ["title", "page_from", "sections"],
            },
        },
    },
    "required": ["title", "authors", "subject", "grade", "language",
                 "publisher", "year", "isbn", "chapters"],
}

STRUCTURE_SYSTEM = """Ты — редактор государственной системы оцифровки учебников Кыргызской Республики.
По распознанному (OCR) тексту страниц скана определи структуру и выходные данные учебника.

Правила:
- Названия глав и параграфов бери ИЗ ТЕКСТА (не сочиняй). OCR-опечатки в названиях аккуратно исправляй.
- page_from — номер СТРАНИЦЫ СКАНА (в тексте страницы размечены маркерами [стр. N]), с которой начинается глава/параграф.
- Главы идут по возрастанию page_from; параграфы внутри главы — тоже.
- Если чего-то нет в тексте (ISBN, издательство, год) — верни пустую строку, НЕ выдумывай.
- subject — предмет одним-двумя словами (например «История», «Математика»); grade — класс цифрой (например «9»).
- language — язык текста учебника: «кыргызский» или «русский».
- Если в начале есть титул/оглавление — используй их в первую очередь."""


@router.post("/{scan_id}/structure")
def detect_structure(scan_id: int, user: dict = Depends(require_permission("books.edit"))):
    """ИИ определяет структуру учебника по OCR-тексту; результат хранится в scans.structure."""
    from ai_api import _client, _record_usage, ai_settings
    from ai_writer import _ask

    conn = db.connect()
    try:
        scan = _require_ready(conn, scan_id)
        rows = conn.execute(
            "SELECT page_no, text FROM scan_pages WHERE scan_id = ? ORDER BY page_no",
            (scan_id,),
        ).fetchall()
        # корпус: каждая страница помечена [стр. N]; длинные страницы усечены,
        # общий объём ограничен настройкой ИИ (как в анализе чекера)
        s = ai_settings()
        budget = max(30000, s["max_chars"])
        parts, used = [], 0
        for r in rows:
            t = (r["text"] or "").strip()
            chunk = f"[стр. {r['page_no']}]\n{t[:1500]}"
            if used + len(chunk) > budget:
                parts.append(f"[дальше ещё {len(rows) - len(parts)} стр. — текст опущен]")
                break
            parts.append(chunk)
            used += len(chunk)
        corpus = "\n\n".join(parts)
        if len(corpus.strip()) < 200:
            raise HTTPException(400, "Распознанного текста слишком мало для определения структуры")

        client, openrouter = _client()
        data, usage = _ask(
            client, openrouter, s["model"], STRUCTURE_SYSTEM,
            "Определи структуру этого отсканированного учебника.\n\n" + corpus,
            STRUCTURE_SCHEMA, 8000,
        )
        _record_usage(conn, user["id"], None, None, usage, s["model"])
        conn.execute("UPDATE scans SET structure = ?, updated_at = ? WHERE id = ?",
                     (json.dumps(data, ensure_ascii=False), db.now(), scan_id))
        conn.commit()
    finally:
        conn.close()
    db.add_audit(user["id"], "scan", f"Скан #{scan_id}: ИИ определил структуру учебника")
    _log(scan_id, user["id"], "запустил ИИ-определение структуры")
    return data


class ToBookBody(BaseModel):
    title: str = ""
    subject: str = ""
    grade: str = ""
    language: str = ""
    use_structure: bool = False
    authors: str = ""      # «Фамилия И. О., Фамилия И. О.»
    publisher: str = ""
    year: str = ""
    isbn: str = ""


@router.post("/{scan_id}/to-book")
def to_book(scan_id: int, body: ToBookBody,
            user: dict = Depends(require_permission("books.create"))):
    """Собрать вычитанные страницы в обычный учебник конструктора."""
    conn = db.connect()
    try:
        scan = conn.execute("SELECT * FROM scans WHERE id = ?", (scan_id,)).fetchone()
        if not scan:
            raise HTTPException(404, "Скан не найден")
        if scan["status"] != "ready":
            raise HTTPException(409, "Распознавание ещё не закончено")
        pages = conn.execute(
            "SELECT page_no, text FROM scan_pages WHERE scan_id = ? ORDER BY page_no", (scan_id,),
        ).fetchall()
        text = "\n\n".join(p["text"] for p in pages if p["text"].strip()).strip()
        if not text:
            raise HTTPException(400, "На страницах нет текста — собрать книгу не из чего")

        structure = None
        if body.use_structure and scan["structure"]:
            try:
                structure = json.loads(scan["structure"])
            except Exception:
                structure = None

        title = (body.title.strip() or (structure or {}).get("title") or scan["title"])[:200]
        subject = body.subject or scan["subject"]
        grade = body.grade or scan["grade"]
        language = body.language or scan["language"] or "русский"
        content = default_content(title, subject, grade, language)
        if structure and structure.get("chapters"):
            content["chapters"] = _chapters_from_structure(pages, structure)
        else:
            content["chapters"] = _chapters_from_text(text)
        # выходные сведения — из формы (или из структуры ИИ, если поля не заполнены)
        st = structure or {}
        authors = [a.strip() for a in body.authors.split(",") if a.strip()] or st.get("authors") or []
        content["people"]["authors"] = authors
        content["titul"]["publisher"] = body.publisher.strip() or st.get("publisher") or ""
        content["titul"]["year"] = body.year.strip() or st.get("year") or ""
        content["titul"]["isbn"] = body.isbn.strip() or st.get("isbn") or ""
        cur = conn.execute(
            "INSERT INTO books (title, subject, grade, language, status, content, created_by, created_at, updated_at) "
            "VALUES (?,?,?,?, 'draft', ?, ?, ?, ?)",
            (title, subject, grade, language,
             json.dumps(content, ensure_ascii=False), user["id"], db.now(), db.now()),
        )
        book_id = cur.lastrowid
        conn.execute("INSERT INTO book_members (book_id, user_id, member_role) VALUES (?,?, 'Автор')",
                     (book_id, user["id"]))
        db.add_history(conn, book_id, user["id"], "import",
                       f"Оцифрован скан «{scan['title']}» ({len(pages)} стр.)")
        conn.execute("UPDATE scans SET book_id = ?, updated_at = ? WHERE id = ?",
                     (book_id, db.now(), scan_id))
        db.add_scan_history(conn, scan_id, user["id"], f"собрал скан в учебник «{title}»")
        conn.commit()
        db.add_audit(user["id"], "scan", f"Скан «{scan['title']}» собран в учебник «{title}»")
        return {"book_id": book_id}
    finally:
        conn.close()


@router.delete("/{scan_id}")
def delete_scan(scan_id: int, user: dict = Depends(require_permission("books.create"))):
    conn = db.connect()
    try:
        scan = conn.execute("SELECT * FROM scans WHERE id = ?", (scan_id,)).fetchone()
        if not scan:
            raise HTTPException(404, "Скан не найден")
        if scan["created_by"] != user["id"] and not user_can(user, "admin.system"):
            raise HTTPException(403, "Удалить скан может его автор или администратор")
        conn.execute("DELETE FROM scan_pages WHERE scan_id = ?", (scan_id,))
        conn.execute("DELETE FROM scans WHERE id = ?", (scan_id,))
        conn.commit()
        shutil.rmtree(_scan_dir(scan_id), ignore_errors=True)
        db.add_audit(user["id"], "scan", f"Удалён скан «{scan['title']}»")
        return {"ok": True}
    finally:
        conn.close()
