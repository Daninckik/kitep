"use strict";

const $ = (id) => document.getElementById(id);

const VERDICTS = {
  fail: { cls: "v-fail", dot: "d-fail", title: "Не соответствует нормам КР",
    icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' },
  review: { cls: "v-review", dot: "d-review", title: "Требуется ручная проверка",
    icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' },
  age: { cls: "v-age", dot: "d-age", title: "Допустимо с учётом возраста",
    icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
  pass: { cls: "v-pass", dot: "d-pass", title: "Замечаний не найдено",
    icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' },
};

const BADGES = {
  fail: ["b-fail", "запрещено"],
  banned: ["b-banned", "запрещённая категория"],
  restricted: ["b-restricted", "по возрасту"],
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let libraryCache = [];
let libFilter = "all";
let selectedAge = "";

// ---------- выбор возраста ----------
$("ageGrid").querySelectorAll(".age-card").forEach((btn) =>
  btn.addEventListener("click", () => {
    $("ageGrid").querySelectorAll(".age-card").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedAge = btn.dataset.age;
  }));

// ---------- загрузка ----------
const dropZone = $("dropZone");
const fileInput = $("fileInput");

$("browseBtn").addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });
dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => fileInput.files[0] && upload(fileInput.files[0]));

// Файл можно бросить в ЛЮБОЕ место страницы — браузер не откроет его вместо сайта
let dragDepth = 0;
document.addEventListener("dragenter", (e) => {
  e.preventDefault();
  if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
    dragDepth++;
    dropZone.classList.add("drag");
    document.body.classList.add("dragging-file");
  }
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("dragleave", (e) => {
  e.preventDefault();
  if (--dragDepth <= 0) {
    dragDepth = 0;
    dropZone.classList.remove("drag");
    document.body.classList.remove("dragging-file");
  }
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropZone.classList.remove("drag");
  document.body.classList.remove("dragging-file");
  const f = e.dataTransfer && e.dataTransfer.files[0];
  if (f) upload(f);
});

async function upload(file) {
  const aiOn = $("aiToggle") && $("aiToggle").checked;
  $("uploadError").classList.add("hidden");
  $("progress").classList.remove("hidden");
  $("progressText").textContent = aiOn
    ? `Проверяем «${file.name}»… OCR при необходимости + AI-экспертиза — это может занять пару минут.`
    : `Проверяем «${file.name}»… Если это скан, распознавание страниц займёт больше времени.`;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("age_group", selectedAge);
  fd.append("ai", aiOn ? "1" : "");
  fd.append("subject", ($("aiSubject") && $("aiSubject").value) || "");
  try {
    const res = await fetch("/api/analyze", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || res.statusText);
    // пока шла проверка, пользователь мог открыть отчёт ПРОШЛОЙ книги —
    // не выбиваем его: новый отчёт молча ложится в «Проверенные книги»
    const busyWithOld = !$("reportModal").classList.contains("hidden")
      && renderReport._id && renderReport._id !== data.id;
    if (busyWithOld) {
      const done = $("uploadDone");
      done.textContent = `Проверка «${file.name}» завершена — отчёт добавлен в «Проверенные книги» справа.`;
      done.classList.remove("hidden");
      clearTimeout(upload._doneT);
      upload._doneT = setTimeout(() => done.classList.add("hidden"), 9000);
    } else {
      renderReport(data);
    }
    loadLibrary();
  } catch (err) {
    $("uploadError").textContent = err.message;
    $("uploadError").classList.remove("hidden");
  } finally {
    $("progress").classList.add("hidden");
    fileInput.value = "";
  }
}

// ---------- отчёт ----------
function renderReport(r) {
  renderReport._id = r.id; // какой отчёт сейчас открыт (см. upload)
  const v = VERDICTS[r.verdict];
  const box = $("report");
  const kb = (r.size / 1024).toFixed(0);

  let html = `
    <div class="report-actions">
      <button class="btn btn-outline" onclick="window.print()">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Печать отчёта
      </button>
    </div>
    <div class="verdict ${v.cls}">
      ${v.icon}
      <div>
        <h3>${v.title}</h3>
        <p>${esc(r.verdict_text)}</p>
        <div class="meta">«${esc(r.filename)}» · возраст: ${esc(r.age_label || "не указан")} · ${r.pages} стр./фрагм. · ${kb} КБ · проверено ${r.checked_at}</div>
      </div>
    </div>`;

  if (r.notes && r.notes.length) {
    html += r.notes
      .map((n) => `
        <div class="note-banner">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>${esc(n)}</span>
        </div>`)
      .join("");
  }

  if (!r.categories.length) {
    html += `<p class="muted">Совпадений по словарям не найдено.</p>`;
  }

  for (const c of r.categories) {
    const [bcls, btext] = BADGES[c.severity];
    const chips = c.words
      .map(([w, n]) => `<span class="chip">${esc(w)} <small>×${n}</small></span>`)
      .join("");
    const frags = c.fragments
      .map((f) => `
        <div class="fragment">
          <div class="page">${esc(f.page)}</div>
          <div>${esc(f.before)}<mark>${esc(f.match)}</mark>${esc(f.after)}</div>
        </div>`)
      .join("");
    html += `
      <div class="category">
        <div class="cat-head" onclick="this.parentElement.classList.toggle('open')">
          <span class="badge ${bcls}">${btext}</span>
          <div class="cat-title">
            <b>${esc(c.title)}</b>
            <span>${esc(c.law)}</span>
          </div>
          <span class="cat-count">${c.hits} совп.</span>
          <svg class="chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="cat-body">
          <p class="cat-note">${esc(c.note)}</p>
          <div class="word-chips">${chips}</div>
          ${frags}
          ${c.truncated ? `<p class="truncated">Показаны первые ${c.fragments.length} из ${c.hits} совпадений.</p>` : ""}
        </div>
      </div>`;
  }

  html += renderAiSection(r);
  html += `<div class="disclaimer">${esc(r.disclaimer)}</div>`;
  box.innerHTML = html;
  box.classList.remove("hidden");
  // отчёт — в отдельном окне, основная страница остаётся на месте
  $("reportModal").classList.remove("hidden");
  document.body.classList.add("modal-open");
  $("reportModal").querySelector(".modal-box").scrollTop = 0;
}

function closeReport() {
  $("reportModal").classList.add("hidden");
  document.body.classList.remove("modal-open");
}

// ---------- OCR и AI-анализ (встроен в отчёт проверки) ----------
const AI_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8"/></svg>';

function renderAiSection(r) {
  if (!r.ai) return "";
  if (r.ai.error) {
    return `
      <div class="ai-report">
        <h3 class="ai-head">${AI_ICON} OCR и AI-анализ</h3>
        <div class="note-banner">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>${esc(r.ai.error)}</span>
        </div>
      </div>`;
  }
  const d = r.ai.result || {};
  const u = r.ai.usage || {};
  const pct = Math.max(0, Math.min(100, d.compliance_percent | 0));
  const color = pct >= 75 ? "var(--pass)" : pct >= 45 ? "var(--review)" : "var(--fail)";
  const CIRC = 2 * Math.PI * 46;
  const chips = [
    `<span class="ai-chip ${d.is_textbook ? "g" : "r"}">${d.is_textbook ? "школьный учебник" : "не учебник"}</span>`,
    d.detected_subject ? `<span class="ai-chip">${esc(d.detected_subject)}</span>` : "",
    d.detected_grade ? `<span class="ai-chip">${esc(d.detected_grade)}</span>` : "",
    d.detected_language ? `<span class="ai-chip">${esc(d.detected_language)}</span>` : "",
    r.ai.ocr_used ? `<span class="ai-chip">OCR</span>` : "",
  ].filter(Boolean).join("");
  // Явные вердикты по пунктам ТЗ (п. 5): да / частично / нет
  const V_CLS = { "да": "ok", "частично": "part", "нет": "no" };
  const tzItems = [
    ["Относится к школьному учебнику", d.is_textbook === true ? "да" : d.is_textbook === false ? "нет" : null],
    ["Требования государственных школ КР", d.meets_state_requirements],
    ["Образовательные стандарты КР", d.meets_standards],
    ["Структура государственных учебников", d.meets_structure],
    ["Корректность оформления", d.formatting_ok],
    ["Полнота содержания", d.completeness_ok],
  ].filter(([, v]) => v);
  const tzChecklist = tzItems.length ? `
    <div class="ai-col ai-tz"><h4>Соответствие требованиям (по пунктам)</h4>
      ${tzItems.map(([t, v]) => `
        <div class="ai-check">
          <span class="cdot ${V_CLS[v] || "no"}"></span>
          <div style="flex:1"><b>${esc(t)}</b></div>
          <span class="ai-verdict-chip ${V_CLS[v] || "no"}">${esc(v)}</span>
        </div>`).join("")}
    </div>` : "";
  const structure = (d.structure || [])
    .map((s) => `
      <div class="ai-check">
        <span class="cdot ${s.present ? "ok" : "no"}"></span>
        <div><b>${esc(s.section)}</b>${s.comment ? `<small>${esc(s.comment)}</small>` : ""}</div>
      </div>`)
    .join("");
  const recos = (d.recommendations || []).map((x) => `<li>${esc(x)}</li>`).join("");
  const notes = [["Стандарты КР", d.standards_notes], ["Оформление", d.formatting_notes], ["Полнота содержания", d.completeness_notes]]
    .filter(([, v]) => v && v.trim())
    .map(([t, v]) => `<div class="ai-notes"><b>${t}:</b> ${esc(v)}</div>`)
    .join("");
  return `
    <div class="ai-report">
      <h3 class="ai-head">${AI_ICON} OCR и AI-анализ соответствия учебникам КР</h3>
      <div class="ai-summary">
        <div class="ai-gauge">
          <svg width="108" height="108">
            <circle cx="54" cy="54" r="46" fill="none" stroke="var(--border)" stroke-width="10"/>
            <circle cx="54" cy="54" r="46" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"
              stroke-dasharray="${(CIRC * pct / 100).toFixed(1)} ${CIRC.toFixed(1)}"/>
          </svg>
          <div class="val"><b>${pct}%</b><span>соответствие</span></div>
        </div>
        <div style="flex:1;min-width:230px">
          <div class="ai-chips">${chips}</div>
          <p style="margin:6px 0 0;line-height:1.6">${esc(d.verdict || "")}</p>
        </div>
      </div>
      ${tzChecklist}
      <div class="ai-cols">
        <div class="ai-col"><h4>Обязательные разделы</h4>${structure || '<p class="muted">нет данных</p>'}</div>
        <div class="ai-col"><h4>Рекомендации по доработке</h4>${recos ? `<ol class="ai-reco">${recos}</ol>` : '<p class="muted">Замечаний нет.</p>'}</div>
      </div>
      ${notes}
      ${u.model ? `<div class="ai-usage">Модель ${esc(u.model)} · токены ${(u.input_tokens || 0).toLocaleString("ru-RU")} вх. / ${(u.output_tokens || 0).toLocaleString("ru-RU")} исх. · $${(+u.cost_usd || 0).toFixed(4)} · ${((r.ai.duration_ms || 0) / 1000).toFixed(1)} с</div>` : ""}
    </div>`;
}

// выбор предмета для AI-анализа — красивая сетка-дропдаун (список из справочника платформы)
(async () => {
  const dd = $("subjDD"), btn = $("subjBtn"), pop = $("subjPop"),
        grid = $("subjGrid"), lbl = $("subjLbl"), hidden = $("aiSubject");
  if (!dd || !btn) return;

  let subjects = [];
  try {
    const res = await fetch("/api/books/meta");
    if (res.ok) subjects = (await res.json()).subjects || [];
  } catch (e) { /* без сети предметов — просто общий анализ */ }

  const renderGrid = () => {
    const items = [{ v: "", t: "Не указывать" }].concat(subjects.map((s) => ({ v: s, t: s })));
    grid.innerHTML = items.map((it, i) => `
      <button type="button" class="subj-opt ${it.v === hidden.value ? "selected" : ""} ${it.v ? "" : "none"}"
        data-v="${it.v.replace(/"/g, "&quot;")}" style="animation-delay:${Math.min(i * 22, 330)}ms">
        ${it.v === hidden.value ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12.5 5.5 5.5L20 6.5"/></svg>' : ""}
        ${it.t}
      </button>`).join("");
  };

  const close = () => { pop.classList.add("hidden"); dd.classList.remove("open"); };
  const open = () => { renderGrid(); pop.classList.remove("hidden"); dd.classList.add("open"); };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    pop.classList.contains("hidden") ? open() : close();
  });
  grid.addEventListener("click", (e) => {
    const o = e.target.closest(".subj-opt");
    if (!o) return;
    hidden.value = o.dataset.v;
    lbl.textContent = o.dataset.v ? o.dataset.v : "Предмет: не указывать";
    dd.classList.toggle("chosen", !!o.dataset.v);
    close();
  });
  document.addEventListener("click", (e) => { if (!dd.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  // ?subjopen=1 — открыть сетку сразу (для проверки вёрстки)
  if (new URLSearchParams(location.search).has("subjopen")) open();
})();

// ---------- статистика ----------
function renderStats() {
  const total = libraryCache.length;
  const cnt = (v) => libraryCache.filter((i) => i.verdict === v).length;
  const warn = cnt("fail") + cnt("review");
  $("statsGrid").innerHTML = `
    <div class="stat-card">
      <div class="stat-icon si-total">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      </div>
      <div><b>${total}</b><span>проверено книг</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon si-pass">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      </div>
      <div><b>${cnt("pass")}</b><span>без замечаний</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon si-age">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <div><b>${cnt("age")}</b><span>по возрасту</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon si-warn">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </div>
      <div><b>${warn}</b><span>требуют внимания</span></div>
    </div>`;
}

// ---------- библиотека ----------
function renderLibrary() {
  const q = $("libSearch").value.trim().toLowerCase();
  const items = libraryCache.filter(
    (it) => (libFilter === "all" || it.verdict === libFilter) &&
            (!q || it.filename.toLowerCase().includes(q)));
  const box = $("libraryList");
  if (!items.length) {
    box.innerHTML = `<p class="lib-empty">${libraryCache.length ? "Ничего не найдено по фильтру." : "Пока ничего не проверяли — загрузите первую книгу выше."}</p>`;
    return;
  }
  box.innerHTML = items
    .map((it) => `
      <div class="lib-item" data-id="${it.id}">
        <span class="dot ${VERDICTS[it.verdict].dot}" aria-label="${VERDICTS[it.verdict].title}"></span>
        <span class="lib-name">${esc(it.filename)}</span>
        <span class="lib-meta">${esc(it.age_label)} · ${it.hits} совп. · ${it.checked_at}</span>
        <button class="lib-del" data-del="${it.id}" aria-label="Удалить отчёт">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>`)
    .join("");

  box.querySelectorAll(".lib-item").forEach((el) =>
    el.addEventListener("click", async (e) => {
      if (e.target.closest("[data-del]")) return;
      const res = await fetch(`/api/reports/${el.dataset.id}`);
      if (res.ok) renderReport(await res.json());
    }));
  box.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await fetch(`/api/reports/${btn.dataset.del}`, { method: "DELETE" });
      loadLibrary();
    }));
}

async function loadLibrary() {
  const res = await fetch("/api/reports");
  libraryCache = await res.json();
  renderStats();
  renderLibrary();
}

$("libSearch").addEventListener("input", renderLibrary);
$("filterGrid").querySelectorAll(".filter-pill").forEach((btn) =>
  btn.addEventListener("click", () => {
    $("filterGrid").querySelectorAll(".filter-pill").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    libFilter = btn.dataset.filter;
    renderLibrary();
  }));

// ---------- модалка ----------
function openModal() {
  $("lawModal").classList.remove("hidden");
  document.body.classList.add("modal-open");
}
function closeModal() {
  $("lawModal").classList.add("hidden");
  document.body.classList.remove("modal-open");
}
$("lawInfoBtn").addEventListener("click", openModal);
$("lawClose").addEventListener("click", closeModal);
$("lawModal").addEventListener("click", (e) => { if (e.target === $("lawModal")) closeModal(); });
$("reportClose").addEventListener("click", closeReport);
$("reportModal").addEventListener("click", (e) => { if (e.target === $("reportModal")) closeReport(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); closeReport(); } });

loadLibrary();
