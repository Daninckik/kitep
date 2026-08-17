# -*- coding: utf-8 -*-
"""ИИ-автор учебников: пользователь пишет пожелания — Claude пишет книгу.

Генерация по шагам (план → главы по одной), чтобы не упираться в лимиты
вывода. Прогресс пишется в ai_jobs.result, фронт опрашивает задачу.
Контент — строго в рамках юрисдикции КР: Закон № 185 (запрещённая для детей
информация, без нецензурной лексики), светский характер образования,
методика и структура государственных учебников kitep.edu.kg.
"""
import base64
import json
import os
import re
import threading
import time
import urllib.request
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import db
from ai_api import OPENROUTER_BASE, _client, _record_usage, _resolve_model, _standards_context, ai_settings
from auth import require_permission
from books_api import _sid, default_content

router = APIRouter(prefix="/api/ai-writer", tags=["ai-writer"])

MAX_CHAPTERS = 8

# ---------------------------------------------------------------- схемы

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "annotation": {"type": "string"},
        "intro": {"type": "string"},
        "chapters": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "sections": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string"},
                                "focus": {"type": "string"},
                            },
                            "required": ["title", "focus"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["title", "sections"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["title", "annotation", "intro", "chapters"],
    "additionalProperties": False,
}

CHAPTER_SCHEMA = {
    "type": "object",
    "properties": {
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "goals": {"type": "string"},
                    "body": {"type": "string"},
                    "examples": {"type": "string"},
                    "summary": {"type": "string"},
                    "tasks": {"type": "string"},
                    "homework": {"type": "string"},
                    "questions": {"type": "string"},
                    "test": {"type": "string"},
                },
                "required": ["title", "goals", "body", "examples", "summary",
                             "tasks", "homework", "questions", "test"],
                "additionalProperties": False,
            },
        },
        "glossary": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "term": {"type": "string"},
                    "definition": {"type": "string"},
                },
                "required": ["term", "definition"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["sections", "glossary"],
    "additionalProperties": False,
}

WRITER_SYSTEM = """Ты — опытный автор-методист школьных учебников Кыргызской Республики
(издательство «Окуу китеби», портал kitep.edu.kg). Ты пишешь ОРИГИНАЛЬНЫЙ учебный контент.

ЮРИДИЧЕСКИЕ РАМКИ (обязательны, Кыргызская Республика):
- Закон КР № 185 «О мерах воздействия информации на детей»: категорически запрещены
  нецензурная лексика и бранные слова, сцены жестокости и насилия, темы суицида,
  наркотиков, алкоголя, табака, азартных игр, порнографии, оправдание противоправного
  поведения, неуважение к семье и родителям. Контент строго соответствует возрасту класса.
- Закон КР «Об образовании» № 179: светский характер обучения — без религиозной
  пропаганды и агитации.
- Уважение к государственным символам и народам Кыргызстана.

МЕТОДИКА (как в реальных учебниках kitep.edu.kg, серия «Я и мир»):
- Обращение к ученику на «ты», короткие ясные фразы, дружелюбный тон.
- Примеры из жизни Кыргызстана, где уместно (природа, города, быт, традиции).
- Научная корректность и предметная точность.
- ЛИТЕРАТУРА И ЧТЕНИЕ (рассказы, произведения) — структура как в учебниках
  литературы kitep.edu.kg: главное — САМО ПРОИЗВЕДЕНИЕ, объёмный художественный
  текст (700+ слов, с диалогами и описаниями); goals всегда пустая строка "";
  в конце body — словарик трудных слов <div class='kt-words'>…</div>;
  после произведения обязательны 4–6 вопросов в questions; никакого
  «Я могу…» и чек-листов.

РАЗМЕТКА ПОЛЯ body (HTML, атрибуты ТОЛЬКО в одинарных кавычках):
- ГЛАВНОЕ ПРАВИЛО: раздел начинается СРАЗУ с материала (рассказа, объяснения) —
  первый элемент body всегда обычный <p> с текстом. НИКАКИХ вводных рубрик перед ним.
- Обычный текст: <p>…</p>; ключевые термины: <b>термин</b>.
- Рубрики kt-* НЕОБЯЗАТЕЛЬНЫ. Добавляй рубрику только если она правда нужна
  в этом месте; в художественных рассказах обычно НЕ нужна ни одна.
- Вопрос-обсуждение (если очень уместен — после основного текста, не в начале):
  <div class='kt-reason'><span class='kt-tag'>Давай порассуждаем!</span><p><b>Вопрос?</b> Пояснение.</p></div>
- Подзаголовки-вопросы: <p class='kt-q'>Почему идёт дождь?</p>
- Пошаговый процесс (карточки): <div class='kt-steps'><div><b>1. Шаг.</b> Описание.</div><div><b>2. Шаг.</b> Описание.</div></div>
- Копилка слов: <div class='kt-words'><b>Копилка слов</b><p><i>термин</i> — определение.</p></div>
- Это интересно: <div class='kt-fact'><b>Это интересно</b><p>Факт.</p></div>

ФОРМАТ ОСТАЛЬНЫХ ПОЛЕЙ (обычный текст, без HTML):
- goals: рубрика «Ты узнаешь» — НЕОБЯЗАТЕЛЬНА: заполняй только там, где она
  реально помогает (научные темы); для рассказов и художественных текстов
  оставляй ПУСТУЮ строку "".
- examples: рубрика «Учимся» — 1 разобранный опыт/пример по шагам (или "").
- summary: главный вывод раздела, 2–3 предложения.
- tasks: три уровня, с новой строки: «А) …», «Б) …», «В) …».
- homework: 1–2 задания для дома.
- questions: ОБЯЗАТЕЛЬНО 2–6 вопросов по прочитанному (по сюжету/материалу
  именно этого раздела), каждый с новой строки, без нумерации.
- test: 3 тестовых вопроса с вариантами а)–в) и ответом, формат:
  «1. Вопрос? а) … б) … в) … (ответ: б)»."""


