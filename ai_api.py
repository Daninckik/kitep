# -*- coding: utf-8 -*-
"""OCR + AI-анализ загружаемых документов.

Конвейер: файл -> extractors.extract() (текстовый слой + Tesseract-OCR
rus/kir/eng для сканов) -> Claude (claude-opus-4-8, structured output) ->
вердикт о соответствии требованиям к школьным учебникам КР.
Все запросы к Claude учитываются в ai_usage (токены и стоимость).
"""
import json
import os
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

import db
from auth import require_permission
from extractors import SUPPORTED, extract

router = APIRouter(prefix="/api/aidocs", tags=["ai"])

DEFAULT_MODEL = "claude-opus-4-8"
# Цены USD за 1M токенов (вход, выход)
MODEL_PRICES = {
    "claude-opus-4-8": (5.00, 25.00),
    "claude-opus-4-7": (5.00, 25.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),
}
DEFAULT_MAX_CHARS = 120_000    # объём текста, передаваемый модели
MAX_SIZE = 100 * 1024 * 1024

OCR_LANG_CODES = {"kir": "кыргызский", "rus": "русский", "eng": "английский"}


def ai_settings() -> dict:
    s = db.get_setting("ai", {}) or {}
    model = s.get("model") or DEFAULT_MODEL
    if model not in MODEL_PRICES:
        model = DEFAULT_MODEL
    return {
        "model": model,
        "max_chars": int(s.get("max_chars") or DEFAULT_MAX_CHARS),
        "api_key": s.get("api_key") or "",
        "use_standards": bool(s.get("use_standards", True)),
    }


def ocr_settings() -> dict:
    s = db.get_setting("ocr", {}) or {}
    langs = [x for x in (s.get("langs") or ["rus", "kir", "eng"]) if x in OCR_LANG_CODES]
    return {"langs": langs or ["rus", "eng"], "max_pages": int(s.get("max_pages") or 200)}


def apply_ocr_settings():
    """Применяет настройки OCR из админ-панели к движку extractors."""
    import extractors
    s = ocr_settings()
    extractors._ocr_langs = "+".join(s["langs"])
    extractors.OCR_MAX_PAGES = s["max_pages"]

