# -*- coding: utf-8 -*-
"""Движок проверки текста книги по категориям rules.CATEGORIES."""
import re

from rules import CATEGORIES, CONTEXT_WHITELIST

MAX_FRAGMENTS_PER_CATEGORY = 60
CONTEXT_CHARS = 110

_COMPILED = [
    {
        **cat,
        "regexes": [re.compile(p, re.IGNORECASE) for p in cat["patterns"]],
    }
    for cat in CATEGORIES
]

_WHITELIST = [(re.compile(w, re.I), re.compile(ctx, re.I)) for w, ctx in CONTEXT_WHITELIST]


def _fragment(text: str, start: int, end: int) -> dict:
    a = max(0, start - CONTEXT_CHARS)
    b = min(len(text), end + CONTEXT_CHARS)
    return {
        "before": ("…" if a > 0 else "") + text[a:start],
        "match": text[start:end],
        "after": text[end:b] + ("…" if b < len(text) else ""),
    }


def _is_whitelisted(word: str, context: str) -> bool:
    for word_re, ctx_re in _WHITELIST:
        if word_re.fullmatch(word) and ctx_re.search(context):
            return True
    return False


AGE_GROUPS = {
    "7-10": "1–4 класс (7–10 лет)",
    "11-14": "5–8 класс (11–14 лет)",
    "15-18": "9–12 класс (15–18 лет)",
}


def analyze(pages: list, age_group: str = "") -> dict:
    """pages: [{"label": str, "text": str}] -> отчёт."""
    categories = []
    total_chars = sum(len(p["text"]) for p in pages)

    for cat in _COMPILED:
        fragments = []
        total_hits = 0
        words = {}
        for page in pages:
            text = page["text"]
            for rx in cat["regexes"]:
                for m in rx.finditer(text):
                    ctx_a = max(0, m.start() - CONTEXT_CHARS)
                    ctx_b = min(len(text), m.end() + CONTEXT_CHARS)
                    if _is_whitelisted(m.group(0), text[ctx_a:ctx_b]):
                        continue
                    total_hits += 1
                    w = m.group(0).lower()
                    words[w] = words.get(w, 0) + 1
                    if len(fragments) < MAX_FRAGMENTS_PER_CATEGORY:
                        frag = _fragment(text, m.start(), m.end())
                        frag["page"] = page["label"]
                        fragments.append(frag)
        if total_hits:
            categories.append(
                {
                    "id": cat["id"],
                    "title": cat["title"],
                    "law": cat["law"],
                    "severity": cat["severity"],
                    "note": cat["note"],
                    "hits": total_hits,
                    "words": sorted(words.items(), key=lambda kv: -kv[1])[:20],
                    "fragments": fragments,
                    "truncated": total_hits > len(fragments),
                }
            )

    sev = {c["severity"] for c in categories}
    if "fail" in sev:
        verdict = "fail"
        verdict_text = (
            "Не соответствует нормам КР: найдена нецензурная брань — "
            "полный запрет для детей (Закон № 185, ст. 2-1, ч. 1, п. 6)."
        )
    elif "banned" in sev:
        verdict = "review"
        verdict_text = (
            "Требуется ручная проверка: найдены фрагменты по категориям, "
            "запрещённым для детей (ст. 2-1, ч. 1). Упоминание темы само по себе "
            "не нарушение — оцените подачу в каждом фрагменте."
        )
    elif "restricted" in sev:
        verdict = "age"
        if age_group == "15-18":
            verdict_text = (
                "Прямых запретов не найдено. Найденный материал относится к категориям, "
                "ограниченным по возрасту (ст. 2-1, ч. 2), — для старшей школы "
                "(15–18 лет) обычно допустим, просмотрите фрагменты."
            )
        elif age_group == "7-10":
            verdict_text = (
                "Прямых запретов не найдено, но есть материал из категорий, ограниченных "
                "по возрасту (ст. 2-1, ч. 2). Для начальной школы (7–10 лет) требования "
                "самые строгие — внимательно оцените каждый фрагмент."
            )
        else:
            verdict_text = (
                "Прямых запретов не найдено. Есть материал из категорий, ограниченных "
                "по возрасту (ст. 2-1, ч. 2), — оцените соответствие целевому классу."
            )
    else:
        verdict = "pass"
        verdict_text = "Замечаний по чек-листу не найдено."

    categories.sort(key=lambda c: {"fail": 0, "banned": 1, "restricted": 2}[c["severity"]])

    return {
        "verdict": verdict,
        "verdict_text": verdict_text,
        "age_group": age_group,
        "age_label": AGE_GROUPS.get(age_group, "не указан"),
        "pages": len(pages),
        "chars": total_chars,
        "categories": categories,
        "disclaimer": (
            "Автоматический поиск — это предварительный фильтр по словам-маркерам. "
            "Он не заменяет ручную оценку контекста и официальные экспертизы "
            "Министерства просвещения КР (для учебников)."
        ),
    }