# ---------------------------------------------------------------- иллюстрации

IMAGE_MODEL = "google/gemini-2.5-flash-image"  # модель OpenRouter с выводом картинок
_AI_IMG_DIR = Path(__file__).resolve().parent / "static" / "img" / "ai"


def _image_key() -> str:
    """Генерация картинок идёт напрямую через OpenRouter — нужен ключ sk-or-…"""
    key = os.environ.get("ANTHROPIC_API_KEY") or ai_settings()["api_key"]
    return key if key.startswith("sk-or-") else ""


def gen_image(prompt: str) -> bytes | None:
    """Картинка по описанию. Любая ошибка -> None: книга важнее иллюстраций."""
    key = _image_key()
    if not key:
        return None
    try:
        req = urllib.request.Request(
            OPENROUTER_BASE + "/v1/chat/completions",
            data=json.dumps({
                "model": IMAGE_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "modalities": ["image", "text"],
            }).encode("utf-8"),
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=240) as r:
            data = json.loads(r.read().decode("utf-8"))
        images = (data.get("choices") or [{}])[0].get("message", {}).get("images") or []
        url = images[0]["image_url"]["url"]  # data:image/png;base64,…
        return base64.b64decode(url.split(",", 1)[1])
    except Exception:
        return None


def _illustration_prompt(book_title: str, subject: str, grade: str, sec_title: str, hint: str) -> str:
    return (
        f"Нарисуй одну иллюстрацию для школьного учебника «{book_title}» "
        f"({subject or 'общий предмет'}, {grade or 'школьный'} класс) к разделу «{sec_title}». "
        f"Сюжет: {hint or sec_title}. "
        "Стиль: тёплая детская книжная иллюстрация, мягкие цвета, аккуратная композиция. "
        "СТРОГО БЕЗ текста, букв, цифр и надписей на изображении."
    )


def save_section_image(name: str, raw: bytes) -> str:
    """Сохраняет PNG в static/img/ai и возвращает веб-путь."""
    _AI_IMG_DIR.mkdir(parents=True, exist_ok=True)
    (_AI_IMG_DIR / name).write_bytes(raw)
    return f"/static/img/ai/{name}"


# ---------------------------------------------------------------- генерация

def _ask(client, openrouter, model, system, user_msg, schema, max_tokens):
    resp = client.messages.create(
        model=_resolve_model(model, openrouter),
        max_tokens=max_tokens,
        system=system,
        output_config={"format": {"type": "json_schema", "schema": schema}},
        messages=[{"role": "user", "content": user_msg}],
        timeout=900.0,
    )
    if resp.stop_reason == "refusal":
        raise ValueError("модель отклонила запрос — переформулируйте пожелания")
    raw = next(b.text for b in resp.content if b.type == "text")
    return json.loads(raw), resp.usage