UPLOADS = Path(__file__).parent / "uploads"
UPLOADS.mkdir(exist_ok=True)

ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "is_textbook": {"type": "boolean"},
        "confidence": {"type": "integer"},
        "detected_subject": {"type": "string"},
        "detected_grade": {"type": "string"},
        "detected_language": {"type": "string"},
        "compliance_percent": {"type": "integer"},
        "verdict": {"type": "string"},
        "meets_state_requirements": {"type": "string", "enum": ["да", "частично", "нет"]},
        "meets_standards": {"type": "string", "enum": ["да", "частично", "нет"]},
        "meets_structure": {"type": "string", "enum": ["да", "частично", "нет"]},
        "formatting_ok": {"type": "string", "enum": ["да", "частично", "нет"]},
        "completeness_ok": {"type": "string", "enum": ["да", "частично", "нет"]},
        "structure": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "section": {"type": "string"},
                    "present": {"type": "boolean"},
                    "comment": {"type": "string"},
                },
                "required": ["section", "present", "comment"],
                "additionalProperties": False,
            },
        },
        "standards_notes": {"type": "string"},
        "formatting_notes": {"type": "string"},
        "completeness_notes": {"type": "string"},
        "recommendations": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "is_textbook", "confidence", "detected_subject", "detected_grade",
        "detected_language", "compliance_percent", "verdict",
        "meets_state_requirements", "meets_standards", "meets_structure",
        "formatting_ok", "completeness_ok", "structure",
        "standards_notes", "formatting_notes", "completeness_notes", "recommendations",
    ],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """Ты — эксперт Министерства просвещения Кыргызской Республики по учебной литературе.
Тебе передают текст документа (возможно, распознанный OCR — допускай ошибки распознавания).
Документ может быть на русском, кыргызском или английском языке (или их смеси) — анализируй
на любом из этих языков одинаково тщательно и по одним и тем же критериям; язык укажи
в detected_language. Вердикты, рекомендации и все текстовые поля ответа всегда пиши по-русски.

Оцени документ по требованиям к школьным учебникам КР:
1. Является ли документ школьным учебником (а не худ. литературой, методичкой, статьёй и т.п.).
2. Соответствие государственным образовательным стандартам КР: предметность, возрастная
   адекватность, научная корректность, светский характер образования, отсутствие
   запрещённой для детей информации (Закон КР № 185 от 21.07.2015).
3. Соответствие структуре государственных учебников КР (портал kitep.edu.kg). Обязательные
   разделы, каждый из которых проверь и включи в structure: титульный лист; сведения об авторах;
   содержание (оглавление); главы; параграфы; практические задания; контрольные вопросы;
   словарь терминов; список литературы; приложения.
4. Корректность оформления (нумерация, заголовки, подписи к иллюстрациям, таблицы).
5. Полноту содержания для заявленного класса и предмета.

Дай явные вердикты («да» / «частично» / «нет») по каждому пункту:
meets_state_requirements — соответствие требованиям государственных школ КР (п. 2);
meets_standards — соответствие образовательным стандартам КР (п. 2);
meets_structure — соответствие структуре государственных учебников (п. 3);
formatting_ok — корректность оформления (п. 4);
completeness_ok — полнота содержания (п. 5).
compliance_percent — целое 0–100, интегральная оценка соответствия государственным требованиям.
confidence — целое 0–100, уверенность в определении типа документа.
recommendations — конкретные шаги по доработке (по-русски, каждая рекомендация отдельно).
verdict — 2–4 предложения итога по-русски. Если текст обрывается (передан фрагмент), оценивай
только по видимой части и отметь это в completeness_notes."""


OPENROUTER_BASE = "https://openrouter.ai/api"


def _resolve_model(model: str, openrouter: bool) -> str:
    """Внутренний id модели -> провайдерский слаг.
    Anthropic: claude-opus-4-8 (как есть). OpenRouter: anthropic/claude-opus-4.8."""
    if not openrouter:
        return model
    base, _, minor = model.rpartition("-")
    return f"anthropic/{base}.{minor}"


def _client():
    """-> (клиент anthropic SDK, флаг openrouter=True). Единственный провайдер —
    OpenRouter: SDK ходит на его Anthropic-совместимый эндпоинт (/v1/messages).
    Прямые подключения к другим ИИ убраны."""
    key = os.environ.get("ANTHROPIC_API_KEY") or ai_settings()["api_key"]
    if not key:
        raise HTTPException(
            503,
            "ИИ не настроен: задайте ключ OpenRouter (sk-or-…) в админ-панели "
            "(Администрирование → OCR / AI) или переменной окружения ANTHROPIC_API_KEY.",
        )
    if not key.startswith("sk-or-"):
        raise HTTPException(
            503,
            "Система работает только через OpenRouter: нужен ключ вида sk-or-… "
            "(текущий ключ не похож на ключ OpenRouter).",
        )
    import anthropic
    return anthropic.Anthropic(api_key=key, base_url=OPENROUTER_BASE), True


def _record_usage(conn, user_id, book_id, job_id, usage, model):
    p_in, p_out = MODEL_PRICES.get(model, MODEL_PRICES[DEFAULT_MODEL])
    cost = usage.input_tokens * p_in / 1e6 + usage.output_tokens * p_out / 1e6
    conn.execute(
        "INSERT INTO ai_usage (user_id, book_id, job_id, model, input_tokens, output_tokens, cost_usd, created_at) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (user_id, book_id, job_id, model, usage.input_tokens, usage.output_tokens, cost, db.now()),
    )
    return cost


