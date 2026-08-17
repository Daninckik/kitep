/* ГИС «Китеп» — SPA платформы создания учебников КР */
"use strict";

const UI_VERSION = "183"; // видимый маркер версии интерфейса
console.log("ГИС «Китеп» — интерфейс v" + UI_VERSION);

/* ================= Утилиты ================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function fmtNum(n) { return Number(n || 0).toLocaleString("ru-RU"); }
function uid() { return Math.random().toString(36).slice(2, 10); }

async function api(path, opts = {}) {
  const o = { headers: {}, ...opts };
  if (o.body && !(o.body instanceof FormData)) {
    o.headers["Content-Type"] = "application/json";
    o.body = JSON.stringify(o.body);
  }
  // если сервер на секунды ушёл в перезапуск (обновление) — тихо переподключаемся, а не «вылетаем»
  let res;
  const method = (o.method || "GET").toUpperCase();
  for (let attempt = 0; ; attempt++) {
    try { res = await fetch(path, o); break; }
    catch (e) {
      if (method === "GET" && attempt < 4) { await new Promise(r => setTimeout(r, 1500)); continue; }
      throw new Error("Сервер недоступен — возможно, перезапускается. Подождите пару секунд и обновите страницу.");
    }
  }
  if (res.status === 401) {
    state.me = null;
    renderLogin();
    throw new Error("Требуется вход");
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* пустой ответ */ }
  if (!res.ok) throw new Error((data && data.detail) || `Ошибка ${res.status}`);
  return data;
}

/* «чёрный ящик»: пульс и ошибки клиента попадают в серверный лог (запросы к несуществующим
   путям видны в docker logs — бэкенд не меняем). Если вкладка «вылетит», последний пульс
   покажет время и экран; «bye» есть = закрыли сами, нет «bye» = вкладка погибла. */
(() => {
  const send = (tag, extra = {}) => {
    try {
      const q = new URLSearchParams({ v: UI_VERSION, h: location.hash.slice(0, 60), ...extra });
      navigator.sendBeacon(`/client-${tag}?` + q.toString());
    } catch (e) { /* не мешаем работе */ }
  };
  send("load");
  setInterval(() => send("ping"), 30000);
  addEventListener("pagehide", () => send("bye"));
  addEventListener("error", e => send("err", { m: String(e.message || "").slice(0, 160) }));
  addEventListener("unhandledrejection", e => send("rej", { m: String((e.reason && e.reason.message) || e.reason || "").slice(0, 160) }));
})();

function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $("#toast-root").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ================= Иконки (SVG) ================= */
const I = {
  home: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/></svg>',
  book: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
  ai: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8"/></svg>',
  stats: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  users: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16.5 14.6c2.4.3 4.3 1.8 5 4.4"/></svg>',
  shield: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5.5v5.7c0 4.9 3.4 9 8 10.3 4.6-1.3 8-5.4 8-10.3V5.5L12 2z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/></svg>',
  mail: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/></svg>',
  plus: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  trash: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/></svg>',
  save: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>',
  out: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>',
  doc: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
  upload: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 8 5-5 5 5M12 3v12"/></svg>',
  print: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg>',
  check: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12.5 5.5 5.5L20 6.5"/></svg>',
  clock: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  flag: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V3"/><path d="M4 4c5-2.5 9 2.5 16 0v10c-7 2.5-11-2.5-16 0"/></svg>',
  chev: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  send: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-11 11M22 2 15 22l-4-9-9-4 20-7z"/></svg>',
  back: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  pen: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
  gear: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>',
  eye: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  scales: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M7 21h10M3 7h3c2 0 4.5-1 6-2 1.5 1 4 2 6 2h3"/><path d="m5 7 3 7a3.2 3.2 0 0 1-6 0l3-7zM19 7l3 7a3.2 3.2 0 0 1-6 0l3-7z"/></svg>',
  landmark: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l8 5H4l8-5z"/></svg>',
  search: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  route: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2.6"/><circle cx="18" cy="5" r="2.6"/><path d="M8.6 19h8.9a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7h8.9"/></svg>',
  alert: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  pulse: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 8-6-16-3 8H2"/></svg>',
  moon: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/></svg>',
  comment: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.3-.7L3 21l1.8-5.7A8.4 8.4 0 1 1 21 11.5z"/><path d="M8 10.5h8M8 14h5"/></svg>',
  sun: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  layout: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 9h18M9 9v12"/></svg>',
  palette: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 1 1 9-9c0 2.2-1.8 3-3.5 3H15a2 2 0 0 0-1.5 3.3c.5.6.2 1.7-1.5 1.7z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="8" r="1"/></svg>',
  brush: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m20.5 3.5-9.4 9.4M9 13a4.6 4.6 0 0 0-4.6 4.4c-.06 1.4-1 2.3-2.4 2.6 1.2 1.3 2.9 2 4.5 2A5.5 5.5 0 0 0 12 16.5"/></svg>',
};

/* ---- Тёмная тема ---- */
function currentTheme() { return document.documentElement.dataset.theme === "dark" ? "dark" : "light"; }
function applyTheme(t) {
  const html = document.documentElement;
  html.classList.add("theme-anim"); // плавный переход цветов при переключении
  clearTimeout(applyTheme._t);
  applyTheme._t = setTimeout(() => html.classList.remove("theme-anim"), 420);
  html.dataset.theme = t;
  try { localStorage.setItem("kitep-theme", t); } catch (e) {}
  const b = document.getElementById("btn-theme");
  if (b) { b.innerHTML = t === "dark" ? I.sun : I.moon; b.title = t === "dark" ? "Светлая тема" : "Тёмная тема"; }
  const f = document.querySelector("iframe.checker-frame");
  try { if (f && f.contentDocument) f.contentDocument.documentElement.dataset.theme = t; } catch (e) {}
}
function toggleTheme() { applyTheme(currentTheme() === "dark" ? "light" : "dark"); }

/* ---- Метаданные ролей: цвет, иконка, короткое описание ---- */
const ROLE_META = {
  superadmin:   { c: "#DC2626", s: "#FDECEC", i: "shield",   d: "Полный доступ ко всем функциям системы" },
  admin:        { c: "#2563EB", s: "#EAF1FF", i: "gear",     d: "Управление платформой, пользователями и настройками" },
  author:       { c: "#16A34A", s: "#E9F9EF", i: "pen",      d: "Создаёт учебники и отвечает за содержание" },
  coauthor:     { c: "#0D9488", s: "#E0F5F2", i: "pen",      d: "Работает над содержанием вместе с автором" },
  chief_editor: { c: "#6D28D9", s: "#F1EBFE", i: "book",     d: "Руководит редакционной подготовкой изданий" },
  editor:       { c: "#8B5CF6", s: "#F3EEFE", i: "book",     d: "Правит структуру и текст учебника" },
  proofreader:  { c: "#DB2777", s: "#FDEBF3", i: "doc",      d: "Исправляет орфографию, пунктуацию и опечатки" },
  layouter:     { c: "#0E7490", s: "#E0F4F8", i: "layout",   d: "Верстает полосы будущей книги" },
  designer:     { c: "#C026D3", s: "#FBEAFD", i: "palette",  d: "Готовит иллюстрации, схемы и оформление" },
  art_editor:   { c: "#9333EA", s: "#F4EBFD", i: "brush",    d: "Сводит текст, вёрстку и оформление воедино" },
  methodist:    { c: "#EA8C1C", s: "#FDF1E3", i: "route",    d: "Проводит методическую экспертизу" },
  lawyer:       { c: "#64748B", s: "#EFF2F6", i: "scales",   d: "Проверяет соответствие законодательству КР" },
  reviewer:     { c: "#D97706", s: "#FBF3E0", i: "search",   d: "Рецензирует научное содержание" },
  ministry:     { c: "#1E3A8A", s: "#E7ECF8", i: "landmark", d: "Экспертиза и присвоение грифа Министерства" },
  observer:     { c: "#94A3B8", s: "#F1F5F9", i: "eye",      d: "Только просмотр, без изменений" },
};
const roleMeta = code => ROLE_META[code] || { c: "#64748B", s: "#EFF2F6", i: "users", d: "" };

function roleBadge(code, title) {
  const m = roleMeta(code);
  return `<span class="rbadge" style="--rb:${m.c};--rbs:${m.s}">${I[m.i]}${esc(title || state.meta?.roles?.[code] || code)}</span>`;
}

// безликий силуэт человека в костюме (как фото на паспорт) — общая ава для всех;
// пропорции естественные: короткая шея, плечи выше, голова круглее
const AVA_FIG = `<svg class="ava-fig" viewBox="0 0 64 64" aria-hidden="true">
  <path class="af-suit" d="M9.5 64C9.5 49.5 19 41.5 32 41.5S54.5 49.5 54.5 64Z"/>
  <rect class="af-neck" x="28.4" y="32.5" width="7.2" height="10" rx="3.2"/>
  <ellipse class="af-head" cx="32" cy="24" rx="10.8" ry="12"/>
  <path class="af-shirt" d="M32 41.5 26.3 44.6 32 56 37.7 44.6Z"/>
  <path class="af-tie" d="M32 45 29.8 48.6 32 58.5 34.2 48.6Z"/>
</svg>`;
function avatar(name, code, cls = "") {
  const m = roleMeta(code);
  return `<span class="avatar ava-sil ${cls}" style="--rb:${m.c};--rbs:${m.s}">${AVA_FIG}</span>`;
}

// стрелка вниз для сворачиваемых списков
const CHEV_DOWN = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;

/* ---- «Сегодня / Вчера / 5 авг» ---- */
function _dk(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function dayLabel(ts) {
  if (!ts) return "—";
  const d = String(ts).slice(0, 10);
  const now = new Date();
  if (d === _dk(now)) return "Сегодня";
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (d === _dk(y)) return "Вчера";
  const lbl = `${+d.slice(8, 10)} ${MONTHS_S[+d.slice(5, 7) - 1] || ""}`;
  return d.slice(0, 4) === String(now.getFullYear()) ? lbl : `${lbl} ${d.slice(0, 4)}`;
}
function humanWhen(ts) {
  if (!ts) return "—";
  const dl = dayLabel(ts);
  return (dl === "Сегодня" || dl === "Вчера") ? `${dl} ${String(ts).slice(11, 16)}` : dl;
}

/* ---- Timeline (история изменений) ---- */
const ACTION_COLOR = {
  create: "#16A34A", version: "#7C3AED", restore: "#7C3AED", comment: "#EA8C1C",
  status: "#2563EB", member: "#0D9488", import: "#64748B", login: "#94A3B8", pipeline: "#0E7490",
  user: "#2563EB", roles: "#DC2626", settings: "#64748B", backup: "#64748B",
  book: "#EA8C1C", ai: "#7C3AED", standard: "#1E3A8A", state: "#1E3A8A", dict: "#64748B",
};
function timelineHtml(items) {
  if (!items.length) return `<div class="empty">Пока пусто</div>`;
  let lastDay = null;
  const out = items.map(it => {
    const dl = dayLabel(it.when);
    const head = dl !== lastDay ? `<div class="tl-day">${dl}</div>` : "";
    lastDay = dl;
    return `${head}<div class="tl-item" style="--tl:${it.color || "#2563EB"}">
      <div class="tl-head"><b>${esc(it.who || "Система")}</b>
        ${it.chip ? `<span class="tl-chip">${esc(it.chip)}</span>` : ""}
        <span class="tl-when">${esc(String(it.when).slice(11, 16))}</span></div>
      ${it.text ? `<div class="tl-text">${esc(it.text)}</div>` : ""}
    </div>`;
  }).join("");
  return `<div class="timeline">${out}</div>`;
}

/* ================= Права (зеркало permissions.py — только для UI) ================= */
const UI_PERMS = {
  superadmin: ["*"],
  admin: ["books.view","books.comment","books.edit","books.versions","ai.analyze","books.create","books.edit_any","books.delete","books.members","stats.view","admin.users","workflow","pipeline.work","pipeline.manage"],
  author: ["books.view","books.comment","books.edit","books.versions","ai.analyze","books.create","books.members","pipeline.work"],
  coauthor: ["books.view","books.comment","books.edit","books.versions","ai.analyze","pipeline.work"],
  chief_editor: ["books.view","books.comment","books.edit","books.versions","ai.analyze","books.edit_any","stats.view","pipeline.work","pipeline.manage"],
  editor: ["books.view","books.comment","books.edit","books.versions","ai.analyze","books.edit_any","pipeline.work"],
  proofreader: ["books.view","books.comment","books.edit","books.versions","ai.analyze","books.edit_any","pipeline.work"],
  layouter: ["books.view","books.comment","books.edit","books.versions","ai.analyze","books.edit_any","pipeline.work"],
  designer: ["books.view","books.comment","books.edit","books.versions","ai.analyze","books.edit_any","pipeline.work"],
  art_editor: ["books.view","books.comment","books.edit","books.versions","ai.analyze","books.edit_any","pipeline.work"],
  methodist: ["books.view","books.comment","ai.analyze","pipeline.work"],
  lawyer: ["books.view","books.comment","ai.analyze"],
  reviewer: ["books.view","books.comment","pipeline.work"],
  ministry: ["books.view","books.comment","ai.analyze","stats.view","pipeline.work"],
  observer: ["books.view"],
};
function can(perm) {
  const p = state.me?.perms || UI_PERMS[state.me?.role] || [];
  return p.includes("*") || p.includes(perm);
}

/* ================= Состояние ================= */
const state = {
  me: null,
  meta: null,
  editor: null, // { book, selected, dirty, timer, tab }
};

const STATUS_CHIP = {
  draft: "gray", editorial: "gold", methodist: "blue", lawyer: "blue",
  reviewer: "blue", ministry: "blue", approved: "green", published: "green",
};

/* ================= Запуск ================= */
window.addEventListener("hashchange", route);
init();

async function init() {
  try {
    state.me = await api("/api/auth/me");
    state.meta = await api("/api/books/meta");
    route();
    aiwWatch();  // если книга дописывается с прошлого визита — чип вернётся сам
    scanWatch(); // идущая оцифровка тоже сразу видна в шапке
  } catch (e) { /* renderLogin уже вызван */ }
}

/* ================= Вход ================= */
function renderLogin() {
  document.body.classList.remove("noscroll");
  document.title = "Вход — ГИС «Китеп»";
  const EYE = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
  $("#app").innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-band"></div>
      <div class="inner">
        <div class="login-logo">
          <img src="/static/img/flag-kg.svg" alt="Флаг КР">
          <div>
            <div class="t1">ГИС «Китеп»</div>
            <div class="t2">Учебники Кыргызской Республики</div>
          </div>
        </div>
        <div class="login-err" id="login-err"></div>
        <form id="login-form" novalidate>
          <div class="field"><label>Логин или почта</label><input name="login" autocomplete="username" autofocus></div>
          <div class="field"><label>Пароль</label>
            <div class="pw-wrap"><input name="password" id="login-pass" type="password" autocomplete="current-password">
              <button type="button" class="pw-eye" id="login-eye" aria-label="Показать пароль">${EYE}</button></div></div>
          <button class="btn primary" style="width:100%;justify-content:center" type="submit">Войти в систему</button>
        </form>
        <button class="btn" style="width:100%;justify-content:center;margin-top:10px" id="go-register">Зарегистрироваться</button>
      </div>
    </div>
  </div>`;
  $("#login-eye").onclick = () => {
    const i = $("#login-pass");
    i.type = i.type === "password" ? "text" : "password";
  };
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (!String(fd.get("login") || "").trim() || !String(fd.get("password") || "")) {
      const el = $("#login-err");
      el.style.display = "block";
      el.textContent = "Введите логин и пароль";
      return;
    }
    try {
      const r = await api("/api/auth/login", { method: "POST", body: { login: fd.get("login"), password: fd.get("password") } });
      state.me = r.user;
      state.meta = await api("/api/books/meta");
      location.hash = "#/dashboard";
      route();
      aiwWatch();
      scanWatch();
    } catch (err) {
      const el = $("#login-err");
      el.style.display = "block";
      el.textContent = err.message;
    }
  });
  $("#go-register").onclick = () => renderRegister();
}

/* ================= Регистрация: пошаговый процесс ================= */
function renderRegister() {
  document.body.classList.remove("noscroll");
  document.title = "Регистрация — ГИС «Китеп»";
  const REG_SELF = [["author", "Автор"], ["coauthor", "Соавтор"]];
  const REG_APPROVAL = [["editor", "Редактор"], ["chief_editor", "Главный редактор"],
    ["proofreader", "Корректор"], ["methodist", "Методист"],
    ["lawyer", "Юрист"], ["reviewer", "Рецензент"]];
  const ORGS = ["Министерство просвещения КР", "Издательство «Окуу китеби»",
    "Кыргызская академия образования", "Школа / лицей / гимназия",
    "Университет / колледж", "Другая организация"];
  const LOCK_IC = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  const EYE_IC = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const reg = { step: 1, d: { role: "", org: ORGS[0], phone: "+996 " } };

  const progHtml = () => `<div class="reg-prog">${["Аккаунт", "Роль", "Организация", "Готово"].map((t, i) => {
    const n = i + 1;
    const cls = n < reg.step ? "done" : n === reg.step ? "cur" : "";
    return `${i ? `<u class="${n <= reg.step ? "on" : ""}"></u>` : ""}<span class="rp ${cls}"><i>${n < reg.step ? I.check : "0" + n}</i>${t}</span>`;
  }).join("")}</div>`;

  const shellHtml = inner => `
  <div class="reg-wrap">
    <aside class="reg-brand">
      <div class="reg-logo">${LOGO_SVG}</div>
      <h1>ГИС «Китеп»</h1>
      <p>Единая цифровая платформа для разработки и проверки учебных материалов Кыргызской Республики</p>
      <svg class="reg-art" viewBox="0 0 220 150" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="18" y="34" width="88" height="104" rx="7" opacity=".35"/>
        <rect x="30" y="22" width="88" height="104" rx="7" opacity=".9"/>
        <path d="M44 44h60M44 60h60M44 76h42" opacity=".55"/>
        <path d="M132 42a10 10 0 0 1 10-10h56v104h-56a10 10 0 0 0-10 10z" opacity=".95"/>
        <path d="M142 52h42M142 66h42M142 80h42M142 94h28" opacity=".55"/>
        <path d="M132 42v104" opacity=".7"/>
      </svg>
    </aside>
    <div class="reg-main">
      ${progHtml()}
      <div class="card reg-card">${inner}</div>
    </div>
  </div>`;

  const draw = inner => { $("#app").innerHTML = shellHtml(inner); };

  /* ---- шаг 1: аккаунт ---- */
  const step1 = () => {
    draw(`
      <h2>Создание аккаунта</h2>
      <div class="sub">Зарегистрируйтесь для работы в системе</div>
      <div class="row2">
        <div class="field"><label>Имя</label><input id="rg-first" value="${esc(reg.d.first || "")}" autocomplete="given-name"></div>
        <div class="field"><label>Фамилия</label><input id="rg-last" value="${esc(reg.d.last || "")}" autocomplete="family-name"></div>
      </div>
      <div class="field"><label>Рабочая почта</label>
        <input id="rg-email" type="email" value="${esc(reg.d.email || "")}" placeholder="example@edu.gov.kg" autocomplete="email"></div>
      <div class="field"><label>Телефон</label>
        <input id="rg-phone" value="${esc(reg.d.phone)}" autocomplete="tel"></div>
      <div class="field"><label>Пароль</label>
        <div class="pw-wrap"><input id="rg-pass" type="password" placeholder="Минимум 6 символов">
          <button type="button" class="pw-eye" id="rg-eye" aria-label="Показать пароль">${EYE_IC}</button></div></div>
      <div class="field"><label>Подтвердите пароль</label>
        <div class="pw-wrap"><input id="rg-pass2" type="password">
          <button type="button" class="pw-eye" id="rg-eye2" aria-label="Показать пароль">${EYE_IC}</button></div></div>
      <div class="reg-actions">
        <span class="spacer"></span>
        <button class="btn primary" id="rg-next1">Продолжить ${I.chev}</button>
      </div>
      <div class="login-note">Уже есть аккаунт? <a href="#" id="rg-tologin">Войти</a></div>`);
    $("#rg-eye").onclick = () => {
      const p = $("#rg-pass");
      p.type = p.type === "password" ? "text" : "password";
    };
    $("#rg-eye2").onclick = () => {
      const p = $("#rg-pass2");
      p.type = p.type === "password" ? "text" : "password";
    };
    $("#rg-tologin").onclick = e => { e.preventDefault(); renderLogin(); };
    $("#rg-next1").onclick = () => {
      const d = reg.d;
      d.first = $("#rg-first").value.trim();
      d.last = $("#rg-last").value.trim();
      d.email = $("#rg-email").value.trim();
      d.phone = $("#rg-phone").value.trim();
      d.pass = $("#rg-pass").value;
      if (!d.first || !d.last) { toast("Укажите имя и фамилию", "err"); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) { toast("Укажите корректную рабочую почту", "err"); return; }
      if (d.pass.length < 6) { toast("Пароль — минимум 6 символов", "err"); return; }
      if (d.pass !== $("#rg-pass2").value) { toast("Пароли не совпадают", "err"); return; }
      reg.step = 2; step2();
    };
  };

  /* ---- шаг 2: роль карточками ---- */
  const step2 = () => {
    const card = ([code, title], approval) => {
      const m = roleMeta(code);
      return `<button type="button" class="rolecard ${reg.d.role === code ? "sel" : ""}" data-role="${code}" style="--rc:${m.c}">
        ${approval ? `<span class="rc-lock" aria-label="Требует подтверждения">${LOCK_IC}</span>` : ""}
        <span class="rolecard-ic">${I[m.i] || I.users}</span>
        <b>${title}</b>
        <span class="rolecard-d">${m.d}</span>
      </button>`;
    };
    draw(`
      <h2>Выберите роль</h2>
      <div class="sub">Роль, с которой вы будете работать в системе</div>
      <div class="reg-rgrp">Самостоятельный выбор</div>
      <div class="rolecards">${REG_SELF.map(r => card(r, false)).join("")}</div>
      <div class="reg-rgrp">${LOCK_IC} Требуют подтверждения администратора</div>
      <div class="rolecards">${REG_APPROVAL.map(r => card(r, true)).join("")}</div>
      <div id="rg-roleinfo"></div>
      <div class="reg-actions">
        <button class="btn" id="rg-back2">${I.back}Назад</button>
        <span class="spacer"></span>
        <button class="btn primary" id="rg-next2" ${reg.d.role ? "" : "disabled"}>Продолжить ${I.chev}</button>
      </div>`);
    const info = () => {
      const box = $("#rg-roleinfo");
      if (!reg.d.role) { box.innerHTML = ""; return; }
      const m = roleMeta(reg.d.role);
      const title = [...REG_SELF, ...REG_APPROVAL].find(([c]) => c === reg.d.role)[1];
      const approval = REG_APPROVAL.some(([c]) => c === reg.d.role);
      box.innerHTML = `
        <div class="rolepick-info" style="--rc:${m.c}">
          <span class="rolecard-ic">${I[m.i] || I.users}</span>
          <div><b>${title}</b><span>${m.d}</span></div>
        </div>
        ${approval ? `<div class="rolewarn">${LOCK_IC}<span>Эта роль требует подтверждения администратора.
          После регистрации ваша заявка будет отправлена на рассмотрение — до одобрения вход будет закрыт.</span></div>` : ""}`;
    };
    info();
    $$(".rolecard").forEach(c => c.onclick = () => {
      reg.d.role = c.dataset.role;
      $$(".rolecard").forEach(x => x.classList.toggle("sel", x === c));
      $("#rg-next2").disabled = false;
      info();
    });
    $("#rg-back2").onclick = () => { reg.step = 1; step1(); };
    $("#rg-next2").onclick = () => { if (reg.d.role) { reg.step = 3; step3(); } };
  };

  /* ---- шаг 3: организация ---- */
  const step3 = () => {
    draw(`
      <h2>Организация</h2>
      <div class="sub">Информация о месте работы</div>
      <div class="field"><label>Организация</label>
        <select id="rg-org" class="pipe-select">${ORGS.map(o =>
          `<option ${reg.d.org === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>
      <div class="field"><label>Должность</label>
        <input id="rg-pos" value="${esc(reg.d.pos || "")}" placeholder="Введите должность"></div>
      <div class="field"><label>Подразделение</label>
        <input id="rg-dep" value="${esc(reg.d.dep || "")}" placeholder="Отдел, кафедра, управление…"></div>
      <div class="reg-actions">
        <button class="btn" id="rg-back3">${I.back}Назад</button>
        <span class="spacer"></span>
        <button class="btn primary" id="rg-next3">Продолжить ${I.chev}</button>
      </div>`);
    $("#rg-back3").onclick = () => { reg.step = 2; step2(); };
    $("#rg-next3").onclick = () => {
      reg.d.org = $("#rg-org").value;
      reg.d.pos = $("#rg-pos").value.trim();
      reg.d.dep = $("#rg-dep").value.trim();
      reg.step = 4; step4();
    };
  };

  /* ---- шаг 4: создание + финальный экран ---- */
  const step4 = async () => {
    draw(`<div class="reg-final"><div class="aiw-orb">${I.ai}</div><b>Создаём аккаунт…</b></div>`);
    let res;
    try {
      res = await api("/api/auth/register", { method: "POST", body: {
        first_name: reg.d.first, last_name: reg.d.last, email: reg.d.email,
        phone: reg.d.phone.replace(/\D/g, "").length > 3 ? reg.d.phone : "",
        password: reg.d.pass,
        role: reg.d.role, org: reg.d.org, position: reg.d.pos, department: reg.d.dep,
      }});
    } catch (e) {
      toast(e.message, "err");
      reg.step = 1; step1();
      return;
    }
    const m = roleMeta(reg.d.role);
    const title = res.role_title || (res.user && res.user.role_title) ||
      ([...REG_SELF, ...REG_APPROVAL].find(([c]) => c === reg.d.role) || [])[1] || "";
    if (res.status === "active") {
      draw(`
        <div class="reg-final">
          <span class="reg-ok"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
          <h2>Аккаунт создан</h2>
          <p>Добро пожаловать в систему цифрового управления учебными материалами.</p>
          <div class="rolepick-info" style="--rc:${m.c}">
            <span class="rolecard-ic">${I[m.i] || I.users}</span>
            <div><b>${esc(title)}</b><span>${m.d}</span></div>
          </div>
          <button class="btn primary" id="rg-enter">Перейти в систему ${I.chev}</button>
        </div>`);
      $("#rg-enter").onclick = () => { location.hash = "#/dashboard"; init(); };
    } else {
      draw(`
        <div class="reg-final">
          <span class="reg-ok pend"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></span>
          <h2>Заявка отправлена</h2>
          <p>Ваша заявка на роль «${esc(title)}» отправлена администратору.<br>
            Мы сообщим, когда её рассмотрят — после одобрения вы сможете войти со своей почтой и паролем.</p>
          <button class="btn primary" id="rg-back">Вернуться ко входу</button>
        </div>`);
      $("#rg-back").onclick = () => renderLogin();
    }
  };

  step1();
}

/* ================= Каркас (верхняя шапка — как в модуле проверки) ================= */
const LOGO_SVG = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  <path d="M9 8l2.5 2.5L16 6"/></svg>`;

function shell(active, contentHtml, fullBleed = false) {
  document.body.classList.remove("noscroll"); // сбрасываем при любой смене вида
  const u = state.me;
  // показываем ВСЕ разделы: недоступные роли — просто прозрачнее (без замков);
  // администрирование открыто всем — внутри есть общие вкладки (стандарты, справочники)
  const nav = [
    { id: "dashboard", icon: I.home, label: "Главная" },
    { id: "analyze", icon: I.shield, label: "Проверка книг" },
    { id: "stats", icon: I.stats, label: "Статистика", locked: !can("stats.view") },
    { id: "library", icon: I.book, label: "Учебники" },
    { id: "scans", icon: HOME_ICONS.scan, label: "Оцифровка" },
    { id: "admin", icon: I.users, label: "Администрирование" },
  ];
  document.title = "ГИС «Китеп» — учебники КР";
  $("#app").innerHTML = `
  <header class="topbar">
    <button class="topbar-back" id="btn-nav-back" aria-label="Назад">${I.back}</button>
    <div class="brand">
      <span class="logo">${LOGO_SVG}</span>
      <div><div class="t1">ГИС «Китеп»</div><div class="t2">учебники Кыргызской Республики · v${UI_VERSION}</div></div>
    </div>
    <nav class="nav">
      ${nav.map(n => `<a href="#/${n.id}" class="${active === n.id ? "active" : ""} ${n.locked ? "locked" : ""}">${n.icon}${n.label}</a>`).join("")}
    </nav>
    <div class="aiw-slot" id="aiw-slot"></div>
    <div class="topuser">
      <div class="ava">${esc((u.name || "?").trim()[0] || "?").toUpperCase()}</div>
      <div><div class="nm">${esc(u.name)}</div><div class="rl">${esc(u.role_title)}</div></div>
      <button aria-label="Выйти" id="btn-logout">${I.out}</button>
    </div>
  </header>
  <main class="main ${fullBleed ? "full" : ""}">${contentHtml}</main>`;
  renderAiwChip(); // индикаторы фоновых задач — на каждой странице, справа от меню
  renderScanChip();
  $("#btn-nav-back").onclick = () => history.back();
  $("#btn-logout").onclick = async () => {
    await api("/api/auth/logout", { method: "POST" });
    state.me = null;
    init(); // в dev-режиме без пароля сразу зайдёт снова, иначе — экран входа
  };
}


/* ================= Роутер ================= */
function route() {
  if (!state.me) { renderLogin(); return; }
  stopAutosave();
  const h = location.hash || "#/dashboard";
  if (h === "#/book/new") return viewEditorNew();
  if (h.startsWith("#/book/ai")) return viewAiWrite();
  const m = h.match(/^#\/book\/(\d+)/);
  if (m) return viewEditor(+m[1]);
  if (h.startsWith("#/books")) return viewBooks();
  if (h.startsWith("#/library")) return viewLibrary();
  if (h.startsWith("#/scans")) return viewScans();
  const msc = h.match(/^#\/scan\/(\d+)/);
  if (msc) return viewScanEditor(+msc[1]);
  if (h.startsWith("#/checker")) return viewAnalyze();
  if (h.startsWith("#/analyze")) return viewAnalyze();
  if (h.startsWith("#/stats")) return can("stats.view") ? viewStats() : renderNoAccess("stats", "Статистика");
  const mu = h.match(/^#\/user\/(\d+)/);
  if (mu) return viewUser(+mu[1]);
  if (h.startsWith("#/admin")) return viewAdmin();
  return viewDashboard();
}

/* ================= Модалка ================= */
function modal({ title, body, footer, wide }) {
  const root = $("#modal-root");
  root.innerHTML = `
  <div class="modal-back">
    <div class="modal ${wide ? "wide" : ""}">
      <div class="modal-h"><h3>${esc(title)}</h3><button id="m-close">${I.x}</button></div>
      <div class="modal-b">${body}</div>
      ${footer ? `<div class="modal-f">${footer}</div>` : ""}
    </div>
  </div>`;
  const close = () => (root.innerHTML = "");
  $("#m-close").onclick = close;
  root.firstElementChild.addEventListener("mousedown", e => { if (e.target === root.firstElementChild) close(); });
  return { close, root };
}

/* Блокируем прокрутку фоновой страницы, пока в #modal-root есть окно/панель.
   Один наблюдатель покрывает и modal(), и drawer (appendChild). */
(function lockScrollWhileModalOpen() {
  const root = document.getElementById("modal-root");
  if (!root) return;
  const sync = () => {
    const open = root.childElementCount > 0;
    if (open === document.body.classList.contains("modal-open")) return;
    if (open) {
      const sbw = window.innerWidth - document.documentElement.clientWidth;
      if (sbw > 0) document.body.style.paddingRight = sbw + "px";
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
      document.body.style.paddingRight = "";
    }
  };
  new MutationObserver(sync).observe(root, { childList: true });
  sync();
})();

/* ================= Главная ================= */
const HOME_ICONS = {
  search: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  lock: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  gov: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 21h18M3 18h18"/></svg>',
  cap: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5"/><path d="M22 9v6"/></svg>',
  scan: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/></svg>',
  edit: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
};

// глубокий фон обложки + светлый акцент (золото/пастель) — премиальный вид
const COVER_COLORS = [
  ["#1E3A8A", "#F4D06F"], ["#134E4A", "#6EE7D3"], ["#5B21B6", "#DDB4FF"],
  ["#7C2D12", "#F6B98C"], ["#14532D", "#86EFAC"], ["#831843", "#F9A8C8"],
  ["#1E4E79", "#8FD0FF"], ["#4C3B10", "#EBD07A"],
];
function coverColor(str) {
  let h = 0;
  for (const ch of String(str || "")) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return COVER_COLORS[h % COVER_COLORS.length];
}
/* фото на обложке (books.cover_url): картинка + затемнение, текст обложки поверх */
const coverPhoto = b => b && b.cover_url
  ? `<img class="bsb-photo" src="${esc(b.cover_url)}" alt=""><i class="bsb-shade"></i>` : "";
const coverCls = b => b && b.cover_url ? " has-photo" : "";

async function viewDashboard() {
  shell("dashboard", `<div class="empty">Загрузка…</div>`);
  let books = [];
  try { books = await api("/api/books"); } catch (e) { /* покажем без списка */ }
  let ov = null, ai = null;
  if (can("stats.view")) {
    try { [ov, ai] = await Promise.all([api("/api/stats/overview"), api("/api/stats/ai")]); } catch (e) {}
  }

  const stat = (icon, color, value, label) => `
    <div class="glass-card hstat">
      <span class="hstat-ic" style="--sc:${ACC[color]};--scs:${ACC_SOFT[color]}">${icon}</span>
      <div><b>${value}</b><span>${label}</span></div>
    </div>`;
  // статусы показываем ВСЕГДА: нет данных или прав — честные нули,
  // пустая полоса выглядит как «ничего не работает»
  const statsRow = [
    stat(I.book, "orange", ov ? fmtNum(ov.books_total) : fmtNum(books.length), "учебных материалов"),
    stat(HOME_ICONS.scan, "purple", ai ? fmtNum(ai.pages_processed) : "0", "страниц оцифровано"),
    stat(I.ai, "blue", ai ? fmtNum(ai.jobs_total) : "0", "AI-анализов"),
    stat(I.check, "green", (ai && ai.jobs_total ? ai.success_rate : 0) + "%", "успешных проверок"),
  ].join("");

  shell("dashboard", `
    <section class="hero glass-card">
      <div class="hero-text">
        <div class="hero-badge">${HOME_ICONS.gov} Государственная информационная система</div>
        <h1>Единая система создания и проверки учебной литературы</h1>
        <p>Создавайте, проверяйте и управляйте учебными материалами в соответствии
        с государственными стандартами образования Кыргызской Республики.</p>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="hv-scene">
          <div class="hv-book">
            <div class="hv-cover">
              <div class="hvc-frame"></div>
              <img class="hvc-emblem" src="/static/img/gerb-kg.svg" alt="">
              <div class="hvc-title">Учебник</div>
              <div class="hvc-rule"></div>
              <div class="hvc-sub">Кыргызская Республика</div>
              <div class="hv-scan"></div>
            </div>
            <span class="hv-pages"></span>
            <span class="hv-pages-top"></span>
          </div>
        </div>
        <div class="hv-shadow"></div>
        <div class="hv-chip c1">${HOME_ICONS.scan} OCR</div>
        <div class="hv-chip c2">${I.ai} ИИ-проверка</div>
        <div class="hv-chip c3">${I.check} Публикация</div>
      </div>
    </section>

    <section class="hstats">${statsRow}</section>

    ${bookshowSectionHtml(books)}

    <section class="trust glass-card">
      <div class="trust-item">${HOME_ICONS.lock}<div><b>Защита данных</b><span>роли, журналы действий, резервные копии</span></div></div>
      <div class="trust-item">${I.doc}<div><b>Государственные стандарты</b><span>образовательные стандарты и нормы Кыргызской Республики</span></div></div>
      <div class="trust-item">${I.shield}<div><b>Экспертная проверка</b><span>методист, юрист, рецензент, Министерство</span></div></div>
    </section>

    <footer class="site-footer">
      <div class="sf-brand">
        <span class="logo">${LOGO_SVG}</span>
        <div><b>ГИС «Китеп»</b><span>Министерство просвещения Кыргызской Республики</span></div>
      </div>
      <nav class="sf-links">
        <a href="#/dashboard">О системе</a>
        <a href="#/books">Документы</a>
        <a href="#/analyze">Проверка материалов</a>
        <a href="#/dashboard">Политика безопасности</a>
      </nav>
      <div class="sf-note">Итоговое решение о грифе принимает Министерство просвещения КР по результатам экспертиз</div>
    </footer>
  `);
  setupBookshow(books);
}

/* ================= Учебники ================= */
function booksGrid(books) {
  if (!books.length) return `<div class="empty">${I.book}<div>Учебников пока нет — создайте первый</div></div>`;
  return `<div class="cards c3">` + books.map(b => `
    <div class="card book-card" data-id="${b.id}">
      <div class="bk-title">${esc(b.title)}</div>
      <div class="bk-meta">
        ${b.subject ? `<span class="chip">${esc(b.subject)}</span>` : ""}
        ${b.grade ? `<span class="chip gold">${esc(b.grade)} класс</span>` : ""}
        <span class="chip ${STATUS_CHIP[b.status] || ""}">${esc(b.status_title)}</span>
      </div>
      <div class="bk-foot">
        <span>${esc(b.author_name)}</span>
        <span>верс. ${b.versions_count} · ${esc((b.updated_at || "").slice(0, 10))}</span>
      </div>
    </div>`).join("") + `</div>`;
}
function bindBookCards() {
  $$(".book-card").forEach(el => el.onclick = () => (location.hash = `#/book/${el.dataset.id}`));
}

/* ---- Учебники: библиотека-список (пункт меню рядом с администрированием) ---- */
let libQuery = "";

/* открыть читалку книги прямо из списка, без захода в редактор */
async function openLibraryReader(id) {
  let book;
  try { book = await api(`/api/books/${id}`); } catch (e) { toast(e.message, "err"); return; }
  const c0 = book.content;
  c0.intro = c0.intro || "";
  c0.legend = c0.legend || [];
  normImprint(c0);
  (c0.chapters || []).forEach(ch => (ch.sections || []).forEach(s => {
    s.motivation = s.motivation || ""; s.examples = s.examples || ""; s.summary = s.summary || "";
  }));
  state.editor = { book, selected: "titul", dirty: false, timer: null, tab: "comments" };
  openBookReader();
}

async function viewLibrary() {
  libQuery = "";
  shell("library", `<div class="empty">Загрузка учебников…</div>`);
  let books;
  try { books = await api("/api/books"); } catch (e) { toast(e.message, "err"); return; }
  const admin = can("admin.system");
  const statuses = state.meta.statuses || {};

  const cardHtml = (b, i) => {
    const [bg, fg] = coverColor(b.subject || b.title);
    return `
    <div class="card lb-card" style="--d:${Math.min(i, 9) * 55}ms">
      <div class="lb-cvr" data-read="${b.id}" role="button" aria-label="Читать учебник">
        <div class="bs-book${coverCls(b)}" style="--cbg:${bg};--cfg:${fg}">
          ${coverPhoto(b)}
          <div class="bsb-emblems"><img src="/static/img/gerb-kg.svg" alt=""><img src="/static/img/flag-kg.svg" alt=""></div>
          <span class="bsb-subject">${esc(b.subject || "Учебник")}</span>
          <b class="bsb-title">${esc(b.title)}</b>
          <span class="bsb-grade">${b.grade ? esc(b.grade) + " класс" : ""}</span>
          <span class="bsb-foot">Кыргызская Республика</span>
        </div>
      </div>
      <div class="lb-info">
        <div class="lb-title">${esc(b.title)}</div>
        <div class="lb-chips">
          ${admin ? `
          <div class="lb-st" data-bid="${b.id}">
            <button type="button" class="chip ${STATUS_CHIP[b.status] || ""} lb-st-trig" aria-haspopup="true" aria-expanded="false">${esc(b.status_title)}${CHEV_DOWN}</button>
            <div class="lb-st-menu" role="menu">
              ${Object.entries(statuses).map(([code, t]) => `
                <button type="button" class="lb-st-opt ${b.status === code ? "current" : ""}" data-set="${code}" role="menuitem">${esc(t)}</button>`).join("")}
            </div>
          </div>` : `<span class="chip ${STATUS_CHIP[b.status] || ""}">${esc(b.status_title)}</span>`}
          ${b.subject ? `<span class="chip">${esc(b.subject)}</span>` : ""}
          ${b.grade ? `<span class="chip gold">${esc(b.grade)} класс</span>` : ""}
        </div>
        <div class="lb-meta">${esc(b.author_name || "")} · верс. ${b.versions_count} · обновлён ${esc((b.updated_at || "").slice(0, 10))}</div>
        <div class="lb-actions">
          <button class="btn small primary" data-read="${b.id}">${I.book}Читать</button>
          <button class="btn small" data-edit="${b.id}">${I.pen}Редактировать</button>
          <span class="spacer"></span>
          ${admin ? `<button class="icon-btn" data-bdel="${b.id}" aria-label="Удалить учебник">${I.trash}</button>` : ""}
        </div>
      </div>
    </div>`;
  };

  const matches = b => {
    const q = libQuery.trim().toLowerCase();
    if (!q) return true;
    return [b.title, b.subject, b.author_name, b.grade && b.grade + " класс"]
      .some(v => (v || "").toLowerCase().includes(q));
  };
  const gridHtml = () => {
    const list = books.filter(matches);
    return list.length
      ? list.map(cardHtml).join("")
      : `<div class="empty" style="grid-column:1/-1">${I.book}<div>${libQuery ? "Ничего не найдено" : "Учебников пока нет — создайте первый"}</div></div>`;
  };

  shell("library", `
    <div class="page-head">
      <div><h1>Учебники</h1><div class="sub">${books.length ? `Всего в системе: ${books.length}` : "Библиотека пуста"}</div></div>
      <div class="spacer"></div>
      <div class="search-wrap lb-search">${I.search}<input id="lib-q" placeholder="Название, предмет, автор…" aria-label="Поиск учебника"></div>
      ${can("books.create") ? `<button class="btn" id="lib-import">${I.upload}Импорт</button>
      <button class="btn primary" id="lib-new">${I.plus}Новый учебник</button>` : ""}
    </div>
    <div class="lb-grid" id="lb-grid">${gridHtml()}</div>
  `);

  const bind = () => {
    $$("#lb-grid [data-read]").forEach(el => el.onclick = () => openLibraryReader(+el.dataset.read));
    $$("#lb-grid [data-edit]").forEach(el => el.onclick = () => { location.hash = `#/book/${el.dataset.edit}`; });
    $$("#lb-grid [data-bdel]").forEach(el => el.onclick = async () => {
      if (!confirm("Удалить учебник безвозвратно (с версиями и историей)?")) return;
      try {
        await api(`/api/books/${el.dataset.bdel}`, { method: "DELETE" });
        toast("Учебник удалён", "ok");
        viewLibrary();
      } catch (e) { toast(e.message, "err"); }
    });
    // смена статуса (админ): чип-кнопка открывает меню статусов
    $$("#lb-grid .lb-st").forEach(dd => {
      const trig = dd.querySelector(".lb-st-trig");
      const setOpen = on => {
        $$("#lb-grid .lb-st.open").forEach(o => { if (o !== dd) { o.classList.remove("open"); o.querySelector(".lb-st-trig").setAttribute("aria-expanded", "false"); } });
        dd.classList.toggle("open", on);
        trig.setAttribute("aria-expanded", on ? "true" : "false");
      };
      trig.onclick = e => { e.stopPropagation(); setOpen(!dd.classList.contains("open")); };
      dd.querySelectorAll("[data-set]").forEach(opt => opt.onclick = async e => {
        e.stopPropagation();
        setOpen(false);
        try {
          await api(`/api/admin/books/${dd.dataset.bid}/status`, { method: "PUT", body: { status: opt.dataset.set, comment: "через раздел «Учебники»" } });
          toast("Статус изменён", "ok");
          const fresh = await api("/api/books");
          books.length = 0; books.push(...fresh);
          $("#lb-grid").innerHTML = gridHtml(); bind();
        } catch (err) { toast(err.message, "err"); }
      });
    });
  };
  bind();
  if (!document._lbStClose) {
    document._lbStClose = true;
    document.addEventListener("click", () => $$(".lb-st.open").forEach(o => {
      o.classList.remove("open");
      const t = o.querySelector(".lb-st-trig"); if (t) t.setAttribute("aria-expanded", "false");
    }));
  }
  $("#lib-q").oninput = e => { libQuery = e.target.value; $("#lb-grid").innerHTML = gridHtml(); bind(); };
  if ($("#lib-new")) $("#lib-new").onclick = openCreateChoice;
  if ($("#lib-import")) $("#lib-import").onclick = openImport;
}

/* ---- Учебники: витрина одной книги ---- */
let bsOrder = null;   // порядок книг в нижнем ряду
let bsActive = null;  // id большой книги
let bsSeq = 0;        // защита от гонок при быстрых переключениях

async function viewBooks() {
  // раздел «Учебники» перенесён на главную — старые ссылки #/books ведут туда
  const sel = (location.hash.match(/[?&]sel=(\d+)/) || [])[1];
  location.hash = "#/dashboard" + (sel ? "?sel=" + sel : "");
}

/* разметка секции «Учебники» для главной */
function bookshowSectionHtml(books) {
  const createBtns = can("books.create") ? `
      <button class="btn" id="btn-import">${I.upload}Импорт</button>
      <button class="btn primary" id="btn-new">${I.plus}Новый учебник</button>` : "";
  const inner = books.length ? `
    <div class="bookshow embed">
      <div class="bs-main">
        <div class="bs-cover-wrap" id="bs-cover"></div>
        <div class="bs-info" id="bs-info"></div>
      </div>
      <div class="bs-strip-row">
        <button class="bs-arrow" id="bs-prev" aria-label="Листать">${I.back}</button>
        <div class="bs-strip" id="bs-strip"></div>
        <button class="bs-arrow" id="bs-next" aria-label="Листать">${I.chev}</button>
      </div>
    </div>` : `<div class="empty">${I.book}<br>Учебников пока нет — создайте первый</div>`;
  return `
    <section class="dash-books">
      <div class="home-sec-row">
        <h2 class="home-sec">Учебники</h2>
        <div class="bs-head-btns">${createBtns}</div>
      </div>
      ${inner}
    </section>`;
}

/* оживление витрины (ожидает #bs-cover/#bs-info/#bs-strip в DOM) */
function setupBookshow(books) {
  if ($("#btn-new")) $("#btn-new").onclick = openCreateChoice;
  if ($("#btn-import")) $("#btn-import").onclick = openImport;
  if (!books.length) return;

  const byId = {};
  books.forEach(b => byId[b.id] = b);
  // порядок ряда: сохраняем прежний, новые книги — в конец
  const ids = books.map(b => b.id);
  bsOrder = (bsOrder || []).filter(id => byId[id]).concat(ids.filter(id => !(bsOrder || []).includes(id)));
  const selParam = (location.hash.match(/[?&]sel=(\d+)/) || [])[1];
  if (selParam && byId[+selParam]) bsActive = +selParam;
  if (!bsActive || !byId[bsActive]) bsActive = bsOrder[0];

  $("#bs-prev").onclick = () => $("#bs-strip").scrollBy({ left: -320, behavior: "smooth" });
  $("#bs-next").onclick = () => $("#bs-strip").scrollBy({ left: 320, behavior: "smooth" });

  const fullCache = {}; // полные данные книг — для инфопанели и читалки

  const bigBook = b => {
    const [bg, fg] = coverColor(b.subject || b.title);
    return `<div class="bs-book${coverCls(b)}" style="--cbg:${bg};--cfg:${fg}" role="button" tabindex="0" aria-label="Открыть и листать «${esc(b.title)}»">
      ${coverPhoto(b)}
      <div class="bsb-emblems"><img src="/static/img/gerb-kg.svg" alt="Герб КР"><img src="/static/img/flag-kg.svg" alt="Флаг КР"></div>
      <span class="bsb-subject">${esc(b.subject || "Учебник")}</span>
      <b class="bsb-title">${esc(b.title)}</b>
      <span class="bsb-grade">${b.grade ? esc(b.grade) + " класс" : ""}</span>
      <span class="bsb-foot">Кыргызская Республика</span>
      <span class="bsb-open">${I.book}Листать</span>
    </div>`;
  };

  const renderCover = (b, animate) => {
    $("#bs-cover").innerHTML = bigBook(b);
    const el = $("#bs-cover .bs-book");
    if (animate) el.classList.add("spin-in");
    el.onclick = () => openInlineReader();
    el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openInlineReader(); } };
  };

  /* — читалка на месте: книга не уезжает, страницы раскрываются вправо,
       инфопанель стирается так же, как печаталась — */
  let rdEl = null, rdKey = null, rdT = null;
  const closeInlineReader = (instant) => {
    if (!rdEl) return;
    const el = rdEl, bookEl = $("#bs-cover .bs-book"), info = $("#bs-info");
    rdEl = null;
    if (rdKey) { document.removeEventListener("keydown", rdKey); rdKey = null; }
    clearTimeout(rdT);
    const finish = () => {
      el.remove();
      if (el._nav) el._nav.remove();
      if (bookEl) bookEl.style.visibility = "";
      if (info) {
        clearTimeout(info._eraseT);
        info.classList.remove("bsi-hidden", "bsi-erase", "bsi-aside");
        info.style.transform = "";
        info.style.width = "";
        const act = info.querySelector(".bsi-actions");
        if (act) { act.style.transform = ""; act.style.transition = ""; }
        renderInfo(bsActive);
      }
    };
    if (el._nav) el._nav.classList.remove("show"); // плашка исчезает прозрачностью, не двигаясь
    if (instant || matchMedia("(prefers-reduced-motion: reduce)").matches) { finish(); return; }
    if (info) {
      info.style.transform = ""; // инфа плавно возвращается на место вместе с книгой
      const act = info.querySelector(".bsi-actions");
      if (act) act.style.transform = ""; // кнопки при этом так и стоят на месте
    }
    // страницы возвращаются; обложка сразу поверх всех — внутренние страницы не мелькают
    const lvs = $$(".bkri-leaf", el);
    lvs.forEach((lf, k) => { lf.classList.remove("flip", "turning"); lf.style.zIndex = String(lvs.length - k); });
    el.classList.add("closing", "closed"); // листы возвращаются, корпус остаётся на месте
    setTimeout(finish, 1550);
  };
  const openInlineReader = async () => {
    if (rdEl) return;
    const b = byId[bsActive];
    if (!b) return;
    let full = fullCache[b.id];
    if (!full) { try { full = await api(`/api/books/${b.id}`); fullCache[b.id] = full; } catch (e) {} }
    const bookEl = $("#bs-cover .bs-book"), wrap = bookEl && bookEl.closest(".bs-main"), info = $("#bs-info");
    if (!bookEl || !wrap || rdEl) return;
    /* настоящие страницы: контент, не влезающий в лист витринного размера,
       раскладывается по СЛЕДУЮЩИМ листам (заголовок сверху, дальше текст) —
       книга читается целиком, ничего не обрезается */
    const mw = bookEl.offsetWidth, mh = bookEl.offsetHeight;
    const meas = document.createElement("div");
    meas.className = "bkri-meas";
    meas.style.cssText = `width:${mw}px;height:${mh}px`;
    wrap.appendChild(meas);
    let F = buildBookFaces(b, full);
    try { F = paginateFaces(F, meas); } catch (e) { /* при сбое остаются цельные страницы */ }
    meas.remove();
    // чётность после пагинации: задняя обложка должна остаться оборотом последнего листа
    if (F.length % 2 !== 0) F.splice(F.length - 1, 0, `<div class="bkp bkp-blank"></div>`);
    const N = F.length / 2;
    // настоящая книга: листы лежат справа от корешка, обложка открывается влево;
    // закрытая книга сдвинута на полразворота влево (стоит на месте витринной),
    // при открытии контейнер плавно уезжает вправо — обложка ложится на место книги
    const leaves = [];
    for (let k = 0; k < N; k++) {
      if (k === 0) {
        // обложка — жёсткая, одним полотном, не сгибается
        leaves.push(`<div class="bkri-leaf">
            <div class="bkri-face f cvr">${F[0]}</div>
            <div class="bkri-face b">${F[1]}</div>
          </div>`);
      } else {
        // страница из ЦЕПОЧКИ 6 звеньев: каждое чуть подворачивается относительно
        // предыдущего (≤5°) — лист гнётся мягкой дугой без видимых изломов;
        // каждое звено — окно на общее полотно грани (см. CSS .bkri-win)
        const win = `<div class="bkri-win">
              <div class="bkri-face f">${F[2 * k]}</div>
              <div class="bkri-face b">${F[2 * k + 1]}</div>
            </div>`;
        leaves.push(`<div class="bkri-leaf seg">
            <div class="bkri-seg g1">${win}
              <div class="bkri-seg g2">${win}
                <div class="bkri-seg g3">${win}
                  <div class="bkri-seg g4">${win}
                    <div class="bkri-seg g5">${win}
                      <div class="bkri-seg g6">${win}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>`);
      }
    }
    // размеры из layout (offset*), а не getBoundingClientRect — не зависят от transform-анимаций.
    // закрытая книга появляется ровно на месте витринной (правый блок при translateX(-50%)),
    // затем НЕ раскрываясь плавно едет слева направо и только после остановки открывается
    const bw = bookEl.offsetWidth, bh = bookEl.offsetHeight;
    const bx = bookEl.offsetLeft, by = bookEl.offsetTop;
    const elLeft = Math.max(0, Math.min(bx, wrap.clientWidth - bw * 2 - 6));
    const el = document.createElement("div");
    el.className = "bkri closed";
    el.style.cssText = `left:${elLeft}px;top:${by}px;width:${bw * 2}px;height:${bh}px`;
    el.innerHTML = `
      ${leaves.join("")}
      <button class="bkri-zone zl" aria-label="Предыдущий разворот"></button>
      <button class="bkri-zone zr" aria-label="Следующий разворот"></button>`;
    wrap.appendChild(el);
    // плашка страниц + крестик — ОТДЕЛЬНО от книги: стоит на месте,
    // не ездит и не левитирует, появляется из прозрачности
    const nav = document.createElement("div");
    nav.className = "bkri-nav";
    nav.style.cssText = `left:${elLeft}px;top:${by + bh + 10}px`;
    nav.innerHTML = `<span class="bkri-pos"></span>
      <button class="bkri-close" aria-label="Закрыть книгу">${I.x}</button>`;
    wrap.appendChild(nav);
    el._nav = nav;
    requestAnimationFrame(() => requestAnimationFrame(() => nav.classList.add("show")));
    rdEl = el;
    const leafEls = $$(".bkri-leaf", el);
    let pos = 0, opened = false;
    const setZ = () => leafEls.forEach((lf, k) => {
      lf.classList.remove("turning");
      lf.style.zIndex = k < pos ? 1 + k : N - k;
    });
    const goTo = n => {
      n = Math.max(0, Math.min(N, n));
      // долистали обратно к обложке → закрыть книгу и вернуть инфопанель (без «залипшего» крестика)
      if (opened && n === 0) { closeInlineReader(false); return; }
      leafEls.forEach((lf, k) => {
        const should = k < n;
        if (lf.classList.contains("flip") !== should) { lf.classList.add("turning"); lf.classList.toggle("flip", should); }
      });
      pos = n;
      el.classList.toggle("closed", pos === 0); // закрытая книга стоит на месте витринной
      el.classList.toggle("at-end", pos === N); // в конце книга занимает левую половину → крестик к её углу
      clearTimeout(rdT);
      rdT = setTimeout(setZ, 1500); // после переворота (1.45s) — обычный порядок слоёв
      const prev = $(".bkri-arr[data-go='-1']", el), next = $(".bkri-arr[data-go='1']", el);
      if (prev) prev.disabled = pos === 0;
      if (next) next.disabled = pos === N;
      $(".bkri-pos", nav).textContent = pos === 0 ? "Обложка" : pos === N ? "Конец" : `${pos} / ${N - 1}`;
    };
    setZ();
    goTo(0);
    // листание влево к обложке (pos 0) закрывает книгу — см. страж в goTo
    $(".bkri-zone.zl", el).onclick = () => goTo(pos - 1);
    $(".bkri-zone.zr", el).onclick = () => goTo(pos + 1);
    $$(".bkri-arr", el).forEach(a => a.onclick = () => goTo(pos + (+a.dataset.go)));
    $(".bkri-close", nav).onclick = () => closeInlineReader(false);
    rdKey = e => {
      if (e.key === "Escape") closeInlineReader(false);
      else if (e.key === "ArrowRight") goTo(pos + 1);
      else if (e.key === "ArrowLeft") goTo(pos - 1);
    };
    document.addEventListener("keydown", rdKey);
    bookEl.style.visibility = "hidden"; // копия обложки стоит ровно на месте книги
    ++bsSeq; // остановить возможную «печать» инфопанели
    finishTypewriter(info); // …и допечатать всё сразу — без застрявшей мигающей каретки
    // две фазы: (1) закрытая книга плавно едет слева направо; (2) после полной остановки — раскрытие
    /* инфа НЕ пропадает: плавно сдвигается вправо ровно настолько, насколько
       раскрытая книга занимает места; ширина ужимается одним пересчётом,
       дальше едет только GPU-transform (без лагающей маски-стирания) */
    if (info) {
      const shift = Math.max(0, elLeft + bw * 2 + 16 - info.offsetLeft);
      info.style.width = Math.max(200, info.offsetWidth - shift) + "px";
      info.classList.add("bsi-aside");
      // кнопки «Настройки»/«Экспорт» НЕ трогаем: контр-сдвиг тем же темпом —
      // панель уезжает, а кнопки визуально остаются там, где стояли
      const act = info.querySelector(".bsi-actions");
      if (act) act.style.transition = "transform 1.3s cubic-bezier(.45,.02,.22,1)";
      requestAnimationFrame(() => {
        info.style.transform = `translateX(${shift}px)`;
        if (act) act.style.transform = `translateX(${-shift}px)`;
      });
    }
    rdT = setTimeout(() => {
      if (rdEl !== el) return;
      el.classList.remove("closed"); // фаза 1: книга и инфа едут вправо в одном ритме
      rdT = setTimeout(() => { if (rdEl === el) { opened = true; goTo(1); } }, 1400); // фаза 2: обложка
    }, 160);
  };

  const renderStrip = (appearedId) => {
    $("#bs-strip").innerHTML = bsOrder.filter(id => id !== bsActive).map(id => {
      const b = byId[id];
      const [bg, fg] = coverColor(b.subject || b.title);
      return `<button class="bs-mini ${id === appearedId ? "shrink-in" : ""}${coverCls(b)}" data-id="${id}"
        style="--cbg:${bg};--cfg:${fg}" aria-label="${esc(b.title)}">
        ${coverPhoto(b)}
        <span>${esc(b.subject || "Учебник")}</span>
        <b>${esc(b.title)}</b>
        <i>${b.grade ? esc(b.grade) + " кл." : ""}</i>
      </button>`;
    }).join("") || `<div class="bs-strip-empty">Другие учебники появятся здесь</div>`;
    $$("#bs-strip .bs-mini").forEach(m => m.onclick = () => selectBook(+m.dataset.id));
  };

  const renderInfo = async (id) => {
    const seq = ++bsSeq;
    const b = byId[id];
    let full = null;
    try { full = await api(`/api/books/${id}`); fullCache[id] = full; } catch (e) {}
    if (seq !== bsSeq) return; // уже выбрали другую
    const el = $("#bs-info");
    if (!el) return;
    const team = (full?.members || []).map(m => `${m.name} — ${m.member_role}`).join("; ");
    const authors = (full?.members || []).filter(m => ["Автор", "Соавтор"].includes(m.member_role))
      .map(m => m.name).join(", ") || b.author_name;
    const chip = (t) => t ? `<span class="chip">${esc(t)}</span>` : "";
    const row = (label, val) => val ? `<div class="bsi-row"><span>${label}</span><b data-tw>${esc(val)}</b></div>` : "";
    el.innerHTML = `
      <div class="bsi-top">
        <h2 class="bsi-title" data-tw>${esc(b.title)}</h2>
        <span class="chip ${STATUS_CHIP[b.status] || ""}">${esc(b.status_title)}</span>
      </div>
      <div class="bsi-chips">
        ${chip(b.subject)}${chip(b.grade ? b.grade + " класс" : "")}${chip(b.language)}
      </div>
      <div class="bsi-rows">
        ${row("Регистрационный №", `КР-КТП-${String(b.id).padStart(4, "0")}`)}
        ${row(plural((full?.members || []).length, "Автор", "Авторы", "Авторы"), authors)}
        ${team && team !== authors ? row("Команда", team) : ""}
        ${row("Версий сохранено", String(b.versions_count))}
        ${row("Открытых замечаний", String(b.open_comments))}
        ${row("Создан", humanWhen(b.created_at))}
        ${row("Обновлён", humanWhen(b.updated_at))}
      </div>
      <div class="bsi-state">
        <img src="/static/img/gerb-kg.svg" alt=""><img src="/static/img/flag-kg.svg" alt="">
        <span data-tw>Госстраницы включены: гимн, герб и флаг Кыргызской Республики</span>
      </div>
      <div class="bsi-actions">
        <button class="btn primary" id="bsi-open">${I.gear}Настройки</button>
        <a class="btn" href="/api/books/${b.id}/export">${I.doc}Экспорт</a>
      </div>`;
    $("#bsi-open").onclick = () => { location.hash = "#/book/" + b.id; };
    typewriter(el, seq);
  };

  function selectBook(id) {
    if (id === bsActive || !byId[id]) return;
    closeInlineReader(true); // при смене книги читалка мгновенно закрывается
    const prev = bsActive;
    // позиции ДО перестановки — откуда полетят книги
    const fromMini = $(`#bs-strip .bs-mini[data-id="${id}"]`);
    const fromBig = $("#bs-cover .bs-book");
    const miniR = fromMini && fromMini.getBoundingClientRect();
    const bigR = fromBig && fromBig.getBoundingClientRect();
    const i = bsOrder.indexOf(id), j = bsOrder.indexOf(prev);
    if (i >= 0 && j >= 0) { bsOrder[i] = prev; bsOrder[j] = id; } // прежняя встаёт на место выбранной
    bsActive = id;
    renderCover(byId[id], false);
    renderStrip();
    renderInfo(id);
    flySwap(prev, miniR, bigR);
  }

  /* полёт-обмен: выбранная книга поднимается из ряда, крутится и растёт до большой;
     прежняя большая тем же движением опускается на освободившееся место в ряду */
  function flySwap(prevId, miniR, bigR) {
    if (!miniR || !bigR || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const newBig = $("#bs-cover .bs-book");
    const prevMini = $(`#bs-strip .bs-mini[data-id="${prevId}"]`);
    if (!newBig || !prevMini || !newBig.animate) return;
    const bigR2 = newBig.getBoundingClientRect();
    const miniR2 = prevMini.getBoundingClientRect();

    const D = 1350, E = "cubic-bezier(.30,.66,.20,1)"; // медленнее и мягче — по просьбе юзера
    const fly = (el, fromR, toR, spin) => {
      // обёртка летит и масштабируется, клон внутри крутится вокруг своего центра;
      // координаты — ДОКУМЕНТА (не fixed), чтобы при прокрутке во время полёта
      // книги ехали вместе со страницей, а не прилипали к экрану
      const wrap = document.createElement("div");
      Object.assign(wrap.style, {
        position: "absolute",
        left: (toR.left + window.scrollX) + "px", top: (toR.top + window.scrollY) + "px",
        width: toR.width + "px", height: toR.height + "px",
        margin: "0", zIndex: 20, pointerEvents: "none",
        transformOrigin: "top left", perspective: "1200px",
      });
      const g = el.cloneNode(true);
      g.classList.remove("spin-in", "shrink-in");
      Object.assign(g.style, {
        position: "absolute", inset: "0", width: "100%", height: "100%",
        margin: "0", visibility: "visible",
      });
      wrap.appendChild(g);
      document.body.appendChild(wrap);
      const dx = fromR.left - toR.left, dy = fromR.top - toR.top;
      const sx = fromR.width / toR.width, sy = fromR.height / toR.height;
      wrap.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transform: "translate(0, 0) scale(1, 1)" },
      ], { duration: D, easing: E });
      const a = g.animate([
        { transform: "rotateY(0deg)" },
        { transform: `rotateY(${spin}deg)` },
      ], { duration: D, easing: E });
      a.onfinish = () => wrap.remove();
      return a;
    };

    const a1 = fly(newBig, miniR, bigR2, 360);    // вверх: растёт и крутится
    const a2 = fly(prevMini, bigR, miniR2, -360); // вниз: уменьшается, крутится обратно
    newBig.style.visibility = "hidden";
    prevMini.style.visibility = "hidden";
    const done = () => { newBig.style.visibility = ""; prevMini.style.visibility = ""; };
    Promise.all([a1.finished, a2.finished]).then(done, done);
  }

  renderCover(byId[bsActive], true);
  renderStrip();
  renderInfo(bsActive);
  // тест-хук: ?reader=1 открывает читалку сразу (для скриншотов)
  if (location.search.includes("reader=1")) setTimeout(() => { const el = $("#bs-cover .bs-book"); if (el) el.click(); }, 1200);
}

/* ---- Читалка: страницы-грани книги, собранные из её содержимого ---- */
function buildBookFaces(b, full) {
  const [bg, fg] = coverColor(b.subject || b.title);
  const c = (full && full.content) || {};
  const t = c.titul || {};
  const ppl = c.people || {};
  const names = arr => (arr || []).map(x => typeof x === "string" ? x : (x && x.name) || "").filter(Boolean);
  const authors = [...names(ppl.authors), ...names(ppl.coauthors)];

  const clip = (s, lim = 460) => {
    s = String(s || "").trim();
    if (!s) return "";
    if (s.length > lim) s = s.slice(0, lim).replace(/\s+\S*$/, "") + "…";
    return esc(s).replace(/\n+/g, "<br>");
  };
  const blk = (name, val, lim, ic = "") => String(val || "").trim()
    ? `<div class="bkp-blk"><b>${ic}${name}</b><p>${clip(val, lim)}</p></div>` : "";

  /* страницы-грани: чётная — правая (лицо листа), нечётная — левая (оборот) */
  const F = [];
  // обложка = ТОЧНАЯ копия витринной книги (та же разметка и стили — без мигания при подмене)
  F.push(`<div class="bkp bkp-cvr"><div class="bs-book${coverCls(b)}" style="--cbg:${bg};--cfg:${fg}">
      ${coverPhoto(b)}
      <div class="bsb-emblems"><img src="/static/img/gerb-kg.svg" alt=""><img src="/static/img/flag-kg.svg" alt=""></div>
      <span class="bsb-subject">${esc(b.subject || "Учебник")}</span>
      <b class="bsb-title">${esc(b.title)}</b>
      <span class="bsb-grade">${b.grade ? esc(b.grade) + " класс" : ""}</span>
      <span class="bsb-foot">Кыргызская Республика</span>
    </div></div>`);
  /* ═══ Первые страницы — точно по образцу реальных госучебников («Жаңы китеп»):
     титул (красное название) → выходные данные (УДК/ББК/ISBN/аннотация) →
     флаг+герб одной страницей → гимн отдельной → введение с обращением ═══ */
  const kg = (b.language || "").toLowerCase().startsWith("кырг");
  const year = String(t.year || new Date().getFullYear());
  const gradeSub = t.subtitle || (kg
    ? (b.grade ? `Окутуу кыргыз тилинде жүргүзүлгөн жалпы билим берүү уюмдарынын ${b.grade}-классы үчүн окуу китеби`
               : "Жалпы билим берүү уюмдары үчүн окуу китеби")
    : (b.grade ? `Учебник для ${b.grade} класса общеобразовательных организаций`
               : "Учебник для общеобразовательных организаций"));
  const grif = t.grif || (kg
    ? "Кыргыз Республикасынын Билим берүү жана илим министрлиги тарабынан сунушталган"
    : "Рекомендовано Министерством просвещения Кыргызской Республики");

  /* титульный лист */
  F.push(`<div class="bkp bkp-titul bkt3">
      <div class="bkt3-brand">${LOGO_SVG}<span>ГИС «КИТЕП»</span></div>
      <p class="bkt3-authors">${authors.length ? esc(authors.join(", ")) : (kg ? "Авторлор жамааты" : "Коллектив авторов")}</p>
      <h3 class="bkt3-title">${esc(t.title || b.title)}</h3>
      <p class="bkt3-sub">${esc(gradeSub)}</p>
      <p class="bkt3-grif">${esc(grif)}</p>
      <span class="bkt3-city">Бишкек – ${esc(year)}</span>
    </div>`);

  /* выходные данные — только реальные значения из «Выходных сведений»;
     официальные коды НЕ выдумываются: пустые помечаются как требующие заполнения */
  const imp = c.imprint || {};
  const missTxt = kg ? "толтурула элек" : "требует заполнения";
  const codeLn = (label, v) => String(v || "").trim()
    ? esc(`${label} ${String(v).trim()}`)
    : `${label} <i class="bki2-miss">${missTxt}</i>`;
  const pub = (imp.publisher || t.publisher || "").trim() || "ГИС «Китеп»";
  const city = (imp.city || "Бишкек").trim();
  const cityShort = /^бишкек$/i.test(city) ? "Б." : city;
  const authorsLine = String(imp.authors_line || "").trim()
    || (authors.length ? authors[0] + (authors.length > 1 ? (kg ? " ж. б." : " и др.") : "") : (kg ? "авторлор жамааты" : "авторский коллектив"));
  const isbn = String(t.isbn || "").trim();
  const biblio = String(imp.bib_desc || "").trim()
    ? esc(imp.bib_desc).replace(/\n/g, "<br>")
    : `<b>${esc(t.title || b.title)}:</b> ${b.grade ? esc(b.grade) + (kg ? "-кл. " : " кл. ") : ""}${esc(authorsLine)}. — ${esc(cityShort)}: «${esc(pub)}», ${esc(year)}.${String(imp.pages || "").trim() ? ` — ${esc(imp.pages)} с.` : ""}`;
  const copyright = String(imp.copyright || "").trim()
    ? esc(imp.copyright).replace(/\n/g, "<br>")
    : `© ${kg ? "Авторлор жамааты" : "Авторский коллектив"}, ${esc(year)}<br>© ${esc(imp.org || (kg ? "Кыргыз Республикасынын Билим берүү жана илим министрлиги" : "Министерство просвещения Кыргызской Республики"))}, ${esc(year)}`;
  F.push(`<div class="bkp bki2">
      <div class="bki2-codes">${codeLn("УДК", imp.udk)}<br>${codeLn("ББК", imp.bbk)}<br>${String(imp.author_sign || "").trim() ? esc(imp.author_sign) : `<i class="bki2-miss">${kg ? "автордук белги: " : "авт. знак: "}${missTxt}</i>`}</div>
      <p class="bki2-biblio">${biblio}</p>
      <p class="bki2-isbn">${isbn ? "ISBN " + esc(isbn) : `ISBN <i class="bki2-miss">${missTxt}</i>`}</p>
      ${String(c.annotation || "").trim() ? `<p class="bki2-annot">${clip(c.annotation, 700)}</p>` : ""}
      <div class="bki2-foot">
        <span>${isbn ? "ISBN " + esc(isbn) : ""}</span>
        <span>${copyright}</span>
      </div>
    </div>`);

  /* флаг и герб — одна страница, заголовки по-кыргызски (гос. стандарт) */
  const sp = c.statePages || {};
  const spm = (state.meta && state.meta.state_pages) || null;
  if ((sp.flag || sp.gerb) && spm) F.push(`<div class="bkp bks3">
      ${sp.flag ? `<h4 class="bks3-h">Кыргыз Республикасынын<br>Мамлекеттик Туусу</h4>
      <img class="bks3-flag" src="${spm.flag.image}" alt="Флаг Кыргызской Республики">` : ""}
      ${sp.gerb ? `<h4 class="bks3-h">Кыргыз Республикасынын<br>Мамлекеттик Герби</h4>
      <img class="bks3-gerb" src="${spm.gerb.image}" alt="Герб Кыргызской Республики">` : ""}
    </div>`);

  /* гимн — отдельная страница */
  if (sp.anthem && spm) F.push(`<div class="bkp bkanth">
      <h4 class="bks3-h">Кыргыз Республикасынын<br>Мамлекеттик Гимни</h4>
      <p class="bkanth-cred">Сөзү Ж. Садыковдуку жана Ш. Кулуевдики<br>Музыкасы Н. Давлесовдуку жана К. Молдобасановдуку</p>
      <div class="bkanth-text">${esc(spm.anthem.text_kg).replace(/\n/g, "<br>")}</div>
    </div>`);

  /* введение — обращение к ученикам, в конце подпись «Авторы» */
  if (String(c.intro || "").trim()) F.push(`<div class="bkp bkintro">
      <h4 class="bks3-h">${kg ? "Киришүү" : "Введение"}</h4>
      <p class="bkintro-greet">${kg ? "Кымбаттуу окуучулар!" : "Дорогие ученики!"}</p>
      <div class="bkintro-text">${clip(c.intro, 1600)}</div>
      <p class="bkintro-sig">${kg ? "Авторлор" : "Авторы"}</p>
    </div>`);

  /* условные обозначения (рубрики книги) */
  if ((c.legend || []).length) F.push(`<div class="bkp bkp-howto">
      <h4>${kg ? "Шарттуу белгилер" : "Условные обозначения"}</h4>
      <div class="bkl">${c.legend.slice(0, 9).map(l => `<div class="bkl-row"><b>${esc(l.symbol || "")}</b><span>${esc(l.meaning || "")}</span></div>`).join("")}</div>
    </div>`);

  // названия глав часто уже содержат «Глава N. / N-бөлүм» (иногда дважды) —
  // срезаем ВСЕ префиксы циклом, в бейдже номер и так есть
  const chClean = t => {
    let out = String(t || "").trim();
    const rx = /^\s*(?:глава\s*\d*|\d+\s*-\s*бөлүм)\s*[.:—-]?\s*/i;
    while (rx.test(out) && out.replace(rx, "").trim()) out = out.replace(rx, "").trim();
    return out || String(t || "");
  };
  /* ═══ Главы — как в литературе kitep.edu.kg: у главы НЕТ отдельной страницы,
     её заголовок стоит СВЕРХУ первой страницы, ниже сразу рассказ.
     Без «Ты узнаешь»/«Я могу» — только произведение, потом «Вопросы и задания».
     Оглавление — в КОНЦЕ книги (см. ниже), как в настоящих учебниках. ═══ */
  const QUEST_IC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`;
  const MEMO_IC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
  (c.chapters || []).forEach((ch, ci) => {
    (ch.sections || []).forEach((s, si) => {
      const body = richBody(s.body);
      const qlist = String(s.questions || "").trim()
        ? String(s.questions).split(/\n+/).map(q => q.trim().replace(/^\d+\s*[).:—-]\s*/, "")).filter(Boolean).slice(0, 6)
        : [];
      F.push(`<div class="bkp" data-sec="${ch.id}:${s.id}" ${si === 0 ? `data-chap="${ch.id}"` : ""}>
          ${si === 0 ? `<div class="bkch-head">
            <span class="bkch-num">${kg ? `${ci + 1}-бөлүм` : `Глава ${ci + 1}`}</span>
            <h3>${esc(chClean(ch.title))}</h3>
          </div>` : ""}
          <h4 data-edit="title">${esc(s.title || "")}</h4>
          ${s.image ? `<figure class="bkp-fig"><img src="${esc(s.image)}" alt="${esc(s.title || "Иллюстрация")}" loading="lazy"></figure>` : ""}
          <div class="bkp-editbody" data-edit="body">${body || `<p class="bkp-mut">Нажмите «Редактировать» и начните писать текст параграфа…</p>`}</div>
          ${blk(kg ? "Эсиңде болсун!" : "Запомни", s.summary, 220, MEMO_IC)}
          ${qlist.length ? `<div class="bkp-quest"><b>${QUEST_IC}${kg ? "Суроолор жана тапшырмалар" : "Вопросы и задания"}</b>
            <ol>${qlist.map(q => `<li>${esc(q)}</li>`).join("")}</ol></div>` : ""}
        </div>`);
    });
  });
  if ((c.glossary || []).some(g => (g.term || "").trim())) F.push(`<div class="bkp"><h4>${kg ? "Терминдер сөздүгү" : "Словарь терминов"}</h4>
      <div class="bkl">${c.glossary.filter(g => (g.term || "").trim()).slice(0, 10)
        .map(g => `<div class="bkl-row"><b>${esc(g.term)}</b><span>${clip(g.definition, 120)}</span></div>`).join("")}</div>
    </div>`);
  /* «Содержание» — в КОНЦЕ книги, как в настоящих учебниках kitep */
  if ((c.chapters || []).length) F.push(`<div class="bkp bkp-toc">
      <h4>${kg ? "Мазмуну" : "Содержание"}</h4>
      <div class="bkt-toc">
        ${c.chapters.map((ch, ci) => `<div class="bkt-tocrow" data-jumpch="${ch.id}"><i>${kg ? `${ci + 1}-бөлүм` : `Глава ${ci + 1}`}</i><span>${esc(chClean(ch.title))}</span></div>`).join("")}
      </div>
    </div>`);
  // паддинг: чётное число граней, задняя обложка — оборотом последнего листа.
  // как в печатных книгах — просто пустая страница
  if (F.length % 2 === 0) F.push(`<div class="bkp bkp-blank"></div>`);
  F.push(`<div class="bkp bkp-back" style="--cbg:${bg}">
      <img src="/static/img/gerb-kg.svg" alt="">
      <span>ГИС «Китеп»<br>${kg ? "Кыргыз Республикасынын Билим берүү жана илим министрлиги" : "Министерство просвещения Кыргызской Республики"}</span>
    </div>`);
  return F;
}

/* ═══ Пагинация читалки: контент, не влезающий в лист, раскладывается на
   НЕСКОЛЬКО страниц фиксированной высоты (как в настоящих книгах kitep.edu.kg) —
   страница книги никогда не скроллится. meas — живой невидимый .rd-page тех же
   размеров: в нём меряем, что помещается. Переполненный блок (например, тело
   параграфа) раскрывается и его дети распределяются по страницам; неделимый
   гигантский абзац режется по словам (двоичным поиском по числу слов). ═══ */
function paginateFaces(raw, meas) {
  const out = [];
  const PAD = 1;
  for (const html of raw) {
    meas.innerHTML = html;
    const root = meas.firstElementChild;
    if (!root || root.scrollHeight <= root.clientHeight + PAD) { out.push(html); continue; }

    const src = root.cloneNode(true);
    let shell = root.cloneNode(false);
    meas.innerHTML = ""; meas.appendChild(shell);
    const openPath = []; // открытые вложенные блоки (переоткрываются на новой странице)
    const fits = () => shell.scrollHeight <= shell.clientHeight + PAD;
    const target = () => openPath.length ? openPath[openPath.length - 1] : shell;
    // пустые обёртки-клоны (без единого ребёнка) — мусор от неудачных спусков:
    // добавляют высоту пустой строкой, вычищаем перед сохранением страницы
    const prune = node => {
      let again = true;
      while (again) {
        again = false;
        node.querySelectorAll("*").forEach(el => {
          if (!el.childNodes.length && !/^(IMG|SVG|BR|HR|INPUT|IFRAME)$/i.test(el.tagName)) { el.remove(); again = true; }
        });
      }
    };
    const newPage = () => {
      prune(shell);
      if (shell.childNodes.length) out.push(shell.outerHTML);
      shell = root.cloneNode(false);
      shell.classList.add("bkp-cont");
      shell.setAttribute("data-cont", "1");
      meas.innerHTML = ""; meas.appendChild(shell);
      let parent = shell;
      for (let i = 0; i < openPath.length; i++) {
        const c = openPath[i].cloneNode(false);
        parent.appendChild(c); openPath[i] = c; parent = c;
      }
    };
    const pageHasContent = () => !!(shell.textContent.trim() || shell.querySelector("img, svg"));

    const place = node => {
      target().appendChild(node.cloneNode(true));
      if (fits()) return;
      target().removeChild(target().lastChild);
      // контейнер (например, тело параграфа) раскрываем ПРЯМО НА ТЕКУЩЕЙ странице —
      // его начало заполняет остаток листа, хвост уходит на следующие
      if (node.nodeType === 1 && (node.childNodes.length > 1 ||
          (node.firstChild && node.firstChild.nodeType === 1))) {
        const wrap = node.cloneNode(false);
        target().appendChild(wrap);
        // даже пустая обёртка не влезла (лист забит) → сразу на новую страницу
        if (!fits() && pageHasContent()) { target().removeChild(wrap); newPage(); target().appendChild(wrap); }
        openPath.push(wrap);
        [...node.childNodes].forEach(k => { if (k.nodeType === 3 && !k.textContent.trim()) return; place(k); });
        openPath.pop();
        return;
      }
      // неделимый блок: сперва пробуем целиком на свежем листе…
      if (pageHasContent()) {
        newPage();
        target().appendChild(node.cloneNode(true));
        if (fits()) return;
        target().removeChild(target().lastChild);
      }
      // …не влез и там — режем текст по словам
      let words = (node.textContent || "").split(/\s+/).filter(Boolean);
      if (!words.length) { target().appendChild(node.cloneNode(true)); return; }
      while (words.length) {
        const el = node.nodeType === 1 ? node.cloneNode(false) : document.createElement("span");
        target().appendChild(el);
        let lo = 1, hi = words.length, fit = 0;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          el.textContent = words.slice(0, mid).join(" ");
          if (fits()) { fit = mid; lo = mid + 1; } else hi = mid - 1;
        }
        if (!fit) {
          target().removeChild(el);
          if (!pageHasContent()) { // даже слово не лезет в пустой лист — форсируем одно
            target().appendChild(el); el.textContent = words[0]; words = words.slice(1);
            continue;
          }
          newPage(); continue;
        }
        el.textContent = words.slice(0, fit).join(" ");
        words = words.slice(fit);
        if (words.length) newPage();
      }
    };
    [...src.childNodes].forEach(n => { if (n.nodeType === 3 && !n.textContent.trim()) return; place(n); });
    prune(shell);
    if (shell.childNodes.length) out.push(shell.outerHTML);
  }
  meas.innerHTML = "";
  return out;
}

/* инфопанель исчезает плавной «шторкой» слева направо (и так же проявляется назад) */
function eraseInfo(el, done) {
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    if (el) el.classList.add("bsi-hidden");
    done(); return;
  }
  el.classList.add("bsi-erase");
  clearTimeout(el._eraseT);
  el._eraseT = setTimeout(() => {
    // если читалку уже закрыли (класс снят) — панель прятать нельзя
    if (el.classList.contains("bsi-erase")) el.classList.add("bsi-hidden");
    done();
  }, 850);
}

/* быстрая «печать» текста в полях [data-tw] */
/* мгновенно завершить «печать»: убрать мигающую каретку и допечатать всё до конца
   (нужно, когда панель остаётся видимой, а печать прервали открытием книги) */
function finishTypewriter(root) {
  if (!root) return;
  $$("[data-tw]", root).forEach(el => {
    if (el._twText !== undefined) el.textContent = el._twText;
    el.classList.remove("tw-wait", "tw-caret");
  });
}

function typewriter(root, seq) {
  const els = $$("[data-tw]", root);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const jobs = els.map(el => ({ el, text: el.textContent }));
  jobs.forEach(j => { j.el._twText = j.text; j.el.textContent = ""; j.el.classList.add("tw-wait"); });
  let k = 0;
  const typeNext = () => {
    if (seq !== bsSeq || k >= jobs.length) return;
    const j = jobs[k++];
    j.el.classList.remove("tw-wait");
    j.el.classList.add("tw-caret");
    let p = 0;
    const step = () => {
      if (seq !== bsSeq) return;
      p = Math.min(p + (j.text.length > 40 ? 3 : 2), j.text.length);
      j.el.textContent = j.text.slice(0, p);
      if (p < j.text.length) setTimeout(step, 9);
      else { j.el.classList.remove("tw-caret"); typeNext(); }
    };
    step();
  };
  typeNext();
}

// «Новый учебник» — без окна: сразу создаём черновик и открываем редактор (всё правится там)
/* Дефолтная структура книги (клиентская копия серверного default_content) —
   для черновика в памяти, который ещё не сохранён в БД. */
function defaultBookContent(title, subject, grade, language) {
  return {
    titul: { title, subtitle: "", subject, grade, language, year: "", publisher: "", isbn: "", grif: "" },
    imprint: { udk: "", bbk: "", author_sign: "", authors_line: "", bib_desc: "",
      publisher: "", city: "Бишкек", pages: "", copyright: "", org: "" },
    people: { authors: [], coauthors: [], editors: [], proofreaders: [], reviewers: [] },
    statePages: { anthem: true, gerb: true, flag: true },
    annotation: "",
    intro: "",
    legend: [
      { symbol: "Ты узнаешь", meaning: "Цели параграфа — что ученик будет знать и уметь" },
      { symbol: "Подумай", meaning: "Вводный вопрос, жизненная ситуация — зачем это нужно" },
      { symbol: "Пример", meaning: "Разобранный пример с пошаговым решением" },
      { symbol: "Запомни", meaning: "Правило, определение, главный вывод" },
      { symbol: "Задания", meaning: "Практические задания (по уровням сложности)" },
      { symbol: "Домашнее задание", meaning: "Работа для самостоятельного выполнения" },
      { symbol: "Вопросы", meaning: "Контрольные вопросы для самопроверки" },
    ],
    chapters: [{
      id: uid(), title: "Глава 1",
      sections: [{
        id: uid(), kind: "paragraph", title: "§ 1. Новый параграф",
        goals: "", motivation: "", body: "", examples: "", summary: "",
        tasks: "", homework: "", questions: "", test: "",
      }],
    }],
    glossary: [], bibliography: [], appendices: [], qr: [],
  };
}

/* «Новый учебник» — открываем редактор с черновиком в памяти.
   Ничего не пишется в БД, пока пользователь не нажмёт «Сохранить». */
function createBookDirect() {
  location.hash = "#/book/new";
}

/* ---- живой предпросмотр обложки на страницах создания книги ---- */
function liveCoverHtml(id, cap, ai) {
  return `
    <div class="card nbp-cvr-card${ai ? " ai" : ""}">
      <div class="nbp-scene"><div class="nbp-float">
        <div class="bs-book nbp-book" id="${id}" style="--cbg:#1E3A8A;--cfg:#F4D06F">
          <div class="bsb-emblems"><img src="/static/img/gerb-kg.svg" alt=""><img src="/static/img/flag-kg.svg" alt=""></div>
          <span class="bsb-subject">Учебник</span>
          <b class="bsb-title">Ваш учебник</b>
          <span class="bsb-grade"></span>
          <span class="bsb-foot">Кыргызская Республика</span>
        </div>
        <div class="nbp-shadow"></div>
      </div></div>
      <div class="nbp-cap">${I.eye}<span>${cap}</span></div>
    </div>`;
}
function liveCoverUpdate(id, d) {
  const el = document.getElementById(id);
  if (!el) return;
  const [bg, fg] = coverColor(d.subject || d.title || "Учебник");
  el.style.setProperty("--cbg", bg);
  el.style.setProperty("--cfg", fg);
  el.querySelector(".bsb-subject").textContent = d.subject || "Учебник";
  el.querySelector(".bsb-title").textContent = d.title || "Ваш учебник";
  el.querySelector(".bsb-grade").textContent = d.grade ? d.grade + " класс" : "";
  el.classList.remove("pop");
  void el.offsetWidth; // перезапуск анимации отклика
  el.classList.add("pop");
}

function viewEditorNew() {
  if (!can("books.create")) { location.hash = "#/dashboard"; return; }
  const meta = state.meta;

  /* шаг 1 — простая страница-настройка: кто ты и о чём книга; конструктор откроется после */
  shell("library", `
    <div class="page-head">
      <div><h1>Новый учебник</h1>
        <div class="sub">Заполните основные данные — и откроется конструктор книги</div></div>
      <div class="spacer"></div>
      <button class="btn" id="nb2-back">${I.back}К учебникам</button>
    </div>
    <div class="aiwp">
      <div class="aiwp-maincol">
      <div class="card aiwp-main">
        <div class="field" id="f-title"><label>Название учебника<i class="req-star" aria-label="обязательное поле">*</i></label>
          <input id="nb2-title" placeholder="Например: Математика. 5 класс" autocomplete="off" spellcheck="false" autofocus>
          <div class="field-err">Укажите название — оно появится на обложке</div></div>
        <div class="field" id="f-subject"><label>Предмет<i class="req-star" aria-label="обязательное поле">*</i></label>
          <div class="pick-grid subjects" id="nb2-subjects">
            ${meta.subjects.map(s => `<div class="pick" data-v="${esc(s)}">${esc(s)}</div>`).join("")}
          </div>
          <div class="field-err">Выберите предмет из списка</div></div>
        <div class="field" id="f-grade"><label>Класс<i class="req-star" aria-label="обязательное поле">*</i></label>
          <div class="pick-grid grades" id="nb2-grades">
            ${[...meta.grades].sort((a, b) => (+a || 99) - (+b || 99)).map(g => `<div class="pick" data-v="${esc(g)}">${esc(g)}</div>`).join("")}
          </div>
          <div class="field-err">Выберите класс, для которого пишется учебник</div></div>
        <div class="field"><label>Язык учебника</label>
          <div class="pick-grid" style="grid-template-columns:repeat(4,1fr)" id="nb2-langs">
            ${["кыргызский", "русский"].map((l, i) =>
              `<div class="pick ${i === 0 ? "selected" : ""}" data-v="${l}">${l}</div>`).join("")}
          </div></div>
        <div class="aiwp-actions">
          <span class="req-note"><i class="req-star">*</i> — обязательные поля</span>
          <span class="spacer"></span>
          <button class="btn" id="nb2-cancel">Отмена</button>
          <button class="btn primary" id="nb2-go">${I.pen}Открыть конструктор</button>
        </div>
      </div>
      <div class="alt-ways">
        <div class="alt-lbl">Не хочется писать с нуля? Есть другие способы:</div>
        <div class="alt-grid">
          <button type="button" class="alt-card ai" id="alt-ai">
            <span class="alt-ic">${I.ai}</span>
            <span class="alt-tx"><b>Создать с ИИ</b><span>опишите пожелания — книга напишется сама</span></span>
            ${I.chev}
          </button>
          <button type="button" class="alt-card imp" id="alt-imp">
            <span class="alt-ic">${I.upload}</span>
            <span class="alt-tx"><b>Импортировать файл</b><span>PDF, DOCX, FB2 — разложим по главам</span></span>
            ${I.chev}
          </button>
          <div class="aiw-hint">${I.book}<span>Первые страницы соберутся сами — титул, выходные данные,
            госсимволы и гимн будут оформлены как в настоящих учебниках «Жаңы китеп».</span></div>
        </div>
      </div>
      </div>
      <div class="aiwp-side">
        ${liveCoverHtml("nb2-cover", "Живой предпросмотр — обложка собирается сама, пока вы заполняете форму")}
        <div class="card aiwp-how tl">
          <h3>Как это работает</h3>
          <div class="how-step"><i>1</i><div><b>Основные данные</b><span>название, предмет и класс — их можно поменять в любой момент</span></div></div>
          <div class="how-step"><i>2</i><div><b>Конструктор книги</b><span>титул, главы и параграфы, задания и тесты — всё по методике госучебников</span></div></div>
          <div class="how-step"><i>3</i><div><b>Кнопка «Сохранить»</b><span>до неё черновик живёт только у вас — в системе книга появится после сохранения</span></div></div>
        </div>
      </div>
    </div>`);

  const pickOne = rootSel => {
    $(rootSel).addEventListener("click", e => {
      const p = e.target.closest(".pick");
      if (!p) return;
      $$(".pick", $(rootSel)).forEach(x => x.classList.remove("selected"));
      p.classList.add("selected");
    });
  };
  pickOne("#nb2-subjects"); pickOne("#nb2-grades"); pickOne("#nb2-langs");
  $("#nb2-back").onclick = $("#nb2-cancel").onclick = () => { location.hash = "#/library"; };
  $("#alt-ai").onclick = () => { location.hash = "#/book/ai"; };
  $("#alt-imp").onclick = openImport;
  // подсветка обязательного поля снимается, как только его заполнили; обложка живёт
  const cover = () => liveCoverUpdate("nb2-cover", {
    title: $("#nb2-title").value.trim(),
    subject: $("#nb2-subjects .selected")?.dataset.v || "",
    grade: $("#nb2-grades .selected")?.dataset.v || "",
  });
  $("#nb2-title").addEventListener("input", () => { $("#f-title").classList.remove("bad"); cover(); });
  $("#nb2-subjects").addEventListener("click", () => { $("#f-subject").classList.remove("bad"); cover(); });
  $("#nb2-grades").addEventListener("click", () => { $("#f-grade").classList.remove("bad"); cover(); });
  $("#nb2-title").addEventListener("keydown", e => { if (e.key === "Enter") $("#nb2-go").click(); });
  $("#nb2-go").onclick = () => {
    const title = $("#nb2-title").value.trim();
    const subject = $("#nb2-subjects .selected")?.dataset.v || "";
    const grade = $("#nb2-grades .selected")?.dataset.v || "";
    const bad = [];
    if (!title) bad.push("#f-title");
    if (!subject) bad.push("#f-subject");
    if (!grade) bad.push("#f-grade");
    if (bad.length) { markBadFields(bad); return; }
    openDraftEditor({ title, subject, grade,
      language: $("#nb2-langs .selected")?.dataset.v || "кыргызский" });
  };
}

/* подсветить незаполненные обязательные поля и подвести к первому из них */
function markBadFields(sels) {
  sels.forEach(s => {
    const f = $(s);
    if (!f) return;
    f.classList.remove("bad");
    void f.offsetWidth; // перезапуск shake-анимации при повторном клике
    f.classList.add("bad");
  });
  const first = $(sels[0]);
  if (first) {
    first.scrollIntoView({ block: "center", behavior: "smooth" });
    first.querySelector("input,textarea")?.focus({ preventScroll: true });
  }
}

/* шаг 2 — черновик в памяти с уже заполненным титулом; в БД попадёт по «Сохранить» */
function openDraftEditor(f) {
  const me = state.me || {};
  const book = {
    id: null, unsaved: true,
    title: f.title, subject: f.subject, grade: f.grade, language: f.language,
    status: "draft", status_title: "Черновик — не сохранён",
    can_edit: true, transitions: [], members: [], author_name: me.name || "",
    content: defaultBookContent(f.title, f.subject, f.grade, f.language),
  };
  const t = book.content.titul || (book.content.titul = {});
  t.title = f.title; t.subject = f.subject; t.grade = f.grade; t.language = f.language;
  state.editor = { book, selected: "titul", dirty: false, timer: null, tab: "preview" };
  renderEditor();
  loadSidePanel();
}

/* Первое сохранение черновика: создаём запись в БД и уходим в обычный редактор. */
async function saveNewBook() {
  const ed = state.editor;
  if (!ed || !ed.book.unsaved) return;
  const t = ed.book.content.titul || {};
  const title = (t.title || ed.book.title || "").trim() || "Новый учебник";
  const payload = {
    title,
    subject: t.subject || "",
    grade: t.grade || "",
    language: t.language || "кыргызский",
  };
  const btn = $("#btn-save");
  if (btn) btn.disabled = true;
  try {
    const r = await api("/api/books", { method: "POST", body: payload });
    // переносим весь наработанный в черновике контент
    await api(`/api/books/${r.id}/content`, { method: "PUT", body: { content: ed.book.content, ...payload } });
    ed.book.unsaved = false; // чтобы уход со страницы не считал черновик потерянным
    toast("Учебник сохранён", "ok");
    location.hash = `#/book/${r.id}`;
  } catch (e) {
    toast(e.message, "err");
    if (btn) btn.disabled = false;
  }
}

function openCreateBook() {
  const meta = state.meta;
  const m = modal({
    title: "Новый учебник", wide: true,
    body: `
      <div class="field"><label>Название учебника</label>
        <input id="nb-title" placeholder="Например: Математика. 5 класс" autocomplete="off" autocorrect="off" spellcheck="false" autofocus></div>
      <div class="field"><label>Предмет</label>
        <div class="pick-grid subjects" id="nb-subjects">
          ${meta.subjects.map(s => `<div class="pick" data-v="${esc(s)}">${esc(s)}</div>`).join("")}
        </div></div>
      <div class="field"><label>Класс</label>
        <div class="pick-grid grades" id="nb-grades">
          ${meta.grades.map(g => `<div class="pick" data-v="${esc(g)}">${esc(g)}</div>`).join("")}
        </div></div>
      <div class="field"><label>Язык обучения</label>
        <div class="pick-grid" style="grid-template-columns:repeat(4,1fr)" id="nb-langs">
          ${["кыргызский", "русский"].map((l, i) =>
            `<div class="pick ${i === 0 ? "selected" : ""}" data-v="${l}">${l}</div>`).join("")}
        </div></div>`,
    footer: `<button class="btn" id="nb-cancel">Отмена</button>
             <button class="btn primary" id="nb-create">${I.plus}Создать</button>`,
  });
  const pickOne = (rootSel) => {
    $(rootSel).addEventListener("click", e => {
      const p = e.target.closest(".pick");
      if (!p) return;
      $$(".pick", $(rootSel)).forEach(x => x.classList.remove("selected"));
      p.classList.add("selected");
    });
  };
  pickOne("#nb-subjects"); pickOne("#nb-grades"); pickOne("#nb-langs");
  $("#nb-cancel").onclick = m.close;
  $("#nb-create").onclick = async () => {
    const title = $("#nb-title").value.trim();
    if (!title) { toast("Укажите название", "err"); return; }
    try {
      const r = await api("/api/books", { method: "POST", body: {
        title,
        subject: $("#nb-subjects .selected")?.dataset.v || "",
        grade: $("#nb-grades .selected")?.dataset.v || "",
        language: $("#nb-langs .selected")?.dataset.v || "кыргызский",
      }});
      m.close();
      toast("Учебник создан", "ok");
      location.hash = `#/book/${r.id}`;
    } catch (e) { toast(e.message, "err"); }
  };
}

function openImport() {
  const m = modal({
    title: "Импорт учебника",
    body: `
      <div class="imp-grid">
        <button type="button" class="imp-card" id="imp-json">
          ${I.doc}
          <b>Файл конструктора (.json)</b>
          <span>Экспорт из этой системы — структура, разделы и оформление сохранятся полностью.</span>
        </button>
        <button type="button" class="imp-card" id="imp-file">
          ${I.upload}
          <b>Готовая книга файлом</b>
          <span>PDF, DOCX, FB2, EPUB, TXT, RTF, HTML, DJVU… Текст будет извлечён, разложен по главам — книгу можно будет читать и править.</span>
        </button>
      </div>
      <div class="imp-note" id="imp-note" hidden>${I.clock}<span>Извлекаем текст из файла… Для больших PDF и сканов это может занять несколько минут — не закрывайте окно.</span></div>`,
    footer: `<button class="btn" id="imp-cancel">Отмена</button>`,
  });
  $("#imp-cancel").onclick = m.close;
  const pick = (accept, handler) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = accept;
    inp.onchange = () => { if (inp.files[0]) handler(inp.files[0]); };
    inp.click();
  };
  $("#imp-json").onclick = () => pick(".json", async f => {
    try {
      const data = JSON.parse(await f.text());
      const r = await api("/api/books/import", { method: "POST", body: { data } });
      m.close();
      toast("Импорт выполнен", "ok");
      location.hash = `#/book/${r.id}`;
    } catch (e) { toast("Импорт не удался: " + e.message, "err"); }
  });
  $("#imp-file").onclick = () => pick(".pdf,.docx,.doc,.fb2,.epub,.txt,.rtf,.html,.htm,.zip,.djvu,.jpg,.jpeg,.png", async f => {
    const note = $("#imp-note");
    note.hidden = false;
    $("#imp-json").disabled = true; $("#imp-file").disabled = true;
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await api("/api/books/import-file", { method: "POST", body: fd });
      m.close();
      toast(`Книга импортирована: ${fmtNum(r.chars)} символов, фрагментов: ${r.pages}`, "ok");
      location.hash = `#/book/${r.id}`;
    } catch (e) {
      note.hidden = true;
      $("#imp-json").disabled = false; $("#imp-file").disabled = false;
      toast("Импорт не удался: " + e.message, "err");
    }
  });
}

/* ================= «Новый учебник»: выбор способа создания ================= */
function openCreateChoice() {
  const m = modal({
    title: "Новый учебник — с чего начнём?", wide: true,
    body: `
      <div class="nc-grid four">
        <button type="button" class="nc-card" id="nc-manual">
          <span class="nc-ic">${I.pen}</span>
          <b>Написать самому</b>
          <span>Чистый учебник в конструкторе: титул, главы, параграфы, задания —
          заполняешь и оформляешь сам, с автосохранением.</span>
          <i class="nc-go">Открыть конструктор ${I.chev}</i>
        </button>
        <button type="button" class="nc-card ai" id="nc-ai">
          <span class="nc-ic">${I.ai}</span>
          <b>Создать с ИИ</b>
          <span>Опиши пожелания — ИИ составит план и напишет книгу целиком:
          главы, рубрики, задания и тесты по нормам КР. Останется проверить и поправить.</span>
          <i class="nc-go">Написать с ИИ ${I.chev}</i>
        </button>
        <button type="button" class="nc-card wide" id="nc-import">
          <span class="nc-ic imp">${I.upload}</span>
          <b>Импортировать файл</b>
          <span>Уже есть готовая книга? PDF, DOCX, FB2, EPUB, TXT и другие —
          текст извлечём и разложим по главам, книгу можно будет править.</span>
          <i class="nc-go">Выбрать файл ${I.chev}</i>
        </button>
      </div>`,
  });
  $("#nc-manual").onclick = () => { m.close(); createBookDirect(); };
  $("#nc-ai").onclick = () => { m.close(); location.hash = "#/book/ai"; };
  $("#nc-import").onclick = () => { m.close(); openImport(); };
}

/* ===== фоновое ИИ-написание: индикатор в шапке на всех страницах =====
   сама задача живёт на сервере (поток в ai_writer.py) и продолжается, куда бы
   пользователь ни ушёл. Здесь только слежение: id задачи хранится в localStorage,
   поэтому чип переживает F5 и любые переходы; появляется он ТОЛЬКО пока книга
   пишется (или ждёт клика «готово»/«ошибка»), клик возвращает к прогрессу. */
const AIW_KEY = "kitep-aiw-job";
const aiwGet = () => { try { return JSON.parse(localStorage.getItem(AIW_KEY) || "null"); } catch (e) { return null; } };
function aiwSet(v) {
  if (v) localStorage.setItem(AIW_KEY, JSON.stringify(v));
  else localStorage.removeItem(AIW_KEY);
  renderAiwChip();
}
function renderAiwChip() {
  const slot = $("#aiw-slot");
  if (!slot) return;
  // у каждого чипа свой контейнер — индикаторы разных задач не затирают друг друга
  let box = $("#aiw-chip-box");
  if (!box) {
    box = document.createElement("span");
    box.id = "aiw-chip-box";
    box.style.display = "contents";
    slot.prepend(box);
  }
  const j = aiwGet();
  if (!j) { box.innerHTML = ""; return; }
  const x = `<span class="aiw-chip-x" data-x aria-label="Скрыть">${I.x}</span>`;
  box.innerHTML = j.status === "done"
    ? `<button class="aiw-chip done" id="aiw-chip">${I.book}<span>Учебник готов — открыть</span>${x}</button>`
    : j.status === "error"
      ? `<button class="aiw-chip err" id="aiw-chip">${I.alert}<span>ИИ-книга: ошибка</span>${x}</button>`
      : `<button class="aiw-chip run" id="aiw-chip">${I.ai}<span>${esc(j.stage || "ИИ пишет книгу…")}</span><b>${j.pct || 4}%</b></button>`;
  $("#aiw-chip").onclick = e => {
    const jj = aiwGet();
    if (!jj) return;
    if (e.target.closest("[data-x]")) { aiwSet(null); return; }
    if (jj.status === "done") { aiwSet(null); location.hash = `#/book/${jj.book_id}`; }
    else location.hash = `#/book/ai?job=${jj.id}`; // прогресс или подробности ошибки
  };
}
let aiwTimer = null;
function aiwWatch() {
  clearTimeout(aiwTimer);
  const tick = async () => {
    const j = aiwGet();
    if (!j || j.status !== "run") return;
    let st;
    try { st = await api(`/api/ai-writer/${j.id}`); }
    catch (e) {
      if (/не найдена/.test(e.message)) { aiwSet(null); return; } // задачи больше нет
      aiwTimer = setTimeout(tick, 6000); return;                  // сеть/перезапуск — ждём
    }
    if (!aiwGet()) return; // пока ждали ответ, страница прогресса уже закрыла задачу
    if (st.status === "done" && st.book_id) {
      if (location.hash.startsWith("#/book/ai")) { aiwSet(null); return; } // страница прогресса сама откроет книгу
      aiwSet({ ...j, status: "done", book_id: st.book_id });
      toast("Учебник написан — откройте по кнопке в шапке", "ok");
      if ((location.hash || "").startsWith("#/library")) route(); // список учебников обновится сам
      return;
    }
    if (st.status === "error") {
      if (location.hash.startsWith("#/book/ai")) { aiwSet(null); return; }
      aiwSet({ ...j, status: "error" });
      return;
    }
    const p = st.progress || {};
    aiwSet({ ...j, stage: p.stage || j.stage || "",
      pct: p.total ? Math.max(4, Math.round((p.done || 0) / p.total * 100)) : (j.pct || 4) });
    aiwTimer = setTimeout(tick, 3000);
  };
  tick();
}

/* ===== фоновая ОЦИФРОВКА: такой же чип в шапке, как у ИИ-книги =====
   статус живёт на сервере (scans.status = processing), поэтому чип не зависит
   от открытой страницы и не пропадает при переходах; после завершения висит
   зелёным «готово», пока не кликнут или не закроют крестиком */
let scanChipState = null, scanPrevRun = null, scanTimer = null;
function renderScanChip() {
  const slot = $("#aiw-slot");
  if (!slot) return;
  let box = $("#scan-chip-box");
  if (!box) {
    box = document.createElement("span");
    box.id = "scan-chip-box";
    box.style.display = "contents";
    slot.appendChild(box);
  }
  const st = scanChipState;
  if (!st) { box.innerHTML = ""; return; }
  const x = `<span class="aiw-chip-x" data-x aria-label="Скрыть">${I.x}</span>`;
  box.innerHTML = st.kind === "done"
    ? `<button class="aiw-chip done" id="scan-chip">${HOME_ICONS.scan}<span>Скан готов — вычитать</span>${x}</button>`
    : st.kind === "error"
      ? `<button class="aiw-chip err" id="scan-chip">${I.alert}<span>Оцифровка: ошибка</span>${x}</button>`
      : `<button class="aiw-chip scan" id="scan-chip">${HOME_ICONS.scan}<span>${st.n > 1 ? `Оцифровка ${st.n} сканов` : "Оцифровка"}…</span><b>${st.total ? Math.round(st.done / st.total * 100) + "%" : "…"}</b></button>`;
  $("#scan-chip").onclick = e => {
    const s = scanChipState;
    if (!s) return;
    if (e.target.closest("[data-x]")) { scanChipState = null; renderScanChip(); return; }
    if (s.kind === "done") { const id = s.id; scanChipState = null; renderScanChip(); location.hash = `#/scan/${id}`; }
    else if (s.kind === "error") { scanChipState = null; renderScanChip(); location.hash = "#/scans"; }
    else { viewScans._sel = s.id; location.hash = "#/scans"; }
  };
}
function scanWatch() {
  clearTimeout(scanTimer);
  const tick = async () => {
    if (!state.me) return;
    let scans;
    try { scans = await api("/api/scans"); }
    catch (e) { scanTimer = setTimeout(tick, 8000); return; }
    const run = scans.filter(s => s.status === "processing");
    const prev = scanPrevRun;
    scanPrevRun = run.map(s => s.id);
    if (run.length) {
      scanChipState = {
        kind: "run", n: run.length, id: run[0].id,
        done: run.reduce((a, s) => a + (s.pages_done || 0), 0),
        total: run.reduce((a, s) => a + (s.pages_total || 0), 0),
      };
      renderScanChip();
      scanTimer = setTimeout(tick, 3000);
      return;
    }
    if (prev && prev.length) { // только что шла оцифровка — завершилась
      const fin = scans.filter(s => prev.includes(s.id));
      const ok = fin.find(s => s.status === "ready");
      const err = fin.find(s => s.status === "error");
      scanChipState = ok ? { kind: "done", id: ok.id } : err ? { kind: "error" } : null;
      renderScanChip();
      if (ok && !location.hash.startsWith("#/scans") && !location.hash.startsWith("#/scan/"))
        toast("Оцифровка завершена — скан готов к вычитке", "ok");
    } else if (scanChipState && scanChipState.kind === "run") {
      scanChipState = null;
      renderScanChip();
    }
  };
  tick();
}

/* ================= ИИ-автор: страница создания книги (#/book/ai) ================= */
async function viewAiWrite() {
  const meta = state.meta;
  const jobId = +((location.hash.match(/[?&]job=(\d+)/) || [])[1] || 0);
  const SIZES = [
    { n: 3, t: "Компактная", d: "3 главы · 6 разделов · ~5 мин" },
    { n: 5, t: "Стандартная", d: "5 глав · 10 разделов · ~10 мин" },
    { n: 7, t: "Большая", d: "7 глав · 14 разделов · ~15 мин" },
  ];

  shell("library", `
    <div class="page-head">
      <div><h1>Новый учебник с ИИ</h1>
        <div class="sub">Опиши пожелания — ИИ составит план и напишет книгу целиком</div></div>
      <div class="spacer"></div>
      <button class="btn" id="aiwp-back">${I.back}К учебникам</button>
    </div>
    <div class="aiwp">
      <div class="card aiwp-main" id="aiwp-main"><div class="empty">Загрузка…</div></div>
      <div class="aiwp-side">
        ${liveCoverHtml("aiw-cover", "Предпросмотр — обложка меняется от предмета и класса, а название придумает ИИ", true)}
        <div class="card aiwp-how tl">
          <h3>Как это работает</h3>
          <div class="how-step"><i>1</i><div><b>План книги</b><span>ИИ продумывает главы и разделы под твои пожелания</span></div></div>
          <div class="how-step"><i>2</i><div><b>Главы по одной</b><span>каждый раздел — с целями, рубриками, заданиями и тестами</span></div></div>
          <div class="how-step"><i>3</i><div><b>Книга в конструкторе</b><span>готовый учебник открывается как черновик — правь что угодно</span></div></div>
        </div>
        <div class="aiw-hint">${I.ai}<span>Структура — как у государственных учебников КР: разделы А/Б,
          «Давай порассуждаем!», «Копилка слов», задания трёх уровней, словарь. Контент — строго
          по нормам КР (Закон № 185: без запрещённой для детей информации, светское обучение).</span></div>
      </div>
    </div>`);
  $("#aiwp-back").onclick = () => { location.hash = "#/library"; };

  const main = $("#aiwp-main");

  /* прогресс на этой же странице; job в адресе — переживает обновление страницы */
  const showProgress = id => {
    main.innerHTML = `
      <div class="aiw-run">
        <div class="aiw-orb">${I.ai}</div>
        <b id="aiw-stage">Готовим…</b>
        <div class="scn-prg"><i id="aiw-bar" style="width:4%"></i></div>
        <span class="aiw-note">Обычно это занимает несколько минут. Можно уйти с этой страницы —
        книга допишется в фоне и появится в разделе «Учебники».</span>
      </div>`;
    const poll = async () => {
      if (!location.hash.startsWith("#/book/ai")) return; // ушли — джоб живёт на сервере
      let st;
      try { st = await api(`/api/ai-writer/${id}`); }
      catch (e) { setTimeout(poll, 4000); return; }
      if (st.status === "done" && st.book_id) {
        aiwSet(null); // книга открывается — чип в шапке больше не нужен
        toast("Учебник написан — открываем", "ok");
        location.hash = `#/book/${st.book_id}`;
        return;
      }
      if (st.status === "error") {
        aiwSet(null); // ошибка показана здесь — чип не нужен
        main.innerHTML = `
          <div class="aiw-run">
            ${I.alert}
            <b style="color:var(--red)">Не получилось написать книгу</b>
            <span class="aiw-note">${esc(st.error || "Попробуйте ещё раз или переформулируйте пожелания.")}</span>
            <button class="btn primary" id="aiw-retry">Заполнить заново</button>
          </div>`;
        $("#aiw-retry").onclick = () => { location.hash = "#/book/ai"; };
        return;
      }
      const p = st.progress;
      if (p && p.stage) {
        const stEl = $("#aiw-stage"), bar = $("#aiw-bar");
        if (stEl) stEl.textContent = p.stage;
        if (bar) bar.style.width = (p.total ? Math.max(4, Math.round(p.done / p.total * 100)) : 4) + "%";
      }
      setTimeout(poll, 2500);
    };
    poll();
  };

  if (jobId) { showProgress(jobId); return; }

  /* форма — как страница ручного создания: те же поля и сетки выбора */
  const EXAMPLES = [
    { t: "География КР", w: "Учебник по географии Кыргызстана: природа и рельеф, области, Иссык-Куль и горы Тянь-Шаня. Больше практических заданий и работы с картой, примеры из жизни села и города." },
    { t: "Математика", w: "Учебник математики с задачами из повседневной жизни: покупки на базаре, расстояния между городами КР, расчёты для дома. Много примеров с пошаговым решением и задания трёх уровней сложности." },
    { t: "История КР", w: "Учебник истории Кыргызстана: от древних кочевников и Великого Шёлкового пути до современности. Эпос «Манас», важные личности, даты и карты; в конце глав — вопросы для обсуждения." },
    { t: "Природа и экология", w: "Учебник о природе и экологии Кыргызстана: экосистемы гор, заповедники Сары-Челек и Ала-Арча, Красная книга, снежный барс. Опыты и наблюдения, задания про бережное отношение к природе." },
  ];
  main.innerHTML = `
    <div class="field" id="f-wishes"><label>Пожелания к книге<i class="req-star" aria-label="обязательное поле">*</i></label>
      <div class="aiw-ex" id="aiw-ex">
        <span class="aiw-ex-lbl">Примеры — нажмите, чтобы подставить:</span>
        ${EXAMPLES.map((x, i) => `<button type="button" class="aiw-ex-chip" data-i="${i}">${esc(x.t)}</button>`).join("")}
      </div>
      <textarea id="aiw-wishes" rows="5" placeholder="Опишите своими словами: о чём книга, что важно не забыть, каких заданий побольше…"></textarea>
      <div class="field-err">Опишите пожелания хотя бы одним предложением — или выберите пример выше</div></div>
    <div class="field" id="f-subject"><label>Предмет<i class="req-star" aria-label="обязательное поле">*</i></label>
      <div class="pick-grid subjects" id="aiw-subjects">
        ${meta.subjects.map(s => `<div class="pick" data-v="${esc(s)}">${esc(s)}</div>`).join("")}
      </div>
      <div class="field-err">Выберите предмет — ИИ будет опираться на его методику</div></div>
    <div class="field" id="f-grade"><label>Класс<i class="req-star" aria-label="обязательное поле">*</i></label>
      <div class="pick-grid grades" id="aiw-grades">
        ${[...meta.grades].sort((a, b) => (+a || 99) - (+b || 99)).map(g => `<div class="pick" data-v="${esc(g)}">${esc(g)}</div>`).join("")}
      </div>
      <div class="field-err">Выберите класс — от него зависят язык и сложность текста</div></div>
    <div class="field"><label>Язык учебника</label>
      <div class="pick-grid" style="grid-template-columns:repeat(4,1fr)" id="aiw-langs">
        ${["русский", "кыргызский"].map((l, i) =>
          `<div class="pick ${i === 0 ? "selected" : ""}" data-v="${l}">${l}</div>`).join("")}
      </div></div>
    <div class="field"><label>Объём</label>
      <div class="pick-grid" style="grid-template-columns:repeat(3,1fr)" id="aiw-sizes">
        ${SIZES.map((s, i) => `<div class="pick aiw-size ${i === 0 ? "selected" : ""}" data-v="${s.n}"><b>${s.t}</b><span>${s.d}</span></div>`).join("")}
      </div></div>
    <div class="aiwp-actions">
      <span class="req-note"><i class="req-star">*</i> — обязательные поля</span>
      <span class="spacer"></span>
      <button class="btn" id="aiw-cancel">Отмена</button>
      <button class="btn ai" id="aiw-go">${I.ai}Написать книгу</button>
    </div>`;

  const pickOne = rootSel => {
    $(rootSel).addEventListener("click", e => {
      const p = e.target.closest(".pick");
      if (!p) return;
      $$(".pick", $(rootSel)).forEach(x => x.classList.remove("selected"));
      p.classList.add("selected");
    });
  };
  pickOne("#aiw-subjects"); pickOne("#aiw-grades"); pickOne("#aiw-langs"); pickOne("#aiw-sizes");
  $("#aiw-cancel").onclick = () => { location.hash = "#/library"; };
  $("#aiw-ex").addEventListener("click", e => {
    const ch = e.target.closest(".aiw-ex-chip");
    if (!ch) return;
    $("#aiw-wishes").value = EXAMPLES[+ch.dataset.i].w;
    $$(".aiw-ex-chip").forEach(x => x.classList.toggle("on", x === ch));
    $("#f-wishes").classList.remove("bad");
    $("#aiw-wishes").focus();
  });
  const aiwCover = () => liveCoverUpdate("aiw-cover", {
    subject: $("#aiw-subjects .selected")?.dataset.v || "",
    grade: $("#aiw-grades .selected")?.dataset.v || "",
  });
  $("#aiw-wishes").addEventListener("input", () => $("#f-wishes").classList.remove("bad"));
  $("#aiw-subjects").addEventListener("click", () => { $("#f-subject").classList.remove("bad"); aiwCover(); });
  $("#aiw-grades").addEventListener("click", () => { $("#f-grade").classList.remove("bad"); aiwCover(); });

  $("#aiw-go").onclick = async () => {
    const wishes = $("#aiw-wishes").value.trim();
    const subject = $("#aiw-subjects .selected")?.dataset.v || "";
    const grade = $("#aiw-grades .selected")?.dataset.v || "";
    const bad = [];
    if (wishes.length < 10) bad.push("#f-wishes");
    if (!subject) bad.push("#f-subject");
    if (!grade) bad.push("#f-grade");
    if (bad.length) { markBadFields(bad); return; }
    $("#aiw-go").disabled = true;
    try {
      const r = await api("/api/ai-writer", { method: "POST", body: {
        wishes, subject, grade,
        language: $("#aiw-langs .selected")?.dataset.v || "русский",
        chapters: +($("#aiw-sizes .selected")?.dataset.v || 3),
      }});
      aiwSet({ id: r.job_id, status: "run", pct: 4, stage: "" }); // чип в шапке — виден с любой страницы
      aiwWatch();
      location.hash = `#/book/ai?job=${r.job_id}`; // прогресс на этой же странице, стойкий к F5
    } catch (e) {
      $("#aiw-go").disabled = false;
      toast(e.message, "err");
    }
  };
}

/* ================= Оцифровка сканов ================= */
const SCAN_ICONS = {
  scan: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/></svg>',
  zin: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/></svg>',
  zout: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8 11h6"/></svg>',
  rotate: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/></svg>',
  contrast: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" stroke-linecap="round"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>',
  wand: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 4 5 5L8.5 20.5a2.1 2.1 0 0 1-3-3z"/><path d="m13 6 5 5"/><path d="M9 3v2M4 8h2M5.5 3.5l1.4 1.4M19 15v2M17 20h2"/></svg>',
  copy: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  skip: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="m5 5 7 7-7 7M13 5l7 7-7 7"/></svg>',
  keys: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"/></svg>',
  tree: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="10" width="7" height="5" rx="1.5"/><rect x="14" y="17" width="7" height="4" rx="1.5"/><path d="M6.5 8v9a2 2 0 0 0 2 2H14M6.5 12.5H14"/></svg>',
};

/* --- автоисправление типичного OCR-мусора; возвращает {text, count} --- */
function ocrAutofix(src) {
  let text = src, count = 0;
  const run = (re, rep) => {
    const m = text.match(re);
    if (m) { count += m.length; text = text.replace(re, rep); }
  };
  run(/­/g, "");                                                    // мягкие переносы
  run(/([А-Яа-яЁёӨөҮүҢң])[-¬]\s*\n\s*([а-яёөүң])/g, "$1$2");            // пере-\nнос → перенос
  run(/[ \t]+([,.;:!?%)\]»])/g, "$1");                                   // пробел перед знаком
  run(/«\s+/g, "«"); run(/\s+»/g, "»");
  run(/[ \t]{2,}/g, " ");                                                // двойные пробелы
  run(/\n{3,}/g, "\n\n");                                                // лишние пустые строки
  run(/ [-–]{1,2}(?=[ \n])/g, " —");                                     // дефис в роли тире (в т.ч. в конце строки)
  run(/"([^"\n]{1,300})"/g, "«$1»");                                     // прямые кавычки → «ёлочки»
  run(/(^|\n)[ \t]+/g, "$1");                                            // пробелы в начале строк
  return { text, count };
}

/* --- подозрительные места после OCR: смешение алфавитов, цифры в словах --- */
const SUS_RE = /[А-Яа-яЁёӨөҮүҢң][A-Za-z]|[A-Za-z][А-Яа-яЁёӨөҮүҢң]|[А-Яа-яЁёӨөҮүҢң][0-9]|[0-9][А-Яа-яЁёӨөҮүҢң]|[|¦№]{2,}|[©®™]/g;
function findSuspicious(text) {
  const out = [];
  let m;
  SUS_RE.lastIndex = 0;
  while ((m = SUS_RE.exec(text)) && out.length < 500) out.push(m.index);
  return out;
}

function scanChip(s) {
  if (s.status === "processing") return `<span class="chip blue">Распознаётся…</span>`;
  if (s.status === "error") return `<span class="chip red">Ошибка</span>`;
  if (s.book_id) return `<span class="chip green">Собран в учебник</span>`;
  const total = s.pages_total || 0, v = s.verified_count || 0;
  if (total && v >= total) return `<span class="chip green">Вычитан</span>`;
  return `<span class="chip gold">Готов к вычитке</span>`;
}

/* ===== мастер этапов оцифровки: СКАН → OCR → ПРОВЕРКА → СТРУКТУРА → ГОТОВО =====
   возвращает номер АКТИВНОГО шага (1–5); 6 = всё завершено (учебник собран) */
function scanStage(s) {
  if (s.status === "processing") return 2;
  if (s.status !== "ready") return 1;
  if (s.book_id) return 6;
  if (s.structure) return 5;
  const total = s.pages_total || 0;
  const v = s.verified_count != null ? s.verified_count : (s.pages || []).filter(p => p.verified).length;
  if (total && v >= total) return 4;
  return 3;
}

const SCAN_STEPS = ["Скан", "OCR", "Проверка", "Структура", "Готово"];

function scanStepper(s) {
  const stg = scanStage(s);
  return `<div class="scw" role="list" aria-label="Этапы оцифровки">${SCAN_STEPS.map((t, i) => {
    const n = i + 1;
    const cls = n < stg ? "done" : n === stg ? "cur" : "";
    return `${i ? `<i class="scw-ln ${n <= stg ? "on" : ""}"></i>` : ""}
      <span class="scw-st ${cls}" role="listitem"><b>${n < stg ? I.check : n}</b><span>${t}</span></span>`;
  }).join("")}</div>`;
}

/* чек-лист статуса оцифровки (боковая панель и экран обработки) */
function scanChecklist(s) {
  const stg = scanStage(s);
  const total = s.pages_total || 0;
  const v = s.verified_count != null ? s.verified_count : (s.pages || []).filter(p => p.verified).length;
  const rows = [
    ["Скан загружен", 1],
    [s.status === "processing" && total ? `Распознавание (${s.pages_done || 0} из ${total})` : "OCR завершён", 2],
    [`Проверка текста (${v} из ${total || "?"})`, 3],
    ["Структура определена", 4],
    ["Собран в учебник", 5],
  ];
  return `<div class="sst">${rows.map(([t, n]) =>
    `<div class="sst-row ${n < stg ? "done" : n === stg ? "cur" : ""}">
      <i class="sst-dot">${n < stg ? I.check : ""}</i><span>${t}</span></div>`).join("")}</div>`;
}

async function viewScans() {
  shell("scans", `
    <div class="page-head">
      <div><h1>Оцифровка книг</h1><div class="sub" id="scn-sub">Загрузите скан бумажного учебника —
        система распознает текст, поможет вычитать его и соберёт настоящий электронный учебник</div></div>
    </div>
    <div class="scans-grid scans-fit">
      <div class="scans-main">
        ${can("books.create") ? `
        <div class="scz scz-dz" id="scz" role="button" tabindex="0" aria-label="Загрузить скан книги">
          <svg class="scz-cloud" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 16.6A4.5 4.5 0 0 0 17.5 8.5h-1.2A7 7 0 1 0 4.4 14.9"/>
            <path d="M12 12v9"/><path d="m8.5 15.5 3.5-3.5 3.5 3.5"/>
          </svg>
          <b class="scz-title">Перетащите скан сюда</b>
          <span class="scz-or">или</span>
          <button type="button" class="btn primary">${I.upload}Выбрать файл</button>
          <div class="scz-fmts"><span class="chip">PDF</span><span class="chip">DjVu</span><span class="chip">JPG / PNG</span><span class="chip">ZIP с фото</span></div>
        </div>` : ""}
        <div class="scn-grid" id="scn-grid"><div class="empty" style="grid-column:1/-1">Загрузка…</div></div>
      </div>
      <div class="scan-side card" id="scan-side">
        <div class="empty">Загрузка…</div>
      </div>
    </div>
  `);

  /* клик по призраку-образцу, пока ничего не загружено — мягкая подсказка
     и подсветка зоны загрузки */
  const ghostNudge = () => {
    toast("Сначала загрузите скан — перетащите файл в зону загрузки или нажмите «Выбрать файл»", "err");
    const z = $("#scz");
    if (z) { z.classList.add("drag"); setTimeout(() => z.classList.remove("drag"), 950); }
  };

  const cardHtml = (s, i) => {
    const total = s.pages_total || 0, done = s.pages_done || 0, v = s.verified_count || 0;
    const p = total ? Math.round(done / total * 100) : 0;
    const vp = total ? Math.round(v / total * 100) : 0;
    const thumb = done > 0
      ? `<img src="/api/scans/${s.id}/img/1" alt="" loading="lazy">`
      : `<div class="scn-skel"><i></i></div>`;
    let prog = "";
    if (s.status === "processing") prog = `
      <div class="scn-prg ${total ? "" : "ind"}"><i style="width:${total ? p : 30}%"></i></div>
      <div class="scn-sub">Распознаём страницы… ${total ? `${done} из ${total}` : "готовим файл"}</div>`;
    else if (s.status === "error") prog = `<div class="scn-sub err">${esc(s.error || "Не удалось обработать файл")}</div>`;
    else prog = `
      <div class="scn-prg ok"><i style="width:${vp}%"></i></div>
      <div class="scn-sub">Вычитано ${v} из ${total} стр.</div>`;
    const canDel = can("admin.system") || s.created_by === state.me.id;
    return `
    <div class="card scn-card ${viewScans._sel === s.id ? "sel" : ""}" data-id="${s.id}" style="--d:${Math.min(i, 9) * 55}ms">
      <div class="scn-th" ${s.status === "ready" ? `data-open="${s.id}" role="button" aria-label="Вычитать скан"` : ""}>${thumb}</div>
      <div class="scn-info">
        <div class="scn-title">${esc(s.title)}</div>
        <div class="lb-chips">${scanChip(s)}</div>
        ${prog}
        <div class="lb-actions">
          ${s.status === "ready" ? `<button class="btn small primary" data-open="${s.id}">${I.pen}Вычитать</button>` : ""}
          ${s.status === "ready" && !s.book_id && can("books.create") ? `<button class="btn small" data-tobook="${s.id}">${I.book}В учебник</button>` : ""}
          ${s.book_id ? `<button class="btn small" data-book="${s.book_id}">${I.book}Открыть учебник</button>` : ""}
          <span class="spacer"></span>
          ${canDel ? `<button class="icon-btn" data-sdel="${s.id}" aria-label="Удалить скан">${I.trash}</button>` : ""}
        </div>
      </div>
    </div>`;
  };

  const bindGrid = load => {
    $$("#scn-grid [data-open]").forEach(el => el.onclick = () => { location.hash = `#/scan/${el.dataset.open}`; });
    $$("#scn-grid [data-book]").forEach(el => el.onclick = () => { location.hash = `#/book/${el.dataset.book}`; });
    $$("#scn-grid [data-tobook]").forEach(el => el.onclick = async () => {
      try { openScanToBook(await api(`/api/scans/${el.dataset.tobook}`)); } catch (e) { toast(e.message, "err"); }
    });
    $$("#scn-grid [data-sdel]").forEach(el => el.onclick = async () => {
      if (!confirm("Удалить скан со всеми распознанными страницами?")) return;
      try { await api(`/api/scans/${el.dataset.sdel}`, { method: "DELETE" }); toast("Скан удалён", "ok"); load(); }
      catch (e) { toast(e.message, "err"); }
    });
    // клик по карточке (мимо кнопок) — выбрать скан для панели результата справа
    $$("#scn-grid .scn-card").forEach(c => c.addEventListener("click", e => {
      if (e.target.closest("button") || e.target.closest("[data-open]")) return;
      viewScans._sel = +c.dataset.id;
      $$("#scn-grid .scn-card").forEach(x => x.classList.toggle("sel", x === c));
      renderSide(load._scans || []);
    }));
  };

  /* ---- правая панель: результат оцифровки — книга, страницы листаются слайдом ---- */
  function renderSide(scans) {
    const box = $("#scan-side");
    if (!box) return;
    const s = scans.find(x => x.id === viewScans._sel) || scans[0];
    if (!s) {
      delete box.dataset.sig; // после призрака реальный скан должен перерисоваться
      /* призрак результата: та же разметка, что у настоящего, но полупрозрачно —
         видно и книгу со страницами, и чек-лист, и кнопки */
      const demo = { status: "ready", pages_total: 24, pages_done: 24, verified_count: 9 };
      box.innerHTML = `
        <div class="scn-ghost-lbl side">${SCAN_ICONS.scan}<span>Результат оцифровки — появится здесь:</span></div>
        <div class="scn-ghost" aria-hidden="true">
          <div class="sside-head">
            <b>Название книги</b>
            <div class="lb-chips"><span class="chip gold">Готов к вычитке</span></div>
          </div>
          <div class="sbk-frame">
            <div class="sbk-ghostpg"><b></b><i></i><i></i><i class="w80"></i><i></i><i class="w60"></i><i></i><i></i><i class="w80"></i><i class="w60"></i></div>
            <button type="button" class="sbk-nav prev" tabindex="-1">${I.back}</button>
            <button type="button" class="sbk-nav next" tabindex="-1">${I.chev}</button>
            <div class="sbk-cnt">1 / 24</div>
          </div>
          <div class="scn-prg ok"><i style="width:38%"></i></div>
          <div class="sside-rows">
            <div class="sside-row"><span>Файл</span><b>кыргыз-тили-5кл.pdf</b></div>
            <div class="sside-row"><span>Оцифрован</span><b>сразу после загрузки</b></div>
            <div class="sside-row"><span>Страниц</span><b>24</b></div>
          </div>
          ${scanChecklist(demo)}
          <div class="sside-btns">
            <button class="btn small primary" tabindex="-1">${I.pen}Вычитать</button>
            <button class="btn small" tabindex="-1">${I.book}Собрать в учебник</button>
            <button class="btn small" tabindex="-1">${I.doc}Скачать текст (.txt)</button>
          </div>
        </div>`;
      const g = box.querySelector(".scn-ghost");
      if (g) g.onclick = ghostNudge;
      return;
    }
    viewScans._sel = s.id;
    const total = s.pages_total || 0, done = s.pages_done || 0, v = s.verified_count || 0;
    const vp = total ? Math.round(v / total * 100) : 0;
    const when = s.created_at ? String(s.created_at).slice(0, 16).replace("T", " ") : "";
    // не перерисовывать панель, если по выбранному скану ничего не изменилось
    // (во время распознавания load() дёргается каждые 2 с — иначе страница мигает и сбрасывается)
    const sig = `${s.id}|${s.status}|${done}|${v}|${total}|${s.structure ? 1 : 0}|${s.book_id || 0}`;
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    // страницы идут строго по порядку файла: 1-я = обложка (если она отсканирована)
    let pg = Math.min((viewScans._pg && viewScans._pg[s.id]) || 1, Math.max(done, 1));
    box.innerHTML = `
      <div class="sside-head">
        <b>${esc(s.title)}</b>
        <div class="lb-chips">${scanChip(s)}</div>
      </div>
      <div class="sbk-frame" id="sbk-frame">
        ${done > 0
          ? `<img class="sbk-pg" src="/api/scans/${s.id}/img/${pg}" alt="Страница скана">
             <button type="button" class="sbk-nav prev" id="sbk-prev" aria-label="Предыдущая страница">${I.back}</button>
             <button type="button" class="sbk-nav next" id="sbk-next" aria-label="Следующая страница">${I.chev}</button>
             <div class="sbk-cnt" id="sbk-cnt">${pg} / ${done}</div>`
          : `<div class="scn-skel big"><i></i></div>`}
      </div>
      ${s.status === "processing"
        ? `<div class="scn-prg ${total ? "" : "ind"}"><i style="width:${total ? Math.round(done / total * 100) : 30}%"></i></div>
           <div class="scn-sub">Распознаём страницы… ${total ? `${done} из ${total}` : ""}</div>`
        : `<div class="scn-prg ok"><i style="width:${vp}%"></i></div>`}
      <div class="sside-rows">
        <div class="sside-row"><span>Файл</span><b>${esc(s.filename || "—")}</b></div>
        ${when ? `<div class="sside-row"><span>Оцифрован</span><b>${esc(when)}</b></div>` : ""}
        <div class="sside-row"><span>Страниц</span><b>${total || "распознаём…"}</b></div>
      </div>
      ${scanChecklist(s)}
      <div class="sside-btns">
        ${s.status === "ready" ? `<button class="btn small primary" id="ss-open">${I.pen}Вычитать</button>` : ""}
        ${s.status === "ready" && !s.book_id && can("books.create") ? `<button class="btn small" id="ss-tobook">${I.book}Собрать в учебник</button>` : ""}
        ${s.book_id ? `<button class="btn small" id="ss-book">${I.book}Открыть учебник</button>` : ""}
        ${s.status === "ready" ? `<button class="btn small" id="ss-txt">${I.doc}Скачать текст (.txt)</button>` : ""}
      </div>`;

    /* листание: правая страница плавно въезжает справа налево (слайд, не переворот) */
    let sliding = false;
    const goPg = n => {
      if (sliding || n < 1 || n > done || n === pg) return;
      const frame = $("#sbk-frame");
      if (!frame) return;
      const dir = n > pg ? 1 : -1;
      const old = frame.querySelector("img.sbk-pg:not(.exit):not(.exit-right)");
      const img = document.createElement("img");
      sliding = true;
      img.className = "sbk-pg enter" + (dir < 0 ? " from-left" : "");
      img.alt = "Страница скана";
      img.style.zIndex = "2"; // новая страница едет ПОВЕРХ старой
      img.onload = () => {
        frame.appendChild(img);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          img.classList.remove("enter", "from-left");
          if (old) { old.classList.add(dir < 0 ? "exit-right" : "exit"); setTimeout(() => old.remove(), 600); }
          setTimeout(() => { sliding = false; }, 580);
        }));
        pg = n;
        (viewScans._pg || (viewScans._pg = {}))[s.id] = n;
        const c = $("#sbk-cnt");
        if (c) c.textContent = `${n} / ${done}`;
      };
      img.onerror = () => { sliding = false; };
      img.src = `/api/scans/${s.id}/img/${n}`;
    };
    const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
    on("#sbk-prev", () => goPg(pg - 1));
    on("#sbk-next", () => goPg(pg + 1));
    on("#ss-open", () => { location.hash = `#/scan/${s.id}`; });
    on("#ss-book", () => { location.hash = `#/book/${s.book_id}`; });
    on("#ss-tobook", async () => {
      try { openScanToBook(await api(`/api/scans/${s.id}`)); } catch (e) { toast(e.message, "err"); }
    });
    on("#ss-txt", () => downloadScanText(s, $("#ss-txt")));
  }

  /* скачать весь распознанный текст одним .txt (страницы по очереди) */
  async function downloadScanText(s, btn) {
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    const orig = btn.innerHTML;
    try {
      const parts = [];
      for (let n = 1; n <= (s.pages_total || 0); n++) {
        btn.textContent = `Готовим… ${n} из ${s.pages_total}`;
        const p = await api(`/api/scans/${s.id}/page/${n}`);
        parts.push(`===== Страница ${n} =====\n\n${p.text || ""}`);
      }
      const blob = new Blob([parts.join("\n\n")], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(s.title || "скан").replace(/[\\/:*?"<>|]+/g, "_")}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast("Текст скачан", "ok");
    } catch (e) { toast(e.message, "err"); }
    btn.disabled = false;
    btn.innerHTML = orig;
  }

  const load = async () => {
    if (!location.hash.startsWith("#/scans")) return;
    let scans;
    try { scans = await api("/api/scans"); } catch (e) { toast(e.message, "err"); return; }
    const grid = $("#scn-grid");
    if (!grid) return;
    /* пусто → полупрозрачный «призрак»-превью: видно, ЧТО и ГДЕ появится после
       загрузки; реальный скан рендерится обычным, непрозрачным */
    grid.innerHTML = scans.length
      ? scans.map(cardHtml).join("")
      : `<div class="scn-ghost-lbl">${SCAN_ICONS.scan}<span>Сканов пока нет — загрузите первый.
           Полупрозрачное ниже — образец того, что появится:</span></div>
         <div class="card scn-card scn-ghost" aria-hidden="true">
           <div class="scn-th"><div class="sbk-ghostpg mini"><b></b><i></i><i></i><i class="w80"></i><i class="w60"></i></div></div>
           <div class="scn-info">
             <div class="scn-title">Название книги</div>
             <div class="lb-chips"><span class="chip gold">Готов к вычитке</span></div>
             <div class="scn-prg ok"><i style="width:38%"></i></div>
             <div class="scn-sub">Вычитано 9 из 24 стр.</div>
             <div class="lb-actions">
               <button class="btn small primary" tabindex="-1">${I.pen}Вычитать</button>
               <button class="btn small" tabindex="-1">${I.book}В учебник</button>
             </div>
           </div>
         </div>`;
    const gg = grid.querySelector(".scn-ghost");
    if (gg) gg.onclick = ghostNudge;
    grid.classList.toggle("live", load._ran === true); // при обновлении по таймеру не переигрывать анимацию входа
    load._ran = true;
    const sub = $("#scn-sub");
    if (sub) sub.textContent = scans.length
      ? `Всего сканов: ${scans.length} — распознавание, вычитка и сборка в учебник`
      : "Загрузите скан бумажного учебника — система распознает текст, поможет вычитать его и соберёт настоящий электронный учебник";
    load._scans = scans;
    if (!scans.some(x => x.id === viewScans._sel)) viewScans._sel = scans[0]?.id;
    renderSide(scans);
    bindGrid(load);
    clearTimeout(viewScans._t);
    if (scans.some(x => x.status === "processing")) viewScans._t = setTimeout(load, 2000);
  };
  load._ran = false;

  const scz = $("#scz");
  if (scz) {
    const filePick = () => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = ".pdf,.djvu,.jpg,.jpeg,.png,.tif,.tiff,.webp,.zip";
      inp.onchange = () => { if (inp.files[0]) openScanUpload(inp.files[0], load); };
      inp.click();
    };
    scz.onclick = filePick;
    scz.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); filePick(); } };
    ["dragenter", "dragover"].forEach(ev => scz.addEventListener(ev, e => { e.preventDefault(); scz.classList.add("drag"); }));
    ["dragleave", "drop"].forEach(ev => scz.addEventListener(ev, e => { e.preventDefault(); scz.classList.remove("drag"); }));
    scz.addEventListener("drop", e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) openScanUpload(f, load); });
  }

  await load();
}

/* оцифровка без анкеты: файл сразу уходит в распознавание (название = имя файла);
   предмет/класс/язык спрашиваются позже — при «Собрать в учебник» */
function openScanUpload(file, onDone) {
  if (openScanUpload._busy) return;
  openScanUpload._busy = true;
  const scz = $("#scz");
  const ttl = scz ? scz.querySelector(".scz-title") : null;
  if (scz) scz.classList.add("busy");
  if (ttl) ttl.textContent = "Загружаем файл…";
  const fd = new FormData();
  fd.append("file", file);
  fd.append("title", (file.name || "Скан книги").replace(/\.[^.]+$/, ""));
  api("/api/scans", { method: "POST", body: fd })
    .then(() => {
      toast("Скан загружен — распознаём страницы", "ok");
      scanWatch(); // чип оцифровки в шапке — виден с любой страницы
      if (location.hash.startsWith("#/scans") && onDone) onDone(); else location.hash = "#/scans";
    })
    .catch(e => toast(e.message, "err"))
    .finally(() => {
      openScanUpload._busy = false;
      if (scz) scz.classList.remove("busy");
      if (ttl) ttl.textContent = "Перетащите скан сюда";
    });
}

/* ===== ИИ-структура учебника: определение и проверка пользователем ===== */
function structTreeHtml(st) {
  const chips = [st.subject, st.grade ? st.grade + " класс" : "", st.language, st.publisher, st.year, st.isbn]
    .filter(Boolean).map(x => `<span class="chip">${esc(x)}</span>`).join("");
  return `
    <div class="strt">
      <div class="strt-head">
        ${I.book}<div><b>${esc(st.title || "Без названия")}</b>
        ${st.authors?.length ? `<span class="strt-auth">${esc(st.authors.join(", "))}</span>` : ""}</div>
      </div>
      ${chips ? `<div class="lb-chips">${chips}</div>` : ""}
      <div class="strt-tree">
        ${(st.chapters || []).map(ch => `
          <div class="strt-ch">
            <div class="strt-cht">${esc(ch.title)}<span>стр. ${ch.page_from}</span></div>
            ${(ch.sections || []).map(x =>
              `<div class="strt-sec">${esc(x.title)}<span>стр. ${x.page_from}</span></div>`).join("")}
          </div>`).join("")}
      </div>
      <div class="strt-note">${I.alert}<span>Проверьте: названия и границы глав ИИ определил по OCR-тексту —
        если что-то не так, поправить структуру можно будет в конструкторе после сборки.</span></div>
    </div>`;
}

function openScanStructure(s) {
  const hasSt = !!(s.structure && s.structure.chapters);
  const m = modal({
    title: "Структура учебника — определяет ИИ", wide: true,
    body: `<div id="strt-body">${hasSt ? structTreeHtml(s.structure) : `
      <div class="strt-intro">
        ${SCAN_ICONS.tree}
        <b>ИИ прочитает распознанный текст и найдёт структуру</b>
        <span>Название, авторов, предмет, класс, главы и параграфы с номерами страниц.
        Обычно это занимает до минуты. Результат вы сможете проверить перед сборкой учебника.</span>
      </div>`}</div>`,
    footer: `<button class="btn" id="strt-close">Закрыть</button>
      <span class="spacer"></span>
      <button class="btn ${hasSt ? "" : "primary"}" id="strt-go">${SCAN_ICONS.tree}${hasSt ? "Определить заново" : "Определить структуру"}</button>
      ${hasSt && !s.book_id && can("books.create") ? `<button class="btn primary" id="strt-tobook">${I.book}Собрать по структуре</button>` : ""}`,
  });
  $("#strt-close").onclick = m.close;
  const toBook = $("#strt-tobook");
  if (toBook) toBook.onclick = () => { m.close(); openScanToBook(s, true); };
  $("#strt-go").onclick = async () => {
    const b = $("#strt-go");
    b.disabled = true;
    b.innerHTML = `${SCAN_ICONS.tree}Читаем текст и определяем…`;
    $("#strt-body").innerHTML = `
      <div class="strt-busy"><div class="scn-skel big"><i></i></div>
      <b>ИИ определяет структуру…</b><span>читаем страницы, ищем главы и параграфы</span></div>`;
    try {
      const data = await api(`/api/scans/${s.id}/structure`, { method: "POST" });
      s.structure = data;
      m.close();
      toast("Структура определена — проверьте её", "ok");
      openScanStructure(s); // перерисовать модалку уже с деревом и кнопкой сборки
    } catch (e) {
      toast(e.message, "err");
      b.disabled = false;
      b.innerHTML = `${SCAN_ICONS.tree}Определить структуру`;
      $("#strt-body").innerHTML = `<div class="strt-intro">${I.alert}<b>Не получилось</b><span>${esc(e.message)}</span></div>`;
    }
  };
}

function openScanToBook(s, useStruct) {
  const meta = state.meta;
  const total = s.pages_total || (s.pages ? s.pages.length : 0);
  const v = s.verified_count != null ? s.verified_count : (s.pages || []).filter(p => p.verified).length;
  const st = (s.structure && s.structure.chapters) ? s.structure : null;
  // подсказки из ИИ-структуры: чего нет в скане — берём из распознанного титула
  const guessTitle = s.title || (st ? st.title : "");
  const guessSubject = s.subject || (st ? st.subject : "");
  const guessGrade = s.grade || (st ? st.grade : "");
  const guessLang = s.language || (st ? st.language : "") || "кыргызский";
  const m = modal({
    title: "Собрать в учебник", wide: true,
    body: `
      ${total && v < total ? `<div class="imp-note">${I.alert}<span>Вычитано ${v} из ${total} стр. — собрать можно и сейчас, но непроверенные страницы попадут в книгу как есть.</span></div>` : ""}
      <div class="field"><label>Название учебника</label>
        <input id="tb-title" value="${esc(guessTitle)}" autocomplete="off" spellcheck="false"></div>
      <div class="field"><label>Предмет</label>
        <div class="pick-grid subjects" id="tb-subjects">
          ${meta.subjects.map(x => `<div class="pick ${x === guessSubject ? "selected" : ""}" data-v="${esc(x)}">${esc(x)}</div>`).join("")}
        </div></div>
      <div class="field"><label>Класс</label>
        <div class="pick-grid grades" id="tb-grades">
          ${meta.grades.map(g => `<div class="pick ${g === guessGrade ? "selected" : ""}" data-v="${esc(g)}">${esc(g)}</div>`).join("")}
        </div></div>
      <div class="field"><label>Язык обучения</label>
        <div class="pick-grid" style="grid-template-columns:repeat(4,1fr)" id="tb-langs">
          ${["кыргызский", "русский"].map(l =>
            `<div class="pick ${l === guessLang ? "selected" : ""}" data-v="${l}">${l}</div>`).join("")}
        </div></div>
      <div class="field"><label>Авторы <span class="lbl-note">через запятую · попадут на титульный лист</span></label>
        <input id="tb-authors" value="${esc(st && st.authors ? st.authors.join(", ") : "")}" autocomplete="off" spellcheck="false"></div>
      <div class="tb-meta3">
        <div class="field"><label>Издательство</label>
          <input id="tb-pub" value="${esc(st ? st.publisher || "" : "")}" autocomplete="off" spellcheck="false"></div>
        <div class="field"><label>Год издания</label>
          <input id="tb-year" value="${esc(st ? st.year || "" : "")}" autocomplete="off" spellcheck="false"></div>
        <div class="field"><label>ISBN</label>
          <input id="tb-isbn" value="${esc(st ? st.isbn || "" : "")}" autocomplete="off" spellcheck="false"></div>
      </div>
      ${st ? `
      <label class="tb-struct"><input type="checkbox" id="tb-usestruct" ${useStruct || st ? "checked" : ""}>
        <span>Главы и параграфы — <b>по структуре ИИ</b> (${st.chapters.length} гл.,
        ${st.chapters.reduce((a, c) => a + (c.sections || []).length, 0)} §)</span></label>` : `
      <div class="tb-nostruct">${SCAN_ICONS.tree}<span>Структура не определена — текст будет разбит на равные части.
        Можно закрыть окно и нажать «Структура (ИИ)», чтобы главы совпали с настоящими.</span></div>`}`,
    footer: `<button class="btn" id="tb-cancel">Отмена</button>
             <button class="btn primary" id="tb-go">${I.book}Собрать учебник</button>`,
  });
  const pickOne = rootSel => {
    $(rootSel).addEventListener("click", e => {
      const p = e.target.closest(".pick");
      if (!p) return;
      $$(".pick", $(rootSel)).forEach(x => x.classList.remove("selected"));
      p.classList.add("selected");
    });
  };
  pickOne("#tb-subjects"); pickOne("#tb-grades"); pickOne("#tb-langs");
  $("#tb-cancel").onclick = m.close;
  $("#tb-go").onclick = async () => {
    $("#tb-go").disabled = true;
    try {
      const r = await api(`/api/scans/${s.id}/to-book`, { method: "POST", body: {
        title: $("#tb-title").value.trim(),
        subject: $("#tb-subjects .selected")?.dataset.v || "",
        grade: $("#tb-grades .selected")?.dataset.v || "",
        language: $("#tb-langs .selected")?.dataset.v || "",
        use_structure: !!$("#tb-usestruct")?.checked,
        authors: $("#tb-authors").value.trim(),
        publisher: $("#tb-pub").value.trim(),
        year: $("#tb-year").value.trim(),
        isbn: $("#tb-isbn").value.trim(),
      }});
      m.close();
      toast("Учебник собран — открываем конструктор", "ok");
      location.hash = `#/book/${r.book_id}`;
    } catch (e) { $("#tb-go").disabled = false; toast(e.message, "err"); }
  };
}

async function viewScanEditor(id) {
  shell("scans", `<div class="empty">Загрузка скана…</div>`);
  let s;
  try { s = await api(`/api/scans/${id}`); }
  catch (e) { toast(e.message, "err"); location.hash = "#/scans"; return; }

  // распознавание ещё идёт (или упало) — экран прогресса с автообновлением
  if (s.status !== "ready") {
    const total = s.pages_total || 0, done = s.pages_done || 0;
    const p = total ? Math.round(done / total * 100) : 30;
    shell("scans", `
      <div class="page-head">
        <button class="btn ghost back-btn" id="scv-back" aria-label="К списку сканов">${I.back}</button>
        <div><h1>${esc(s.title)}</h1><div class="sub">Оцифровка учебника</div></div>
      </div>
      ${scanStepper(s)}
      <div class="card scv-wait">
        ${s.status === "error" ? `
          ${I.alert}
          <b>Не удалось обработать скан</b>
          <span class="scn-sub err">${esc(s.error || "")}</span>
          <button class="btn" id="scv-back2">К списку сканов</button>`
        : `
          <div class="scw-file">${I.doc}<b>${esc(s.filename || s.title)}</b>
            <span>${total ? `${total} стр.` : "определяем страницы…"}</span></div>
          <div class="scn-prg ${total ? "" : "ind"}"><i style="width:${p}%"></i></div>
          <span class="scn-sub">${total ? `распознано ${done} из ${total} стр. · ${p}%` : "готовим файл"}</span>
          ${scanChecklist(s)}`}
      </div>`);
    const back = $("#scv-back");
    if (back) back.onclick = () => { location.hash = "#/scans"; };
    const back2 = $("#scv-back2");
    if (back2) back2.onclick = () => { location.hash = "#/scans"; };
    if (s.status === "processing") {
      clearTimeout(viewScanEditor._t);
      viewScanEditor._t = setTimeout(() => {
        if (location.hash.startsWith(`#/scan/${id}`)) viewScanEditor(id);
      }, 1500);
    }
    return;
  }

  const pages = s.pages || [];
  const total = pages.length;
  const st = { cur: 0, zoom: 100, dirty: false, timer: null, seq: 0, orig: "" };
  const vcount = () => pages.filter(p => p.verified).length;
  const pageMeta = n => pages.find(p => p.page_no === n);

  shell("scans", `
  <div class="scv">
    <div class="scv-head">
      <div><h1>${esc(s.title)}</h1>
        <div class="sub">${esc(s.filename)} · ${total} стр.${s.subject ? " · " + esc(s.subject) : ""}${s.grade ? " · " + esc(s.grade) + " класс" : ""}</div></div>
      <span class="spacer"></span>
      ${scanStepper(s)}
      <span class="scv-pill" id="scv-vpill">Вычитано ${vcount()} из ${total}</span>
      <button class="btn" id="scv-hist" aria-label="История оцифровки">
        <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        История</button>
      ${can("books.edit") ? `<button class="btn" id="scv-struct">${SCAN_ICONS.tree}Структура (ИИ)</button>` : ""}
      ${s.book_id ? `<button class="btn" id="scv-openbook">${I.book}Открыть учебник</button>` : ""}
      ${can("books.create") && !s.book_id ? `<button class="btn primary" id="scv-tobook">${I.book}Собрать в учебник</button>` : ""}
    </div>
    <div class="scv-prgline"><i id="scv-vbar" style="width:${total ? Math.round(vcount() / total * 100) : 0}%"></i></div>
    <div class="scq" id="scq" hidden></div>
    <div class="scv-body">
      <div class="scv-rail" id="scv-rail">
        ${pages.map(p => `
        <button type="button" class="scv-th ${p.verified ? "ok" : ""}" draggable="${can("books.edit")}" data-n="${p.page_no}" aria-label="Страница ${p.page_no}">
          <img loading="lazy" src="/api/scans/${id}/img/${p.page_no}" alt="">
          <span>${p.page_no}</span><i class="scv-dot">${I.check}</i>
          ${can("books.edit") ? `<span class="scv-thtools">
            <b data-rot="${p.page_no}" aria-label="Повернуть страницу">${SCAN_ICONS.rotate}</b>
            <b data-repl="${p.page_no}" aria-label="Заменить страницу файлом">${I.upload}</b>
            <b data-pdel="${p.page_no}" aria-label="Удалить страницу">${I.trash}</b>
          </span>` : ""}
        </button>`).join("")}
      </div>
      <div class="scv-pane">
        <div class="scv-tools">
          <span class="scv-lbl">Оригинал страницы</span>
          <span class="spacer"></span>
          <button class="icon-btn" id="scv-rot" aria-label="Повернуть на 90 градусов">${SCAN_ICONS.rotate}</button>
          <button class="icon-btn" id="scv-enh" aria-label="Повысить контраст скана">${SCAN_ICONS.contrast}</button>
          <span class="scv-sep"></span>
          <button class="icon-btn" id="scv-zo" aria-label="Уменьшить">${SCAN_ICONS.zout}</button>
          <span class="scv-zoom" id="scv-zv">100%</span>
          <button class="icon-btn" id="scv-zi" aria-label="Увеличить">${SCAN_ICONS.zin}</button>
        </div>
        <div class="scv-imgwrap" id="scv-imgwrap"><img id="scv-img" alt="Скан страницы"></div>
        <button type="button" class="scv-bignav prev" id="scv-imgprev" aria-label="Предыдущая страница">${I.back}</button>
        <button type="button" class="scv-bignav next" id="scv-imgnext" aria-label="Следующая страница">${I.back}</button>
        <div class="scv-imgcnt" id="scv-imgcnt">— / ${total}</div>
      </div>
      <div class="scv-pane">
        <div class="scv-tools">
          <button class="icon-btn" id="scv-prev" aria-label="Предыдущая страница">${I.back}</button>
          <span class="scv-pageno">стр. <b id="scv-no">—</b> / ${total}</span>
          <button class="icon-btn flip" id="scv-next" aria-label="Следующая страница">${I.back}</button>
          <span class="spacer"></span>
          <button type="button" class="scv-sus" id="scv-sus" hidden aria-label="Показать следующее подозрительное место">${I.alert}<b>0</b></button>
          <span class="scv-save" id="scv-save"></span>
          <button class="btn small" id="scv-ok">${I.check}Проверена</button>
        </div>
        <div class="scv-fixbar">
          <button type="button" class="btn small" id="scv-fix">${SCAN_ICONS.wand}Автоисправление</button>
          <button type="button" class="btn small" id="scv-frt">${I.search}Найти и заменить</button>
          <button type="button" class="btn small" id="scv-orig" disabled
            aria-label="Вернуть оригинал распознавания этой страницы">
            <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>
            Оригинал OCR</button>
          <button type="button" class="icon-btn" id="scv-copy" aria-label="Копировать текст страницы">${SCAN_ICONS.copy}</button>
          <button type="button" class="icon-btn" id="scv-skip" aria-label="К следующей непроверенной странице">${SCAN_ICONS.skip}</button>
          <span class="spacer"></span>
          <span class="scv-cnt" id="scv-cnt"></span>
          <button type="button" class="icon-btn" id="scv-keys" aria-label="Горячие клавиши">${SCAN_ICONS.keys}</button>
        </div>
        <div class="scv-fr" id="scv-fr" hidden>
          <input id="fr-find" placeholder="Найти…" autocomplete="off" spellcheck="false">
          <input id="fr-repl" placeholder="Заменить на…" autocomplete="off" spellcheck="false">
          <label class="scv-fr-all"><input type="checkbox" id="fr-all"> на всех страницах</label>
          <button class="btn small primary" id="fr-go">Заменить</button>
          <span class="scv-fr-res" id="fr-res"></span>
        </div>
        <div class="scv-keys-pop" id="scv-keys-pop" hidden>
          <b>Горячие клавиши вычитки</b>
          <div><i>клик по странице</i><span>правая половина — вперёд, левая — назад</span></div>
          <div><i>←/→</i><span>листать книгу (когда курсор не в тексте)</span></div>
          <div><i>Alt + ←/→</i><span>листать даже во время печати</span></div>
          <div><i>Ctrl + Enter</i><span>«Проверена» — и сразу к следующей</span></div>
          <div><i>Ctrl + S</i><span>сохранить правки немедленно</span></div>
        </div>
        <div class="scv-tawrap">
          <div class="scv-hl" id="scv-hl" aria-hidden="true"></div>
          <textarea class="scv-ta" id="scv-ta" spellcheck="false" placeholder="Распознанный текст страницы…"></textarea>
        </div>
      </div>
    </div>
  </div>`); // ограниченная ширина по центру — как у остальных страниц (не во весь экран)

  const ind = (t, cls) => {
    const el = $("#scv-save");
    if (el) { el.textContent = t; el.className = "scv-save " + (cls || ""); }
  };

  async function flush() {
    if (!st.dirty) return;
    const ta = $("#scv-ta");
    if (!ta) { st.dirty = false; return; }
    st.dirty = false;
    clearTimeout(st.timer);
    const n = st.cur, text = ta.value;
    ind("сохраняем…", "saving");
    try {
      await api(`/api/scans/${id}/page/${n}`, { method: "PUT", body: { text } });
      ind("сохранено", "saved");
    } catch (e) {
      st.dirty = true;
      ind("не сохранено", "unsaved");
      toast(e.message, "err");
    }
  }

  function setOkBtn(on) {
    const b = $("#scv-ok");
    if (!b) return;
    b.classList.toggle("on", on);
    b.innerHTML = `${I.check}${on ? "Проверена" : "Отметить проверенной"}`;
  }

  async function goPage(n) {
    if (n < 1 || n > total || n === st.cur) return;
    await flush();
    const seq = ++st.seq;
    const dir = n > st.cur ? 1 : -1; // вперёд = страница «уезжает» влево
    st.cur = n;
    $("#scv-no").textContent = n;
    const ic = $("#scv-imgcnt");
    if (ic) ic.textContent = `${n} / ${total}`;
    const bp = $("#scv-imgprev"), bn = $("#scv-imgnext");
    if (bp) bp.disabled = n <= 1;
    if (bn) bn.disabled = n >= total;
    /* анимация перелистывания: текущая страница сдвигается и тает,
       новая въезжает с противоположной стороны */
    const img = $("#scv-img");
    img.style.transform = `translateX(${dir * -46}px)`;
    img.style.opacity = "0";
    const tmp = new Image();
    tmp.onload = () => {
      if (seq !== st.seq) return; // уже листнули дальше
      img.src = tmp.src;
      img.style.transition = "none";
      img.style.transform = `translateX(${dir * 46}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        img.style.transition = "";
        img.style.transform = "";
        img.style.opacity = "";
      }));
    };
    tmp.src = `/api/scans/${id}/img/${n}`;
    $$("#scv-rail .scv-th").forEach(t => t.classList.toggle("cur", +t.dataset.n === n));
    const th = $(`#scv-rail .scv-th[data-n="${n}"]`);
    if (th) th.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const ta = $("#scv-ta");
    ta.value = ""; ta.disabled = true; ind("");
    const hl0 = $("#scv-hl");
    if (hl0) hl0.innerHTML = "";
    setOkBtn(!!(pageMeta(n) || {}).verified);
    resetFix();
    try {
      const p = await api(`/api/scans/${id}/page/${n}`);
      if (seq !== st.seq) return; // уже ушли на другую страницу
      ta.value = p.text;
      st.orig = p.text_orig || ""; // неудаляемый оригинал OCR этой страницы
      ta.disabled = false;
      $("#scv-imgwrap").scrollTop = 0;
      refreshMeta();
    } catch (e) { toast(e.message, "err"); }
  }

  /* --- счётчик слов и «подозрительные места» --- */
  function refreshMeta() {
    const ta = $("#scv-ta");
    if (!ta) return;
    // «Оригинал OCR» активен, только если текст страницы отличается от оригинала
    const ob = $("#scv-orig");
    if (ob) ob.disabled = ta.disabled || ta.value === st.orig;
    const t = ta.value;
    const words = t.trim() ? t.trim().split(/\s+/).length : 0;
    const cnt = $("#scv-cnt");
    if (cnt) cnt.textContent = words ? `${fmtNum(words)} слов · ${fmtNum(t.length)} симв.` : "";
    st.sus = findSuspicious(t);
    st.susIdx = -1;
    const sb = $("#scv-sus");
    if (sb) { sb.hidden = !st.sus.length; sb.querySelector("b").textContent = st.sus.length; }
    renderHl();
  }

  /* --- жёлтая подсветка подозрительных мест: подложка-зеркало за textarea --- */
  function renderHl() {
    const hl = $("#scv-hl"), ta = $("#scv-ta");
    if (!hl || !ta) return;
    const t = ta.value, poss = st.sus || [];
    if (!poss.length) { hl.innerHTML = ""; return; }
    const ranges = [];
    poss.forEach(p => {
      const a = Math.max(0, p), b = Math.min(t.length, p + 2);
      const last = ranges[ranges.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else ranges.push([a, b]);
    });
    let out = "", prev = 0;
    ranges.forEach(([a, b]) => {
      out += esc(t.slice(prev, a)) + "<mark>" + esc(t.slice(a, b)) + "</mark>";
      prev = b;
    });
    // ширина подложки = видимая ширина textarea (учёт её скроллбара), иначе переносы разъедутся
    hl.style.width = ta.clientWidth + "px";
    hl.innerHTML = out + esc(t.slice(prev)) + "\n";
    hl.scrollTop = ta.scrollTop;
  }

  /* --- автоисправление с возможностью отмены (пока не начали печатать) --- */
  function resetFix() {
    st.fixUndo = null;
    const b = $("#scv-fix");
    if (b) { b.classList.remove("on"); b.innerHTML = `${SCAN_ICONS.wand}Автоисправление`; }
  }

  const setZoom = z => {
    st.zoom = Math.min(240, Math.max(60, z));
    $("#scv-zv").textContent = st.zoom + "%";
    $("#scv-imgwrap")?.classList.toggle("zoomed", st.zoom !== 100); // курсор-подсказка листания
    const img = $("#scv-img");
    if (st.zoom === 100) { // 100% = страница вписана в панель целиком (CSS-дефолт)
      img.style.width = ""; img.style.maxWidth = ""; img.style.maxHeight = "";
    } else { // иначе — масштаб по ширине с прокруткой
      img.style.width = st.zoom + "%"; img.style.maxWidth = "none"; img.style.maxHeight = "none";
    }
  };
  $("#scv-zi").onclick = () => setZoom(st.zoom + 20);
  $("#scv-zo").onclick = () => setZoom(st.zoom - 20);
  $("#scv-prev").onclick = () => goPage(st.cur - 1);
  $("#scv-next").onclick = () => goPage(st.cur + 1);
  // листание прямо на странице книги
  $("#scv-imgprev").onclick = () => goPage(st.cur - 1);
  $("#scv-imgnext").onclick = () => goPage(st.cur + 1);

  /* «Оригинал OCR»: спасение от случайно стёртого текста — сервер хранит
     неизменяемый результат распознавания каждой страницы */
  const origBtn = $("#scv-orig");
  if (origBtn) origBtn.onclick = async () => {
    if (!confirm("Вернуть текст этой страницы к оригиналу распознавания?\nТекущие правки страницы будут заменены оригиналом OCR.")) return;
    try {
      const r = await api(`/api/scans/${id}/page/${st.cur}/restore`, { method: "POST" });
      const ta = $("#scv-ta");
      ta.value = r.text;
      st.orig = r.text;
      st.dirty = false;
      clearTimeout(st.timer);
      const pm = pageMeta(st.cur);
      if (pm) pm.verified = 0;
      setOkBtn(false);
      ind("возвращён оригинал", "saved");
      refreshMeta();
      toast("Возвращён оригинал распознавания", "ok");
    } catch (e) { toast(e.message, "err"); }
  };

  /* общая история оцифровки — кто что сделал, видна всем */
  $("#scv-hist").onclick = async () => {
    let rows = [];
    try { rows = await api(`/api/scans/${id}/history`); }
    catch (e) { toast(e.message, "err"); return; }
    const m = modal({
      title: "История оцифровки",
      body: rows.length ? `<div class="shist">${rows.map(h => `
          <div class="shist-row">
            <span class="shist-ava">${esc((h.user_name || "?").trim()[0] || "?").toUpperCase()}</span>
            <div class="shist-tx"><b>${esc(h.user_name || "—")}</b><span>${esc(h.action)}</span></div>
            <i>${esc(String(h.created_at || "").slice(0, 16))}</i>
          </div>`).join("")}</div>`
        : `<p class="muted">Пока никаких действий не записано.</p>`,
      footer: `<span class="spacer"></span><button class="btn" id="shist-close">Закрыть</button>`,
    });
    $("#shist-close").onclick = () => m.close();
  };
  const bust = () => Date.now();
  const refreshImgs = n => { // после поворота/замены — сбросить кеш картинок страницы
    const t = bust();
    const th = $(`#scv-rail .scv-th[data-n="${n}"] img`);
    if (th) th.src = `/api/scans/${id}/img/${n}?t=${t}`;
    if (n === st.cur) $("#scv-img").src = `/api/scans/${id}/img/${n}?t=${t}`;
  };

  $("#scv-rail").addEventListener("click", async e => {
    const tool = e.target.closest("[data-rot],[data-repl],[data-pdel]");
    if (tool) {
      e.stopPropagation();
      const n = +(tool.dataset.rot || tool.dataset.repl || tool.dataset.pdel);
      if (tool.dataset.rot) {
        try { await api(`/api/scans/${id}/page/${n}/rotate`, { method: "POST", body: { deg: 90 } }); refreshImgs(n); }
        catch (err) { toast(err.message, "err"); }
      } else if (tool.dataset.repl) {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = ".jpg,.jpeg,.png,.tif,.tiff,.webp";
        inp.onchange = async () => {
          if (!inp.files[0]) return;
          const fd = new FormData();
          fd.append("file", inp.files[0]);
          toast(`Заменяем страницу ${n} — распознаём заново…`, "ok");
          try {
            const r = await api(`/api/scans/${id}/page/${n}/replace`, { method: "POST", body: fd });
            refreshImgs(n);
            const p = pageMeta(n);
            if (p) { p.verified = 0; $(`#scv-rail .scv-th[data-n="${n}"]`)?.classList.remove("ok"); }
            if (n === st.cur) { $("#scv-ta").value = r.text || ""; setOkBtn(false); refreshMeta(); }
            loadQuality();
            toast(`Страница ${n} заменена и распознана`, "ok");
          } catch (err) { toast(err.message, "err"); }
        };
        inp.click();
      } else {
        if (!confirm(`Удалить страницу ${n} из скана? Нумерация остальных сдвинется.`)) return;
        try {
          await flush();
          await api(`/api/scans/${id}/page/${n}`, { method: "DELETE" });
          toast(`Страница ${n} удалена`, "ok");
          viewScanEditor(id); // нумерация изменилась — перерисовываем целиком
        } catch (err) { toast(err.message, "err"); }
      }
      return;
    }
    const th = e.target.closest(".scv-th");
    if (th) goPage(+th.dataset.n);
  });

  /* --- порядок страниц: перетаскивание миниатюр в ленте --- */
  if (can("books.edit")) {
    const rail = $("#scv-rail");
    let dragN = null;
    rail.addEventListener("dragstart", e => {
      const th = e.target.closest(".scv-th");
      if (!th) return;
      dragN = +th.dataset.n;
      th.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    rail.addEventListener("dragend", e => {
      e.target.closest(".scv-th")?.classList.remove("dragging");
      $$("#scv-rail .scv-th.dropto").forEach(x => x.classList.remove("dropto"));
    });
    rail.addEventListener("dragover", e => {
      const th = e.target.closest(".scv-th");
      if (!th || dragN == null) return;
      e.preventDefault();
      $$("#scv-rail .scv-th.dropto").forEach(x => x.classList.remove("dropto"));
      if (+th.dataset.n !== dragN) th.classList.add("dropto");
    });
    rail.addEventListener("drop", async e => {
      const th = e.target.closest(".scv-th");
      if (!th || dragN == null) return;
      e.preventDefault();
      const to = +th.dataset.n;
      if (to === dragN) return;
      const order = pages.map(p => p.page_no).filter(n => n !== dragN);
      order.splice(order.indexOf(to) + (to > dragN ? 1 : 0), 0, dragN);
      dragN = null;
      try {
        await flush();
        await api(`/api/scans/${id}/pages/reorder`, { method: "POST", body: { order } });
        toast("Порядок страниц изменён", "ok");
        viewScanEditor(id);
      } catch (err) { toast(err.message, "err"); }
    });
  }

  /* --- отчёт качества распознавания --- */
  async function loadQuality() {
    let q;
    try { q = await api(`/api/scans/${id}/quality`); } catch { return; }
    st.quality = q;
    const box = $("#scq");
    if (!box) return;
    const items = [
      `<span class="scq-it ${q.recognized_pct >= 98 ? "g" : q.recognized_pct >= 90 ? "y" : "r"}"><i></i>${q.recognized_pct}% страниц с текстом</span>`,
      q.sus_total ? `<button type="button" class="scq-it y" id="scq-sus"><i></i>${fmtNum(q.sus_total)} подозрительных мест</button>` : `<span class="scq-it g"><i></i>подозрительных мест нет</span>`,
      q.weak_pages.length ? `<button type="button" class="scq-it o" id="scq-weak"><i></i>стр. с малым текстом: ${q.weak_pages.length}</button>` : "",
      q.empty_pages.length ? `<button type="button" class="scq-it r" id="scq-empty"><i></i>пустых стр.: ${q.empty_pages.length}</button>` : "",
      `<span class="scq-it b"><i></i>${fmtNum(q.words_total)} слов</span>`,
    ].filter(Boolean);
    box.innerHTML = `<span class="scq-cap">Качество распознавания</span>` + items.join("");
    box.hidden = false;
    const cycler = list => {
      let i = -1;
      return () => { if (list.length) { i = (i + 1) % list.length; goPage(list[i]); } };
    };
    const su = $("#scq-sus");
    if (su) su.onclick = cycler(q.sus_pages.map(x => x.page));
    const wk = $("#scq-weak");
    if (wk) wk.onclick = cycler(q.weak_pages);
    const em = $("#scq-empty");
    if (em) em.onclick = cycler(q.empty_pages);
  }
  loadQuality();

  const btnStruct = $("#scv-struct");
  if (btnStruct) btnStruct.onclick = () => openScanStructure(s);

  /* поворот и контраст оригинала — для фото, снятых боком или бледных сканов */
  st.rot = 0;
  $("#scv-rot").onclick = () => {
    st.rot = (st.rot + 90) % 360;
    const img = $("#scv-img");
    img.style.transform = st.rot ? `rotate(${st.rot}deg)` : "";
    $("#scv-rot").classList.toggle("on", !!st.rot);
  };
  $("#scv-enh").onclick = () => {
    const on = $("#scv-img").classList.toggle("enh");
    $("#scv-enh").classList.toggle("on", on);
  };

  $("#scv-ta").addEventListener("scroll", () => {
    const hl = $("#scv-hl");
    if (hl) hl.scrollTop = $("#scv-ta").scrollTop;
  });
  $("#scv-ta").oninput = () => {
    st.dirty = true;
    ind("не сохранено", "unsaved");
    clearTimeout(st.timer);
    st.timer = setTimeout(flush, 900);
    resetFix(); // начали печатать — отмена автоисправления уже не нужна
    clearTimeout(st.metaT);
    st.metaT = setTimeout(refreshMeta, 400);
  };

  /* автоисправление OCR-мусора одной кнопкой (повторное нажатие — отмена) */
  $("#scv-fix").onclick = () => {
    const ta = $("#scv-ta"), b = $("#scv-fix");
    if (ta.disabled) return;
    if (st.fixUndo != null) {
      ta.value = st.fixUndo;
      resetFix();
      toast("Исправления отменены", "ok");
    } else {
      const r = ocrAutofix(ta.value);
      if (!r.count) { toast("Исправлять нечего — текст чистый", "ok"); return; }
      st.fixUndo = ta.value;
      ta.value = r.text;
      b.classList.add("on");
      b.innerHTML = `${SCAN_ICONS.wand}Отменить (${r.count})`;
      toast(`Исправлено мест: ${r.count} — переносы, пробелы, кавычки, тире`, "ok");
    }
    st.dirty = true;
    ind("не сохранено", "unsaved");
    clearTimeout(st.timer);
    st.timer = setTimeout(flush, 900);
    refreshMeta();
  };

  /* подозрительные места: клик по бейджу — прыжки по ним с выделением */
  $("#scv-sus").onclick = () => {
    if (!st.sus.length) return;
    const ta = $("#scv-ta");
    st.susIdx = (st.susIdx + 1) % st.sus.length;
    const pos = st.sus[st.susIdx];
    ta.focus();
    ta.setSelectionRange(Math.max(0, pos - 1), Math.min(ta.value.length, pos + 3));
    const lines = ta.value.slice(0, pos).split("\n").length;
    ta.scrollTop = Math.max(0, (lines - 4) * (parseFloat(getComputedStyle(ta).lineHeight) || 20));
  };

  $("#scv-copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText($("#scv-ta").value);
      toast("Текст страницы скопирован", "ok");
    } catch { toast("Не удалось скопировать", "err"); }
  };

  $("#scv-skip").onclick = () => {
    for (let i = 1; i <= total; i++) {
      const n = ((st.cur - 1 + i) % total) + 1;
      const p = pageMeta(n);
      if (p && !p.verified) { goPage(n); return; }
    }
    toast("Все страницы вычитаны", "ok");
  };

  /* найти и заменить: текущая страница или весь скан */
  $("#scv-frt").onclick = () => {
    const fr = $("#scv-fr");
    fr.hidden = !fr.hidden;
    $("#scv-frt").classList.toggle("on", !fr.hidden);
    if (!fr.hidden) $("#fr-find").focus();
  };
  $("#fr-go").onclick = async () => {
    const find = $("#fr-find").value;
    if (!find) { $("#fr-find").focus(); return; }
    const repl = $("#fr-repl").value;
    const res = $("#fr-res");
    const countIn = t => t.split(find).length - 1;
    if (!$("#fr-all").checked) {
      const ta = $("#scv-ta");
      const c = countIn(ta.value);
      if (!c) { res.textContent = "не найдено"; return; }
      ta.value = ta.value.split(find).join(repl);
      st.dirty = true;
      await flush();
      resetFix(); refreshMeta();
      res.textContent = `заменено: ${c}`;
    } else {
      $("#fr-go").disabled = true;
      await flush();
      let pagesHit = 0, totalHit = 0;
      try {
        for (let n = 1; n <= total; n++) {
          res.textContent = `страница ${n} из ${total}…`;
          const p = await api(`/api/scans/${id}/page/${n}`);
          const c = countIn(p.text);
          if (!c) continue;
          await api(`/api/scans/${id}/page/${n}`, { method: "PUT", body: { text: p.text.split(find).join(repl) } });
          pagesHit++; totalHit += c;
          if (n === st.cur) { $("#scv-ta").value = p.text.split(find).join(repl); resetFix(); refreshMeta(); }
        }
        res.textContent = totalHit ? `заменено: ${totalHit} на ${pagesHit} стр.` : "не найдено";
      } catch (e) { res.textContent = ""; toast(e.message, "err"); }
      $("#fr-go").disabled = false;
    }
  };
  $("#fr-find").onkeydown = $("#fr-repl").onkeydown = e => { if (e.key === "Enter") $("#fr-go").click(); };

  $("#scv-keys").onclick = () => {
    const pop = $("#scv-keys-pop");
    pop.hidden = !pop.hidden;
    $("#scv-keys").classList.toggle("on", !pop.hidden);
  };

  $("#scv-ok").onclick = async () => {
    const p = pageMeta(st.cur);
    const on = !(p && p.verified);
    try {
      await flush();
      await api(`/api/scans/${id}/page/${st.cur}`, { method: "PUT", body: { verified: on } });
      if (p) p.verified = on ? 1 : 0;
      setOkBtn(on);
      const th = $(`#scv-rail .scv-th[data-n="${st.cur}"]`);
      if (th) th.classList.toggle("ok", on);
      const pill = $("#scv-vpill");
      if (pill) pill.textContent = `Вычитано ${vcount()} из ${total}`;
      const vbar = $("#scv-vbar");
      if (vbar) vbar.style.width = (total ? Math.round(vcount() / total * 100) : 0) + "%";
      if (on && st.cur < total) goPage(st.cur + 1); // поток вычитки: сразу к следующей
    } catch (e) { toast(e.message, "err"); }
  };

  const btnBook = $("#scv-openbook");
  if (btnBook) btnBook.onclick = () => { location.hash = `#/book/${s.book_id}`; };
  const btnTo = $("#scv-tobook");
  if (btnTo) btnTo.onclick = () => openScanToBook(s);

  const keyH = e => {
    if (!location.hash.startsWith("#/scan/")) { removeEventListener("keydown", keyH); return; }
    const typing = /^(TEXTAREA|INPUT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && ["s", "S", "ы", "Ы"].includes(e.key)) { e.preventDefault(); flush(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); $("#scv-ok")?.click(); }
    else if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); goPage(st.cur + 1); }
    else if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); goPage(st.cur - 1); }
    // просто стрелки листают книгу, если не печатаем в тексте
    // (PgUp/PgDn оставлены браузеру — ими прокручивается страница сайта)
    else if (!typing && e.key === "ArrowRight") { e.preventDefault(); goPage(st.cur + 1); }
    else if (!typing && e.key === "ArrowLeft") { e.preventDefault(); goPage(st.cur - 1); }
  };
  addEventListener("keydown", keyH);
  // колесо мыши над книгой листает страницы (пока страница вписана целиком);
  // при увеличенном зуме колесо, как обычно, прокручивает изображение
  const iw = $("#scv-imgwrap");
  // колесо мыши прокручивает СТРАНИЦУ САЙТА как обычно (листание книги —
  // кликом по странице, стрелками и клавишами)
  // клик по САМОЙ странице листает книгу: правая половина — вперёд, левая — назад
  // (при увеличенном зуме клики не листают — там прокрутка изображения)
  if (iw) iw.addEventListener("click", e => {
    if (st.zoom !== 100) return;
    const r = iw.getBoundingClientRect();
    if ((e.clientX - r.left) / r.width >= 0.5) goPage(st.cur + 1);
    else goPage(st.cur - 1);
  });
  addEventListener("hashchange", () => flush(), { once: true }); // не потерять правку при уходе

  goPage(1);
}

/* ================= Редактор ================= */
function stopAutosave() {
  if (state.editor?.timer) clearTimeout(state.editor.timer);
  state.editor = null;
}

async function viewEditor(bookId) {
  shell("books", `<div class="empty">Загрузка учебника…</div>`);
  let book;
  try { book = await api(`/api/books/${bookId}`); }
  catch (e) { toast(e.message, "err"); location.hash = "#/books"; return; }
  // книги, созданные до обновления шаблона, дополняем новыми полями
  const c0 = book.content;
  c0.intro = c0.intro || "";
  c0.legend = c0.legend || [];
  normImprint(c0);
  (c0.chapters || []).forEach(ch => (ch.sections || []).forEach(s => {
    s.motivation = s.motivation || ""; s.examples = s.examples || ""; s.summary = s.summary || "";
  }));
  // deep-link на вкладку панели: #/book/16?tab=pipeline
  const tabParam = (location.hash.match(/[?&]tab=(\w+)/) || [])[1];
  const tab = ["preview", "pipeline", "comments", "history", "versions", "members"].includes(tabParam) ? tabParam : "comments";
  state.editor = { book, selected: "titul", dirty: false, timer: null, tab };
  renderEditor();
  loadSidePanel();
}

/* выходные сведения: у старых книг блока нет — дополняем пустыми полями */
function normImprint(c) {
  c.imprint = Object.assign({ udk: "", bbk: "", author_sign: "", authors_line: "", bib_desc: "",
    publisher: "", city: "Бишкек", pages: "", copyright: "", org: "" }, c.imprint || {});
  return c.imprint;
}

function renderEditor() {
  const ed = state.editor;
  const b = ed.book;
  shell("books", `
    <div class="page-head">
      <button class="btn ghost back-btn" id="btn-back" aria-label="К списку учебников">${I.back}</button>
      <div>
        <h1 style="font-family:var(--serif)">${esc(b.title)}</h1>
        <div class="sub">
          <span class="chip ${STATUS_CHIP[b.status] || ""}">${esc(b.status_title)}</span>
          ${b.pipeline ? `<span class="chip ${b.pipeline.overdue ? "red" : "blue"}" id="pipe-chip">${
            b.pipeline.stage
              ? `Конвейер ${b.pipeline.index}/${b.pipeline.total} · ${esc(b.pipeline.title)}${b.pipeline.overdue ? " · просрочен" : ""}`
              : "Конвейер завершён"}</span>` : ""}
          ${b.subject ? `<span class="chip">${esc(b.subject)}</span>` : ""}
          ${b.grade ? `<span class="chip gold">${esc(b.grade)} класс</span>` : ""}
          ${b.unsaved
            ? `<span class="save-ind unsaved" id="save-ind">${I.clock} не сохранено</span>`
            : `<span class="save-ind" id="save-ind">${I.check} сохранено</span>`}
        </div>
      </div>
      <div class="spacer"></div>
      ${b.unsaved ? `
        <button class="btn primary" id="btn-save">${I.save}Сохранить</button>
        <button class="btn" id="btn-read">${I.book}Открыть и править</button>
      ` : `
        ${b.transitions.map(t => `<button class="btn" data-wf="${esc(t.to)}">${I.send}${esc(t.label)}</button>`).join("")}
        ${b.can_edit ? `<button class="btn" id="btn-version">${I.save}Версия</button>` : ""}
        <button class="btn primary" id="btn-read">${I.book}Открыть и править</button>
        <button class="btn" id="btn-export">${I.doc}Экспорт</button>
        <button class="btn" id="btn-print">${I.print}Печать</button>
      `}
    </div>
    ${b.unsaved ? `
    <div class="draft-guide" id="draft-guide">
      <div class="dg-head">${I.book}<span>Что дальше — три шага до готовой книги</span></div>
      <div class="dg-steps">
        <div class="dg-step"><i>1</i><span>Слева — <b>структура книги</b>: выбирайте раздел и заполняйте его</span></div>
        <div class="dg-step"><i>2</i><span>Добавьте <b>главы и параграфы</b> кнопкой «+ Добавить главу»</span></div>
        <div class="dg-step"><i>3</i><span>Нажмите <b>«Сохранить»</b> вверху — книга появится в системе</span></div>
      </div>
      <button class="icon-btn dg-x" id="dg-close" aria-label="Скрыть подсказку">${I.x}</button>
    </div>` : ""}
    <div class="editor-grid">
      <div class="card tree" id="tree"></div>
      <div class="edit-panel" id="edit-panel"></div>
      <div class="side-panel" id="side-panel"></div>
    </div>
  `);
  const dgClose = $("#dg-close");
  if (dgClose) dgClose.onclick = () => $("#draft-guide")?.remove();
  document.body.classList.add("noscroll"); // страница конструктора не листается — скролл внутри колонок
  renderTree();
  renderNodeForm();
  renderSideTabs();
  $("#btn-back").onclick = () => { location.hash = "#/books"; };
  if ($("#btn-read")) $("#btn-read").onclick = openBookReader;
  if ($("#btn-save")) $("#btn-save").onclick = saveNewBook;
  if ($("#btn-export")) $("#btn-export").onclick = doExport;
  if ($("#btn-print")) $("#btn-print").onclick = doPrint;
  if ($("#btn-version")) $("#btn-version").onclick = openVersionModal;
  $$("[data-wf]").forEach(btn => btn.onclick = () => openWorkflowModal(btn.dataset.wf, btn.textContent.trim()));
}

/* ---- полноэкранная читалка/редактор всей книги (постранично, правка прямо в книге) ---- */
function openBookReader() {
  const b = state.editor?.book;
  if (!b) return;
  const canEdit = !!b.can_edit;
  let editing = false;
  let meas = null; // невидимый .rd-page-измеритель (создаётся после вставки оверлея)
  // чтение = страницы фиксированной высоты (пагинация как в печатной книге);
  // правка = один параграф на страницу целиком (зоны contenteditable нельзя рвать)
  const rebuild = () => {
    const raw = buildBookFaces(b, b);
    return editing || !meas ? raw : paginateFaces(raw, meas);
  };
  let pages = [];
  let pos = 0;
  const ov = document.createElement("div");
  ov.className = "reader-overlay";
  ov.innerHTML = `
    <div class="rd-inner">
      <div class="rd-top">
        <div class="rd-toc" id="rd-toc">
          <button type="button" class="btn small rd-toc-trig" aria-haspopup="true" aria-expanded="false">${RT_ICONS.ul}Содержание</button>
          <div class="rd-toc-menu" role="menu" id="rd-toc-menu"></div>
        </div>
        ${canEdit ? `<button class="btn small rd-edit" id="rd-edit">${I.pen}Редактировать</button>` : ""}
        <button class="rd-close" aria-label="Закрыть">${I.x}</button>
      </div>
      ${canEdit ? `<div class="rd-tools" id="rd-tools" hidden>
          ${rtDropdownsHtml()}
          <span class="rt-sep"></span>
          <button type="button" class="rt-btn" data-cmd="bold" aria-label="Жирный"><b>Ж</b></button>
          <button type="button" class="rt-btn" data-cmd="italic" aria-label="Курсив"><i>К</i></button>
          <span class="rt-sep"></span>
          <button type="button" class="rt-btn" data-cmd="justifyLeft" aria-label="По левому краю">${RT_ICONS.left}</button>
          <button type="button" class="rt-btn" data-cmd="justifyCenter" aria-label="По центру">${RT_ICONS.center}</button>
          <button type="button" class="rt-btn" data-cmd="justifyRight" aria-label="По правому краю">${RT_ICONS.right}</button>
          <span class="rt-sep"></span>
          <button type="button" class="rt-btn" data-cmd="insertUnorderedList" aria-label="Маркированный список">${RT_ICONS.ul}</button>
          <button type="button" class="rt-btn" data-cmd="insertOrderedList" aria-label="Нумерованный список">${RT_ICONS.ol}</button>
          <span class="rt-sep"></span>
          <button type="button" class="rt-btn" data-cmd="removeFormat" aria-label="Очистить форматирование">${RT_ERASER}</button>
          <span class="rt-sep"></span>
          <button type="button" class="rt-btn" id="rd-img" aria-label="Вставить картинку на страницу">
            <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
          </button>
          <span class="rt-sep"></span>
          <button type="button" class="btn small rd-upload" id="rd-upload">${I.upload}Загрузить файл</button>
        </div>` : ""}
      <div class="rd-mid">
        <button class="rd-side rd-prev" data-rd="-1" aria-label="Назад">${I.back}</button>
        <div class="rd-page" id="rd-page"></div>
        <button class="rd-side rd-next" data-rd="1" aria-label="Вперёд">${I.chev}</button>
      </div>
      <div class="rd-bar">
        <button type="button" class="rd-bbtn" id="rd-home" aria-label="К обложке">${I.home}</button>
        <div class="rd-progress"><i id="rd-prog"></i></div>
        <span class="rd-pgwrap"><input id="rd-pgin" inputmode="numeric" aria-label="Номер страницы"><span id="rd-pgtotal"></span></span>
        <span class="rd-bsep"></span>
        <button type="button" class="rd-bbtn" id="rd-zoomout" aria-label="Уменьшить масштаб"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg></button>
        <span class="rd-zoomval" id="rd-zoomval">100%</span>
        <button type="button" class="rd-bbtn" id="rd-zoomin" aria-label="Увеличить масштаб">${I.plus}</button>
        <button type="button" class="rd-bbtn" id="rd-fs" aria-label="Во весь экран"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg></button>
        ${canEdit ? `<span class="save-ind rd-save ${state.editor.dirty ? "unsaved" : ""}" id="rd-save">${state.editor.dirty ? I.clock + " не сохранено" : I.check + " сохранено"}</span>` : ""}
      </div>
    </div>`;
  document.body.appendChild(ov);
  const page = ov.querySelector("#rd-page");
  const pgIn = ov.querySelector("#rd-pgin"), pgTotal = ov.querySelector("#rd-pgtotal");
  meas = document.createElement("div");
  meas.className = "rd-page rd-meas";
  ov.querySelector(".rd-mid").appendChild(meas);
  pages = rebuild();

  const secOf = () => {
    const el = page.querySelector("[data-sec]");
    if (!el) return null;
    const [chId, sId] = el.dataset.sec.split(":");
    return b.content.chapters.find(x => x.id === chId)?.sections.find(x => x.id === sId) || null;
  };
  const saveZones = () => {
    const s = secOf(); if (!s) return;
    const t = page.querySelector('[data-edit="title"]'); if (t) s.title = t.textContent.trim();
    const bz = page.querySelector('[data-edit="body"]'); if (bz) s.body = bz.innerHTML.trim();
    markDirty(); renderTreeSoon();
  };
  const applyEdit = () => {
    const secEl = page.querySelector("[data-sec]");
    const on = editing && !!secEl;
    ov.classList.toggle("rd-editing", on);
    const tools = ov.querySelector("#rd-tools"); if (tools) tools.hidden = !editing;
    if (!on) return;
    const bz = page.querySelector('[data-edit="body"]');
    if (bz) { const rt = bz.querySelector(".bkp-rt"); if (rt) bz.innerHTML = rt.innerHTML; else if (bz.querySelector(".bkp-mut")) bz.innerHTML = ""; }
    page.querySelectorAll("[data-edit]").forEach(z => {
      z.setAttribute("contenteditable", "true");
      z.setAttribute("spellcheck", "false"); // без красных волн проверки орфографии на странице книги
      z.oninput = saveZones;
    });
  };
  const render = () => {
    page.innerHTML = pages[pos];
    page.classList.remove("rd-flip"); void page.offsetWidth; page.classList.add("rd-flip");
    pgIn.value = pos + 1;
    pgTotal.textContent = `/ ${pages.length}`;
    ov.querySelector(".rd-prev").disabled = pos === 0;
    ov.querySelector(".rd-next").disabled = pos === pages.length - 1;
    const prog = ov.querySelector("#rd-prog");
    if (prog) prog.style.width = (pages.length > 1 ? (pos / (pages.length - 1)) * 100 : 100) + "%";
    if (tocWrap.classList.contains("open")) renderToc();
    applyEdit();
  };
  const go = d => { pages = rebuild(); pos = Math.max(0, Math.min(pages.length - 1, pos + d)); render(); };
  const close = () => { document.removeEventListener("keydown", key); removeEventListener("hashchange", onHash); ov.remove(); };
  const onHash = () => close(); // ушли на другой экран (назад/меню) — читалка не должна висеть поверх
  addEventListener("hashchange", onHash);

  /* оглавление: список всех страниц книги с переходом в один клик */
  const tocWrap = ov.querySelector("#rd-toc");
  const tocTrig = tocWrap.querySelector(".rd-toc-trig");
  const tocMenu = tocWrap.querySelector("#rd-toc-menu");
  const tocItems = () => pages.map((html, i) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    const el = t.content.firstElementChild;
    const cl = el.classList;
    if (el.dataset.cont) return null; // продолжения страниц в оглавлении не дублируем
    if (cl.contains("bkp-cvr")) return { i, title: "Обложка", kind: "svc" };
    if (cl.contains("bkp-titul")) return { i, title: "Титульный лист", kind: "svc" };
    if (cl.contains("bki2")) return { i, title: "Выходные данные", kind: "svc" };
    if (cl.contains("bks3")) return { i, title: "Государственные символы", kind: "svc" };
    if (cl.contains("bkanth")) return { i, title: "Государственный гимн", kind: "svc" };
    if (cl.contains("bkintro")) return { i, title: "Введение", kind: "svc" };
    if (cl.contains("bkp-howto")) return { i, title: "Условные обозначения", kind: "svc" };
    if (cl.contains("bkp-toc")) return { i, title: "Содержание", kind: "svc" };
    if (cl.contains("bkp-blank")) return { i, title: "Пустая страница", kind: "svc" };
    if (cl.contains("bkp-back")) return { i, title: "Задняя обложка", kind: "svc" };
    // отдельной страницы главы больше нет: глава начинается сверху первой страницы раздела
    if (el.querySelector(".bkch-head")) return { i, title: (el.querySelector(".bkch-head h3")?.textContent || "Глава").trim(), num: (el.querySelector(".bkch-num")?.textContent || "").trim(), kind: "chap" };
    if (el.dataset.sec) return { i, title: (el.querySelector("h4")?.textContent || "Параграф").trim(), kind: "sec" };
    return { i, title: (el.querySelector("h4")?.textContent || `Страница ${i}`).trim(), kind: "svc" };
  });
  const renderToc = () => {
    tocMenu.innerHTML = tocItems().filter(Boolean).map(it => `
      <button type="button" class="rd-toc-item ${it.kind} ${it.i === pos ? "current" : ""}" data-goto="${it.i}" role="menuitem">
        ${it.kind === "chap" && it.num ? `<span class="tocn">${esc(it.num)}</span>` : ""}
        <span class="toct">${esc(it.title)}</span>
        ${it.i > 0 && it.i < pages.length - 1 ? `<span class="tocp">${it.i}</span>` : ""}
      </button>`).join("");
    tocMenu.querySelectorAll("[data-goto]").forEach(btn => btn.onclick = () => { pos = +btn.dataset.goto; setToc(false); render(); });
    const cur = tocMenu.querySelector(".current");
    if (cur) cur.scrollIntoView({ block: "nearest" });
  };
  const setToc = on => {
    if (on) { pages = rebuild(); pos = Math.min(pos, pages.length - 1); renderToc(); }
    tocWrap.classList.toggle("open", on);
    tocTrig.setAttribute("aria-expanded", on ? "true" : "false");
  };
  tocTrig.onclick = () => setToc(!tocWrap.classList.contains("open"));
  ov.addEventListener("mousedown", e => { if (!tocWrap.contains(e.target)) setToc(false); });

  /* клик по параграфу на странице главы или главе в «Содержании» — переход */
  page.addEventListener("click", e => {
    const sp = e.target.closest("[data-jump],[data-jumpch]");
    if (!sp) return;
    pages = rebuild();
    const idx = sp.dataset.jumpch
      ? pages.findIndex(p => p.includes(`data-chap="${sp.dataset.jumpch}"`))
      : pages.findIndex(p => p.includes(`data-sec="${sp.dataset.jump}"`));
    if (idx > -1) { pos = idx; render(); }
  });

  /* панель как на kitep.edu.kg: домой, номер страницы, масштаб, весь экран */
  ov.querySelector("#rd-home").onclick = () => { pos = 0; render(); };
  const goPage = () => {
    const n = parseInt(pgIn.value, 10);
    if (!isNaN(n)) { pages = rebuild(); pos = Math.max(0, Math.min(pages.length - 1, n - 1)); }
    render(); pgIn.blur();
  };
  pgIn.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") goPage(); if (e.key === "Escape") { pgIn.value = pos + 1; pgIn.blur(); } });
  pgIn.addEventListener("blur", () => { if (+pgIn.value !== pos + 1) goPage(); });
  let zoom = 1;
  const zoomVal = ov.querySelector("#rd-zoomval");
  const setZoom = z => {
    zoom = Math.max(.7, Math.min(1.6, Math.round(z * 100) / 100));
    page.style.zoom = zoom;
    zoomVal.textContent = Math.round(zoom * 100) + "%";
    ov.classList.toggle("rd-zoomed", zoom > 1);
  };
  ov.querySelector("#rd-zoomin").onclick = () => setZoom(zoom + .15);
  ov.querySelector("#rd-zoomout").onclick = () => setZoom(zoom - .15);
  ov.querySelector("#rd-fs").onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else ov.requestFullscreen().catch(() => {});
  };
  const key = e => {
    if (document.activeElement && document.activeElement.isContentEditable) {
      if (e.key === "Escape") document.activeElement.blur();
      return;
    }
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "+" || e.key === "=") setZoom(zoom + .15);
    else if (e.key === "-") setZoom(zoom - .15);
  };
  // форматирование
  const zoneOf = () => { // зона, где стоит курсор (заголовок или тело); по умолчанию — тело
    const sel = getSelection();
    const n = sel && sel.anchorNode;
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    return (el && el.closest("[data-edit]")) || page.querySelector('[data-edit="body"]');
  };
  const runCmd = (cmd, val) => { const z = zoneOf(); if (z) rtExec(z, cmd, val, saveZones); };
  ov.querySelectorAll("#rd-tools .rt-btn[data-cmd]").forEach(btn => btn.addEventListener("mousedown", e => { e.preventDefault(); runCmd(btn.dataset.cmd, null); }));
  const tools = ov.querySelector("#rd-tools");
  if (tools) bindRtDropdowns(tools, runCmd);
  // переключатель режима
  const editBtn = ov.querySelector("#rd-edit");
  if (editBtn) editBtn.onclick = () => {
    // при смене режима раскладка страниц другая — остаёмся на том же параграфе
    const secMatch = (pages[pos] || "").match(/data-sec="([^"]+)"/);
    editing = !editing;
    ov.classList.toggle("rd-editmode", editing);
    editBtn.innerHTML = editing ? `${I.check}Готово` : `${I.pen}Редактировать`;
    editBtn.classList.toggle("primary", editing);
    pages = rebuild();
    if (secMatch) {
      const i = pages.findIndex(p => p.includes(`data-sec="${secMatch[1]}"`));
      if (i > -1) pos = i;
    }
    pos = Math.max(0, Math.min(pages.length - 1, pos));
    render();
    if (editing && !page.querySelector("[data-sec]")) toast("Пролистайте к параграфу — там можно писать и править", "ok");
  };
  // картинка НА СТРАНИЦУ: загрузка файла → <figure> в текст параграфа у курсора
  const imgBtn2 = ov.querySelector("#rd-img");
  if (imgBtn2) imgBtn2.onclick = () => {
    const z = zoneOf();
    if (!z || z.dataset.edit !== "body") { toast("Поставьте курсор в текст параграфа — картинка встанет туда", "err"); return; }
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".jpg,.jpeg,.png,.webp,image/*";
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      const fd = new FormData();
      fd.append("file", f);
      try {
        const r = await api(`/api/books/${b.id}/image`, { method: "POST", body: fd });
        const html = `<figure class='bkp-fig'><img src='${r.url}' alt=''></figure><p></p>`;
        const sel = getSelection();
        const inZone = sel.rangeCount && z.contains(sel.getRangeAt(0).startContainer);
        if (inZone) { z.focus(); document.execCommand("insertHTML", false, html); }
        else z.insertAdjacentHTML("beforeend", html);
        saveZones();
        toast("Картинка добавлена на страницу", "ok");
      } catch (e) { toast(e.message, "err"); }
    };
    inp.click();
  };

  // загрузка файла в текущий параграф
  const upBtn = ov.querySelector("#rd-upload");
  if (upBtn) upBtn.onclick = () => {
    const s = secOf();
    if (!s) { toast("Откройте страницу параграфа", "err"); return; }
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".txt,.html,.htm,.md,text/plain";
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const text = await f.text();
        const isHtml = /<\/?[a-z][\s\S]*>/i.test(text);
        s.body = isHtml ? text.replace(/<script[\s\S]*?<\/script>/gi, "")
          : text.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
        markDirty(); pages = rebuild(); render();
        toast("Текст загружен в параграф", "ok");
      } catch (e) { toast("Не удалось прочитать файл", "err"); }
    };
    inp.click();
  };
  ov.querySelectorAll("[data-rd]").forEach(btn => btn.onclick = () => go(+btn.dataset.rd));
  ov.querySelector(".rd-close").onclick = close;
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  document.addEventListener("keydown", key);
  render();
}

/* ---- дерево структуры ---- */
function renderTree() {
  const ed = state.editor;
  const c = ed.book.content;
  const sel = id => (ed.selected === id ? "selected" : "");
  let html = `
    <div class="tsec">Служебные разделы</div>
    <div class="tnode ${sel("titul")}" data-n="titul">${I.doc}<span class="grow">Титульный лист</span></div>
    <div class="tnode ${sel("imprint")}" data-n="imprint">${I.doc}<span class="grow">Выходные сведения</span></div>
    <div class="tnode ${sel("people")}" data-n="people">${I.users}<span class="grow">Авторы и коллектив</span></div>
    <div class="tnode ${sel("state")}" data-n="state">${I.flag}<span class="grow">Государственные страницы</span></div>
    <div class="tnode ${sel("annotation")}" data-n="annotation">${I.doc}<span class="grow">Аннотация</span></div>
    <div class="tnode ${sel("intro")}" data-n="intro">${I.send}<span class="grow">Как пользоваться книгой</span></div>
    <div class="tnode ${sel("legend")}" data-n="legend">${I.check}<span class="grow">Условные обозначения</span></div>
    <div class="tsec">Содержание</div>`;
  c.chapters.forEach((ch, ci) => {
    html += `<div class="tnode ${sel("ch:" + ch.id)}" data-n="ch:${ch.id}">${I.book}
      <span class="grow">${esc(ch.title || "Глава")}</span>
      ${state.editor.book.can_edit ? `<button class="mini" data-addsec="${ch.id}" aria-label="Добавить параграф">${I.plus}</button>` : ""}
    </div>`;
    ch.sections.forEach(s => {
      html += `<div class="tnode child ${sel("sec:" + ch.id + ":" + s.id)}" data-n="sec:${ch.id}:${s.id}">
        ${I.chev}<span class="grow">${esc(s.title || "Параграф")}</span></div>`;
    });
  });
  if (state.editor.book.can_edit) {
    html += `<div class="tree-add"><button class="btn small ghost" id="add-chapter">${I.plus}Добавить главу</button></div>`;
  }
  html += `
    <div class="tsec">Аппарат издания</div>
    <div class="tnode ${sel("glossary")}" data-n="glossary">${I.doc}<span class="grow">Словарь терминов</span></div>
    <div class="tnode ${sel("biblio")}" data-n="biblio">${I.doc}<span class="grow">Список литературы</span></div>
    <div class="tnode ${sel("append")}" data-n="append">${I.doc}<span class="grow">Доп. материалы</span></div>
    <div class="tnode ${sel("qr")}" data-n="qr">${I.doc}<span class="grow">QR-коды</span></div>`;
  $("#tree").innerHTML = html;

  $$("#tree .tnode").forEach(n => n.addEventListener("click", (e) => {
    if (e.target.closest(".mini")) return;
    state.editor.selected = n.dataset.n;
    renderTree(); renderNodeForm();
  }));
  $$("#tree [data-addsec]").forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const ch = state.editor.book.content.chapters.find(x => x.id === btn.dataset.addsec);
    const s = { id: uid(), kind: "paragraph", title: `§ ${ch.sections.length + 1}. Новый параграф`, goals: "", motivation: "", body: "", examples: "", summary: "", tasks: "", homework: "", questions: "", test: "" };
    ch.sections.push(s);
    state.editor.selected = `sec:${ch.id}:${s.id}`;
    markDirty(); renderTree(); renderNodeForm();
  });
  if ($("#add-chapter")) $("#add-chapter").onclick = () => {
    const c2 = state.editor.book.content;
    const ch = { id: uid(), title: `Глава ${c2.chapters.length + 1}`, sections: [] };
    c2.chapters.push(ch);
    state.editor.selected = `ch:${ch.id}`;
    markDirty(); renderTree(); renderNodeForm();
  };
}

/* ---- поля формы ---- */
function fld(label, name, value, opts = {}) {
  const ro = state.editor.book.can_edit ? "" : "disabled";
  if (opts.area) {
    return `<div class="field"><label>${esc(label)}</label>
      <textarea data-f="${name}" ${ro} rows="${opts.rows || 4}" placeholder="${esc(opts.ph || "")}">${esc(value)}</textarea>
      ${opts.note ? `<div class="note">${esc(opts.note)}</div>` : ""}</div>`;
  }
  return `<div class="field"><label>${esc(label)}</label>
    <input data-f="${name}" ${ro} value="${esc(value)}" placeholder="${esc(opts.ph || "")}">
    ${opts.note ? `<div class="note">${esc(opts.note)}</div>` : ""}</div>`;
}

/* ---- редактор написания книги (форматирование текста) ---- */
const RT_ICONS = {
  left:   '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h14"/></svg>',
  center: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 12h10M6 18h12"/></svg>',
  right:  '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M10 12h10M6 18h14"/></svg>',
  ul: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none"/></svg>',
  ol: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h12M8 12h12M8 18h12M3.4 4.6h1.2V8M3 8h2"/></svg>',
};
/* наборы для оформления материала: размеры, шрифты, цвета текста и маркера */
const RT_SIZES = [["2", "Мелкий"], ["3", "Обычный"], ["5", "Крупный"], ["6", "Заголовок"]];
const RT_FONTS = [
  { v: "Lato, 'Segoe UI', sans-serif", t: "Книжный (Lato)" },
  { v: "Georgia, 'Times New Roman', serif", t: "С засечками" },
  { v: "'Segoe Print', 'Comic Sans MS', cursive", t: "Рукописный" },
  { v: "Consolas, 'Courier New', monospace", t: "Моноширинный" },
];
const RT_TEXT_COLORS = ["#2E3A52", "#DC2626", "#EA580C", "#B45309", "#16A34A", "#0D9488", "#2563EB", "#7C3AED", "#DB2777", "#64748B"];
const RT_MARK_COLORS = ["#FEF9C3", "#DCFCE7", "#DBEAFE", "#FCE7F3"];
const RT_ERASER = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 19"/><path d="M22 21H7"/><path d="m5 12 6.5 6.5"/></svg>';

/* выпадашки Размер / Шрифт / Цвет — общие для конструктора и читалки */
function rtDropdownsHtml() {
  return `
    <div class="rt-dd rt-dd-size">
      <button type="button" class="rt-dd-trig" aria-label="Размер текста" aria-haspopup="true" aria-expanded="false"><span>Размер</span>${CHEV_DOWN}</button>
      <div class="rt-dd-menu" role="menu">
        ${RT_SIZES.map(([v, t]) => `<button type="button" class="rt-opt rt-opt-s${v}" data-size="${v}" role="menuitem"><span>${t}</span></button>`).join("")}
      </div>
    </div>
    <div class="rt-dd rt-dd-font">
      <button type="button" class="rt-dd-trig" aria-label="Шрифт" aria-haspopup="true" aria-expanded="false"><span>Шрифт</span>${CHEV_DOWN}</button>
      <div class="rt-dd-menu" role="menu">
        ${RT_FONTS.map(f => `<button type="button" class="rt-opt" data-font="${esc(f.v)}" style="font-family:${esc(f.v)}" role="menuitem"><span>${f.t}</span></button>`).join("")}
      </div>
    </div>
    <div class="rt-dd rt-dd-color">
      <button type="button" class="rt-dd-trig" aria-label="Цвет текста и маркер" aria-haspopup="true" aria-expanded="false"><span class="rt-cdot"></span><span>Цвет</span>${CHEV_DOWN}</button>
      <div class="rt-dd-menu rt-cmenu">
        <b>Цвет текста</b>
        <div class="rt-swatches">
          ${RT_TEXT_COLORS.map(c => `<button type="button" class="rt-sw" data-fore="${c}" style="--sw:${c}" aria-label="Цвет текста ${c}"></button>`).join("")}
        </div>
        <b>Выделение маркером</b>
        <div class="rt-swatches">
          ${RT_MARK_COLORS.map(c => `<button type="button" class="rt-sw" data-mark="${c}" style="--sw:${c}" aria-label="Маркер ${c}"></button>`).join("")}
          <button type="button" class="rt-sw rt-sw-none" data-mark="none" aria-label="Убрать выделение"></button>
        </div>
      </div>
    </div>`;
}

function bindRtDropdowns(scope, run) {
  const dds = [...scope.querySelectorAll(".rt-dd")];
  const closeAll = ex => $$(".rt-dd.open").forEach(d => {
    if (d === ex) return;
    d.classList.remove("open");
    d.querySelector(".rt-dd-trig").setAttribute("aria-expanded", "false");
  });
  dds.forEach(dd => {
    const trig = dd.querySelector(".rt-dd-trig");
    const setOpen = on => { closeAll(dd); dd.classList.toggle("open", on); trig.setAttribute("aria-expanded", on ? "true" : "false"); };
    // mousedown + preventDefault — не терять выделение в contenteditable
    trig.addEventListener("mousedown", e => { e.preventDefault(); setOpen(!dd.classList.contains("open")); });
    const opt = (sel, fn) => dd.querySelectorAll(sel).forEach(o =>
      o.addEventListener("mousedown", e => { e.preventDefault(); fn(o); setOpen(false); }));
    // выбранный пункт отмечается галочкой, подпись кнопки меняется — видно, что выбор применился
    const mark = o => {
      dd.querySelectorAll(".rt-opt").forEach(x => x.classList.toggle("cur", x === o));
      const t = (o.querySelector("span") || o).textContent.trim();
      const lab = dd.querySelector(".rt-dd-trig span:not(.rt-cdot)");
      if (lab && t) lab.textContent = t;
    };
    opt("[data-size]", o => { run("fontSize", o.dataset.size); mark(o); });
    opt("[data-font]", o => {
      run("fontName", o.dataset.font);
      mark(o);
      toast(`Шрифт «${(o.querySelector("span") || o).textContent.trim()}» применён`, "ok");
    });
    opt("[data-fore]", o => {
      run("foreColor", o.dataset.fore);
      const dot = dd.querySelector(".rt-cdot");
      if (dot) dot.style.background = o.dataset.fore;
    });
    opt("[data-mark]", o => run("hiliteColor", o.dataset.mark === "none" ? "transparent" : o.dataset.mark));
  });
  if (!document._rtDDClose) {
    document._rtDDClose = true;
    document.addEventListener("mousedown", e => { if (!e.target.closest(".rt-dd")) closeAll(null); });
  }
}

function richField(label, name, value, opts = {}) {
  const editable = state.editor.book.can_edit;
  return `<div class="field">
    <label>${esc(label)}</label>
    <div class="rt-wrap">
      <div class="rt-toolbar">
        ${rtDropdownsHtml()}
        <span class="rt-sep"></span>
        <button type="button" class="rt-btn" data-cmd="bold" aria-label="Жирный"><b>Ж</b></button>
        <button type="button" class="rt-btn" data-cmd="italic" aria-label="Курсив"><i>К</i></button>
        <span class="rt-sep"></span>
        <button type="button" class="rt-btn" data-cmd="justifyLeft" aria-label="По левому краю">${RT_ICONS.left}</button>
        <button type="button" class="rt-btn" data-cmd="justifyCenter" aria-label="По центру">${RT_ICONS.center}</button>
        <button type="button" class="rt-btn" data-cmd="justifyRight" aria-label="По правому краю">${RT_ICONS.right}</button>
        <span class="rt-sep"></span>
        <button type="button" class="rt-btn" data-cmd="insertUnorderedList" aria-label="Маркированный список">${RT_ICONS.ul}</button>
        <button type="button" class="rt-btn" data-cmd="insertOrderedList" aria-label="Нумерованный список">${RT_ICONS.ol}</button>
        <span class="rt-sep"></span>
        <button type="button" class="rt-btn" data-img aria-label="Вставить картинку">
          <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
        </button>
        <span class="rt-sep"></span>
        <button type="button" class="rt-btn" data-cmd="removeFormat" aria-label="Очистить форматирование">${RT_ERASER}</button>
      </div>
      <div class="rt-area" data-f="${name}" data-ph="${esc(opts.ph || "")}" spellcheck="false" ${editable ? "contenteditable" : ""}>${value || ""}</div>
    </div>
    ${opts.note ? `<div class="note">${esc(opts.note)}</div>` : ""}
  </div>`;
}
/* Шрифт/размер/цвет: «нажал — переключилось», без смешивания.
   Без выделения (или при выделении всего текста) новый выбор применяется КО ВСЕМУ полю,
   причём СНАЧАЛА снимаются прежние шрифтовые обёртки — иначе браузерный execCommand
   оставляет вложенные span'ы, внутренние побеждают и «шрифт не переключается».
   С частичным выделением — применяется только к выделенному. */
const RT_APPLY_ALL = ["fontName", "fontSize", "foreColor"];
const RT_SIZE_PX = { 1: "11px", 2: "12.5px", 3: "15px", 4: "17px", 5: "19px", 6: "24px", 7: "30px" };

function applyWholeField(area, cmd, val) {
  const prop = cmd === "fontName" ? "fontFamily" : cmd === "fontSize" ? "fontSize" : "color";
  const cssVal = cmd === "fontSize" ? (RT_SIZE_PX[val] || "15px") : val;
  // пустое поле: ставим styled-span с курсором внутри — всё, что напечатают, будет этим шрифтом
  if (!area.textContent.trim()) {
    const sp = document.createElement("span");
    sp.style[prop] = cssVal;
    sp.appendChild(document.createTextNode("​"));
    area.textContent = "";
    area.appendChild(sp);
    const r = document.createRange();
    r.setStart(sp.firstChild, 1);
    r.collapse(true);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    return;
  }
  // 1) снять это свойство со всех прежних обёрток внутри поля
  area.querySelectorAll("[style]").forEach(el => {
    el.style[prop] = "";
    if (!el.getAttribute("style")) el.removeAttribute("style");
  });
  area.querySelectorAll("font").forEach(f => {
    if (cmd === "fontName") f.removeAttribute("face");
    if (cmd === "fontSize") f.removeAttribute("size");
    if (cmd === "foreColor") f.removeAttribute("color");
  });
  // 2) применить новый выбор к верхнему уровню — каскадом накрывает всё поле
  [...area.childNodes].forEach(n => {
    if (n.nodeType === 1) n.style[prop] = cssVal;
    else if (n.nodeType === 3 && n.textContent.trim()) {
      const sp = document.createElement("span");
      sp.style[prop] = cssVal;
      n.parentNode.insertBefore(sp, n);
      sp.appendChild(n);
    }
  });
}

/* Ж/К/Ч без выделения = «один активный стиль на всё поле»: нажал — включился ОН,
   прежний стиль снялся (и с текста, и с кнопок); повторный клик — выключить. */
const RT_TOGGLE_PROPS = { bold: ["fontWeight", "700"], italic: ["fontStyle", "italic"], underline: ["textDecoration", "underline"] };

function rtFieldHasToggle(area, cmd) {
  const [prop] = RT_TOGGLE_PROPS[cmd];
  const tags = { bold: "b, strong", italic: "i, em", underline: "u" }[cmd];
  if (area.querySelector(tags)) return true;
  return [...area.querySelectorAll("[style]")].some(el => {
    const v = el.style[prop];
    return v && v !== "normal" && v !== "none" && v !== "400";
  });
}

function applyToggleWholeField(area, cmd) {
  const [prop, onVal] = RT_TOGGLE_PROPS[cmd];
  const wasOn = rtFieldHasToggle(area, cmd);
  // 1) снять ВСЕ стили начертания со всего поля (теги и инлайн)
  area.querySelectorAll("b, strong, i, em, u").forEach(el => {
    const p = el.parentNode;
    while (el.firstChild) p.insertBefore(el.firstChild, el);
    p.removeChild(el);
  });
  area.querySelectorAll("[style]").forEach(el => {
    el.style.fontWeight = ""; el.style.fontStyle = ""; el.style.textDecoration = "";
    if (!el.getAttribute("style")) el.removeAttribute("style");
  });
  if (wasOn) return; // повторный клик по активной кнопке = просто выключили
  // 2) включаем нажатый стиль на всё поле
  if (!area.textContent.trim()) { // пустое поле: печать пойдёт этим стилем
    const sp = document.createElement("span");
    sp.style[prop] = onVal;
    sp.appendChild(document.createTextNode("​"));
    area.textContent = "";
    area.appendChild(sp);
    const r = document.createRange();
    r.setStart(sp.firstChild, 1);
    r.collapse(true);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    return;
  }
  [...area.childNodes].forEach(n => {
    if (n.nodeType === 1) n.style[prop] = onVal;
    else if (n.nodeType === 3 && n.textContent.trim()) {
      const sp = document.createElement("span");
      sp.style[prop] = onVal;
      n.parentNode.insertBefore(sp, n);
      sp.appendChild(n);
    }
  });
}

function rtExec(area, cmd, val, after) {
  const sel = getSelection();
  const collapsed = !sel || sel.rangeCount === 0 || sel.isCollapsed;
  const norm = s => s.replace(/\s+/g, " ").trim();
  const allSelected = !collapsed && norm(sel.toString()) === norm(area.textContent); // Ctrl+A
  const whole = collapsed || allSelected;
  if (RT_APPLY_ALL.includes(cmd) && whole) {
    applyWholeField(area, cmd, val);
    if (after) after();
    setTimeout(refreshRtStates, 30);
    return;
  }
  if (RT_TOGGLE_PROPS[cmd] && whole) {
    applyToggleWholeField(area, cmd);
    if (after) after();
    setTimeout(refreshRtStates, 30);
    return;
  }
  try { document.execCommand("styleWithCSS", false, true); } catch (e) {}
  document.execCommand(cmd, false, val);
  if (after) after();
  setTimeout(refreshRtStates, 30);
}

function bindRichToolbars(panel) {
  $$(".rt-toolbar", panel).forEach(tb => {
    const area = tb.parentElement.querySelector(".rt-area");
    if (!area || !area.isContentEditable) return;
    const run = (cmd, val) => {
      area.focus();
      rtExec(area, cmd, val, () => area.dispatchEvent(new Event("input", { bubbles: true })));
    };
    tb.querySelectorAll(".rt-btn[data-cmd]").forEach(btn =>
      btn.addEventListener("mousedown", e => { e.preventDefault(); run(btn.dataset.cmd, null); }));
    /* картинка в текст книги: файл → загрузка на сервер → <figure> в месте курсора
       (если курсор вне поля после диалога выбора файла — в конец текста) */
    const imgBtn = tb.querySelector("[data-img]");
    if (imgBtn) imgBtn.addEventListener("click", () => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = ".jpg,.jpeg,.png,.webp,image/*";
      inp.onchange = async () => {
        const f = inp.files[0];
        if (!f) return;
        const fd = new FormData();
        fd.append("file", f);
        imgBtn.disabled = true;
        try {
          const r = await api(`/api/books/${state.editor.book.id}/image`, { method: "POST", body: fd });
          const html = `<figure class='bkp-fig'><img src='${r.url}' alt=''></figure><p></p>`;
          const sel = getSelection();
          const inArea = sel.rangeCount && area.contains(sel.getRangeAt(0).startContainer);
          if (inArea) { area.focus(); document.execCommand("insertHTML", false, html); }
          else area.insertAdjacentHTML("beforeend", html);
          area.dispatchEvent(new Event("input", { bubbles: true })); // автосейв
          toast("Картинка добавлена в текст", "ok");
        } catch (e) { toast(e.message, "err"); }
        imgBtn.disabled = false;
      };
      inp.click();
    });
    bindRtDropdowns(tb, run);
  });
}

/* Подсветка включённых режимов (Ж/К/Ч/З) во всех панелях форматирования:
   иначе случайно включённый «Зачёркнутый» выглядит как «сломанный шрифт». */
const RT_STATE_CMDS = ["bold", "italic"];
function refreshRtStates() {
  $$(".rt-toolbar, .rd-tools").forEach(tb => {
    if (tb.hidden || !tb.offsetParent) return;
    tb.querySelectorAll(".rt-btn[data-cmd]").forEach(b => {
      if (!RT_STATE_CMDS.includes(b.dataset.cmd)) return;
      let on = false;
      try { on = document.queryCommandState(b.dataset.cmd); } catch (e) {}
      b.classList.toggle("on", on);
    });
  });
}
document.addEventListener("selectionchange", () => {
  clearTimeout(refreshRtStates._t);
  refreshRtStates._t = setTimeout(refreshRtStates, 120);
});
/* текст параграфа для читалки/экспорта: HTML из редактора отдаём как есть, обычный текст — с переносами */
function richBody(s) {
  s = String(s || "").trim();
  if (!s) return "";
  const isHtml = /<\/?[a-z][\s\S]*>/i.test(s);
  const html = isHtml ? s.replace(/<script[\s\S]*?<\/script>/gi, "") : esc(s).replace(/\n+/g, "<br>");
  return `<div class="bkp-rt">${html}</div>`;
}

function listEditor(id, items, ph) {
  const ro = state.editor.book.can_edit;
  return `<div class="list-editor" id="${id}">
    ${items.map((v, i) => `
      <div class="li-row">
        <input data-li="${i}" value="${esc(v)}" placeholder="${esc(ph)}" ${ro ? "" : "disabled"}>
        ${ro ? `<button class="icon-btn" data-del="${i}" aria-label="Удалить">${I.trash}</button>` : ""}
      </div>`).join("")}
    ${ro ? `<div><button class="btn small ghost" data-add="1">${I.plus}Добавить</button></div>` : ""}
  </div>`;
}

function bindListEditor(id, arrGetter) {
  const root = $("#" + id);
  if (!root) return;
  root.addEventListener("input", e => {
    const i = e.target.dataset.li;
    if (i !== undefined) { arrGetter()[+i] = e.target.value; markDirty(); }
  });
  root.addEventListener("click", e => {
    const del = e.target.closest("[data-del]");
    const add = e.target.closest("[data-add]");
    if (del) { arrGetter().splice(+del.dataset.del, 1); markDirty(); renderNodeForm(); }
    if (add) { arrGetter().push(""); markDirty(); renderNodeForm(); }
  });
}

function renderNodeForm() {
  const ed = state.editor;
  const c = ed.book.content;
  const sel = ed.selected;
  const panel = $("#edit-panel");
  let html = "";

  if (sel === "titul") {
    const t = c.titul;
    html = `<div class="card"><h2 style="margin-top:0">Титульный лист</h2>
      ${fld("Название учебника", "titul.title", t.title)}
      ${fld("Подзаголовок", "titul.subtitle", t.subtitle, { ph: "Учебник для 5 класса общеобразовательной школы" })}
      <div class="row2">${fld("Предмет", "titul.subject", t.subject)}${fld("Класс", "titul.grade", t.grade)}</div>
      <div class="row2">${fld("Язык обучения", "titul.language", t.language)}${fld("Год издания", "titul.year", t.year)}</div>
      <div class="row2">${fld("Издательство", "titul.publisher", t.publisher)}${fld("ISBN", "titul.isbn", t.isbn)}</div>
      ${fld("Гриф Министерства просвещения КР", "titul.grif", t.grif, { ph: "Рекомендовано Министерством просвещения КР (приказ № …)", note: "Заполняется после прохождения экспертизы" })}
      ${ed.book.unsaved ? "" : `
      <div class="field"><label>Фото на обложке</label>
        <div class="cov-row">
          ${ed.book.cover_url ? `<img class="cov-thumb" src="${esc(ed.book.cover_url)}" alt="Фото обложки">` : ""}
          ${ed.book.can_edit ? `
            <button type="button" class="btn small" id="cov-up">${I.upload}${ed.book.cover_url ? "Заменить" : "Добавить фото"}</button>
            ${ed.book.cover_url ? `<button type="button" class="btn small ghost" id="cov-del">${I.trash}Убрать</button>` : ""}
            <input type="file" id="cov-file" accept=".jpg,.jpeg,.png,.webp" hidden>` : ""}
        </div>
        <div class="note">JPG, PNG или WebP до 8 МБ — фото ляжет фоном обложки в витрине и читалке</div>
      </div>`}
    </div>`;
  } else if (sel === "imprint") {
    const t = c.titul;
    const imp = normImprint(c);
    const anames = arr => (arr || []).map(x => typeof x === "string" ? x : (x && x.name) || "").filter(Boolean);
    const autoAuthors = [...anames(c.people?.authors), ...anames(c.people?.coauthors)].join(", ");
    const req = v => String(v || "").trim() ? "" : `<div class="imp-req">${I.alert}требует заполнения / проверки редактором</div>`;
    html = `<div class="card"><h2 style="margin-top:0">Выходные сведения <span class="h2-note">оборот титульного листа</span></h2>
      <div class="note" style="margin-bottom:12px">Библиографическое и выходное оформление по структуре официального
        учебного издания. УДК, ББК, авторский знак и ISBN система не придумывает — их присваивают издательство
        и Книжная палата, впишите официальные значения. Пустые поля будут помечены в книге как требующие заполнения.</div>
      <div class="row2">
        <div>${fld("УДК", "imprint.udk", imp.udk, { ph: "например: 373.167.1:502" })}${req(imp.udk)}</div>
        <div>${fld("ББК", "imprint.bbk", imp.bbk, { ph: "например: 74.262" })}${req(imp.bbk)}</div>
      </div>
      <div class="row2">
        <div>${fld("Авторский знак", "imprint.author_sign", imp.author_sign, { ph: "например: А 92" })}${req(imp.author_sign)}</div>
        <div>${fld("ISBN", "titul.isbn", t.isbn, { ph: "978-9967-…" })}${req(t.isbn)}</div>
      </div>
      ${fld("Автор / сведения об авторах", "imprint.authors_line", imp.authors_line,
        { ph: autoAuthors || "Фамилия И.О., Фамилия И.О.", note: autoAuthors ? `Пусто — подставится из раздела «Авторы»: ${autoAuthors}` : "Пусто — подставится «коллектив авторов»" })}
      ${fld("Название книги", "titul.title", t.title, { note: "Общее с титульным листом" })}
      <div class="row2">${fld("Класс / целевая аудитория", "titul.grade", t.grade)}${fld("Год издания", "titul.year", t.year, { ph: String(new Date().getFullYear()) })}</div>
      <div class="row2">${fld("Издательство", "imprint.publisher", imp.publisher, { ph: t.publisher || "например: «Окуу китеби»" })}${fld("Город издания", "imprint.city", imp.city, { ph: "Бишкек" })}</div>
      <div class="row2">
        <div class="field"><label>Количество страниц</label>
          <div style="display:flex;gap:8px">
            <input data-f="imprint.pages" value="${esc(imp.pages)}" placeholder="объём книги" ${ed.book.can_edit ? "" : "disabled"} style="flex:1">
            ${ed.book.can_edit ? `<button class="btn small" id="imp-count">Посчитать по книге</button>` : ""}
          </div></div>
        ${fld("Организация / министерство", "imprint.org", imp.org, { ph: "Министерство просвещения Кыргызской Республики" })}
      </div>
      ${fld("Библиографическое описание", "imprint.bib_desc", imp.bib_desc, { area: true, rows: 3,
        ph: "Пусто — составится автоматически: Автор. Название: учебник для N класса. — Город: «Издательство», год. — N с." })}
      ${fld("Аннотация", "annotation", c.annotation, { area: true, rows: 5, ph: "Краткое описание учебника — печатается на обороте титула", note: "Общая с разделом «Аннотация»" })}
      ${fld("Авторские права (©)", "imprint.copyright", imp.copyright, { area: true, rows: 3,
        ph: "© Авторский коллектив, год\n© Министерство просвещения Кыргызской Республики, год", note: "Пусто — подставится стандартная строка © с авторами и годом издания" })}
    </div>`;
  } else if (sel === "people") {
    html = `<div class="card"><h2 style="margin-top:0">Авторский коллектив</h2>
      <div class="field"><label>Авторы</label>${listEditor("le-authors", c.people.authors, "ФИО, учёная степень")}</div>
      <div class="field"><label>Соавторы</label>${listEditor("le-coauthors", c.people.coauthors, "ФИО")}</div>
      <div class="field"><label>Редакторы</label>${listEditor("le-editors", c.people.editors, "ФИО")}</div>
      <div class="field"><label>Корректоры</label>${listEditor("le-proof", c.people.proofreaders, "ФИО")}</div>
      <div class="field"><label>Рецензенты</label>${listEditor("le-reviewers", c.people.reviewers, "ФИО, место работы")}</div>
    </div>`;
  } else if (sel === "state") {
    const sp = c.statePages;
    const ro = ed.book.can_edit ? "" : "disabled";
    html = `<div class="card"><h2 style="margin-top:0">Государственные страницы</h2>
      <div class="note" style="color:var(--muted);font-size:13px;margin-bottom:12px">
        Обязательные страницы государственного учебника КР. Включённые разделы автоматически
        попадают в печатную версию учебника.</div>
      ${["anthem:Государственный гимн КР", "gerb:Государственный герб КР", "flag:Государственный флаг КР"].map(x => {
        const [k, label] = x.split(":");
        return `<label style="display:flex;gap:10px;align-items:center;padding:8px 0;font-weight:600;cursor:pointer">
          <input type="checkbox" data-state="${k}" ${sp[k] ? "checked" : ""} ${ro}> ${label}</label>`;
      }).join("")}
      <div class="state-preview">
        <div class="sp"><img src="/static/img/flag-kg.svg" alt="Флаг"><div style="font-size:12.5px;margin-top:6px">Флаг КР</div></div>
        <div class="sp"><img src="/static/img/gerb-kg.svg" alt="Герб"><div style="font-size:12.5px;margin-top:6px">Герб КР</div></div>
      </div>
      <div class="sp" style="border:1px solid var(--line);border-radius:10px;padding:14px;margin-top:14px">
        <b>${esc(state.meta.state_pages.anthem.title)}</b>
        <div class="anthem-text">${esc(state.meta.state_pages.anthem.text_kg)}</div>
      </div>
    </div>`;
  } else if (sel === "annotation") {
    html = `<div class="card"><h2 style="margin-top:0">Аннотация</h2>
      ${fld("Текст аннотации", "annotation", c.annotation, { area: true, rows: 8, ph: "Краткое описание учебника, целевая аудитория, соответствие стандарту…" })}</div>`;
  } else if (sel === "intro") {
    html = `<div class="card"><h2 style="margin-top:0">Как пользоваться этой книгой</h2>
      <div class="note" style="color:var(--muted);font-size:13px;margin-bottom:12px">
        Страница после государственных символов — как в настоящих школьных учебниках:
        зачем эта книга и как с ней работать. В книге этот текст показывается вместе
        с условными обозначениями (рубриками) на одной странице.</div>
      ${fld("Вводный текст", "intro", c.intro, { area: true, rows: 10, ph: "Эта книга написана, чтобы помочь тебе изучать… Ты приобретёшь знания и навыки…\nУчебник имеет следующие особенности: …" })}</div>`;
  } else if (sel === "legend") {
    html = `<div class="card"><h2 style="margin-top:0">Условные обозначения</h2>
      <div class="note" style="color:var(--muted);font-size:13px;margin-bottom:12px">
        Навигационные рубрики учебника (в госизданиях — пиктограммы). Каждая рубрика
        подсказывает ученику, что за блок перед ним.</div>
      <div id="legend-rows">
      ${c.legend.map((g, i) => `
        <div class="row2" style="align-items:start;border-bottom:1px dashed var(--line);padding:6px 0">
          <div class="field" style="margin:0"><input data-lt="${i}" value="${esc(g.symbol)}" placeholder="Рубрика (например: Запомни)" ${ed.book.can_edit ? "" : "disabled"}></div>
          <div style="display:flex;gap:8px">
            <div class="field" style="margin:0;flex:1"><input data-lm="${i}" value="${esc(g.meaning)}" placeholder="Что означает" ${ed.book.can_edit ? "" : "disabled"}></div>
            ${ed.book.can_edit ? `<button class="icon-btn" data-ldel="${i}">${I.trash}</button>` : ""}
          </div>
        </div>`).join("")}
      </div>
      ${ed.book.can_edit ? `<button class="btn small ghost" style="margin-top:10px" id="legend-add">${I.plus}Добавить рубрику</button>` : ""}
    </div>`;
  } else if (sel === "glossary") {
    html = `<div class="card"><h2 style="margin-top:0">Словарь терминов</h2><div id="gloss-rows">
      ${c.glossary.map((g, i) => `
        <div class="row2" style="align-items:start;border-bottom:1px dashed var(--line);padding:6px 0">
          <div class="field" style="margin:0"><input data-gt="${i}" value="${esc(g.term)}" placeholder="Термин" ${ed.book.can_edit ? "" : "disabled"}></div>
          <div style="display:flex;gap:8px">
            <div class="field" style="margin:0;flex:1"><input data-gd="${i}" value="${esc(g.definition)}" placeholder="Определение" ${ed.book.can_edit ? "" : "disabled"}></div>
            ${ed.book.can_edit ? `<button class="icon-btn" data-gdel="${i}">${I.trash}</button>` : ""}
          </div>
        </div>`).join("")}
      </div>
      ${ed.book.can_edit ? `<button class="btn small ghost" style="margin-top:10px" id="gloss-add">${I.plus}Добавить термин</button>` : ""}
    </div>`;
  } else if (sel === "biblio") {
    html = `<div class="card"><h2 style="margin-top:0">Список литературы</h2>
      ${listEditor("le-biblio", c.bibliography, "Автор. Название. — Издательство, год.")}</div>`;
  } else if (sel === "append") {
    html = `<div class="card"><h2 style="margin-top:0">Доп. материалы <span class="h2-note">попадут в конец книги</span></h2><div id="app-rows">
      ${c.appendices.map((a, i) => `
        <div style="border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <input data-at="${i}" value="${esc(a.title)}" placeholder="Название приложения" style="flex:1;border:1px solid var(--line);border-radius:8px;padding:8px 11px" ${ed.book.can_edit ? "" : "disabled"}>
            ${ed.book.can_edit ? `<button class="icon-btn" data-adel="${i}">${I.trash}</button>` : ""}
          </div>
          <textarea data-ab="${i}" rows="4" placeholder="Содержимое" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 11px" ${ed.book.can_edit ? "" : "disabled"}>${esc(a.body)}</textarea>
        </div>`).join("")}
      </div>
      ${ed.book.can_edit ? `<button class="btn small ghost" id="app-add">${I.plus}Добавить материал</button>` : ""}
    </div>`;
  } else if (sel === "qr") {
    html = `<div class="card"><h2 style="margin-top:0">QR-коды</h2>
      <div class="note" style="color:var(--muted);font-size:13px;margin-bottom:12px">Ссылки на дополнительные электронные материалы (видео, тренажёры). В печатной версии выводятся как QR-код.</div>
      <div id="qr-rows">
      ${c.qr.map((q, i) => `
        <div class="row2" style="border-bottom:1px dashed var(--line);padding:6px 0">
          <div class="field" style="margin:0"><input data-qt="${i}" value="${esc(q.label)}" placeholder="Подпись (к §, главе)" ${ed.book.can_edit ? "" : "disabled"}></div>
          <div style="display:flex;gap:8px">
            <div class="field" style="margin:0;flex:1"><input data-qu="${i}" value="${esc(q.url)}" placeholder="https://…" ${ed.book.can_edit ? "" : "disabled"}></div>
            ${ed.book.can_edit ? `<button class="icon-btn" data-qdel="${i}">${I.trash}</button>` : ""}
          </div>
        </div>`).join("")}
      </div>
      ${ed.book.can_edit ? `<button class="btn small ghost" style="margin-top:10px" id="qr-add">${I.plus}Добавить ссылку</button>` : ""}
    </div>`;
  } else if (sel.startsWith("ch:")) {
    const ch = c.chapters.find(x => x.id === sel.slice(3));
    if (!ch) { ed.selected = "titul"; return renderNodeForm(); }
    html = `<div class="card"><h2 style="margin-top:0">Глава</h2>
      ${fld("Название главы", "ch.title", ch.title)}
      <div class="note" style="color:var(--muted);font-size:13px">Параграфов в главе: ${ch.sections.length}</div>
      ${ed.book.can_edit ? `<div style="margin-top:14px;display:flex;gap:10px">
        <button class="btn small" id="ch-addsec">${I.plus}Добавить параграф</button>
        <button class="btn small danger" id="ch-del">${I.trash}Удалить главу</button>
      </div>` : ""}
    </div>`;
  } else if (sel.startsWith("sec:")) {
    const [, chId, sId] = sel.split(":");
    const ch = c.chapters.find(x => x.id === chId);
    const s = ch?.sections.find(x => x.id === sId);
    if (!s) { ed.selected = "titul"; return renderNodeForm(); }
    const ro = ed.book.can_edit ? "" : "disabled";
    html = `<div class="card">
      <div style="display:flex;align-items:center;gap:10px"><h2 style="margin:0;flex:1">Параграф / урок</h2>
        ${ed.book.can_edit ? `<button class="btn small danger" id="sec-del">${I.trash}Удалить</button>` : ""}</div>
      <div class="field" style="margin-top:14px"><label>Тип раздела</label>
        <select data-f="sec.kind" ${ro}>
          <option value="paragraph" ${s.kind === "paragraph" ? "selected" : ""}>Параграф</option>
          <option value="lesson" ${s.kind === "lesson" ? "selected" : ""}>Урок</option>
          <option value="practice" ${s.kind === "practice" ? "selected" : ""}>Практическая работа</option>
          <option value="control" ${s.kind === "control" ? "selected" : ""}>Контроль знаний</option>
        </select></div>
      ${fld("Заголовок", "sec.title", s.title)}
      <div class="method-hint">
        <b>Пошаговая структура параграфа</b> — по образцу государственных учебников КР:
        цели → мотивация → материал шагами → примеры → вывод → задания → контроль.
        Каждый шаг — свой цветной блок ниже.
      </div>
      <div class="fgrp" style="--gc:#2563EB">
        <div class="fgrp-h">${I.eye}Цели и мотивация</div>
        ${fld("Цели — «Ты узнаешь»", "sec.goals", s.goals, { area: true, rows: 3, ph: "Что ученик будет знать и уметь после изучения (простыми словами, обращение на «ты»)" })}
        ${fld("Мотивация — «Подумай»", "sec.motivation", s.motivation, { area: true, rows: 3, ph: "Вводный вопрос или жизненная ситуация: зачем эта тема нужна ученику" })}
      </div>
      <div class="fgrp" style="--gc:#0E7490">
        <div class="fgrp-h">${I.doc}Материал и примеры</div>
        ${richField("Основной материал", "sec.body", s.body, { note: "Пишите текст параграфа. Выделите фрагмент и примените размер, стиль, выравнивание или список на панели сверху.", ph: "Начните писать текст параграфа…" })}
        ${fld("Разобранные примеры", "sec.examples", s.examples, { area: true, rows: 6, ph: "Пример 1. Условие → решение по шагам → ответ" })}
      </div>
      <div class="fgrp" style="--gc:#059669">
        <div class="fgrp-h">${I.check}Закрепление</div>
        ${fld("Вывод — «Запомни»", "sec.summary", s.summary, { area: true, rows: 3, ph: "Главное правило/определение параграфа в 1–3 предложениях" })}
        ${fld("Практические задания", "sec.tasks", s.tasks, { area: true, rows: 4, note: "Рекомендуется по уровням: А (по образцу), Б (самостоятельно), В (творческое)" })}
        ${fld("Домашнее задание", "sec.homework", s.homework, { area: true, rows: 3 })}
      </div>
      <div class="fgrp" style="--gc:#7C3AED">
        <div class="fgrp-h">${I.clock}Контроль знаний</div>
        ${fld("Контрольные вопросы", "sec.questions", s.questions, { area: true, rows: 4, note: "По одному вопросу на строку" })}
        ${fld("Итоговое тестирование", "sec.test", s.test, { area: true, rows: 4, note: "Вопросы теста с вариантами ответов" })}
      </div>
    </div>`;
  }

  panel.innerHTML = html;

  /* привязки */
  panel.addEventListener("input", onFormInput);
  bindRichToolbars(panel);
  if (sel === "titul" && $("#cov-up")) {
    const fileInp = $("#cov-file");
    $("#cov-up").onclick = () => fileInp.click();
    fileInp.onchange = async () => {
      const f = fileInp.files[0];
      if (!f) return;
      const fd = new FormData();
      fd.append("file", f);
      try {
        const r = await api(`/api/books/${ed.book.id}/cover`, { method: "POST", body: fd });
        ed.book.cover_url = r.cover_url;
        toast("Фото на обложке обновлено", "ok");
        renderNodeForm();
      } catch (e) { toast(e.message, "err"); }
    };
    const del = $("#cov-del");
    if (del) del.onclick = async () => {
      try {
        await api(`/api/books/${ed.book.id}/cover`, { method: "DELETE" });
        ed.book.cover_url = "";
        toast("Фото убрано", "ok");
        renderNodeForm();
      } catch (e) { toast(e.message, "err"); }
    };
  }
  if (sel === "imprint") {
    const cnt = $("#imp-count");
    if (cnt) cnt.onclick = () => {
      const n = buildBookFaces(ed.book, ed.book).length;
      (c.imprint || (c.imprint = {})).pages = String(n);
      const inp = panel.querySelector('input[data-f="imprint.pages"]');
      if (inp) inp.value = String(n);
      markDirty();
      toast(`Посчитано по текущей вёрстке: ${n} стр.`, "ok");
    };
  }
  if (sel === "people") {
    bindListEditor("le-authors", () => c.people.authors);
    bindListEditor("le-coauthors", () => c.people.coauthors);
    bindListEditor("le-editors", () => c.people.editors);
    bindListEditor("le-proof", () => c.people.proofreaders);
    bindListEditor("le-reviewers", () => c.people.reviewers);
  }
  if (sel === "biblio") bindListEditor("le-biblio", () => c.bibliography);
  if (sel === "legend") {
    panel.addEventListener("input", e => {
      if (e.target.dataset.lt !== undefined) { c.legend[+e.target.dataset.lt].symbol = e.target.value; markDirty(); }
      if (e.target.dataset.lm !== undefined) { c.legend[+e.target.dataset.lm].meaning = e.target.value; markDirty(); }
    });
    panel.addEventListener("click", e => {
      const d = e.target.closest("[data-ldel]");
      if (d) { c.legend.splice(+d.dataset.ldel, 1); markDirty(); renderNodeForm(); }
    });
    if ($("#legend-add")) $("#legend-add").onclick = () => { c.legend.push({ symbol: "", meaning: "" }); markDirty(); renderNodeForm(); };
  }
  if (sel === "state") {
    $$("[data-state]", panel).forEach(cb => cb.onchange = () => {
      c.statePages[cb.dataset.state] = cb.checked; markDirty();
    });
  }
  if (sel === "glossary") {
    panel.addEventListener("input", e => {
      if (e.target.dataset.gt !== undefined) { c.glossary[+e.target.dataset.gt].term = e.target.value; markDirty(); }
      if (e.target.dataset.gd !== undefined) { c.glossary[+e.target.dataset.gd].definition = e.target.value; markDirty(); }
    });
    panel.addEventListener("click", e => {
      const d = e.target.closest("[data-gdel]");
      if (d) { c.glossary.splice(+d.dataset.gdel, 1); markDirty(); renderNodeForm(); }
    });
    if ($("#gloss-add")) $("#gloss-add").onclick = () => { c.glossary.push({ term: "", definition: "" }); markDirty(); renderNodeForm(); };
  }
  if (sel === "append") {
    panel.addEventListener("input", e => {
      if (e.target.dataset.at !== undefined) { c.appendices[+e.target.dataset.at].title = e.target.value; markDirty(); }
      if (e.target.dataset.ab !== undefined) { c.appendices[+e.target.dataset.ab].body = e.target.value; markDirty(); }
    });
    panel.addEventListener("click", e => {
      const d = e.target.closest("[data-adel]");
      if (d) { c.appendices.splice(+d.dataset.adel, 1); markDirty(); renderNodeForm(); }
    });
    if ($("#app-add")) $("#app-add").onclick = () => { c.appendices.push({ title: "", body: "" }); markDirty(); renderNodeForm(); };
  }
  if (sel === "qr") {
    panel.addEventListener("input", e => {
      if (e.target.dataset.qt !== undefined) { c.qr[+e.target.dataset.qt].label = e.target.value; markDirty(); }
      if (e.target.dataset.qu !== undefined) { c.qr[+e.target.dataset.qu].url = e.target.value; markDirty(); }
    });
    panel.addEventListener("click", e => {
      const d = e.target.closest("[data-qdel]");
      if (d) { c.qr.splice(+d.dataset.qdel, 1); markDirty(); renderNodeForm(); }
    });
    if ($("#qr-add")) $("#qr-add").onclick = () => { c.qr.push({ label: "", url: "" }); markDirty(); renderNodeForm(); };
  }
  if (sel.startsWith("ch:")) {
    const ch = c.chapters.find(x => x.id === sel.slice(3));
    if ($("#ch-addsec")) $("#ch-addsec").onclick = () => {
      const s = { id: uid(), kind: "paragraph", title: `§ ${ch.sections.length + 1}. Новый параграф`, goals: "", motivation: "", body: "", examples: "", summary: "", tasks: "", homework: "", questions: "", test: "" };
      ch.sections.push(s); state.editor.selected = `sec:${ch.id}:${s.id}`;
      markDirty(); renderTree(); renderNodeForm();
    };
    if ($("#ch-del")) $("#ch-del").onclick = () => {
      if (!confirm(`Удалить главу «${ch.title}» со всеми параграфами?`)) return;
      c.chapters = c.chapters.filter(x => x.id !== ch.id);
      state.editor.selected = "titul";
      markDirty(); renderTree(); renderNodeForm();
    };
  }
  if (sel.startsWith("sec:")) {
    const [, chId, sId] = sel.split(":");
    const ch = c.chapters.find(x => x.id === chId);
    if ($("#sec-del")) $("#sec-del").onclick = () => {
      if (!confirm("Удалить параграф?")) return;
      ch.sections = ch.sections.filter(x => x.id !== sId);
      state.editor.selected = `ch:${chId}`;
      markDirty(); renderTree(); renderNodeForm();
    };
  }
  // при переключённом узле обновляем живой предпросмотр справа
  if (state.editor.tab === "preview") { const r = $("#panel-scroll"); if (r) renderPreview(r); }
}

function onFormInput(e) {
  const f = e.target.dataset.f;
  if (!f) return;
  const ed = state.editor;
  const c = ed.book.content;
  const v = e.target.isContentEditable ? e.target.innerHTML : e.target.value;
  if (f.startsWith("titul.")) c.titul[f.slice(6)] = v;
  else if (f.startsWith("imprint.")) (c.imprint || (c.imprint = {}))[f.slice(8)] = v;
  else if (f === "annotation") c.annotation = v;
  else if (f === "intro") c.intro = v;
  else if (f === "ch.title") {
    const ch = c.chapters.find(x => x.id === ed.selected.slice(3));
    if (ch) { ch.title = v; renderTreeSoon(); }
  } else if (f.startsWith("sec.")) {
    const [, chId, sId] = ed.selected.split(":");
    const s = c.chapters.find(x => x.id === chId)?.sections.find(x => x.id === sId);
    if (s) { s[f.slice(4)] = v; if (f === "sec.title") renderTreeSoon(); }
  }
  markDirty();
  if (ed.tab === "preview") schedulePreview();
}

let _treeTimer = null;
function renderTreeSoon() {
  clearTimeout(_treeTimer);
  _treeTimer = setTimeout(renderTree, 600);
}

/* ---- автосохранение ---- */
/* индикаторов может быть два: в шапке редактора и в читалке — обновляем оба */
function setSaveInd(stateCls, html) {
  $$(".save-ind").forEach(el => {
    el.classList.remove("unsaved", "saving", "saved");
    if (stateCls) el.classList.add(stateCls);
    el.innerHTML = html;
  });
}

function markDirty() {
  const ed = state.editor;
  if (!ed || !ed.book.can_edit) return;
  ed.dirty = true;
  // черновик не автосохраняется — ждём явного нажатия «Сохранить»
  if (ed.book.unsaved) {
    setSaveInd("unsaved", `${I.clock} не сохранено — нажмите «Сохранить»`);
    return;
  }
  setSaveInd("saving", `${I.clock} сохранение…`);
  clearTimeout(ed.timer);
  ed.timer = setTimeout(saveContent, 1200);
}

async function saveContent() {
  const ed = state.editor;
  if (!ed || !ed.dirty) return;
  try {
    const r = await api(`/api/books/${ed.book.id}/content`, { method: "PUT", body: { content: ed.book.content } });
    ed.dirty = false;
    setSaveInd("saved", `${I.check} сохранено ${r.saved_at.slice(11, 16)}`);
  } catch (e) {
    toast("Не сохранилось: " + e.message, "err");
  }
}

/* Ctrl+S / Cmd+S — мгновенное сохранение из редактора и читалки */
document.addEventListener("keydown", e => {
  if (!(e.ctrlKey || e.metaKey) || !["s", "S", "ы", "Ы"].includes(e.key)) return;
  const ed = state.editor;
  if (!ed || !location.hash.startsWith("#/book/")) return;
  e.preventDefault();
  if (!ed.book.can_edit) return;
  if (ed.book.unsaved) {
    // черновик: закрываем читалку (если открыта) и сохраняем в БД
    const rd = document.querySelector(".reader-overlay .rd-close");
    if (rd) rd.click();
    saveNewBook();
  } else {
    clearTimeout(ed.timer);
    saveContent();
  }
});

/* ---- правая панель ---- */
function renderSideTabs() {
  const ed = state.editor;
  $("#side-panel").innerHTML = `
    <div class="tabs">
      ${[["preview", "Просмотр", I.eye], ["pipeline", "Конвейер", I.route], ["comments", "Замечания", I.comment],
         ["history", "История", I.clock], ["versions", "Версии", I.save], ["members", "Участники", I.users]]
        .map(([id, t, ic]) => `<button data-tab="${id}" class="${ed.tab === id ? "active" : ""}" aria-label="${t}">${ic}<span>${t}</span></button>`).join("")}
    </div>
    <div class="panel-scroll" id="panel-scroll"><div class="empty">Загрузка…</div></div>`;
  $$("#side-panel [data-tab]").forEach(b => b.onclick = () => {
    ed.tab = b.dataset.tab;
    // классы переключаем на живых кнопках (без пересборки DOM) — играет анимация раскрытия активной вкладки
    $$("#side-panel [data-tab]").forEach(x => x.classList.toggle("active", x.dataset.tab === ed.tab));
    $("#panel-scroll").innerHTML = `<div class="empty">Загрузка…</div>`;
    loadSidePanel();
  });
}

/* ---- живой предпросмотр параграфа «как в книге» ---- */
function sectionPreviewHtml(s) {
  const tx = v => esc(String(v || "").trim()).replace(/\n+/g, "<br>");
  const blk = (name, val, cls = "") => String(val || "").trim()
    ? `<div class="sp-blk ${cls}"><b>${name}</b><div>${tx(val)}</div></div>` : "";
  return `<div class="sp-page">
    <h3 class="sp-title">${esc(s.title || "Без названия")}</h3>
    ${blk("Ты узнаешь", s.goals)}
    ${blk("Подумай", s.motivation)}
    ${richBody(s.body) || `<p class="sp-mut">Здесь появится текст параграфа по мере написания…</p>`}
    ${blk("Разобранные примеры", s.examples)}
    ${blk("Запомни", s.summary, "sp-remember")}
  </div>`;
}
function renderPreview(root) {
  const ed = state.editor;
  const c = ed.book.content;
  const sel = ed.selected || "";
  let inner = "";
  if (sel.startsWith("sec:")) {
    const [, chId, sId] = sel.split(":");
    const s = c.chapters.find(x => x.id === chId)?.sections.find(x => x.id === sId);
    if (s) inner = sectionPreviewHtml(s);
  }
  root.innerHTML = inner
    ? `<div class="preview-wrap"><div class="preview-hint">Так параграф выглядит в книге — обновляется на ходу</div>${inner}</div>`
    : `<div class="empty" style="padding:22px;text-align:center">Выберите параграф в дереве слева —<br>здесь появится его вид «как в книге».</div>`;
}
let _prevTimer = null;
function schedulePreview() {
  clearTimeout(_prevTimer);
  _prevTimer = setTimeout(() => {
    const root = $("#panel-scroll");
    if (root && state.editor?.tab === "preview") renderPreview(root);
  }, 160);
}

async function loadSidePanel() {
  const ed = state.editor;
  if (!ed) return;
  const root = $("#panel-scroll");
  if (!root) return;
  if (ed.tab === "preview") { renderPreview(root); return; }
  // у несохранённого черновика ещё нет id — разделы с данными недоступны
  if (ed.book.unsaved) {
    root.innerHTML = `<div class="empty" style="padding:22px;text-align:center">Сохраните учебник,<br>чтобы работать с этим разделом.</div>`;
    return;
  }
  try {
    if (ed.tab === "pipeline") {
      await renderPipelinePanel(root);
    } else if (ed.tab === "comments") {
      const items = await api(`/api/books/${ed.book.id}/comments`);
      root.innerHTML = `
        ${can("books.comment") ? `
        <div class="card" style="padding:12px">
          <textarea id="cm-text" rows="3" placeholder="Замечание, предложение…" class="cm-input"></textarea>
          <button class="btn small primary" style="margin-top:8px" id="cm-send">${I.send}Отправить</button>
        </div>` : ""}
        ${items.length ? items.map(c => `
          <div class="comment-item ${c.resolved ? "resolved" : ""}">
            <div class="ch"><span class="who">${esc(c.user_name)}</span><span class="when">${esc(c.created_at)}</span></div>
            <div>${esc(c.text)}</div>
            ${!c.resolved && can("books.comment") ? `<button class="btn small ghost" style="margin-top:6px" data-res="${c.id}">${I.check}Снять</button>` : ""}
          </div>`).join("") : `<div class="empty">Замечаний нет</div>`}`;
      if ($("#cm-send")) $("#cm-send").onclick = async () => {
        const t = $("#cm-text").value.trim();
        if (!t) return;
        await api(`/api/books/${ed.book.id}/comments`, { method: "POST", body: { text: t, section_id: ed.selected } });
        loadSidePanel();
      };
      $$("[data-res]", root).forEach(b => b.onclick = async () => {
        await api(`/api/books/${ed.book.id}/comments/${b.dataset.res}/resolve`, { method: "POST" });
        loadSidePanel();
      });
    } else if (ed.tab === "history") {
      const items = await api(`/api/books/${ed.book.id}/history`);
      const label = { create: "Создание", version: "Версия", restore: "Восстановление", comment: "Комментарий", status: "Согласование", member: "Участники", import: "Импорт", pipeline: "Конвейер" };
      root.innerHTML = timelineHtml(items.map(h => ({
        who: h.user_name || "Система", chip: label[h.action] || h.action,
        text: h.details, when: h.created_at, color: ACTION_COLOR[h.action],
      })));
    } else if (ed.tab === "versions") {
      const items = await api(`/api/books/${ed.book.id}/versions`);
      root.innerHTML = items.length ? items.map(v => `
        <div class="comment-item">
          <div class="ch"><span class="who">Версия №${v.number}</span><span class="when">${esc(v.created_at)}</span></div>
          <div style="color:var(--muted);font-size:12.5px">${esc(v.author)}${v.comment ? " — " + esc(v.comment) : ""}</div>
          ${ed.book.can_edit ? `<button class="btn small ghost" style="margin-top:6px" data-restore="${v.number}">Восстановить</button>` : ""}
        </div>`).join("") : `<div class="empty">Версий ещё нет.<br>Кнопка «Версия» — контрольная точка.</div>`;
      $$("[data-restore]", root).forEach(b => b.onclick = async () => {
        if (!confirm(`Заменить текущее содержимое версией №${b.dataset.restore}?`)) return;
        await api(`/api/books/${ed.book.id}/versions/${b.dataset.restore}/restore`, { method: "POST" });
        toast("Версия восстановлена", "ok");
        viewEditor(ed.book.id);
      });
    } else if (ed.tab === "members") {
      const members = ed.book.members;
      const TEAM_META = {
        "Автор": { c: "#16A34A", s: "#E9F9EF", i: "pen" }, "Соавтор": { c: "#0D9488", s: "#E0F5F2", i: "pen" },
        "Редактор": { c: "#8B5CF6", s: "#F3EEFE", i: "book" }, "Корректор": { c: "#DB2777", s: "#FDEBF3", i: "doc" },
        "Верстальщик": { c: "#0E7490", s: "#E0F4F8", i: "layout" }, "Дизайнер": { c: "#C026D3", s: "#FBEAFD", i: "palette" },
        "Худ. редактор": { c: "#9333EA", s: "#F4EBFD", i: "brush" },
        "Рецензент": { c: "#D97706", s: "#FBF3E0", i: "search" }, "Методист": { c: "#EA8C1C", s: "#FDF1E3", i: "route" },
        "Наблюдатель": { c: "#94A3B8", s: "#F1F5F9", i: "eye" },
      };
      const order = Object.keys(TEAM_META);
      let dirHtml = "";
      if (can("books.members") && ed.book.can_edit) {
        const dir = await api("/api/users/directory");
        dirHtml = `<div class="card" style="padding:12px">
          <div class="field" style="margin-bottom:8px"><label>Добавить участника</label>
            <select id="mb-user">${dir.map(u => `<option value="${u.id}">${esc(u.name)} — ${esc(u.role_title)}</option>`).join("")}</select></div>
          <div class="field" style="margin-bottom:10px"><label>Роль в книге</label>
            <div class="pick-grid roles" id="mb-roles">${order.map((r, i) =>
              `<div class="pick role${i === 0 ? " selected" : ""}" data-v="${esc(r)}" style="--rc:${TEAM_META[r].c};--rcs:${TEAM_META[r].s}">${I[TEAM_META[r].i]}<span>${esc(r)}</span></div>`).join("")}</div></div>
          <button class="btn small primary" id="mb-add">${I.plus}Добавить</button>
        </div>`;
      }
      const groups = order.filter(r => members.some(mm => mm.member_role === r))
        .concat([...new Set(members.map(mm => mm.member_role))].filter(r => !order.includes(r)));
      const canRm = can("books.members") && ed.book.can_edit;
      root.innerHTML = dirHtml + `<div class="team">
        <div class="team-title">Команда учебника <span>${members.length}</span></div>
        ${groups.map(r => {
          const tm = TEAM_META[r] || { c: "#64748B", s: "#EFF2F6", i: "users" };
          const rows = members.filter(mm => mm.member_role === r);
          return `<div class="team-group" style="--rb:${tm.c};--rbs:${tm.s}">
            <div class="tg-head">${I[tm.i]}${esc(r)}${rows.length > 1 ? `<span class="tg-n">${rows.length}</span>` : ""}</div>
            ${rows.map(mm => `
              <div class="tg-row">
                <span class="avatar sm" style="--rb:${tm.c};--rbs:${tm.s}">${esc(String(mm.name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase())}</span>
                <b>${esc(mm.name)}</b>
                ${canRm ? `<button class="icon-btn" data-rm="${mm.user_id}">${I.trash}</button>` : ""}
              </div>`).join("")}
          </div>`;
        }).join("") || `<div class="empty">Участников пока нет</div>`}
      </div>`;
      if ($("#mb-roles")) $("#mb-roles").addEventListener("click", e => {
        const p = e.target.closest(".pick"); if (!p) return;
        $$("#mb-roles .pick", root).forEach(x => x.classList.remove("selected"));
        p.classList.add("selected");
      });
      if ($("#mb-add")) $("#mb-add").onclick = async () => {
        await api(`/api/books/${ed.book.id}/members`, { method: "POST", body: {
          user_id: +$("#mb-user").value, member_role: $("#mb-roles .selected")?.dataset.v || "Автор" } });
        viewEditor(ed.book.id);
      };
      $$("[data-rm]", root).forEach(b => b.onclick = async () => {
        await api(`/api/books/${ed.book.id}/members/${b.dataset.rm}`, { method: "DELETE" });
        viewEditor(ed.book.id);
      });
    }
  } catch (e) {
    root.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* ---- конвейер: редакционно-издательский процесс книги ---- */
const PIPE_STATUS = { done: ["Завершён", "green"], active: ["В работе", "blue"], pending: ["Ожидает", "gray"] };
let _pipeDir = null; // справочник пользователей для назначения исполнителя

function pipeDue(d) {
  return `до ${+d.slice(8, 10)} ${MONTHS_S[+d.slice(5, 7) - 1] || ""}`;
}

function updatePipeChip(sum) {
  if (state.editor) state.editor.book.pipeline = sum;
  const el = $("#pipe-chip");
  if (!el || !sum) return;
  el.className = `chip ${sum.overdue ? "red" : "blue"}`;
  el.textContent = sum.stage
    ? `Конвейер ${sum.index}/${sum.total} · ${sum.title}${sum.overdue ? " · просрочен" : ""}`
    : "Конвейер завершён";
}

async function renderPipelinePanel(root, data) {
  const ed = state.editor;
  if (!data) {
    root.innerHTML = `<div class="empty">Загрузка…</div>`;
    try { data = await api(`/api/books/${ed.book.id}/pipeline`); }
    catch (e) { root.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  }
  if (data.can_manage && !_pipeDir) {
    try { _pipeDir = await api("/api/users/directory"); } catch (e) { _pipeDir = []; }
  }
  if (ed.pipeOpen === undefined)
    ed.pipeOpen = data.stages.find(s => s.status === "active")?.code || null;
  updatePipeChip(data.summary);
  const sum = data.summary;
  const pct = Math.round(sum.done / sum.total * 100);
  root.innerHTML = `
    <div class="card pipe-prog">
      <div class="pp-row"><b>${sum.stage ? `Этап ${sum.index} из ${sum.total}` : "Конвейер завершён"}</b>
        <span>${esc(sum.stage ? sum.title : "книга готова к изданию")}</span></div>
      <div class="pp-bar"><i style="width:${pct}%"></i></div>
    </div>
    <div class="pipe-list">${data.stages.map((s, i) => pipeStageHtml(s, i, data)).join("")}</div>`;
  bindPipeline(root, data);
}

function pipeStageHtml(s, i, data) {
  const [stTitle, stChip] = PIPE_STATUS[s.status];
  const open = state.editor.pipeOpen === s.code;
  const doneN = s.checklist.filter(c => c.done).length;
  const workable = s.can_work && s.status === "active";
  const assignee = s.assignee_name || s.role_titles.join(", ");
  return `<div class="pipe-stage ${s.status}${open ? " open" : ""}" data-stage="${s.code}" style="--pd:${i * 55}ms">
    <button type="button" class="ps-head" data-open="${s.code}" aria-expanded="${open}">
      <span class="ps-dot">${s.status === "done" ? I.check : i + 1}</span>
      <span class="ps-t"><b>${esc(s.title)}</b><small>${esc(assignee)}</small></span>
      ${s.overdue ? `<span class="chip red">просрочен</span>`
        : (s.due_date && s.status !== "done" ? `<span class="chip gray">${esc(pipeDue(s.due_date))}</span>` : "")}
      <span class="chip ${stChip}">${stTitle}</span>
    </button>
    ${open ? `<div class="ps-body">
      <div class="ps-desc">${esc(s.desc)}</div>
      ${data.can_manage ? `
        <div class="ps-manage">
          <div class="field"><label>Исполнитель</label>
            <select data-asg="${s.code}">
              <option value="">— по роли: ${esc(s.role_titles.join(", "))}</option>
              ${(_pipeDir || []).map(u => `<option value="${u.id}" ${u.id === s.assignee_id ? "selected" : ""}>${esc(u.name)} — ${esc(u.role_title)}</option>`).join("")}
            </select></div>
          <div class="field"><label>Срок этапа</label>
            <input type="date" data-due="${s.code}" value="${esc(s.due_date)}"></div>
        </div>` : ""}
      <div class="ps-chk-head">Контроль стандартов <span>${doneN}/${s.checklist.length}</span></div>
      ${s.checklist.map(c => `
        <label class="ps-chk${c.done ? " on" : ""}">
          <input type="checkbox" data-chk="${c.i}" ${c.done ? "checked" : ""} ${workable ? "" : "disabled"}>
          <i>${I.check}</i><span>${esc(c.text)}</span>
        </label>`).join("")}
      <div class="ps-when">
        ${s.started_at ? `<span>${I.clock}в работе с ${esc(humanWhen(s.started_at))}</span>` : ""}
        ${s.done_at ? `<span>${I.check}завершён ${esc(humanWhen(s.done_at))}</span>` : ""}
      </div>
      <div class="ps-actions">
        ${workable && !s.started_at ? `<button class="btn small primary" data-act="start">${I.send}Взять в работу</button>` : ""}
        ${workable && s.started_at ? `<button class="btn small primary" data-act="done" ${doneN < s.checklist.length ? "disabled" : ""}>${I.check}Этап завершён</button>` : ""}
        ${workable && s.started_at && doneN < s.checklist.length ? `<span class="ps-hint">закройте чек-лист, чтобы завершить</span>` : ""}
        ${s.status === "done" && data.can_manage ? `<button class="btn small ghost" data-act="reopen">${I.back}Вернуть на этот этап</button>` : ""}
      </div>
    </div>` : ""}
  </div>`;
}

function bindPipeline(root, data) {
  const ed = state.editor;
  const id = ed.book.id;
  const rerender = d => renderPipelinePanel(root, d);
  $$("[data-open]", root).forEach(b => b.onclick = () => {
    ed.pipeOpen = ed.pipeOpen === b.dataset.open ? null : b.dataset.open;
    rerender(data);
  });
  $$("[data-chk]", root).forEach(cb => cb.onchange = async () => {
    const box = cb.closest(".pipe-stage");
    const st = data.stages.find(x => x.code === box.dataset.stage);
    const map = {};
    st.checklist.forEach(c => { map[c.i] = c.i === +cb.dataset.chk ? cb.checked : c.done; });
    try { rerender(await api(`/api/books/${id}/pipeline/${st.code}`, { method: "PUT", body: { checklist: map } })); }
    catch (e) { toast(e.message, "err"); rerender(data); }
  });
  $$("[data-asg]", root).forEach(sel => sel.onchange = async () => {
    try { rerender(await api(`/api/books/${id}/pipeline/${sel.dataset.asg}`, { method: "PUT", body: { assignee_id: +sel.value || 0 } })); }
    catch (e) { toast(e.message, "err"); }
  });
  $$("[data-due]", root).forEach(inp => inp.onchange = async () => {
    try { rerender(await api(`/api/books/${id}/pipeline/${inp.dataset.due}`, { method: "PUT", body: { due_date: inp.value || "" } })); }
    catch (e) { toast(e.message, "err"); }
  });
  $$("[data-act]", root).forEach(b => b.onclick = async () => {
    const stage = b.closest(".pipe-stage").dataset.stage;
    const act = b.dataset.act;
    if (act === "reopen" && !confirm("Вернуть книгу на этот этап? Последующие этапы будут открыты заново.")) return;
    try {
      const d = await api(`/api/books/${id}/pipeline/${stage}/action`, { method: "POST", body: { action: act } });
      if (act === "done") {
        ed.pipeOpen = d.stages.find(s => s.status === "active")?.code || null;
        toast("Этап завершён", "ok");
      }
      if (act === "reopen") ed.pipeOpen = stage;
      rerender(d);
    } catch (e) { toast(e.message, "err"); }
  });
}

/* ---- версии, согласование, экспорт, печать ---- */
function openVersionModal() {
  const ed = state.editor;
  const m = modal({
    title: "Сохранить версию",
    body: `<div class="field"><label>Комментарий к версии</label>
      <input id="v-comment" placeholder="Что изменилось (необязательно)"></div>`,
    footer: `<button class="btn" id="v-cancel">Отмена</button>
             <button class="btn primary" id="v-save">${I.save}Сохранить</button>`,
  });
  $("#v-cancel").onclick = m.close;
  $("#v-save").onclick = async () => {
    await saveContent();
    try {
      const r = await api(`/api/books/${ed.book.id}/versions`, { method: "POST", body: { comment: $("#v-comment").value } });
      toast(`Версия №${r.number} сохранена`, "ok");
      m.close();
      if (ed.tab === "versions") loadSidePanel();
    } catch (e) { toast(e.message, "err"); }
  };
}

function openWorkflowModal(to, label) {
  const ed = state.editor;
  const m = modal({
    title: label,
    body: `<div class="field"><label>Комментарий к решению</label>
      <textarea id="wf-comment" rows="3" placeholder="Замечания, основание решения…"></textarea></div>`,
    footer: `<button class="btn" id="wf-cancel">Отмена</button>
             <button class="btn primary" id="wf-ok">${I.send}Подтвердить</button>`,
  });
  $("#wf-cancel").onclick = m.close;
  $("#wf-ok").onclick = async () => {
    try {
      await saveContent();
      await api(`/api/books/${ed.book.id}/status`, { method: "POST", body: { to, comment: $("#wf-comment").value } });
      toast("Статус обновлён", "ok");
      m.close();
      viewEditor(ed.book.id);
    } catch (e) { toast(e.message, "err"); }
  };
}

async function doExport() {
  const ed = state.editor;
  const data = await api(`/api/books/${ed.book.id}/export`);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${ed.book.title.replace(/[^\wа-яА-ЯёЁүөңҮӨҢ ]/g, "_")}.kitep.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function doPrint() {
  const ed = state.editor;
  const c = ed.book.content;
  const sp = state.meta.state_pages;
  const kindLabel = { paragraph: "", lesson: "Урок. ", practice: "Практическая работа. ", control: "Контроль знаний. " };
  const block = (title, text) => text?.trim() ? `<div class="blk"><h4>${esc(title)}</h4><p>${esc(text).replace(/\n/g, "<br>")}</p></div>` : "";
  let html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${esc(ed.book.title)}</title><style>
    /* Lato — шрифт настоящих учебников kitep.edu.kg */
    @font-face { font-family: "Lato"; src: url("${location.origin}/static/fonts/Lato-Regular.ttf"); font-weight: 400; }
    @font-face { font-family: "Lato"; src: url("${location.origin}/static/fonts/Lato-Italic.ttf"); font-weight: 400; font-style: italic; }
    @font-face { font-family: "Lato"; src: url("${location.origin}/static/fonts/Lato-Bold.ttf"); font-weight: 700; }
    @font-face { font-family: "Lato"; src: url("${location.origin}/static/fonts/Lato-Black.ttf"); font-weight: 800 900; }
    body { font-family: "Lato", "Segoe UI", sans-serif; margin: 0; color: #1a1a1a; }
    h1, h2, h3, h4 { font-weight: 800; }
    .page { page-break-after: always; padding: 60px 70px; min-height: 85vh; }
    .titul { text-align: center; display: flex; flex-direction: column; min-height: 88vh; }
    .titul .top { font-size: 13px; letter-spacing: 1px; text-transform: uppercase; }
    .titul h1 { font-size: 34px; margin: auto 0 8px; }
    .titul .sub { font-size: 17px; color: #444; margin-bottom: auto; }
    .titul .bottom { font-size: 14px; color: #555; }
    .state { text-align: center; }
    .state img { height: 200px; margin: 30px 0; }
    .anthem { white-space: pre-line; font-size: 15px; line-height: 1.7; }
    h2.chap { font-size: 24px; border-bottom: 3px solid #2563EB; padding-bottom: 8px; margin-top: 0; }
    h3.sec { font-size: 19px; margin-top: 28px; }
    .goals { background: #FBF6E8; border-left: 4px solid #E8A400; padding: 10px 14px; font-size: 14px; }
    .podumaj { background: #EAF1FF; border-left: 4px solid #2563EB; padding: 10px 14px; font-size: 14px; margin-top: 10px; }
    .zapomni { background: #E9F9EF; border: 1.5px solid #16A34A; border-radius: 8px; padding: 10px 14px; font-size: 14.5px; margin-top: 14px; }
    .legend-row { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px dashed #ccc; font-size: 15px; }
    .legend-row b { min-width: 190px; color: #1D4ED8; }
    .intro-text { font-size: 15.5px; line-height: 1.75; white-space: pre-line; }
    .blk h4 { margin: 18px 0 6px; font-size: 15px; color: #1D4ED8; }
    .blk p { margin: 0; line-height: 1.65; font-size: 15px; }
    .toc td { padding: 4px 0; font-size: 15px; }
    dl dt { font-weight: bold; margin-top: 8px; } dl dd { margin-left: 0; color: #333; }
    ol.bib li { margin-bottom: 6px; }
    @media print { .page { padding: 40px 30px; } }
  </style></head><body>`;

  /* первые страницы — по образцу реальных госучебников («Жаңы китеп») */
  const kg = (ed.book.language || "").toLowerCase().startsWith("кырг");
  const pYear = String(c.titul.year || new Date().getFullYear());
  const pAuthors = c.people.authors.length ? c.people.authors.join(", ") : (kg ? "Авторлор жамааты" : "Коллектив авторов");
  const pSub = c.titul.subtitle || (kg
    ? (c.titul.grade ? `Окутуу кыргыз тилинде жүргүзүлгөн жалпы билим берүү уюмдарынын ${c.titul.grade}-классы үчүн окуу китеби` : "Жалпы билим берүү уюмдары үчүн окуу китеби")
    : (c.titul.grade ? `Учебник для ${c.titul.grade} класса общеобразовательных организаций` : "Учебник для общеобразовательных организаций"));
  const pGrif = c.titul.grif || (kg
    ? "Кыргыз Республикасынын Билим берүү жана илим министрлиги тарабынан сунушталган"
    : "Рекомендовано Министерством просвещения Кыргызской Республики");

  /* титул: авторы, красное название, курсивные серия и гриф, «Бишкек – год» */
  html += `<div class="page titul">
    <div class="top" style="color:#2563EB;letter-spacing:2px">ГИС «КИТЕП»</div>
    <div style="margin-top:60px;font-weight:700;font-size:14px">${esc(pAuthors)}</div>
    <h1 style="color:#BB3A32;text-transform:uppercase;margin:26px 0 10px">${esc(c.titul.title)}</h1>
    <div class="sub" style="font-style:italic">${esc(pSub)}</div>
    <div style="font-style:italic;font-size:13.5px;color:#555;margin-top:26px">${esc(pGrif)}</div>
    <div class="bottom" style="margin-top:auto;font-weight:700">Бишкек – ${esc(pYear)}</div>
  </div>`;

  /* выходные данные — из «Выходных сведений»; официальные коды не выдумываются */
  const pImp = c.imprint || {};
  const pMiss = kg ? "толтурула элек" : "требует заполнения";
  const pCode = (label, v) => String(v || "").trim()
    ? esc(`${label} ${String(v).trim()}`)
    : `${label} <i style="color:#B45309;font-weight:500">${pMiss}</i>`;
  const pPub = (pImp.publisher || c.titul.publisher || "").trim() || "ГИС «Китеп»";
  const pCity = /^бишкек$/i.test((pImp.city || "Бишкек").trim()) ? "Б." : (pImp.city || "Бишкек").trim();
  const pAuthLine = String(pImp.authors_line || "").trim() || pAuthors;
  const pIsbn = String(c.titul.isbn || "").trim();
  const pBiblio = String(pImp.bib_desc || "").trim()
    ? esc(pImp.bib_desc).replace(/\n/g, "<br>")
    : `<b>${esc(c.titul.title)}:</b> ${c.titul.grade ? esc(c.titul.grade) + (kg ? "-кл. " : " кл. ") : ""}${esc(pAuthLine)}. — ${esc(pCity)}: «${esc(pPub)}», ${esc(pYear)}.${String(pImp.pages || "").trim() ? ` — ${esc(pImp.pages)} с.` : ""}`;
  const pCopy = String(pImp.copyright || "").trim()
    ? esc(pImp.copyright).replace(/\n/g, "<br>")
    : `© ${kg ? "Авторлор жамааты" : "Авторский коллектив"}, ${esc(pYear)}<br>© ${esc(pImp.org || (kg ? "Кыргыз Республикасынын Билим берүү жана илим министрлиги" : "Министерство просвещения Кыргызской Республики"))}, ${esc(pYear)}`;
  html += `<div class="page" style="display:flex;flex-direction:column">
    <div style="font-weight:700;font-size:13.5px;line-height:1.7">${pCode("УДК", pImp.udk)}<br>${pCode("ББК", pImp.bbk)}<br>${String(pImp.author_sign || "").trim() ? esc(pImp.author_sign) : `<i style="color:#B45309;font-weight:500">авт. знак: ${pMiss}</i>`}</div>
    <p style="margin-top:26px;font-size:13.5px">${pBiblio}</p>
    <p style="font-weight:700;font-size:13.5px">${pIsbn ? "ISBN " + esc(pIsbn) : `ISBN <i style="color:#B45309;font-weight:500">${pMiss}</i>`}</p>
    ${c.annotation.trim() ? `<p style="font-size:13.5px;line-height:1.7;text-align:justify;text-indent:1.6em">${esc(c.annotation).replace(/\n/g, "<br>")}</p>` : ""}
    <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;font-size:11.5px;color:#555">
      <span>${pIsbn ? "ISBN " + esc(pIsbn) : ""}</span>
      <span style="text-align:right">${pCopy}</span>
    </div>
  </div>`;

  /* флаг и герб — одна страница; гимн — отдельная (как в настоящих книгах) */
  if (c.statePages.flag || c.statePages.gerb) {
    html += `<div class="page state">
      ${c.statePages.flag ? `<div style="color:#2AA3DC;font-weight:800;text-transform:uppercase;margin:26px 0 14px">Кыргыз Республикасынын<br>Мамлекеттик Туусу</div><img src="${sp.flag.image}" style="width:300px;border:1px solid #ddd">` : ""}
      ${c.statePages.gerb ? `<div style="color:#2AA3DC;font-weight:800;text-transform:uppercase;margin:40px 0 14px">Кыргыз Республикасынын<br>Мамлекеттик Герби</div><img src="${sp.gerb.image}" style="width:200px">` : ""}
    </div>`;
  }
  if (c.statePages.anthem) {
    html += `<div class="page state">
      <div style="color:#2AA3DC;font-weight:800;text-transform:uppercase;margin:30px 0 16px">Кыргыз Республикасынын<br>Мамлекеттик Гимни</div>
      <div style="font-style:italic;font-size:13px;color:#555;line-height:1.7">Сөзү Ж. Садыковдуку жана Ш. Кулуевдики<br>Музыкасы Н. Давлесовдуку жана К. Молдобасановдуку</div>
      <div class="anthem" style="display:inline-block;text-align:left;margin-top:18px">${esc(sp.anthem.text_kg)}</div>
    </div>`;
  }

  /* введение (обращение к ученикам) + условные обозначения */
  const legend = (c.legend || []).filter(g => (g.symbol || "").trim());
  if ((c.intro || "").trim()) {
    html += `<div class="page">
      <h2 class="chap" style="color:#2AA3DC;border-color:#2AA3DC;text-align:center;text-transform:uppercase">${kg ? "Киришүү" : "Введение"}</h2>
      <p style="text-align:center;font-weight:800">${kg ? "Кымбаттуу окуучулар!" : "Дорогие ученики!"}</p>
      <div class="intro-text" style="text-align:justify;text-indent:1.6em">${esc(c.intro)}</div>
      <p style="text-align:right;font-style:italic;font-weight:600;margin-top:20px">${kg ? "Авторлор" : "Авторы"}</p>
    </div>`;
  }
  if (legend.length) {
    html += `<div class="page"><h2 class="chap">${kg ? "Шарттуу белгилер" : "Условные обозначения"}</h2>
      ${legend.map(g => `<div class="legend-row"><b>${esc(g.symbol)}</b><span>${esc(g.meaning)}</span></div>`).join("")}
    </div>`;
  }

  /* сведения об авторах */
  const ppl = [];
  if (c.people.authors.length) ppl.push(`<b>Авторы:</b> ${esc(c.people.authors.join("; "))}`);
  if (c.people.coauthors.length) ppl.push(`<b>Соавторы:</b> ${esc(c.people.coauthors.join("; "))}`);
  if (c.people.editors.length) ppl.push(`<b>Редакторы:</b> ${esc(c.people.editors.join("; "))}`);
  if (c.people.proofreaders.length) ppl.push(`<b>Корректоры:</b> ${esc(c.people.proofreaders.join("; "))}`);
  if (c.people.reviewers.length) ppl.push(`<b>Рецензенты:</b> ${esc(c.people.reviewers.join("; "))}`);
  if (ppl.length || c.annotation.trim()) {
    html += `<div class="page"><h2 class="chap">Сведения об издании</h2>
      ${ppl.map(x => `<p>${x}</p>`).join("")}
      ${c.annotation.trim() ? `<h3>Аннотация</h3><p style="line-height:1.65">${esc(c.annotation).replace(/\n/g, "<br>")}</p>` : ""}</div>`;
  }

  /* содержание */
  html += `<div class="page"><h2 class="chap">${kg ? "Мазмуну" : "Содержание"}</h2><table class="toc">`;
  c.chapters.forEach(ch => {
    html += `<tr><td><b>${esc(ch.title)}</b></td></tr>`;
    ch.sections.forEach(s => html += `<tr><td style="padding-left:24px">${esc(s.title)}</td></tr>`);
  });
  html += `</table></div>`;

  /* главы */
  c.chapters.forEach(ch => {
    html += `<div class="page"><h2 class="chap">${esc(ch.title)}</h2>`;
    ch.sections.forEach(s => {
      html += `<h3 class="sec">${esc(kindLabel[s.kind] || "")}${esc(s.title)}</h3>`;
      if (s.goals?.trim()) html += `<div class="goals"><b>${kg ? "Бул бөлүмдө сен:" : "Ты узнаешь:"}</b> ${esc(s.goals).replace(/\n/g, "<br>")}</div>`;
      if (s.motivation?.trim()) html += `<div class="podumaj"><b>${kg ? "Ойлонуп көр:" : "Подумай:"}</b> ${esc(s.motivation).replace(/\n/g, "<br>")}</div>`;
      if (s.body?.trim()) html += `<div class="blk">${richBody(s.body)}</div>`;
      html += block(kg ? "Мисалдар" : "Разобранные примеры", s.examples);
      if (s.summary?.trim()) html += `<div class="zapomni"><b>${kg ? "Эсиңде болсун!" : "Запомни!"}</b> ${esc(s.summary).replace(/\n/g, "<br>")}</div>`;
      html += block(kg ? "Тапшырмалар" : "Практические задания", s.tasks) + block(kg ? "Үй тапшырмасы" : "Домашнее задание", s.homework)
            + block(kg ? "Суроолор" : "Контрольные вопросы", s.questions) + block(kg ? "Тест" : "Итоговое тестирование", s.test);
    });
    html += `</div>`;
  });

  /* аппарат */
  if (c.glossary.length) {
    html += `<div class="page"><h2 class="chap">${kg ? "Терминдер сөздүгү" : "Словарь терминов"}</h2><dl>` +
      c.glossary.filter(g => g.term.trim()).map(g => `<dt>${esc(g.term)}</dt><dd>${esc(g.definition)}</dd>`).join("") + `</dl></div>`;
  }
  if (c.bibliography.filter(x => x.trim()).length) {
    html += `<div class="page"><h2 class="chap">Список литературы</h2><ol class="bib">` +
      c.bibliography.filter(x => x.trim()).map(x => `<li>${esc(x)}</li>`).join("") + `</ol></div>`;
  }
  c.appendices.forEach((a, i) => {
    html += `<div class="page"><h2 class="chap">Приложение ${i + 1}. ${esc(a.title)}</h2>
      <p style="line-height:1.65">${esc(a.body).replace(/\n/g, "<br>")}</p></div>`;
  });
  if (c.qr.filter(q => q.url.trim()).length) {
    html += `<div class="page"><h2 class="chap">Электронные материалы (QR)</h2><ol>` +
      c.qr.filter(q => q.url.trim()).map(q => `<li><b>${esc(q.label)}</b> — ${esc(q.url)}</li>`).join("") + `</ol></div>`;
  }
  html += `</body></html>`;

  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

/* ================= Проверка книг (Закон № 185 + встроенный OCR/AI) ================= */
async function viewAnalyze() {
  shell("analyze", `<iframe class="checker-frame" src="/checker?embed=1&v=13"
    aria-label="Проверка книг по нормам КР"></iframe>`, true);
}

/* ================= Статистика (дашборд) ================= */
const ACC = {
  orange: "#EA8C1C", purple: "#7C3AED", blue: "#2563EB",
  green: "#16A34A", teal: "#0D9488", gold: "#D97706", gray: "#94A3B8",
};
const ACC_SOFT = {
  orange: "#FDF1E3", purple: "#F1EBFE", blue: "#EAF1FF",
  green: "#E9F9EF", teal: "#E0F5F2", gold: "#FBF3E0",
};

const MONTHS_S = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function last30(map) {
  const out = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push(+((map || {})[k]) || 0);
  }
  return out;
}

function last30Pairs(map) {
  const out = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ label: `${d.getDate()} ${MONTHS_S[d.getMonth()]}`, v: +((map || {})[k]) || 0 });
  }
  return out;
}

function sparkline(series, color) {
  const w = 124, h = 36, p = 3;
  const max = Math.max(...series, 1);
  const gid = "sg" + uid();
  const pts = series.map((v, i) => [
    p + i / (series.length - 1) * (w - 2 * p),
    h - p - (v / max) * (h - 2 * p),
  ]);
  const line = pts.map(pt => pt.map(n => n.toFixed(1)).join(",")).join(" ");
  const [ex, ey] = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity=".28"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="${p},${h - p} ${line} ${w - p},${h - p}" fill="url(#${gid})"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="2.6" fill="${color}"/>
  </svg>`;
}

function barChart(pairs, color, fmt) {
  const max = Math.max(...pairs.map(p => p.v), 1);
  return `<div class="bchart">` + pairs.map((p, i) => `
    <span class="bc" aria-label="${esc(p.label)} — ${fmt(p.v)}" style="animation-delay:${i * 14}ms">
      <i class="${p.v ? "" : "z"}" style="height:${p.v ? Math.max(p.v / max * 100, 7).toFixed(1) : 5}%;${p.v ? `background:${color}` : ""}"></i>
    </span>`).join("") + `</div>`;
}

function donutChart(items) {
  const palette = [ACC.blue, ACC.orange, ACC.purple, ACC.teal, ACC.green, ACC.gold, ACC.gray];
  const total = items.reduce((s, x) => s + x.c, 0);
  if (!total) return `<div class="empty">Нет данных</div>`;
  const R = 44, C = 2 * Math.PI * R;
  let off = 0;
  const segs = items.map((x, i) => {
    const len = x.c / total * C;
    const s = `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${palette[i % palette.length]}"
      stroke-width="16" stroke-dasharray="${Math.max(len - 1.5, .5).toFixed(1)} ${C.toFixed(1)}"
      stroke-dashoffset="${(-off).toFixed(1)}"/>`;
    off += len;
    return s;
  }).join("");
  return `<div class="donut-wrap">
    <div class="donut"><svg width="120" height="120" viewBox="0 0 120 120" style="transform:rotate(-90deg)">${segs}</svg>
      <div class="donut-c"><b data-count="${total}">${fmtNum(total)}</b><span>всего</span></div></div>
    <div class="donut-legend">${items.map((x, i) => `
      <div class="dl-row" aria-label="${esc(x.label)}: ${fmtNum(x.c)}">
        <span class="dl-dot" style="background:${palette[i % palette.length]}"></span>
        <span class="dl-name">${esc(x.label)}</span><span class="dl-cnt">${fmtNum(x.c)}</span>
        <b>${Math.round(x.c / total * 100)}%</b></div>`).join("")}</div>
  </div>`;
}

function pctBars(rows, labelKey, color) {
  const total = rows.reduce((s, r) => s + r.c, 0);
  if (!total) return `<div class="empty">Нет данных</div>`;
  return rows.map((r, i) => {
    const pct = Math.round(r.c / total * 100);
    return `<div class="pbar-row" aria-label="${esc(r[labelKey] || "—")}: ${fmtNum(r.c)}">
      <span class="pbar-lbl">${esc(r[labelKey] || "—")}</span>
      <div class="pbar"><i style="width:${Math.max(pct, 2)}%;background:linear-gradient(90deg,${color},${color}CC);animation-delay:${i * 70}ms"></i></div>
      <b class="pbar-pct">${fmtNum(r.c)} · ${pct}%</b></div>`;
  }).join("");
}

function topList(rows, unitFn) {
  if (!rows.length) return `<div class="empty" style="padding:14px">Пока нет данных</div>`;
  const medal = ["rank-g", "rank-s", "rank-b"];
  return `<div class="top-list">` + rows.map((r, i) => `
    <div class="top-item"><span class="top-rank ${medal[i] || ""}">${i + 1}</span>
      <b>${esc(r.name || r.title)}</b><span>${unitFn(r.c)}</span></div>`).join("") + `</div>`;
}

function animateCounters(root) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  (root || document).querySelectorAll("[data-count]").forEach(el => {
    const target = parseFloat(el.dataset.count) || 0;
    const dec = +el.dataset.dec || 0;
    const prefix = el.dataset.prefix || "", suffix = el.dataset.suffix || "";
    const render = v => { el.textContent = prefix + (dec ? v.toFixed(dec) : fmtNum(Math.round(v))) + suffix; };
    if (reduce || !target) { render(target); return; }
    const t0 = performance.now(), dur = 700;
    const step = t => {
      const k = Math.min((t - t0) / dur, 1);
      render(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function fmtShort(n) {
  n = +n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",") + " млн";
  if (n >= 1e4) return (n / 1e3).toFixed(0) + " тыс";
  return fmtNum(n);
}

const STATUS_COLOR = {
  draft: "#94A3B8", editorial: "#D97706", methodist: "#2563EB", lawyer: "#64748B",
  reviewer: "#EA8C1C", ministry: "#1E3A8A", approved: "#16A34A", published: "#059669",
};

/* раздел виден всем, но роль не даёт доступа — вежливый экран вместо скрытия */
function renderNoAccess(section, title) {
  shell(section, `
    <div class="noaccess">
      <span class="noaccess-ic"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
      <h2>Доступ ограничен</h2>
      <p>Раздел «${esc(title)}» недоступен вашей роли
        <b>${esc(state.me?.role_title || "")}</b>.<br>
        Чтобы получить доступ, обратитесь к администратору системы —
        он может расширить права вашей роли или добавить дополнительную.</p>
      <button class="btn primary" id="na-home">${I.home}На главную</button>
    </div>`);
  $("#na-home").onclick = () => { location.hash = "#/dashboard"; };
}

async function viewStats() {
  shell("stats", `<div class="empty">Загрузка…</div>`);
  let ov, ai, tok, ops;
  try {
    [ov, ai, tok, ops] = await Promise.all([
      api("/api/stats/overview"), api("/api/stats/ai"),
      api("/api/stats/tokens"), api("/api/stats/ops"),
    ]);
  } catch (e) { toast(e.message, "err"); return; }

  const jobs30 = last30(ai.jobs_daily);
  const jobs30sum = jobs30.reduce((s, v) => s + v, 0);
  const booksP = last30Pairs(ov.books_daily), jobsP = last30Pairs(ai.jobs_daily), costP = last30Pairs(tok.cost_daily);
  const books30sum = booksP.reduce((s, p) => s + p.v, 0);
  const cost30sum = costP.reduce((s, p) => s + p.v, 0);

  const numc = (v, o = {}) => `<span data-count="${+v || 0}"${o.dec ? ` data-dec="${o.dec}"` : ""}${o.prefix ? ` data-prefix="${o.prefix}"` : ""}${o.suffix ? ` data-suffix="${esc(o.suffix)}"` : ""}>${o.prefix || ""}${o.dec ? (+v || 0).toFixed(o.dec) : fmtNum(v)}${o.suffix || ""}</span>`;
  const hero = (icon, color, value, label, sub) => `
    <div class="card hero-card" style="--hc:${ACC[color]};--hc-soft:${ACC_SOFT[color]}">
      <div class="hc-ic">${icon}</div>
      <div class="hc-body"><div class="hc-val">${value}</div>
        <div class="hc-lbl">${label}</div><div class="hc-sub">${sub}</div></div>
    </div>`;
  const mini = (label, value, sub, color, series) => `
    <div class="card mini-card" style="--mc:${color}">
      <div class="mc-top"><span class="mc-lbl">${label}</span>${series ? sparkline(series, color) : ""}</div>
      <div><div class="mc-val">${value}</div>${sub ? `<div class="mc-sub">${sub}</div>` : ""}</div>
    </div>`;
  const sec = (icon, color, title) => `
    <h2 class="sec-head"><span class="sec-ic" style="--sc:${ACC[color] || "#46536B"};--scs:${ACC_SOFT[color] || "#EDF1F7"}">${icon}</span>${title}</h2>`;
  const mult = (label, total, pairs, color, fmt) => `
    <div class="mult">
      <div class="mult-top"><span class="mult-lbl">${label}</span><b class="mult-val">${total}</b></div>
      ${barChart(pairs, color, fmt)}
    </div>`;
  const spendMax = Math.max(+tok.cost_today, +tok.cost_week, +tok.cost_month, 0.01);
  const spend = (label, v) => `
    <div class="spend-row"><span>${label}</span>
      <div class="spend-bar"><i style="width:${Math.max(+v / spendMax * 100, 2).toFixed(1)}%"></i></div>
      <b>$${(+v).toFixed(2)}</b></div>`;

  const subjectsDonutData = (() => {
    const rows = [...ov.by_subject];
    const top = rows.slice(0, 6).map(r => ({ label: r.subject, c: r.c }));
    const rest = rows.slice(6).reduce((s, r) => s + r.c, 0);
    if (rest) top.push({ label: "Прочие", c: rest });
    return top;
  })();

  /* -- жизненный цикл -- */
  const stMap = {};
  ov.by_status.forEach(x => stMap[x.status] = x.count);
  const ST_ORDER = ["draft", "editorial", "methodist", "lawyer", "reviewer", "ministry", "approved", "published"];
  const stTitles = state.meta.statuses;
  const lcMax = Math.max(...ST_ORDER.map(s => stMap[s] || 0), 1);
  const lcRow = s => {
    const n = stMap[s] || 0;
    return `<div class="lc-row ${n ? "" : "zero"}">
      <span class="lc-dot" style="background:${STATUS_COLOR[s]}"></span>
      <span class="lc-lbl">${esc(stTitles[s] || s)}</span>
      <div class="lc-bar"><i style="width:${n ? Math.max(n / lcMax * 100, 4).toFixed(1) : 0}%;background:${STATUS_COLOR[s]}"></i></div>
      <b class="lc-n">${n}</b>
    </div>`;
  };

  /* -- проблемные места -- */
  const bookKeys = new Set(["no_editor", "lawyer_queue", "ministry_queue", "stale"]);
  const attnItems = ops.attention.filter(a => a.count > 0);
  const attnHtml = attnItems.length ? attnItems.map(a => `
    <div class="att-item ${a.level}">
      <b>${a.count}</b>
      <span>${bookKeys.has(a.key) ? `${plural(a.count, "книга", "книги", "книг")} ` : ""}${esc(a.label)}</span>
    </div>`).join("") : `<div class="att-ok">${I.check}Всё в порядке — очередей и проблем нет</div>`;

  /* -- роли -- */
  const rolesHtml = ov.by_role.filter(r => r.c > 0).map(r => `
    <div class="roles-row">${roleBadge(r.role)}<div class="roles-line"></div><b>${r.c}</b></div>`).join("")
    || `<div class="empty">Нет пользователей</div>`;

  /* -- здоровье -- */
  const healthHtml = ops.health.map(h => `
    <div class="hl-row ${h.status}"><span class="hl-dot"></span>
      <b>${esc(h.label)}</b><span class="hl-note">${esc(h.note)}</span></div>`).join("");

  const bstat = (label, val, sub) => `
    <div class="bstat"><span class="bs-lbl">${label}</span><b class="bs-val">${val}</b>${sub ? `<i class="bs-sub">${sub}</i>` : ""}</div>`;

  const histLabel = { create: "Создание", version: "Версия", restore: "Восстановление", comment: "Комментарий",
    status: "Согласование", member: "Участники", import: "Импорт" };
  const feedHtml = timelineHtml(ops.activity.map(h => ({
    who: h.user_name || "Система", chip: h.book_title,
    text: `${histLabel[h.action] || h.action}: ${h.details}`, when: h.created_at,
    color: ACTION_COLOR[h.action],
  })));

  const tokensTotal = (+tok.input_tokens || 0) + (+tok.output_tokens || 0);
  const t = ops.team;

  shell("stats", `
    <div class="page-head"><div><h1>Статистика</h1>
      <div class="sub">Процесс создания учебников: от черновика до грифа${ov.last_update ? ` · обновлено ${esc(ov.last_update.slice(0, 16))}` : ""}</div></div></div>

    <div class="hero-grid">
      ${hero(I.book, "orange", numc(ov.books_total), plural(ov.books_total, "Учебник", "Учебника", "Учебников"),
        `${ov.books_published} с грифом / опубликовано`)}
      ${hero(I.pen, "green", numc(ov.authors_total), plural(ov.authors_total, "Активный автор", "Активных автора", "Активных авторов"),
        `соавторство и команды книг`)}
      ${hero(I.users, "purple", numc(ov.users_total), plural(ov.users_total, "Пользователь", "Пользователя", "Пользователей"),
        `активны сегодня: ${t.active_users_today}`)}
      ${hero(I.clock, "blue", numc(ov.changes_total), plural(ov.changes_total, "Изменение", "Изменения", "Изменений"),
        `сегодня: ${t.edits_today}`)}
      ${hero(I.doc, "teal", numc(ai.pages_processed), "Страниц через OCR",
        `${ai.ocr_jobs} ${plural(ai.ocr_jobs, "распознавание", "распознавания", "распознаваний")}`)}
      ${hero(I.ai, "gold", `<span aria-label="${fmtNum(tokensTotal)}">${fmtShort(tokensTotal)}</span>`, "AI-токенов использовано",
        `расход: $${(+tok.cost_usd).toFixed(2)}`)}
    </div>

    <div class="card mult-card">
      <h3 class="card-h">Активность за 30 дней</h3>
      <div class="mult-grid">
        ${mult("Новые учебники", numc(books30sum), booksP, ACC.orange, v => fmtNum(v))}
        ${mult("AI-анализы", numc(jobs30sum), jobsP, ACC.blue, v => fmtNum(v))}
        ${mult("Расход AI", numc(cost30sum, { prefix: "$", dec: 2 }), costP, ACC.green, v => "$" + (+v).toFixed(2))}
      </div>
    </div>

    ${sec(I.route, "blue", "Жизненный цикл учебников")}
    <div class="cards" style="grid-template-columns:repeat(auto-fit,minmax(330px,1fr));align-items:start">
      <div class="card"><h3 class="card-h">Этапы согласования</h3>
        <div class="sub" style="font-size:12px;color:var(--muted);margin:-6px 0 10px">Где сейчас книги — видно, на каком этапе образовалась очередь</div>
        ${ST_ORDER.map(lcRow).join("")}</div>
      <div class="card att-card"><h3 class="card-h">${I.alert}Требуют внимания</h3>${attnHtml}</div>
    </div>
    <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(300px,470px));margin-top:14px">
      <div class="card"><h3 class="card-h">Книги по классам</h3>
        ${pctBars(ov.by_grade.map(x => ({ ...x, grade: x.grade + " класс" })), "grade", ACC.orange)}</div>
      <div class="card"><h3 class="card-h">Книги по предметам</h3>${donutChart(subjectsDonutData)}</div>
    </div>

    ${sec(I.users, "purple", "Работа команды")}
    <div class="mini-grid team-row">
      ${mini("Изменений сегодня", numc(t.edits_today), "правки и события книг", ACC.blue)}
      ${mini("Комментариев сегодня", numc(t.comments_today), "замечания и предложения", ACC.orange)}
      ${mini("Версий сегодня", numc(t.versions_today), "контрольные точки", ACC.purple)}
      ${mini("Согласований сегодня", numc(t.approvals_today), "решения по этапам", ACC.green)}
    </div>
    <div class="cards team-row team-cards" style="margin-top:10px">
      <div class="card"><h3 class="card-h">Пользователи по ролям</h3>${rolesHtml}</div>
      <div class="card"><h3 class="card-h">Активные авторы</h3>
        ${topList(ops.tops.authors, c => `${c} ${plural(c, "действие", "действия", "действий")}`)}</div>
      <div class="card"><h3 class="card-h">Активные редакторы</h3>
        ${topList(ops.tops.editors, c => `${c} ${plural(c, "действие", "действия", "действий")}`)}</div>
      <div class="card"><h3 class="card-h">Активные эксперты</h3>
        ${topList(ops.tops.experts, c => `${c} ${plural(c, "действие", "действия", "действий")}`)}</div>
    </div>

    ${sec(I.ai, "blue", "OCR и AI")}
    <div class="cards" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));align-items:start">
      <div class="card"><h3 class="card-h">${I.doc}OCR</h3>
        ${bstat("Страниц обработано", numc(ai.pages_processed))}
        ${bstat("Распознаваний (сканы и фото)", numc(ai.ocr_jobs))}
        ${bstat("Обработок с ошибкой", numc(ai.jobs_error), ai.jobs_total ? `успешность ${ai.success_rate}%` : "")}
      </div>
      <div class="card"><h3 class="card-h">${I.ai}AI-анализ</h3>
        ${bstat("Токенов использовано", `<span aria-label="${fmtNum(tokensTotal)}">${fmtShort(tokensTotal)}</span>`,
          `${fmtShort(tok.input_tokens)} вход · ${fmtShort(tok.output_tokens)} выход`)}
        ${bstat("Проверок выполнено", numc(ai.jobs_done))}
        ${bstat("Среднее время проверки", numc(ai.avg_duration_ms / 1000, { dec: 1, suffix: " с" }))}
      </div>
      <div class="card"><h3 class="card-h">${I.save}Расход AI</h3>
        ${spend("Сегодня", tok.cost_today)}
        ${spend("Неделя", tok.cost_week)}
        ${spend("Месяц", tok.cost_month)}
        <div class="spend-total">за всё время: <b>$${(+tok.cost_usd).toFixed(2)}</b> · ${fmtNum(tok.requests)} ${plural(tok.requests, "запрос", "запроса", "запросов")}</div>
      </div>
    </div>

    ${sec(I.pulse, "green", "Система")}
    <div class="cards" style="grid-template-columns:repeat(auto-fit,minmax(330px,1fr));align-items:start">
      <div class="card"><h3 class="card-h">Здоровье системы</h3>${healthHtml}</div>
      <div class="card"><h3 class="card-h">Лента активности</h3>
        <div style="max-height:420px;overflow-y:auto;padding-right:4px">${feedHtml}</div></div>
    </div>
  `);
  animateCounters();
}

/* ================= Администрирование ================= */
let adminTab = "users";

const ADMIN_TABS = [
  ["users", "Пользователи", "admin.users"],
  ["roles", "Роли и права", "admin.system"],
  ["dicts", "Предметы и классы", "books.view"],
  ["standards", "Стандарты", "books.view"],
  ["stpl", "Госшаблоны", "admin.system"],
  ["settings", "OCR / AI", "admin.system"],
  ["logs", "Журналы", "admin.system"],
  ["backups", "Копии", "admin.system"],
];

async function viewAdmin() {
  // вкладки видны ВСЕ; недоступные роли — прозрачные и некликабельные
  const tabs = ADMIN_TABS.filter(([, , perm]) => can(perm));
  if (!tabs.length) { location.hash = "#/dashboard"; return; }
  const hm = location.hash.match(/^#\/admin\/(\w+)/);
  if (hm && tabs.some(([id]) => id === hm[1])) adminTab = hm[1];
  if (!tabs.some(([id]) => id === adminTab)) adminTab = tabs[0][0];
  shell("admin", `
    <div class="page-head">
      <div><h1>Администрирование</h1><div class="sub">Управление системой: пользователи, роли, справочники, настройки, журналы, резервные копии</div></div>
    </div>
    <div class="tabs admin-tabs">
      ${ADMIN_TABS.map(([id, t, perm]) => can(perm)
        ? `<button data-atab="${id}" class="${adminTab === id ? "active" : ""}">${t}</button>`
        : `<button class="tab-off" disabled aria-label="Недоступно вашей роли">${t}</button>`).join("")}
    </div>
    <div id="admin-body"><div class="empty">Загрузка…</div></div>
  `);
  $$("[data-atab]").forEach(b => b.onclick = () => { location.hash = "#/admin/" + b.dataset.atab; });
  const render = {
    users: adminUsers, roles: adminRoles, dicts: adminDicts,
    standards: adminStandards, stpl: adminStateTpl, settings: adminSettings,
    logs: adminLogs, backups: adminBackups,
  }[adminTab];
  try { await render($("#admin-body")); }
  catch (e) { $("#admin-body").innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

/* ---- Пользователи ---- */
let usersRoleFilter = null; // код роли из быстрых действий вкладки «Роли и права»

async function adminUsers(root) {
  let users = await api("/api/users");
  const me = state.me || {};
  const filterChip = usersRoleFilter ? `
    <span class="filter-chip">${roleBadge(usersRoleFilter)}
      <button class="icon-btn" id="uf-clear" aria-label="Снять фильтр">${I.x}</button></span>` : "";
  if (usersRoleFilter) users = users.filter(u => u.roles.some(r => r.code === usersRoleFilter));

  const userRow = u => `
    <div class="urow ${u.active ? "" : "inactive"}" data-open="${u.id}">
      ${avatar(u.name, u.role, "sm2")}
      <div class="ur-id">
        <b>${esc(u.name)}</b>
        <span class="ur-sub">@${esc(u.login)}${u.email ? ` · ${esc(u.email)}` : ""}</span>
      </div>
      <div class="ur-roles">${u.roles.map(r => roleBadge(r.code, r.title)).join("")}</div>
      <div class="ur-meta">
        <span>${I.book}${u.books_count}</span>
        <span>${I.clock}${humanWhen(u.last_action_at)}</span>
      </div>
      ${u.active ? "" : `<span class="chip gray">откл.</span>`}
      <button class="btn small ghost" data-edit="${u.id}">Изменить</button>
    </div>`;

  root.innerHTML = `
    <div class="users-layout">
      <aside class="card myprofile">
        <span class="mp-tag">Мой аккаунт</span>
        ${avatar(me.name, me.role, "big")}
        <b class="mp-name">${esc(me.name || "—")}</b>
        <span class="mp-login">@${esc(me.login || "")}</span>
        ${me.email ? `<a class="mp-mail" href="mailto:${esc(me.email)}">${I.mail}${esc(me.email)}</a>`
          : `<span class="mp-mail mp-empty">${I.mail}email не указан</span>`}
        <div class="mp-roles">${(me.roles || []).map(r => roleBadge(r.code, r.title)).join("")}</div>
        <p class="mp-bio ${me.bio ? "" : "mp-empty"}">${me.bio ? esc(me.bio) : "Биография не заполнена"}</p>
        <div class="mp-meta">${I.clock}в системе с ${esc(String(me.created_at || "").slice(0, 10))}</div>
        <button class="btn primary" id="mp-edit">${I.pen}Редактировать профиль</button>
      </aside>
      <section class="users-main">
        <div class="um-head">
          <div class="sub" style="color:var(--muted);font-size:13px;display:flex;align-items:center;gap:10px">
            ${filterChip || `Все пользователи · ${users.length}`}</div>
          <button class="btn primary" id="u-new">${I.plus}Новый пользователь</button>
        </div>
        <div class="urows">
          ${users.length ? users.map(userRow).join("") : `<div class="empty">Нет пользователей с этой ролью</div>`}
        </div>
      </section>
    </div>`;

  $("#u-new").onclick = () => openUserModal(null);
  $("#mp-edit").onclick = () => openUserModal(users.find(u => u.id === me.id) || me);
  if ($("#uf-clear")) $("#uf-clear").onclick = () => { usersRoleFilter = null; adminUsers(root); };
  $$("[data-edit]", root).forEach(b => b.onclick = e => {
    e.stopPropagation();
    openUserModal(users.find(u => u.id === +b.dataset.edit));
  });
  $$("[data-open]", root).forEach(c => c.onclick = e => {
    if (e.target.closest("[data-edit]")) return;
    location.hash = "#/user/" + c.dataset.open;
  });
}

/* ---- Роли и права ---- */
const PERM_GROUPS = [
  { t: "Учебники", s: "Учебники", i: "book",
    ps: ["books.view", "books.create", "books.edit", "books.edit_any", "books.delete", "books.members", "books.versions", "books.comment"] },
  { t: "Согласование", s: "Согласование", i: "route",
    ps: ["workflow.submit", "workflow.editorial", "workflow.methodist", "workflow.lawyer", "workflow.reviewer", "workflow.ministry", "workflow.publish"] },
  { t: "Конвейер", s: "Конвейер", i: "layout", ps: ["pipeline.work", "pipeline.manage"] },
  { t: "AI и статистика", s: "AI", i: "ai", ps: ["ai.analyze", "stats.view"] },
  { t: "Администрирование", s: "Админ.", i: "shield", ps: ["admin.users", "admin.system"] },
];
let rolesQuery = "";
let rolesSelected = null; // выбранная карточка — статы в правой панели
let permClipboard = null; // {from, title, perms: [...]}

async function adminRoles(root) {
  const data = await api("/api/admin/roles");
  const roleCodes = Object.keys(data.roles);
  const matrix = {};
  roleCodes.forEach(r => matrix[r] = new Set(data.matrix[r] || []));
  const permTotal = Object.keys(data.perms).length;
  const title = code => code === "superadmin" ? "Суперадминистратор" : data.roles[code];

  const level = code => {
    if (code === "superadmin") return ["full", "Полный доступ"];
    const n = matrix[code].size;
    if (n >= 12) return ["ext", "Расширенный"];
    if (n >= 5) return ["lim", "Ограниченный"];
    return ["view", "Только просмотр"];
  };

  const metaRow = code => {
    const users = data.users[code] || 0;
    const act = data.last_activity[code];
    const nperm = code === "superadmin" ? permTotal : matrix[code].size;
    return `<div class="rc-meta">
      <span>${I.users}${users} ${plural(users, "пользователь", "пользователя", "пользователей")}</span>
      <span>${I.clock}${act ? humanWhen(act) : "нет активности"}</span>
      <span>${I.check}${nperm} ${plural(nperm, "разрешение", "разрешения", "разрешений")}</span>
    </div>`;
  };

  const roleCard = code => {
    const m = roleMeta(code);
    const [lc, lt] = level(code);
    return `<div class="card role-card" data-role="${code}" style="--rb:${m.c};--rbs:${m.s}">
      <div class="rc-actions">
        <button class="rca" data-act="edit" data-r="${code}" aria-label="Права роли">${I.pen}</button>
        <button class="rca" data-act="users" data-r="${code}" aria-label="Пользователи с этой ролью">${I.users}</button>
        ${code !== "superadmin" ? `<button class="rca" data-act="copy" data-r="${code}" aria-label="Копировать набор прав">${I.doc}</button>` : ""}
      </div>
      <div class="rc-top"><span class="rc-ic">${I[m.i]}</span>
        <div class="rc-tt"><b class="rc-title">${esc(title(code))}</b>
          <span class="lvl lvl-${lc}">${lt}</span>
          <div class="rc-desc">${esc(m.d)}</div></div></div>
      ${metaRow(code)}
    </div>`;
  };

  /* правая панель: статы групп выбранной роли (призрачная, пока не выбрали) */
  const panelHtml = () => {
    const code = rolesSelected;
    if (!code) {
      return `<div class="rsp-ghost">
        <div class="rsp-head"><span class="rsp-ava">${I.users}</span>
          <div><b>Выберите роль</b><div class="rsp-sub">кликните карточку слева — здесь появятся её показатели</div></div></div>
        ${PERM_GROUPS.map(g => `
          <div class="rsp-row"><span class="rsp-l">${I[g.i]}${g.t}</span>
            <div class="rsp-bar"><i style="width:0%"></i></div><b>—/${g.ps.length}</b></div>`).join("")}
        <div class="rsp-total">— из ${permTotal} разрешений</div>
      </div>`;
    }
    const m = roleMeta(code);
    const [lc, lt] = level(code);
    const users = data.users[code] || 0;
    const nperm = code === "superadmin" ? permTotal : matrix[code].size;
    return `<div class="rsp-live" style="--rb:${m.c};--rbs:${m.s}">
      <div class="rsp-head"><span class="rsp-ava">${I[m.i]}</span>
        <div style="min-width:0"><b>${esc(title(code))}</b> <span class="lvl lvl-${lc}">${lt}</span>
          <div class="rsp-sub">${users} ${plural(users, "пользователь", "пользователя", "пользователей")} · ${esc(data.last_activity[code] ? humanWhen(data.last_activity[code]) : "нет активности")}</div></div></div>
      ${PERM_GROUPS.map((g, gi) => {
        const n = code === "superadmin" ? g.ps.length : g.ps.filter(p => matrix[code].has(p)).length;
        return `<div class="rsp-row ${n ? "" : "zero"}"><span class="rsp-l">${I[g.i]}${g.t}</span>
          <div class="rsp-bar"><i style="width:${(n / g.ps.length * 100).toFixed(0)}%;animation-delay:${140 + gi * 160}ms"></i></div><b>${n}/${g.ps.length}</b></div>`;
      }).join("")}
      <div class="rsp-total"><b>${nperm}</b> из ${permTotal} разрешений включено</div>
      <button class="btn primary" id="rsp-edit" style="width:100%;margin-top:12px">${I.pen}${data.editable && code !== "superadmin" ? "Изменить права" : "Посмотреть права"}</button>
    </div>`;
  };

  const renderPanel = () => {
    $("#rstat").innerHTML = panelHtml();
    const b = $("#rsp-edit");
    if (b) b.onclick = () => openRoleDrawer(rolesSelected);
  };

  const render = () => {
    const q = rolesQuery.trim().toLowerCase();
    const codes = ["superadmin", ...roleCodes].filter(c =>
      !q || title(c).toLowerCase().includes(q) || (roleMeta(c).d || "").toLowerCase().includes(q));
    $("#role-cards").innerHTML = codes.length
      ? codes.map(roleCard).join("")
      : `<div class="empty" style="grid-column:1/-1">Роль «${esc(rolesQuery)}» не найдена</div>`;
    $$(".role-card", root).forEach(x => x.classList.toggle("selected", x.dataset.role === rolesSelected));
    wireCards();
    renderPanel();
  };

  const openParam = (location.hash.match(/[?&]open=(\w+)/) || [])[1];

  root.innerHTML = `
    <div class="roles-bar">
      <div class="search-wrap">${I.search}<input id="role-q" placeholder="Найти роль…" value="${esc(rolesQuery)}"></div>
      <span class="sub" style="font-size:12.5px;color:var(--muted)">${data.editable
        ? "Клик по карточке — показатели справа; «Изменить права» — редактор."
        : "Просмотр: изменять права может только суперадминистратор."}</span>
      ${data.editable ? `<button class="btn" id="rm-reset" style="margin-left:auto">Сбросить к стандартной</button>` : ""}
    </div>
    <div class="roles-layout">
      <div class="roles-scroll"><div class="role-cards" id="role-cards"></div></div>
      <aside class="rstat-panel card" id="rstat"></aside>
    </div>`;
  render();
  const selParam = (location.hash.match(/[?&]sel=(\w+)/) || [])[1];
  if (selParam && (selParam === "superadmin" || roleCodes.includes(selParam))) {
    rolesSelected = selParam;
    render();
  }
  if (openParam && (openParam === "superadmin" || roleCodes.includes(openParam))) {
    rolesSelected = openParam;
    render();
    openRoleDrawer(openParam);
  }

  $("#role-q").oninput = e => { rolesQuery = e.target.value; render(); };
  if (data.editable) $("#rm-reset").onclick = async () => {
    if (!confirm("Вернуть стандартную матрицу прав для всех ролей?")) return;
    await api("/api/admin/roles/reset", { method: "POST" });
    toast("Матрица сброшена", "ok");
    state.me = await api("/api/auth/me");
    adminRoles(root);
  };

  function wireCards() {
    $$(".role-card", root).forEach(c => c.onclick = e => {
      if (e.target.closest(".rca")) return;
      rolesSelected = c.dataset.role;
      $$(".role-card", root).forEach(x => x.classList.toggle("selected", x.dataset.role === rolesSelected));
      renderPanel();
    });
    $$(".rca", root).forEach(b => b.onclick = e => {
      e.stopPropagation();
      const code = b.dataset.r;
      if (b.dataset.act === "edit") { rolesSelected = code; render(); openRoleDrawer(code); }
      if (b.dataset.act === "users") { usersRoleFilter = code; adminTab = "users"; viewAdmin(); }
      if (b.dataset.act === "copy") {
        permClipboard = { from: code, title: title(code), perms: [...matrix[code]] };
        toast(`Права роли «${title(code)}» скопированы — вставьте их в редакторе другой роли`, "ok");
      }
    });
  }

  /* ---- выезжающий справа редактор прав ---- */
  function openRoleDrawer(code) {
    const m = roleMeta(code);
    const locked = !data.editable || code === "superadmin";
    const draft = new Set(code === "superadmin" ? [] : matrix[code]); // черновик до «Сохранить»
    const host = document.createElement("div");
    host.className = "drawer-overlay";
    host.innerHTML = `
      <aside class="drawer" style="--rb:${m.c};--rbs:${m.s}">
        <div class="drawer-h">
          <span class="rc-ic">${I[m.i]}</span>
          <div style="flex:1;min-width:0">
            <b class="dr-title">${esc(title(code))}</b>
            <span class="lvl" id="dr-lvl"></span>
            <div class="rc-desc">${esc(m.d)}</div>
          </div>
          <button class="icon-btn" id="dr-close" aria-label="Закрыть">${I.x}</button>
        </div>
        <div class="drawer-body">
          ${code === "superadmin" ? `<div class="dr-note">${I.check}Право «*» — суперадминистратору разрешены все действия. Изменить нельзя.</div>` : `
          ${locked ? `<div class="dr-note warn">${I.eye}Режим просмотра — изменять права может только суперадминистратор.</div>` : ""}
          ${!locked && permClipboard && permClipboard.from !== code ? `
            <button class="btn small" id="dr-paste" style="margin-bottom:6px">${I.doc}Вставить права из «${esc(permClipboard.title)}»</button>` : ""}
          `}
          ${PERM_GROUPS.map(g => `
            <div class="dr-group">
              <div class="pg-head"><span class="pg-ic">${I[g.i]}</span>${g.t}
                <span class="dr-gcnt" data-g="${g.t}"></span></div>
              ${g.ps.map(p => `
                <div class="pg-row">
                  <span class="pg-lbl">${esc(data.perms[p])}<i>${esc(p)}</i></span>
                  <label class="switch"><input type="checkbox" data-p="${p}"
                    ${code === "superadmin" || draft.has(p) ? "checked" : ""} ${locked ? "disabled" : ""}><i></i></label>
                </div>`).join("")}
            </div>`).join("")}
        </div>
        <div class="drawer-f">
          ${locked ? `<button class="btn" id="dr-cancel">Закрыть</button>` : `
            <button class="btn" id="dr-cancel">Отмена</button>
            <button class="btn primary" id="dr-save">${I.save}Сохранить</button>`}
        </div>
      </aside>`;
    $("#modal-root").appendChild(host);

    const refresh = () => {
      const n = code === "superadmin" ? permTotal : draft.size;
      const lvl = code === "superadmin" ? ["full", "Полный доступ"]
        : n >= 12 ? ["ext", "Расширенный"] : n >= 5 ? ["lim", "Ограниченный"] : ["view", "Только просмотр"];
      const le = $("#dr-lvl", host);
      le.className = `lvl lvl-${lvl[0]}`;
      le.textContent = lvl[1];
      PERM_GROUPS.forEach(g => {
        const gn = code === "superadmin" ? g.ps.length : g.ps.filter(p => draft.has(p)).length;
        const el = $(`.dr-gcnt[data-g="${g.t}"]`, host);
        if (el) el.textContent = `${gn}/${g.ps.length}`;
      });
    };
    refresh();

    const close = () => { host.classList.add("closing"); setTimeout(() => host.remove(), 180); };
    host.onclick = e => { if (e.target === host) close(); };
    $("#dr-close", host).onclick = close;
    $("#dr-cancel", host).onclick = close;
    $$("input[data-p]", host).forEach(cb => cb.onchange = () => {
      cb.checked ? draft.add(cb.dataset.p) : draft.delete(cb.dataset.p);
      refresh();
    });
    const pasteBtn = $("#dr-paste", host);
    if (pasteBtn) pasteBtn.onclick = () => {
      draft.clear();
      permClipboard.perms.forEach(p => { if (data.perms[p]) draft.add(p); });
      $$("input[data-p]", host).forEach(cb => cb.checked = draft.has(cb.dataset.p));
      refresh();
      toast("Права вставлены — не забудьте сохранить", "ok");
    };
    const saveBtn = $("#dr-save", host);
    if (saveBtn) saveBtn.onclick = async () => {
      matrix[code] = new Set(draft);
      const body = {};
      roleCodes.forEach(r => body[r] = [...matrix[r]]);
      try {
        await api("/api/admin/roles", { method: "PUT", body: { matrix: body } });
        toast(`Права роли «${title(code)}» сохранены`, "ok");
        state.me = await api("/api/auth/me");
        close();
        render();
      } catch (e) { toast(e.message, "err"); }
    };
  }
}

/* ---- Учебники ---- */
/* Управление учебниками (статусы, удаление) переехало в раздел «Учебники» (#/library) */

/* ---- Предметы и классы ---- */
/* иконки предметов (в стиле общего набора I) */
const SJ = {
  calc: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/></svg>',
  atom: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><ellipse cx="12" cy="12" rx="9" ry="3.8"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(120 12 12)"/></svg>',
  flask: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 3h5M10 3v5.2L4.8 17.5a2 2 0 0 0 1.8 3h10.8a2 2 0 0 0 1.8-3L14 8.2V3"/><path d="M7.3 14h9.4"/></svg>',
  leaf: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21c8 0 13-5 13-14V4h-3C7.5 4 3 9.5 3 15c0 2.3.8 4.3 3 6z"/><path d="M6 21c0-6 3-10 9-13"/></svg>',
  globe: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a13.8 13.8 0 0 1 0 18 13.8 13.8 0 0 1 0-18z"/></svg>',
  bookOpen: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5C10.4 5 8.3 4.5 5.5 4.5H3v14h2.5c2.8 0 4.9.5 6.5 2 1.6-1.5 3.7-2 6.5-2H21v-14h-2.5c-2.8 0-4.9.5-6.5 2z"/><path d="M12 6.5v14"/></svg>',
  lang: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.3 8.3 0 0 1-8.5 8.2c-1.5 0-3-.4-4.2-1L3 20l1.3-4.8a8 8 0 0 1-.4-3.7A8.3 8.3 0 0 1 12.5 3.3 8.3 8.3 0 0 1 21 11.5z"/><text x="12.3" y="15" text-anchor="middle" font-size="8.5" font-weight="700" font-family="inherit" fill="currentColor" stroke="none">Аа</text></svg>',
  code: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"/></svg>',
  music: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5.5L20 3.5V16"/><circle cx="6.4" cy="18" r="2.6"/><circle cx="17.4" cy="16" r="2.6"/></svg>',
  palette: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 1 1 9-9c0 2.2-1.4 3.5-3.4 3.5H15a2 2 0 0 0-1.5 3.3c.6.7.1 2.2-1.5 2.2z"/><path d="M7.7 12.2h.01M10 8h.01M14.2 7.5h.01M17.1 10.5h.01"/></svg>',
  sport: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/></svg>',
  wrench: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  sprout: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-9"/><path d="M12 12C12 8 9 5.5 4 5.5c0 4.5 2.6 7 8 6.5z"/><path d="M12 10c0-3.5 2.6-6 8-6 0 4-2.6 6.7-8 6z"/></svg>',
  heart: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5C6.5 16.7 3 13.5 3 9.7A4.6 4.6 0 0 1 7.6 5c1.9 0 3.4 1 4.4 2.6A5.1 5.1 0 0 1 16.4 5 4.6 4.6 0 0 1 21 9.7c0 3.8-3.5 7-9 10.8z"/></svg>',
  cap: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 9 10-4.5L22 9l-10 4.5L2 9z"/><path d="M6.5 11.5V16c0 1.4 2.4 2.8 5.5 2.8s5.5-1.4 5.5-2.8v-4.5"/><path d="M22 9v5"/></svg>',
};
/* подбор иконки и цвета по названию предмета (рус/кырг) */
const SJ_MAP = [
  [/физкульт|спорт|дене/, "sport", 2],
  [/матем|алгебр|геометр/, "calc", 0],
  [/физик/, "atom", 6],
  [/хими/, "flask", 5],
  [/биолог/, "leaf", 2],
  [/географ/, "globe", 7],
  [/истори|тарых/, "landmark", 3],
  [/литерат|чтени|адабият|окуу/, "bookOpen", 1],
  [/информат|программ|компьютер|цифр/, "code", 0],
  [/музык/, "music", 4],
  [/^изо$|изобраз|искусств|көркөм|худож|рисован/, "palette", 1],
  [/труд|технолог|эмгек|черчени/, "wrench", 3],
  [/обж|безопасн/, "shield", 4],
  [/природ|окружа|естеств|табият|мекен/, "sprout", 2],
  [/этик|адеп/, "heart", 4],
  [/общество|граждан|человек/, "users", 6],
  [/тил|язык|русск|кыргыз|англи|немец|франц/, "lang", 6],
];
function subjMeta(name) {
  const n = (name || "").toLowerCase().trim();
  for (const [re, ic, h] of SJ_MAP) if (re.test(n)) return { icon: SJ[ic] || I[ic], hue: h };
  let s = 0; for (let i = 0; i < n.length; i++) s = (s * 31 + n.charCodeAt(i)) & 0xffff;
  return { icon: I.book, hue: s % 8 };
}

async function adminDicts(root) {
  const d = await api("/api/admin/dictionaries");
  if (!can("admin.system")) root.classList.add("admin-ro"); else root.classList.remove("admin-ro");
  renderDicts(root, d);
}

let dictSaveT;
function renderDicts(root, d, focus) {
  const sub = (v, i) => { const m = subjMeta(v); return `
    <div class="dsub sh${m.hue}" style="--d:${Math.min(i * 28, 400)}ms">
      <span class="dsub-ic">${m.icon}</span>
      <input class="dchip-in" data-i="${i}" value="${esc(v)}" aria-label="Название предмета">
      <button class="dchip-x" data-del="${i}" aria-label="Удалить предмет">${I.x}</button>
    </div>`; };
  const tile = (v, i) => `
    <div class="dgr" style="--d:${Math.min(i * 28, 400)}ms">
      <input class="dtile-in" data-i="${i}" value="${esc(v)}" maxlength="4" aria-label="Номер класса">
      <span class="dgr-cap">класс</span>
      <button class="dtile-x" data-del="${i}" aria-label="Удалить класс">${I.x}</button>
    </div>`;
  // классы группируются по ступеням школы; внутри ступени — по возрастанию
  const gradeItems = d.grades.map((v, i) => ({ v, i, n: parseInt(v, 10) }));
  const stageOf = x => isNaN(x.n) ? 3 : x.n <= 4 ? 0 : x.n <= 9 ? 1 : 2;
  const STAGES = [
    { t: "Начальная школа", r: "1–4 класс", c: "#16A34A" },
    { t: "Основная школа", r: "5–9 класс", c: "#2563EB" },
    { t: "Старшая школа", r: "10–11 класс", c: "#7C3AED" },
    { t: "Другое", r: "", c: "#94A3B8" },
  ];
  const gradesHtml = STAGES.map((st, s) => {
    const list = gradeItems.filter(x => stageOf(x) === s)
      .sort((a, b) => ((isNaN(a.n) ? 999 : a.n) - (isNaN(b.n) ? 999 : b.n)) || (a.i - b.i));
    if (!list.length) return "";
    return `
      <div class="dgrp" style="--gc:${st.c}">
        <div class="dgrp-h"><i></i><b>${st.t}</b>${st.r ? `<span>${st.r}</span>` : ""}</div>
        <div class="dgrp-row">${list.map(x => tile(x.v, x.i)).join("")}</div>
      </div>`;
  }).join("");
  root.innerHTML = `
    <div class="dict-wrap${focus ? "" : " dict-anim"}">
      <div class="dict-bar">
        <div class="dict-intro">
          <span class="dict-intro-ic">${I.gear}</span>
          <div>
            <b>Справочник предметов и классов</b>
            <p>Определяет варианты предмета и класса в форме «Новый учебник», при загрузке образовательных
               стандартов и в статистике. Изменения сохраняются автоматически.</p>
          </div>
        </div>
        <span class="dict-status ok" id="dict-status">${I.check}Сохранено</span>
      </div>
      <div class="dict-cols">
        <div class="dict-col">
          <div class="dict-col-h"><span class="dcol-ic sh0">${SJ.bookOpen}</span><b>Предметы</b>
            <span class="dict-count" id="cnt-subjects">${d.subjects.length}</span>
            <span class="hint">иконка и цвет подбираются по названию</span></div>
          <div class="dict-scroll dsub-grid" data-key="subjects">
            ${d.subjects.map(sub).join("")}
            <label class="dsub add"><span class="dsub-ic">${I.plus}</span>
              <input class="dadd" data-add="subjects" placeholder="Новый предмет — Enter"></label>
          </div>
        </div>
        <div class="dict-col">
          <div class="dict-col-h"><span class="dcol-ic sh1">${SJ.cap}</span><b>Классы</b>
            <span class="dict-count" id="cnt-grades">${d.grades.length}</span></div>
          <div class="dict-scroll dgr-field" data-key="grades">
            ${gradesHtml}
            <button class="dgr-addbtn" data-add="grades">${I.plus}Добавить класс</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.classList.add("noscroll"); // на этой вкладке страница не листается
  const wrap = $(".dict-wrap", root);

  const spin = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.56"/></svg>';
  const setStatus = (txt, cls) => { const el = $("#dict-status"); if (el) { el.innerHTML = (cls === "ok" ? I.check : cls === "saving" ? spin : I.alert) + txt; el.className = "dict-status " + cls; } };
  const save = () => {
    setStatus("Сохранение…", "saving");
    clearTimeout(dictSaveT);
    dictSaveT = setTimeout(async () => {
      const body = { subjects: d.subjects.map(s => s.trim()).filter(Boolean), grades: d.grades.map(g => g.trim()).filter(Boolean) };
      try {
        await api("/api/admin/dictionaries", { method: "PUT", body });
        state.meta = await api("/api/books/meta");
        setStatus("Сохранено", "ok");
      } catch (e) { setStatus("Ошибка сохранения", "err"); }
    }, 650);
  };

  wrap.addEventListener("input", e => {
    const t = e.target;
    if (!t.classList.contains("dchip-in") && !t.classList.contains("dtile-in")) return;
    d[t.closest("[data-key]").dataset.key][+t.dataset.i] = t.value;
    if (t.classList.contains("dchip-in")) {
      // иконка и цвет подстраиваются под название на лету
      const card = t.closest(".dsub"), m = subjMeta(t.value);
      card.className = `dsub sh${m.hue}`;
      $(".dsub-ic", card).innerHTML = m.icon;
    }
    save();
  });
  wrap.addEventListener("keydown", e => {
    if (e.target.classList.contains("dadd") && e.key === "Enter") {
      e.preventDefault();
      const v = e.target.value.trim();
      if (v) { d.subjects.push(v); renderDicts(root, d, "add-subjects"); save(); }
    }
  });
  wrap.addEventListener("click", e => {
    const del = e.target.closest("[data-del]");
    const add = e.target.closest("[data-add]");
    if (del) { const key = del.closest("[data-key]").dataset.key; d[key].splice(+del.dataset.del, 1); renderDicts(root, d, "refocus"); save(); return; }
    if (add && add.dataset.add === "grades") { d.grades.push(""); renderDicts(root, d, "grade-last"); save(); return; }
  });

  if (focus === "add-subjects") { const a = $(".dadd", root); if (a) { a.closest(".dict-scroll").scrollTop = 9e9; a.focus(); } }
  if (focus === "grade-last") { const last = $(`.dtile-in[data-i="${d.grades.length - 1}"]`, root); if (last) { last.scrollIntoView({ block: "nearest" }); last.focus(); last.select(); } }
}

/* ---- Образовательные стандарты ---- */
async function adminStandards(root) {
  const items = await api("/api/admin/standards");
  root.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div class="sub" style="color:var(--muted);font-size:13px;max-width:640px">
        Загруженные стандарты автоматически подставляются в AI-анализ: документ сверяется
        с текстом стандарта по своему предмету (плюс общие стандарты без предмета).</div>
      ${can("admin.system") ? `<button class="btn primary" id="std-new">${I.plus}Добавить стандарт</button>` : ""}</div>
    ${items.length ? `<table class="tbl">
      <tr><th>Название</th><th>Предмет</th><th>Класс</th><th>Текст</th><th>Добавлен</th><th></th></tr>
      ${items.map(s => `<tr>
        <td><b>${esc(s.title)}</b>${s.url ? `<div style="font-size:12px"><a href="${esc(s.url)}" target="_blank">${esc(s.url)}</a></div>` : ""}</td>
        <td>${esc(s.subject || "общий")}</td><td>${esc(s.grade || "—")}</td>
        <td>${s.text_len ? fmtNum(s.text_len) + " симв." : `<span class="chip gray">нет текста</span>`}</td>
        <td>${esc(s.created_at.slice(0, 10))}</td>
        <td style="white-space:nowrap"><button class="btn small ghost" data-sedit="${s.id}">Изменить</button>
          <button class="icon-btn" data-sdel="${s.id}">${I.trash}</button></td>
      </tr>`).join("")}</table>` : `<div class="empty">Стандартов пока нет</div>`}`;
  if ($("#std-new")) $("#std-new").onclick = () => openStandardModal(null, root);
  if (!can("admin.system")) root.classList.add("admin-ro"); else root.classList.remove("admin-ro");
  $$("[data-sedit]", root).forEach(b => b.onclick = async () => {
    const s = await api(`/api/admin/standards/${b.dataset.sedit}`);
    openStandardModal(s, root);
  });
  $$("[data-sdel]", root).forEach(b => b.onclick = async () => {
    if (!confirm("Удалить стандарт?")) return;
    await api(`/api/admin/standards/${b.dataset.sdel}`, { method: "DELETE" });
    adminStandards(root);
  });
}

function openStandardModal(s, root) {
  const m = modal({
    title: s ? "Стандарт: " + s.title : "Новый образовательный стандарт", wide: true,
    body: `
      <div class="field"><label>Название</label><input id="std-title" value="${esc(s?.title || "")}" placeholder="ГОС основного общего образования КР, предметный стандарт…"></div>
      <div class="row2">
        <div class="field"><label>Предмет (пусто = общий)</label>
          <select id="std-subject"><option value="">— общий —</option>
            ${state.meta.subjects.map(x => `<option ${s?.subject === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>
        <div class="field"><label>Класс(ы)</label><input id="std-grade" value="${esc(s?.grade || "")}" placeholder="5–9"></div>
      </div>
      <div class="field"><label>Ссылка на документ</label><input id="std-url" value="${esc(s?.url || "")}" placeholder="https://cbd.minjust.gov.kg/…"></div>
      <div class="field"><label>Текст стандарта (используется AI-анализом)</label>
        <textarea id="std-text" rows="10" placeholder="Вставьте ключевые требования стандарта…">${esc(s?.text || "")}</textarea></div>`,
    footer: `<button class="btn" id="std-cancel">Отмена</button>
             <button class="btn primary" id="std-save">${I.save}Сохранить</button>`,
  });
  $("#std-cancel").onclick = m.close;
  $("#std-save").onclick = async () => {
    const body = {
      title: $("#std-title").value, subject: $("#std-subject").value,
      grade: $("#std-grade").value, url: $("#std-url").value, text: $("#std-text").value,
    };
    try {
      if (s) await api(`/api/admin/standards/${s.id}`, { method: "PUT", body });
      else await api("/api/admin/standards", { method: "POST", body });
      m.close(); toast("Сохранено", "ok"); adminStandards(root);
    } catch (e) { toast(e.message, "err"); }
  };
}

/* ---- Госшаблоны ---- */
async function adminStateTpl(root) {
  const sp = await api("/api/admin/state-templates");
  root.innerHTML = `
    <div class="cards" style="grid-template-columns:1fr 1fr;align-items:start">
      <div class="card">
        <h3 style="margin:0 0 10px">Гимн Кыргызской Республики</h3>
        <div class="row2">
          <div class="field"><label>Название (кырг.)</label><input id="st-a-title" value="${esc(sp.anthem.title)}"></div>
          <div class="field"><label>Название (рус.)</label><input id="st-a-title-ru" value="${esc(sp.anthem.title_ru)}"></div>
        </div>
        <div class="row2">
          <div class="field"><label>Музыка</label><input id="st-a-music" value="${esc(sp.anthem.music)}"></div>
          <div class="field"><label>Слова</label><input id="st-a-lyrics" value="${esc(sp.anthem.lyrics)}"></div>
        </div>
        <div class="field"><label>Текст (кыргызский)</label><textarea id="st-a-kg" rows="10">${esc(sp.anthem.text_kg)}</textarea></div>
        <div class="field"><label>Текст (русский перевод)</label><textarea id="st-a-ru" rows="8">${esc(sp.anthem.text_ru)}</textarea></div>
      </div>
      <div>
        <div class="card" style="margin-bottom:16px">
          <h3 style="margin:0 0 10px">Флаг КР</h3>
          <div class="state-preview" style="grid-template-columns:1fr">
            <div class="sp"><img src="${esc(sp.flag.image)}" alt="Флаг" style="height:140px"></div></div>
          <button class="btn small" style="margin-top:10px" id="st-flag-upload">${I.upload}Заменить изображение</button>
        </div>
        <div class="card">
          <h3 style="margin:0 0 10px">Герб КР</h3>
          <div class="state-preview" style="grid-template-columns:1fr">
            <div class="sp"><img src="${esc(sp.gerb.image)}" alt="Герб" style="height:140px"></div></div>
          <button class="btn small" style="margin-top:10px" id="st-gerb-upload">${I.upload}Заменить изображение</button>
        </div>
        <div class="note" style="color:var(--muted);font-size:12.5px;margin-top:10px">
          Для официального тиража загрузите утверждённые изображения символики
          (SVG или PNG) — они попадут в печатные версии всех учебников.</div>
      </div>
    </div>
    <button class="btn primary" style="margin-top:14px" id="st-save">${I.save}Сохранить тексты</button>`;
  $("#st-save").onclick = async () => {
    await api("/api/admin/state-templates", { method: "PUT", body: { pages: {
      anthem: {
        title: $("#st-a-title").value, title_ru: $("#st-a-title-ru").value,
        music: $("#st-a-music").value, lyrics: $("#st-a-lyrics").value,
        text_kg: $("#st-a-kg").value, text_ru: $("#st-a-ru").value,
      },
    }}});
    state.meta = await api("/api/books/meta");
    toast("Госшаблоны сохранены", "ok");
  };
  const upload = (kind) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".svg,.png,.jpg,.jpeg,.webp";
    inp.onchange = async () => {
      if (!inp.files[0]) return;
      const fd = new FormData();
      fd.append("file", inp.files[0]);
      try {
        await api(`/api/admin/state-templates/image/${kind}`, { method: "POST", body: fd });
        state.meta = await api("/api/books/meta");
        toast("Изображение обновлено", "ok");
        adminStateTpl(root);
      } catch (e) { toast(e.message, "err"); }
    };
    inp.click();
  };
  $("#st-flag-upload").onclick = () => upload("flag");
  $("#st-gerb-upload").onclick = () => upload("gerb");
}

/* ---- Настройки OCR / AI ---- */
async function adminSettings(root) {
  const s = await api("/api/admin/settings");
  const langNames = { kir: "Кыргызский", rus: "Русский", eng: "Английский" };
  root.innerHTML = `
    <div class="um-head" style="margin-bottom:14px">
      <div class="sub" style="color:var(--muted);font-size:13px">Распознавание сканов и ИИ-анализ —
        настройки применяются сразу после сохранения</div>
      <button class="btn primary" id="set-save">${I.save}Сохранить настройки</button>
    </div>
    <div class="cards" style="grid-template-columns:1fr 1fr;align-items:start">
      <div class="card">
        <h3 style="margin:0 0 12px">Настройка OCR</h3>
        <div class="field"><label>Языки распознавания (Tesseract)</label>
          <div class="pick-grid" style="grid-template-columns:repeat(3,1fr)" id="ocr-langs">
            ${Object.entries(langNames).map(([code, name]) => `
              <div class="pick ${s.ocr.langs.includes(code) ? "selected" : ""}" data-lang="${code}">${name}</div>`).join("")}
          </div>
          <div class="note">Можно выбрать несколько — сканы распознаются по всем выбранным языкам сразу.</div>
        </div>
        <div class="field"><label>Лимит OCR-страниц на файл</label>
          <input id="ocr-pages" type="number" min="1" max="1000" value="${s.ocr.max_pages}">
          <div class="note">Страницы сверх лимита пропускаются — защита от очень больших файлов.</div></div>
      </div>
      <div class="card">
        <h3 style="margin:0 0 12px">Настройка ИИ — через OpenRouter</h3>
        <div class="field"><label>Модель (запросы идут через OpenRouter)</label>
          <div class="pick-grid ai-models" id="ai-models">
            ${Object.entries(s.ai.models).map(([mcode, p]) => `
              <div class="pick ${s.ai.model === mcode ? "selected" : ""}" data-v="${mcode}">
                <b>${mcode.replace("claude-", "")}</b>
                <span class="pk-sub">$${p.in} вход · $${p.out} выход за 1M</span>
              </div>`).join("")}
          </div></div>
        <div class="field"><label>Максимум символов текста в запросе</label>
          <input id="ai-chars" type="number" min="10000" max="400000" step="10000" value="${s.ai.max_chars}"></div>
        <div class="setrow">
          <div><b>Сверять с загруженными стандартами</b>
            <span>тексты стандартов по предмету добавляются в запрос AI</span></div>
          <label class="switch"><input type="checkbox" id="ai-standards" ${s.ai.use_standards ? "checked" : ""}><i></i></label>
        </div>
        <div class="field"><label>API-ключ OpenRouter</label>
          <input id="ai-key" type="password" placeholder="${s.ai.key_set ? `настроен (${esc(s.ai.key_masked)}, источник: ${s.ai.key_source === "env" ? "переменная окружения" : "база"}) — введите новый для замены` : "sk-or-…"}">
          <div class="note">${s.ai.key_source === "env" ? "Ключ из переменной окружения имеет приоритет над ключом из базы. " : "Ключ хранится в локальной базе системы. "}Ключ OpenRouter (sk-or-…) — весь ИИ (анализ, писатель, иллюстрации) работает через OpenRouter.</div></div>
      </div>
    </div>`;
  // языки — мульти-выбор чипами
  $("#ocr-langs").addEventListener("click", e => {
    const p = e.target.closest(".pick");
    if (!p) return;
    if (p.classList.contains("selected") && $$("#ocr-langs .pick.selected").length === 1) {
      toast("Нужен хотя бы один язык распознавания", "err");
      return;
    }
    p.classList.toggle("selected");
  });
  $("#set-save").onclick = async () => {
    const langs = $$("#ocr-langs .pick.selected", root).map(p => p.dataset.lang);
    const body = {
      ocr: { langs, max_pages: +$("#ocr-pages").value || 200 },
      ai: {
        model: $("#ai-models .selected")?.dataset.v,
        max_chars: +$("#ai-chars").value || 120000,
        use_standards: $("#ai-standards").checked,
      },
    };
    const key = $("#ai-key").value.trim();
    if (key) body.ai.api_key = key;
    try {
      await api("/api/admin/settings", { method: "PUT", body });
      toast("Настройки сохранены", "ok");
      adminSettings(root);
    } catch (e) { toast(e.message, "err"); }
  };
  $("#ai-models").addEventListener("click", e => {
    const p = e.target.closest(".pick");
    if (!p) return;
    $$("#ai-models .pick").forEach(x => x.classList.remove("selected"));
    p.classList.add("selected");
  });
}

/* ---- Журналы ---- */
async function adminLogs(root) {
  const [logs, hist] = await Promise.all([
    api("/api/admin/logs"), api("/api/admin/history"),
  ]);
  const actionLabel = { login: "Вход", user: "Пользователи", roles: "Роли", dict: "Справочники",
    standard: "Стандарты", state: "Госшаблоны", settings: "Настройки", backup: "Копии",
    book: "Учебники", ai: "AI-анализ", create: "Создание", version: "Версия",
    restore: "Восстановление", comment: "Комментарий", status: "Согласование",
    member: "Участники", import: "Импорт" };
  root.innerHTML = `
    <div class="cards" style="grid-template-columns:1fr 1fr;align-items:start">
      <div class="card"><h3 style="margin:0 0 10px">Журнал действий (система)</h3>
        <div style="max-height:520px;overflow-y:auto">
        ${timelineHtml(logs.map(l => ({
          who: l.user_name || "Система", chip: actionLabel[l.action] || l.action,
          text: l.details, when: l.created_at, color: ACTION_COLOR[l.action],
        })))}
        </div></div>
      <div class="card"><h3 style="margin:0 0 10px">История изменений учебников</h3>
        <div style="max-height:520px;overflow-y:auto">
        ${timelineHtml(hist.map(h => ({
          who: h.user_name || "Система", chip: h.book_title,
          text: `${actionLabel[h.action] || h.action}: ${h.details}`, when: h.created_at,
          color: ACTION_COLOR[h.action],
        })))}
        </div></div>
    </div>`;
}

/* ---- Резервные копии ---- */
async function adminBackups(root) {
  const items = await api("/api/admin/backups");
  root.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div class="sub" style="color:var(--muted);font-size:13px">
        Копия включает всю базу системы: пользователей, учебники, версии, настройки, журналы.
        Файлы хранятся в <code>data/backups</code>.</div>
      <button class="btn primary" id="bk-new">${I.save}Создать копию</button></div>
    ${items.length ? `<table class="tbl">
      <tr><th>Файл</th><th>Размер</th><th>Создана</th><th style="width:300px"></th></tr>
      ${items.map(b => `<tr>
        <td><b>${esc(b.name)}</b></td><td>${(b.size / 1024).toFixed(0)} КБ</td><td>${esc(b.created_at)}</td>
        <td style="display:flex;gap:8px">
          <a class="btn small" href="/api/admin/backups/${esc(b.name)}/download">${I.doc}Скачать</a>
          ${state.me.role === "superadmin" ? `<button class="btn small danger" data-restore="${esc(b.name)}">Восстановить</button>` : ""}
          <button class="icon-btn" data-bkdel="${esc(b.name)}">${I.trash}</button>
        </td></tr>`).join("")}</table>` : `<div class="empty">Резервных копий ещё нет</div>`}`;
  $("#bk-new").onclick = async () => {
    const r = await api("/api/admin/backups", { method: "POST" });
    toast(`Создана копия ${r.name}`, "ok");
    adminBackups(root);
  };
  $$("[data-restore]", root).forEach(b => b.onclick = async () => {
    if (!confirm(`ВНИМАНИЕ: текущие данные будут заменены содержимым копии ${b.dataset.restore}. Продолжить?`)) return;
    await api(`/api/admin/backups/${b.dataset.restore}/restore`, { method: "POST" });
    toast("База восстановлена из копии", "ok");
    state.me = await api("/api/auth/me");
    state.meta = await api("/api/books/meta");
    viewAdmin();
  });
  $$("[data-bkdel]", root).forEach(b => b.onclick = async () => {
    if (!confirm("Удалить файл копии?")) return;
    await api(`/api/admin/backups/${b.dataset.bkdel}`, { method: "DELETE" });
    adminBackups(root);
  });
}

function openUserModal(u) {
  const roles = Object.entries(state.meta.roles)
    .filter(([code]) => state.me.role === "superadmin" || !["admin", "superadmin"].includes(code));
  const m = modal({
    title: u ? `Пользователь: ${u.name}` : "Новый пользователь", wide: true,
    body: `
      <div class="row2">
        <div class="field"><label>Имя (ФИО)</label><input id="u-name" value="${esc(u?.name || "")}"></div>
        <div class="field"><label>Логин</label><input id="u-login" value="${esc(u?.login || "")}" ${u ? "disabled" : ""}></div>
      </div>
      <div class="field"><label>Email / Gmail</label>
        <input id="u-email" type="email" value="${esc(u?.email || "")}" placeholder="name@gmail.com" autocomplete="off" autocorrect="off" spellcheck="false"></div>
      <div class="field"><label>${u ? "Новый пароль (пусто — не менять)" : "Пароль"}</label>
        <input id="u-pass" type="password" placeholder="Минимум 6 символов"></div>
      <div class="field"><label>Биография</label>
        <textarea id="u-bio" rows="3" placeholder="Коротко о себе: должность, опыт, интересы…">${esc(u?.bio || "")}</textarea></div>
      <div class="field"><label>Основная роль</label>
        <div class="roledd" id="dd-main">
          <button type="button" class="roledd-trigger" aria-expanded="false"><span class="roledd-val" id="dd-main-val"></span>${CHEV_DOWN}</button>
          <div class="roledd-panel"><div class="roledd-inner">
            <div class="pick-grid" style="grid-template-columns:repeat(3,1fr)" id="u-roles">
              ${roles.map(([code, title]) => `<div class="pick ${u?.role === code ? "selected" : ""}" data-v="${code}">${esc(title)}</div>`).join("")}
            </div>
          </div></div>
        </div></div>
      <div class="field"><label>Дополнительные роли (необязательно — права складываются)</label>
        <div class="roledd" id="dd-extra">
          <button type="button" class="roledd-trigger" aria-expanded="false"><span class="roledd-val" id="dd-extra-val"></span>${CHEV_DOWN}</button>
          <div class="roledd-panel"><div class="roledd-inner">
            <div class="pick-grid" style="grid-template-columns:repeat(3,1fr)" id="u-xroles">
              ${roles.map(([code, title]) => `<div class="pick ${u?.extra_roles?.includes(code) ? "selected" : ""}" data-v="${code}">${esc(title)}</div>`).join("")}
            </div>
          </div></div>
        </div></div>
      <div class="field"><label>Возможности выбранных ролей</label>
        <div class="uperm" id="u-perms"><span class="muted">Загрузка…</span></div></div>
      ${u && u.role !== "superadmin" ? `<label style="display:flex;gap:8px;align-items:center;font-weight:600;cursor:pointer">
        <input type="checkbox" id="u-active" ${u.active ? "checked" : ""}> Учётная запись активна</label>` : ""}`,
    footer: `<button class="btn" id="u-cancel">Отмена</button>
             <button class="btn primary" id="u-save">${I.save}Сохранить</button>`,
  });
  /* «Возможности выбранных ролей»: все права основной + дополнительных ролей,
     живо перерисовывается при смене выбора (права складываются) */
  let permsData = null;
  const renderPerms = () => {
    const box = $("#u-perms");
    if (!box || !permsData) return;
    const codes = [$("#u-roles .selected")?.dataset.v,
      ...$$("#u-xroles .selected").map(x => x.dataset.v)].filter(Boolean);
    const has = new Set();
    codes.forEach(c => {
      if (c === "superadmin") { Object.keys(permsData.perms).forEach(p => has.add(p)); return; } // всё
      (permsData.matrix[c] || []).forEach(p => has.add(p));
    });
    /* аккуратные группы как в «Ролях и правах»: цветная иконка, счётчик,
       шкала заполненности и права в два столбца (✓ есть / − нет) */
    const GC = { book: "#2563EB", route: "#7C3AED", layout: "#D97706", ai: "#0D9488", shield: "#DC2626" };
    const MINUS = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>`;
    box.innerHTML = PERM_GROUPS.map(g => {
      const n = g.ps.filter(p => has.has(p)).length;
      return `
      <div class="uperm-g" style="--gc:${GC[g.i] || "#2563EB"}">
        <div class="uperm-h">
          <span class="uperm-ic">${I[g.i] || ""}</span><b>${g.t}</b>
          <span class="uperm-cnt">${n} из ${g.ps.length}</span>
          <i class="uperm-bar"><u style="width:${Math.round(n / g.ps.length * 100)}%"></u></i>
        </div>
        <div class="uperm-list">${g.ps.map(p =>
          `<span class="uperm-it ${has.has(p) ? "on" : ""}">${has.has(p) ? I.check : MINUS}<span>${esc(permsData.perms[p] || p)}</span></span>`).join("")}
        </div>
      </div>`;
    }).join("");
  };
  api("/api/admin/roles")
    .then(d => { permsData = d; renderPerms(); })
    .catch(() => { const b = $("#u-perms"); if (b) b.innerHTML = `<span class="muted">Матрица прав недоступна</span>`; });
  $("#u-roles").addEventListener("click", () => setTimeout(renderPerms));
  $("#u-xroles").addEventListener("click", () => setTimeout(renderPerms));

  const roleTitle = code => state.meta.roles[code] || code;
  const setDDVal = () => {
    const mainSel = $("#u-roles .selected");
    const mv = $("#dd-main-val");
    mv.textContent = mainSel ? roleTitle(mainSel.dataset.v) : "Выберите роль";
    mv.classList.toggle("dd-ph", !mainSel);
    const xs = $$("#u-xroles .selected");
    const xv = $("#dd-extra-val");
    xv.textContent = xs.length ? xs.map(x => roleTitle(x.dataset.v)).join(", ") : "Не выбрано";
    xv.classList.toggle("dd-ph", !xs.length);
  };
  const syncExtra = () => {
    const main = $("#u-roles .selected")?.dataset.v;
    $$("#u-xroles .pick").forEach(x => {
      x.classList.toggle("disabled", x.dataset.v === main);
      if (x.dataset.v === main) x.classList.remove("selected");
    });
  };
  // аккордеон: раскрытие только по стрелке; открытие одного закрывает другой
  const dds = $$(".roledd");
  dds.forEach(dd => {
    const trig = dd.querySelector(".roledd-trigger");
    trig.onclick = () => {
      const willOpen = !dd.classList.contains("open");
      dds.forEach(d => { d.classList.remove("open"); d.querySelector(".roledd-trigger").setAttribute("aria-expanded", "false"); });
      dd.classList.toggle("open", willOpen);
      trig.setAttribute("aria-expanded", willOpen ? "true" : "false");
    };
  });
  $("#u-roles").addEventListener("click", e => {
    const p = e.target.closest(".pick");
    if (!p) return;
    $$("#u-roles .pick").forEach(x => x.classList.remove("selected"));
    p.classList.add("selected");
    syncExtra();
    setDDVal();
    const dd = $("#dd-main"); dd.classList.remove("open"); // выбрал основную — свернуть
    dd.querySelector(".roledd-trigger").setAttribute("aria-expanded", "false");
  });
  $("#u-xroles").addEventListener("click", e => {
    const p = e.target.closest(".pick");
    if (!p || p.classList.contains("disabled")) return;
    p.classList.toggle("selected");
    setDDVal();
  });
  syncExtra();
  setDDVal();
  $("#u-cancel").onclick = m.close;
  $("#u-save").onclick = async () => {
    const role = $("#u-roles .selected")?.dataset.v;
    const extra_roles = $$("#u-xroles .selected").map(x => x.dataset.v);
    try {
      if (u) {
        await api(`/api/users/${u.id}`, { method: "PUT", body: {
          name: $("#u-name").value, role, extra_roles,
          email: $("#u-email").value, bio: $("#u-bio").value,
          active: $("#u-active") ? $("#u-active").checked : undefined,
          password: $("#u-pass").value || undefined,
        }});
      } else {
        if (!role) { toast("Выберите роль", "err"); return; }
        await api("/api/users", { method: "POST", body: {
          login: $("#u-login").value, name: $("#u-name").value,
          password: $("#u-pass").value, role, extra_roles,
          email: $("#u-email").value, bio: $("#u-bio").value,
        }});
      }
      m.close();
      if (u && state.me && u.id === state.me.id) { try { state.me = await api("/api/auth/me"); } catch (e) {} }
      toast("Сохранено", "ok");
      route(); // остаёмся там же: админ-вкладка или профиль
    } catch (e) { toast(e.message, "err"); }
  };
}

/* ================= Страница пользователя ================= */
async function viewUser(id) {
  if (!can("admin.users")) { location.hash = "#/dashboard"; return; }
  shell("admin", `<div class="empty">Загрузка…</div>`);
  let p;
  try { p = await api(`/api/users/${id}/profile`); }
  catch (e) { shell("admin", `<div class="empty">${esc(e.message)}</div>`); return; }
  const u = p.user;
  const actLabel = { login: "Вход", user: "Пользователи", roles: "Роли", dict: "Справочники",
    standard: "Стандарты", state: "Госшаблоны", settings: "Настройки", backup: "Копии",
    book: "Учебники", ai: "AI-анализ", create: "Создание", version: "Версия",
    restore: "Восстановление", comment: "Комментарий", status: "Согласование",
    member: "Участники", import: "Импорт" };
  shell("admin", `
    <div class="page-head"><div><h1>${esc(u.name)}</h1>
      <div class="sub">Профиль пользователя · <a href="#/admin">← ко всем пользователям</a></div></div></div>
    <div class="profile-grid">
      <div class="card prof-card">
        ${avatar(u.name, u.role, "big")}
        <b class="pf-name">${esc(u.name)}</b>
        <span class="pf-login">@${esc(u.login)}</span>
        ${u.email ? `<a class="mp-mail" href="mailto:${esc(u.email)}">${I.mail}${esc(u.email)}</a>` : ""}
        ${u.active ? "" : `<span class="chip gray">учётная запись отключена</span>`}
        <div class="pf-roles">${u.roles.map(r => roleBadge(r.code, r.title)).join("")}</div>
        ${u.bio ? `<p class="mp-bio">${esc(u.bio)}</p>` : ""}
        <div class="pf-meta">
          <span>${I.clock}в системе с ${esc(String(u.created_at).slice(0, 10))}</span>
        </div>
        <button class="btn" id="pf-edit" style="margin-top:14px">${I.pen}Изменить</button>
      </div>
      <div class="prof-main">
        <div class="mini-grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,220px))">
          <div class="card mini-card" style="--mc:#16A34A"><span class="mc-lbl">Создал</span>
            <div><div class="mc-val" data-count="${p.created_count}">${p.created_count}</div>
            <div class="mc-sub">${plural(p.created_count, "учебник", "учебника", "учебников")}</div></div></div>
          <div class="card mini-card" style="--mc:#2563EB"><span class="mc-lbl">Участвует</span>
            <div><div class="mc-val" data-count="${p.member_count}">${p.member_count}</div>
            <div class="mc-sub">${plural(p.member_count, "проект", "проекта", "проектов")}</div></div></div>
          <div class="card mini-card" style="--mc:#7C3AED"><span class="mc-lbl">Активность</span>
            <div><div class="mc-val" style="font-size:17px">${esc(humanWhen(p.activity[0]?.created_at))}</div>
            <div class="mc-sub">последнее действие</div></div></div>
        </div>
        <div class="cards" style="grid-template-columns:1fr 1fr;align-items:start;margin-top:12px">
          <div class="card"><h3 class="card-h">Книги пользователя</h3>
            ${p.books.length ? p.books.map(b => `
              <a class="pf-book" href="#/book/${b.id}">
                <b>${esc(b.title)}</b>
                <span class="pf-brole">${esc(b.member_role)}</span>
                <span class="chip ${STATUS_CHIP[b.status] || ""}">${esc(b.status_title)}</span>
              </a>`).join("") : `<div class="empty" style="padding:14px">Не участвует в книгах</div>`}
          </div>
          <div class="card"><h3 class="card-h">Последние действия</h3>
            ${timelineHtml(p.activity.map(a => ({
              who: a.book_title ? `«${a.book_title}»` : (actLabel[a.action] || a.action),
              chip: a.book_title ? (actLabel[a.action] || a.action) : "",
              text: a.details, when: a.created_at, color: ACTION_COLOR[a.action],
            })))}
          </div>
        </div>
      </div>
    </div>`);
  animateCounters();
  $("#pf-edit").onclick = async () => {
    const users = await api("/api/users");
    openUserModal(users.find(x => x.id === id));
  };
}
