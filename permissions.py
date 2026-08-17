# -*- coding: utf-8 -*-
"""Ролевая модель платформы и маршрут согласования учебника.

12 ролей по ТЗ; каждой роли — набор прав (permissions). Проверка прав —
auth.require_permission(). Маршрут согласования — WORKFLOW.
"""

ROLES = {
    "superadmin":   "Суперадминистратор",
    "admin":        "Администратор",
    "author":       "Автор",
    "coauthor":     "Соавтор",
    "chief_editor": "Главный редактор",
    "editor":       "Редактор",
    "proofreader":  "Корректор",
    "layouter":     "Верстальщик",
    "designer":     "Дизайнер-иллюстратор",
    "art_editor":   "Художественный редактор",
    "methodist":    "Методист",
    "lawyer":       "Юрист",
    "reviewer":     "Рецензент",
    "ministry":     "Эксперт Министерства",
    "observer":     "Наблюдатель",
}

# Права:
#   books.view      — видеть книги и их содержимое
#   books.create    — создавать книги
#   books.edit      — редактировать содержимое (для автора/соавтора — только свои книги)
#   books.edit_any  — редактировать любые книги
#   books.delete    — удалять книги
#   books.members   — управлять участниками книги
#   books.versions  — создавать/восстанавливать версии
#   books.comment   — оставлять комментарии
#   workflow.*      — переводить книгу по этапам согласования
#   ai.analyze      — запускать OCR/AI-анализ
#   stats.view      — раздел статистики
#   admin.users     — управление пользователями
PERM_LABELS = {
    "books.view":     "Просмотр учебников",
    "books.create":   "Создание учебников",
    "books.edit":     "Редактирование (свои книги)",
    "books.edit_any": "Редактирование любых книг",
    "books.delete":   "Удаление учебников",
    "books.members":  "Управление участниками",
    "books.versions": "Версии (создание/восстановление)",
    "books.comment":  "Комментарии",
    "workflow.submit":    "Отправка на редактуру",
    "workflow.editorial": "Этап: редактура",
    "workflow.methodist": "Этап: методист",
    "workflow.lawyer":    "Этап: юрист",
    "workflow.reviewer":  "Этап: рецензент",
    "workflow.ministry":  "Этап: Министерство",
    "workflow.publish":   "Публикация",
    "pipeline.work":   "Конвейер: работа на своём этапе",
    "pipeline.manage": "Конвейер: исполнители, сроки, возвраты",
    "ai.analyze":     "OCR и AI-анализ",
    "stats.view":     "Статистика",
    "admin.users":    "Админ: пользователи",
    "admin.system":   "Админ: система",
}

_COMMON_VIEW = {"books.view", "books.comment"}
_EDIT = _COMMON_VIEW | {"books.edit", "books.versions", "ai.analyze"}

DEFAULT_ROLE_PERMISSIONS = {
    "superadmin": {"*"},
    "admin": _EDIT | {
        "books.create", "books.edit_any", "books.delete", "books.members",
        "stats.view", "admin.users", "admin.system",
        "workflow.editorial", "workflow.methodist", "workflow.lawyer",
        "workflow.reviewer", "workflow.ministry", "workflow.publish",
        "pipeline.work", "pipeline.manage",
    },
    "author":       _EDIT | {"books.create", "books.members", "workflow.submit", "pipeline.work"},
    "coauthor":     _EDIT | {"pipeline.work"},
    "chief_editor": _EDIT | {"books.edit_any", "workflow.editorial", "stats.view",
                             "pipeline.work", "pipeline.manage"},
    "editor":       _EDIT | {"books.edit_any", "workflow.editorial", "pipeline.work"},
    "proofreader":  _EDIT | {"books.edit_any", "workflow.editorial", "pipeline.work"},
    "layouter":     _EDIT | {"books.edit_any", "pipeline.work"},
    "designer":     _EDIT | {"books.edit_any", "pipeline.work"},
    "art_editor":   _EDIT | {"books.edit_any", "pipeline.work"},
    "methodist":    _COMMON_VIEW | {"workflow.methodist", "ai.analyze", "pipeline.work"},
    "lawyer":       _COMMON_VIEW | {"workflow.lawyer", "ai.analyze"},
    "reviewer":     _COMMON_VIEW | {"workflow.reviewer", "pipeline.work"},
    "ministry":     _COMMON_VIEW | {"workflow.ministry", "workflow.publish", "stats.view", "ai.analyze",
                                    "pipeline.work"},
    "observer":     {"books.view"},
}

# Переопределения из админ-панели ({role: [perm, ...]}); загружаются при старте
# (load_overrides) и после сохранения матрицы. Суперадмин всегда «*».
_overrides: dict = {}


def load_overrides():
    global _overrides
    import db
    raw = db.get_setting("role_permissions", {}) or {}
    _overrides = {
        role: set(perms) for role, perms in raw.items()
        if role in ROLES and role != "superadmin"
    }


def save_overrides(matrix: dict):
    import db
    clean = {
        role: sorted(set(p for p in perms if p in PERM_LABELS))
        for role, perms in matrix.items()
        if role in ROLES and role != "superadmin"
    }
    db.set_setting("role_permissions", clean)
    load_overrides()


def effective_permissions(role: str) -> set:
    if role == "superadmin":
        return {"*"}
    if role in _overrides:
        return set(_overrides[role])
    return set(DEFAULT_ROLE_PERMISSIONS.get(role, set()))


def has_permission(role: str, perm: str) -> bool:
    perms = effective_permissions(role)
    return "*" in perms or perm in perms


def effective_permissions_multi(roles) -> set:
    """Объединение прав нескольких ролей (основная + дополнительные)."""
    out: set = set()
    for r in roles:
        out |= effective_permissions(r)
    return out