def _progress(conn, job_id: int, stage: str, done: int, total: int):
    conn.execute("UPDATE ai_jobs SET result = ? WHERE id = ?",
                 (json.dumps({"stage": stage, "done": done, "total": total},
                             ensure_ascii=False), job_id))
    conn.commit()


def _write_book_job(job_id: int, user_id: int, wishes: str, subject: str,
                    grade: str, language: str, n_chapters: int):
    started = time.time()
    conn = db.connect()
    try:
        client, openrouter = _client()
        s = ai_settings()
        system = WRITER_SYSTEM + _standards_context(subject)
        total = n_chapters + 1

        base_ctx = (
            f"Предмет: {subject or 'по пожеланиям'}. Класс: {grade or 'по пожеланиям'}. "
            f"Язык учебника: {language or 'русский'} (весь контент пиши на этом языке).\n"
            f"Пожелания заказчика:\n{wishes.strip()}"
        )

        # 1) план книги
        _progress(conn, job_id, "Составляем план книги…", 0, total)
        plan, usage = _ask(
            client, openrouter, s["model"], system,
            "Составь план школьного учебника.\n" + base_ctx +
            f"\n\nНужно РОВНО {n_chapters} глав, в каждой РОВНО 2 раздела (А и Б, "
            "названия разделов начинай с «А. » и «Б. »). intro — вводный текст "
            "«Как пользоваться этой книгой» (5–7 предложений, на «ты»). "
            "focus — 1–2 предложения, что раскрыть в разделе.",
            PLAN_SCHEMA, 4000,
        )
        _record_usage(conn, user_id, None, job_id, usage, s["model"])
        conn.commit()

        chapters_plan = plan["chapters"][:n_chapters]
        outline = "\n".join(
            f"Глава {i}. {ch['title']}: " + "; ".join(x["title"] for x in ch.get("sections", []))
            for i, ch in enumerate(chapters_plan, 1)
        )

        # 2) главы по одной
        content_chapters, glossary, seen_terms = [], [], set()
        for i, ch in enumerate(chapters_plan, 1):
            _progress(conn, job_id, f"Пишем главу {i} из {n_chapters}: «{ch['title']}»", i, total)
            secs_hint = "\n".join(
                f"- {x['title']} (фокус: {x.get('focus', '')})" for x in ch.get("sections", [])[:2]
            )
            data, usage = _ask(
                client, openrouter, s["model"], system,
                f"Книга: «{plan['title']}». {base_ctx}\n\nПлан книги:\n{outline}\n\n"
                f"Напиши ПОЛНОСТЬЮ главу {i}: «{ch['title']}».\nРазделы:\n{secs_hint}\n\n"
                "Для КАЖДОГО раздела заполни все поля по формату. body — 350–500 слов, "
                "начинается СРАЗУ с материала/рассказа (первый элемент — <p> с текстом); "
                "рубрики kt-* — только там, где реально уместны. После рассказа обязательно "
                "2–6 вопросов в поле questions. В glossary добавь 3–5 новых терминов главы. "
                "Не повторяй материал других глав.",
                CHAPTER_SCHEMA, 16000,
            )
            _record_usage(conn, user_id, None, job_id, usage, s["model"])
            conn.commit()
            sections = []
            for si, x in enumerate(data["sections"][:2]):
                sec = {
                    "id": _sid(), "kind": "paragraph",
                    "title": x["title"],
                    "goals": x["goals"], "motivation": "",
                    "body": x["body"], "examples": x["examples"], "summary": x["summary"],
                    "tasks": x["tasks"], "homework": x["homework"],
                    "questions": x["questions"], "test": x["test"],
                }
                # иллюстрация к разделу — рисует ИИ; без ключа OpenRouter или при
                # ошибке раздел просто остаётся без картинки
                _progress(conn, job_id, f"Рисуем иллюстрацию к главе {i}…", i, total)
                hint = next((p.get("focus", "") for p in ch.get("sections", [])
                             if p.get("title") == x["title"]), "")
                raw_img = gen_image(_illustration_prompt(plan["title"], subject, grade, x["title"], hint))
                if raw_img:
                    sec["image"] = save_section_image(f"aiw{job_id}-{i}-{si + 1}.png", raw_img)
                sections.append(sec)
            # ИИ часто сам пишет «Глава N.» в названии (порой дважды) — срезаем все префиксы
            ch_title = ch["title"].strip()
            _pref = re.compile(r"^\s*(?:глава\s*\d*|\d+\s*-\s*бөлүм)\s*[.:—-]?\s*", re.I)
            while _pref.match(ch_title) and _pref.sub("", ch_title, count=1).strip():
                ch_title = _pref.sub("", ch_title, count=1).strip()
            ch_title = ch_title or ch["title"]
            content_chapters.append({"id": _sid(), "title": f"Глава {i}. {ch_title}", "sections": sections})
            for g in data.get("glossary", []):
                t = g["term"].strip()
                if t and t.lower() not in seen_terms:
                    seen_terms.add(t.lower())
                    glossary.append({"term": t, "definition": g["definition"].strip()})

        # 3) собираем книгу
        _progress(conn, job_id, "Собираем учебник…", total, total)
        title = (plan["title"] or "Учебник").strip()[:200]
        content = default_content(title, subject, grade, language or "русский")
        content["annotation"] = plan.get("annotation", "")
        content["intro"] = plan.get("intro", "")
        content["chapters"] = content_chapters
        content["glossary"] = sorted(glossary, key=lambda g: g["term"].lower())[:60]
        content["titul"]["year"] = time.strftime("%Y")

        cur = conn.execute(
            "INSERT INTO books (title, subject, grade, language, status, content, created_by, created_at, updated_at) "
            "VALUES (?,?,?,?, 'draft', ?, ?, ?, ?)",
            (title, subject, grade, language or "русский",
             json.dumps(content, ensure_ascii=False), user_id, db.now(), db.now()),
        )
        book_id = cur.lastrowid
        conn.execute("INSERT INTO book_members (book_id, user_id, member_role) VALUES (?,?, 'Автор')",
                     (book_id, user_id))
        db.add_history(conn, book_id, user_id, "create",
                       f"Учебник написан ИИ по пожеланиям ({n_chapters} гл.)")
        conn.execute(
            "UPDATE ai_jobs SET status='done', duration_ms=?, result=?, book_id=? WHERE id=?",
            (int((time.time() - started) * 1000),
             json.dumps({"book_id": book_id}, ensure_ascii=False), book_id, job_id),
        )
        conn.commit()
        db.add_audit(user_id, "ai", f"ИИ написал учебник «{title}» ({n_chapters} гл.)")
    except Exception as e:  # noqa: BLE001 — причина уходит в карточку задачи
        msg = getattr(e, "detail", None) or str(e)
        try:
            conn.execute("UPDATE ai_jobs SET status='error', error=? WHERE id=?",
                         (str(msg)[:500], job_id))
            conn.commit()
        except Exception:
            pass
    finally:
        conn.close()