def _standards_context(subject: str) -> str:
    """Тексты образовательных стандартов КР для system-подсказки (по предмету + общие)."""
    if not ai_settings()["use_standards"]:
        return ""
    conn = db.connect()
    try:
        rows = conn.execute(
            "SELECT title, subject, grade, text FROM standards "
            "WHERE text != '' AND (subject = '' OR subject = ?) ORDER BY id LIMIT 10",
            (subject or "",),
        ).fetchall()
    finally:
        conn.close()
    if not rows:
        return ""
    parts, budget = [], 20_000
    for r in rows:
        head = f"[{r['title']}" + (f" · {r['subject']}" if r["subject"] else "") + \
               (f" · {r['grade']} класс" if r["grade"] else "") + "]"
        chunk = f"{head}\n{r['text'][:budget]}"
        budget -= len(chunk)
        parts.append(chunk)
        if budget <= 0:
            break
    return (
        "\n\nПри оценке ОБЯЗАТЕЛЬНО сверяйся со следующими выдержками из образовательных "
        "стандартов и требований КР (загружены администратором системы):\n" + "\n\n".join(parts)
    )


def analyze_text_with_claude(text: str, filename: str, meta_hint: str = "", subject: str = "") -> tuple[dict, object, str]:
    """-> (результат анализа, usage, model)."""
    client, openrouter = _client()
    s = ai_settings()
    truncated = len(text) > s["max_chars"]
    payload = text[:s["max_chars"]]
    user_msg = (
        f"Файл: {filename}\n{meta_hint}"
        + (f"Заявленный предмет: {subject}\n" if subject else "")
        + ("\n[Текст обрезан — передано начало документа]\n" if truncated else "\n")
        + "---- ТЕКСТ ДОКУМЕНТА ----\n" + payload
    )
    response = client.messages.create(
        model=_resolve_model(s["model"], openrouter),
        max_tokens=8000,
        system=SYSTEM_PROMPT + _standards_context(subject),
        output_config={"format": {"type": "json_schema", "schema": ANALYSIS_SCHEMA}},
        messages=[{"role": "user", "content": user_msg}],
    )
    if response.stop_reason == "refusal":
        raise HTTPException(422, "Модель отклонила анализ этого документа")
    raw = next(b.text for b in response.content if b.type == "text")
    return json.loads(raw), response.usage, s["model"]


def run_ai_on_pages(pages, notes, filename, subject, user_id, book_id=None) -> dict:
    """AI-анализ уже извлечённого текста (общий конвейер для загрузки в разделе
    AI и для проверки книг). Пишет ai_jobs/ai_usage. Ошибки не бросает —
    возвращает {"error": ...}, чтобы отчёт по Закону № 185 не пропадал."""
    text = "\n\n".join(f"[{p['label']}]\n{p['text']}" for p in pages)
    ocr_used = any("OCR" in n for n in notes)
    started = time.time()
    conn = db.connect()
    try:
        cur = conn.execute(
            "INSERT INTO ai_jobs (user_id, book_id, filename, status, pages, ocr_used, created_at) "
            "VALUES (?,?,?, 'running', ?, ?, ?)",
            (user_id, book_id, filename, len(pages), int(ocr_used), db.now()),
        )
        job_id = cur.lastrowid
        conn.commit()
        meta_hint = f"Страниц/фрагментов: {len(pages)}. OCR: {'да' if ocr_used else 'нет'}.\n"
        try:
            result, usage, model = analyze_text_with_claude(text, filename, meta_hint, subject)
        except HTTPException as e:
            conn.execute("UPDATE ai_jobs SET status='error', error=? WHERE id=?",
                         (str(e.detail)[:500], job_id))
            conn.commit()
            return {"error": str(e.detail)}
        except Exception as e:
            conn.execute("UPDATE ai_jobs SET status='error', error=? WHERE id=?", (str(e)[:500], job_id))
            conn.commit()
            return {"error": f"Ошибка AI-анализа: {e}"}
        duration = int((time.time() - started) * 1000)
        cost = _record_usage(conn, user_id, book_id, job_id, usage, model)
        result["notes"] = notes
        conn.execute("UPDATE ai_jobs SET status='done', duration_ms=?, result=? WHERE id=?",
                     (duration, json.dumps(result, ensure_ascii=False), job_id))
        conn.commit()
        db.add_audit(user_id, "ai", f"AI-анализ «{filename}»: {result.get('compliance_percent', '?')}%")
        return {
            "job_id": job_id, "filename": filename, "pages": len(pages),
            "ocr_used": ocr_used, "duration_ms": duration,
            "usage": {"model": model, "input_tokens": usage.input_tokens,
                      "output_tokens": usage.output_tokens, "cost_usd": round(cost, 4)},
            "result": result,
        }
    finally:
        conn.close()