def user_can(user: dict, perm: str) -> bool:
    """Проверка по уже посчитанным правам пользователя (user['perms'] из auth)."""
    perms = user.get("perms") or []
    return "*" in perms or perm in perms


# ---- Маршрут согласования -------------------------------------------------
# status -> (название, право на перевод вперёд, следующий статус)
STATUSES = {
    "draft":       "Редактируется",
    "editorial":   "Редактура и корректура",
    "methodist":   "Методическая экспертиза",
    "lawyer":      "Юридическая экспертиза",
    "reviewer":    "Рецензирование",
    "ministry":    "Экспертиза Министерства",
    "approved":    "Утверждён (гриф)",
    "published":   "Опубликован",
}

# Переходы: из статуса -> [(целевой статус, требуемое право, метка действия)]
WORKFLOW = {
    "draft":     [("editorial", "workflow.submit",    "Отправить на редактуру")],
    "editorial": [("methodist", "workflow.editorial", "Передать методисту"),
                  ("draft",     "workflow.editorial", "Вернуть автору")],
    "methodist": [("lawyer",    "workflow.methodist", "Согласовать (методист)"),
                  ("editorial", "workflow.methodist", "Вернуть на редактуру")],
    "lawyer":    [("reviewer",  "workflow.lawyer",    "Согласовать (юрист)"),
                  ("editorial", "workflow.lawyer",    "Вернуть на редактуру")],
    "reviewer":  [("ministry",  "workflow.reviewer",  "Рекомендовать (рецензент)"),
                  ("editorial", "workflow.reviewer",  "Вернуть на редактуру")],
    "ministry":  [("approved",  "workflow.ministry",  "Присвоить гриф"),
                  ("editorial", "workflow.ministry",  "Вернуть на редактуру")],
    "approved":  [("published", "workflow.publish",   "Опубликовать")],
    "published": [],
}
# Автор может отправить на редактуру; admin/superadmin — везде (право * или workflow.*).


# ---- Редакционно-издательский конвейер ------------------------------------
# Реальный процесс создания учебника, положенный в систему как последовательные
# этапы: у каждого — ответственные роли, чек-лист контроля стандартов и срок.
# Этап нельзя завершить, пока не закрыт чек-лист; следующий не начнётся,
# пока не завершён предыдущий (возврат — право pipeline.manage).
PIPELINE_STAGES = [
    {
        "code": "manuscript", "title": "Рукопись",
        "desc": "Автор готовит полную рукопись в конструкторе",
        "roles": ["author", "coauthor"],
        "checklist": [
            "Структура полная: титул, главы и параграфы, словарь, литература",
            "Методический аппарат: «Ты узнаешь», «Подумай», «Запомни», задания, вопросы",
            "Содержание соответствует предметному стандарту и программе класса",
            "Проверка чекером: запрещённого контента нет (ст. 2-1 закона № 185)",
        ],
    },
    {
        "code": "subject_edit", "title": "Предметное редактирование",
        "desc": "Редактор выверяет научное содержание и логику изложения",
        "roles": ["editor", "chief_editor"],
        "checklist": [
            "Научная достоверность фактов, терминов и формул",
            "Изложение соответствует возрасту и учебной программе",
            "Терминология единообразна по всей книге",
            "Замечания редактора сняты автором",
        ],
    },
    {
        "code": "layout", "title": "Вёрстка",
        "desc": "Верстальщик собирает полосы будущей книги",
        "roles": ["layouter"],
        "checklist": [
            "Гарнитура, кегль и интерлиньяж — по возрастной группе",
            "Поля, колонтитулы и нумерация страниц выставлены",
            "Объём и формат в пределах норм веса комплекта (СанПиН № 201, п. 199)",
        ],
    },
    {
        "code": "design", "title": "Дизайн и иллюстрации",
        "desc": "Художник готовит иллюстрации, схемы и оформление",
        "roles": ["designer"],
        "checklist": [
            "Иллюстрации соответствуют тексту и возрасту учеников",
            "Права на все изображения подтверждены",
            "Госсимволы — только официальные образцы",
        ],
    },
    {
        "code": "proofread", "title": "Корректура",
        "desc": "Корректор вычитывает свёрстанные полосы",
        "roles": ["proofreader"],
        "checklist": [
            "Орфография и пунктуация выверены",
            "Подписи к рисункам и таблицам сверены с текстом",
            "Оглавление совпадает с фактическими страницами",
        ],
    },
    {
        "code": "art_edit", "title": "Художественная редакция",
        "desc": "Худ. редактор сводит текст, вёрстку и оформление воедино",
        "roles": ["art_editor", "chief_editor"],
        "checklist": [
            "Единый художественный стиль всех полос",
            "Цветовые решения и контраст проверены",
            "Обложка утверждена",
        ],
    },
    {
        "code": "oepk", "title": "Экспертиза ОЭПК",
        "desc": "Экспертный предметный комитет проводит экспертизы для грифа",
        "roles": ["reviewer", "methodist", "ministry"],
        "checklist": [
            "Научная экспертиза пройдена",
            "Научно-педагогическая экспертиза пройдена",
            "Практико-педагогическая экспертиза (апробация) пройдена",
            "Антидискриминационная и гендерная экспертиза пройдена",
        ],
    },
    {
        "code": "production", "title": "Печать и электронная версия",
        "desc": "Издание уходит в типографию и публикуется в электронном виде",
        "roles": ["ministry", "admin"],
        "checklist": [
            "Выходные сведения заполнены: УДК/ББК, ISBN, тираж",
            "Сигнальный экземпляр утверждён",
            "Электронная версия сформирована и загружена",
        ],
    },
]
PIPELINE_BY_CODE = {s["code"]: s for s in PIPELINE_STAGES}