# ---------------------------------------------------------------- endpoints

class WriteBody(BaseModel):
    wishes: str
    subject: str = ""
    grade: str = ""
    language: str = "русский"
    chapters: int = 3


@router.post("")
def start_writing(body: WriteBody, user: dict = Depends(require_permission("books.create"))):
    if len(body.wishes.strip()) < 10:
        raise HTTPException(400, "Опишите пожелания к книге хотя бы одним предложением")
    n = max(1, min(MAX_CHAPTERS, int(body.chapters)))
    _client()  # ключ не настроен -> сразу понятная ошибка 503, поток не стартуем
    conn = db.connect()
    try:
        cur = conn.execute(
            "INSERT INTO ai_jobs (user_id, filename, status, created_at) VALUES (?,?, 'running', ?)",
            (user["id"], f"ИИ-книга: {(body.subject or body.wishes.strip()[:60])}", db.now()),
        )
        job_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()
    threading.Thread(
        target=_write_book_job,
        args=(job_id, user["id"], body.wishes, body.subject, body.grade, body.language, n),
        daemon=True,
    ).start()
    db.add_audit(user["id"], "ai", f"Запущено ИИ-написание книги ({n} гл.)")
    return {"job_id": job_id}


@router.get("/{job_id}")
def writing_status(job_id: int, user: dict = Depends(require_permission("books.view"))):
    conn = db.connect()
    try:
        row = conn.execute("SELECT status, result, error, book_id FROM ai_jobs WHERE id = ?",
                           (job_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Задача не найдена")
        out = {"status": row["status"], "book_id": row["book_id"], "error": row["error"] or ""}
        try:
            out["progress"] = json.loads(row["result"]) if row["result"] else None
        except json.JSONDecodeError:
            out["progress"] = None
        return out
    finally:
        conn.close()