@router.post("/upload")
async def upload_and_analyze(
    file: UploadFile = File(...),
    book_id: str = Form(""),
    subject: str = Form(""),
    user: dict = Depends(require_permission("ai.analyze")),
):
    """ТЗ п.4–5: OCR загруженного файла и AI-анализ соответствия требованиям КР."""
    name = os.path.basename(file.filename or "document")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Пустой файл")
    if len(data) > MAX_SIZE:
        raise HTTPException(413, "Файл больше 100 МБ")
    ext = Path(name).suffix.lower()
    if data[:8] == b"AT&TFORM":
        ext = ".djvu"
        if not name.lower().endswith(".djvu"):
            name += ".djvu"
    if ext not in SUPPORTED:
        raise HTTPException(415, f"Формат {ext or '(нет)'} не поддерживается. Доступны: PDF, DOCX, JPG, PNG, TIFF и др.")

    tmp = UPLOADS / f"ai-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}{ext}"
    tmp.write_bytes(data)
    started = time.time()
    apply_ocr_settings()
    try:
        pages, notes = extract(str(tmp), ext)
    except Exception as e:
        tmp.unlink(missing_ok=True)
        raise HTTPException(422, f"Не удалось извлечь текст: {e}")
    if not pages:
        tmp.unlink(missing_ok=True)
        raise HTTPException(422, "Текст не распознался даже через OCR — проверьте качество скана")

    bid = int(book_id) if book_id.strip().isdigit() else None
    try:
        r = run_ai_on_pages(pages, notes, name, subject, user["id"], bid)
    finally:
        tmp.unlink(missing_ok=True)
    if "error" in r:
        raise HTTPException(503 if "не настроен" in r["error"] else 502, r["error"])
    return r


@router.get("")
def list_jobs(user: dict = Depends(require_permission("ai.analyze"))):
    conn = db.connect()
    try:
        rows = conn.execute(
            "SELECT j.id, j.filename, j.status, j.pages, j.ocr_used, j.duration_ms, j.created_at, "
            " j.book_id, u.name AS user_name "
            "FROM ai_jobs j JOIN users u ON u.id = j.user_id ORDER BY j.id DESC LIMIT 100"
        ).fetchall()
        return db.rows_to_dicts(rows)
    finally:
        conn.close()


@router.get("/{job_id}")
def get_job(job_id: int, user: dict = Depends(require_permission("ai.analyze"))):
    conn = db.connect()
    try:
        row = conn.execute(
            "SELECT j.*, u.name AS user_name FROM ai_jobs j JOIN users u ON u.id = j.user_id WHERE j.id = ?",
            (job_id,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Анализ не найден")
        d = dict(row)
        d["result"] = json.loads(d["result"]) if d["result"] else None
        usage = conn.execute(
            "SELECT model, input_tokens, output_tokens, cost_usd FROM ai_usage WHERE job_id = ?", (job_id,)
        ).fetchone()
        d["usage"] = dict(usage) if usage else None
        return d
    finally:
        conn.close()
