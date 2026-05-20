

function todayKey() { return new Date().toISOString().slice(0,10); }
function weekKeyFor(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay() === 0 ? 7 : d.getDay();
  const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
  return mon.toISOString().slice(0,10);
}
function weekKey() { return weekKeyFor(todayKey()); }
function monthKey() { return new Date().toISOString().slice(0,7); }
function weekdayIdx() { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; }
const STORAGE_DB_NAME = 'greatyou-store';
const STORAGE_STORE_NAME = 'kv';
let storageDBPromise = null;
function openStorageDB() {
  if (storageDBPromise) return storageDBPromise;
  storageDBPromise = new Promise(resolve => {
    if (!('indexedDB' in window)) return resolve(null);
    const req = indexedDB.open(STORAGE_DB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORAGE_STORE_NAME)) {
        db.createObjectStore(STORAGE_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return storageDBPromise;
}
function loadLocalStorage(key, fallback) {
  if (fallback === undefined) fallback = {};
  try { const v = localStorage.getItem(key); if (v === null) return fallback; const p = JSON.parse(v); return (p !== null && typeof p === 'object') ? p : fallback; } catch { return fallback; }
}
function loadLocalStorageRaw(key, fallback) {
  if (fallback === undefined) fallback = '';
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; }
}
async function idbGet(key) {
  const db = await openStorageDB();
  if (!db) return undefined;
  return new Promise(resolve => {
    const tx = db.transaction(STORAGE_STORE_NAME, 'readonly');
    const store = tx.objectStore(STORAGE_STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}
async function idbGetAll() {
  const db = await openStorageDB();
  if (!db) return {};
  return new Promise(resolve => {
    const tx = db.transaction(STORAGE_STORE_NAME, 'readonly');
    const store = tx.objectStore(STORAGE_STORE_NAME);
    const data = {};
    store.openCursor().onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) {
        data[cursor.key] = cursor.value;
        cursor.continue();
      } else {
        resolve(data);
      }
    };
    tx.oncomplete = () => {};
  });
}
async function idbSet(key, value) {
  const db = await openStorageDB();
  if (!db) return;
  return new Promise(resolve => {
    const tx = db.transaction(STORAGE_STORE_NAME, 'readwrite');
    tx.objectStore(STORAGE_STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
async function storageHas(key) {
  const db = await openStorageDB();
  if (db) {
    const stored = await idbGet(key);
    if (stored !== undefined) return true;
  }
  try { return localStorage.getItem(key) !== null; } catch { return false; }
}
async function storageGetJson(key, fallback = {}) {
  const db = await openStorageDB();
  if (db) {
    const stored = await idbGet(key);
    if (stored !== undefined) return stored;
  }
  return loadLocalStorage(key, fallback);
}
async function storageGetRaw(key, fallback = '') {
  const db = await openStorageDB();
  if (db) {
    const stored = await idbGet(key);
    if (stored !== undefined) return String(stored);
  }
  return loadLocalStorageRaw(key, fallback);
}
async function storageSetJson(key, value) {
  const db = await openStorageDB();
  if (db) await idbSet(key, value);
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
async function storageSetRaw(key, value) {
  const db = await openStorageDB();
  if (db) await idbSet(key, String(value));
  try { localStorage.setItem(key, String(value)); } catch {}
}
async function syncStorageFromDB() {
  const all = await idbGetAll();
  Object.keys(all).forEach(key => {
    if (localStorage.getItem(key) === null) {
      try {
        if (typeof all[key] === 'string') {
          localStorage.setItem(key, all[key]);
        } else {
          localStorage.setItem(key, JSON.stringify(all[key]));
        }
      } catch {}
    }
  });
}
async function initStorage() {
  await openStorageDB();
  await syncStorageFromDB();
  if (navigator.storage && navigator.storage.persist) {
    try {
      if (!(await navigator.storage.persisted())) {
        await navigator.storage.persist();
      }
    } catch {}
  }
}
async function loadLS(key, fallback) {
  return storageGetJson(key, fallback);
}
async function saveLS(key, val) {
  return storageSetJson(key, val);
}
async function saveRawItem(key, val) {
  return storageSetRaw(key, val);
}
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function getDateKeyForWeekday(weekdayI, refMon) {
  const mon = refMon ? new Date(refMon + 'T12:00:00') : (() => { const d = new Date(); const day = d.getDay() === 0 ? 7 : d.getDay(); const m = new Date(d); m.setDate(d.getDate() - day + 1); return m; })();
  const target = new Date(mon); target.setDate(mon.getDate() + weekdayI);
  return target.toISOString().slice(0,10);
}
const WEEKDAYS = ['Mo','Di','Mi','Do','Fr','Sa','So'];
let weights;
let weightSettings = { height: 165, goalDate: '2026-12-15', startDate: null, goalWeight: 70.8 };
let weightChartEntries = [];
let weightQuickAdd = null;
let weightModalMode = 'weight';
const DEFAULT_WEIGHT_HEIGHT = 165;
const DEFAULT_WEIGHT_GOAL_DATE = '2026-12-15';
const DEFAULT_GOAL_WEIGHT = 70.8;
const DEFAULT_START_WEIGHT = 81.3;

// Commitment functions
async function initCommitment() {
  const stored = await storageGetRaw('commitment', '');
  const el = document.getElementById('commitText');
  el.value = stored;
  document.getElementById('commitCount').textContent = stored.length;
  const collapsed = await storageGetRaw('commitCollapsed', 'false') === 'true';
  const body = document.getElementById('commitBody');
  const toggle = document.getElementById('commitToggle');
  if (collapsed) { body.classList.remove('open'); toggle.textContent = '▸'; }
  else { body.classList.add('open'); toggle.textContent = '▾'; }
}
async function saveCommitment() {
  const el = document.getElementById('commitText');
  await saveRawItem('commitment', el.value);
  document.getElementById('commitCount').textContent = el.value.length;
}
async function toggleCommitment() {
  const body = document.getElementById('commitBody');
  const toggle = document.getElementById('commitToggle');
  const isOpen = body.classList.contains('open');
  if (isOpen) { body.classList.remove('open'); toggle.textContent = '▸'; await saveRawItem('commitCollapsed','true'); }
  else { body.classList.add('open'); toggle.textContent = '▾'; await saveRawItem('commitCollapsed','false'); }
}
function showSubTab(name) {
 document.querySelectorAll('.sub-tab-content').forEach(el => el.classList.remove('active'));
 document.querySelectorAll('.sub-tab').forEach(el => el.classList.remove('active'));
 document.getElementById('subtab-' + name).classList.add('active');
 document.getElementById('subtab-btn-' + name).classList.add('active');
}




// goal-edit-icon keyboard support
function goalEditKey(e){
  const k = e.key;
  if(k==='Enter' || k===' '){ e.preventDefault(); e.currentTarget.click(); }
}
const CATEGORIES = {
  kraft:      {label:'Kraftziel',     color:'purple', emoji:'🏋️'},
  ausdauer:   {label:'Ausdauerziel',  color:'blue',   emoji:'🏃'},
  mental:     {label:'Mentales Ziel', color:'yellow', emoji:'🧘'},
  ernaehrung: {label:'Ernährungsziel',color:'green',  emoji:'🥗'},
  sonstiges:  {label:'Sonstiges',     color:'orange', emoji:'⚡'},
};
const CAT_ORDER = ['kraft','ausdauer','mental','ernaehrung','sonstiges'];

let goals = [];

async function normalizeGoals() {
  let ch = false;
  goals.forEach(g => {
    if (g.type === 'weekly') {
      if (g.weeklyTarget == null || isNaN(+g.weeklyTarget) || +g.weeklyTarget < 1) { g.weeklyTarget = 1; ch = true; }
      else g.weeklyTarget = parseInt(g.weeklyTarget, 10);
    } else {
      if (g.weeklyTarget === undefined) { g.weeklyTarget = null; ch = true; }
    }
  });
  if (ch) await saveLS('goals', goals);
}

function getActiveGoals(dateStr, type) {
  return goals.filter(g => g.type === type && g.effectiveFrom <= dateStr && (g.deletedAt === null || g.deletedAt > dateStr));
}
async function normWD(wk) {
  const obj = await loadLS('weekly-' + wk, {});
  let ch = false;
  Object.keys(obj || {}).forEach(k => {
    const v = obj[k];
    if (v === true) { obj[k] = 1; ch = true; }
    else if (v === false || v === null) { obj[k] = 0; ch = true; }
  });
  if (ch) await saveLS('weekly-' + wk, obj);
  return obj;
}

let dailyData;
let weeklyData;

async function renderTrainingGoals() {
  renderDailySection(); await renderWeeklySection();
  const aD = getActiveGoals(todayKey(), 'daily');
  const aW = getActiveGoals(weekKey(), 'weekly');
  const dailyEmpty = document.getElementById('daily-empty-state');
  const weeklyEmpty = document.getElementById('weekly-empty-state');
  if (aD.length === 0) { dailyEmpty.innerHTML = '<div class="empty-state"><div class="empty-emoji">📋</div><div class="empty-text">Noch keine Tagesziele.<br>Leg jetzt dein erstes Tagesziel fest!</div></div>'; }
  else { dailyEmpty.innerHTML = ''; }
  if (aW.length === 0) { weeklyEmpty.innerHTML = '<div class="empty-state"><div class="empty-emoji">📋</div><div class="empty-text">Noch keine Wochenziele.<br>Leg jetzt dein erstes Wochenziel fest!</div></div>'; }
  else { weeklyEmpty.innerHTML = ''; }
}

function renderDailySection() {
  const wrap = document.getElementById('daily-section-wrap');
  const active = getActiveGoals(todayKey(), 'daily');
  if (active.length === 0) { wrap.innerHTML = ''; updDailyProg(0, 0); return; }
  let h = '<div class="sec-head"><span class="emoji">⚡</span><div><div class="title">Tagesroutine</div><div class="sub">Täglich erledigen</div></div></div>';
  active.forEach(g => {
    const done = !!dailyData[g.id], cl = CATEGORIES[g.category].color;
    h += `<button class="task-btn${done ? ' done-' + cl : ''}" onclick="toggleDailyGoal('${g.id}')">`
    h += `<div class="check-circle${done ? ' done-' + cl : ''}">${done ? '✓' : ''}</div>`;
    h += `<div><div class="task-label${done ? ' done' : ''}">${esc(g.title)}</div>`;
    h += `<div class="task-sub${done ? ' done-' + cl : ''}">${esc(g.description || '')}</div></div>`;
    h += `<span class="goal-edit-icon" onclick="event.stopPropagation();openGoalModal(null,'${g.id}')" role="button" tabindex="0" onkeydown="goalEditKey(event)">⋮</span></button>`;
  });
  wrap.innerHTML = h;
  updDailyProg(active.filter(g => !!dailyData[g.id]).length, active.length);
}

function updDailyProg(done, total) {
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  const off = 169.6 - (pct / 100) * 169.6;
  const r = document.getElementById('ring-daily');
  r.style.strokeDashoffset = off;
  r.style.stroke = pct === 100 ? '#34d399' : '#c084fc';
  document.getElementById('ring-daily-pct').textContent = pct + '%';
  document.getElementById('ring-daily-pct').style.color = pct === 100 ? '#34d399' : '#d8b4fe';
  document.getElementById('daily-done').textContent = done;
  document.getElementById('daily-total').textContent = total;
  const hint = document.getElementById('daily-hint');
  if (total === 0) hint.textContent = 'Keine Ziele';
  else if (pct === 100) { hint.textContent = '🎉 Geschafft!'; hint.style.color = '#34d399'; }
  else if (done === 0) { hint.textContent = "Los geht's!"; hint.style.color = '#8b7aaa'; }
  else { hint.textContent = 'Noch ' + (total - done) + ' übrig'; hint.style.color = '#8b7aaa'; }
}

async function toggleDailyGoal(gid) {
  dailyData[gid] = !dailyData[gid];
  await saveLS('daily-' + todayKey(), dailyData);
  await renderTrainingGoals(); await buildWeekstrip(); await renderTrainCalendar();
}

async function renderWeeklySection() {
  const wrap = document.getElementById('weekly-section-wrap');
  const wk = weekKey(); const active = getActiveGoals(wk, 'weekly');
  weeklyData = await normWD(wk);
  if (active.length === 0) { wrap.innerHTML = ''; updWeeklyProg(0, 0); return; }
  const groups = {};
  active.forEach(g => (groups[g.category] = groups[g.category] || []).push(g));
  let h = '';
  let dS = 0, tS = 0;
  CAT_ORDER.forEach(cat => {
    if (!groups[cat]) return;
    const ci = CATEGORIES[cat];
    h += `<div class="sec-head"><span class="emoji">${ci.emoji}</span><div><div class="title">${ci.label}</div></div></div>`;
    groups[cat].forEach(g => {
      const target = g.weeklyTarget || 1;
      let cur = weeklyData[g.id] || 0; if (typeof cur !== 'number') cur = 0;
      const done = cur >= target, cl = ci.color;
      dS += Math.min(cur, target); tS += target;
      const ct = done ? '✓' : (cur > 0 ? String(cur) : '');
      const sub = (g.description ? esc(g.description) : '') + ' · ' + cur + '/' + target + ' erledigt';
      h += `<button class="task-btn${done ? ' done-' + cl : ''}" onclick="toggleWeeklyGoal('${g.id}')">`
      h += `<div class="check-circle${done ? ' done-' + cl : ''}">${ct}</div>`;
      h += `<div><div class="task-label${done ? ' done' : ''}">${esc(g.title)}</div>`;
      h += `<div class="task-sub${done ? ' done-' + cl : ''}">${sub}</div></div>`;
      h += `<span class="goal-edit-icon" onclick="event.stopPropagation();openGoalModal(null,'${g.id}')" role="button" tabindex="0" onkeydown="goalEditKey(event)">⋮</span></button>`;
    });
  });
  wrap.innerHTML = h; updWeeklyProg(dS, tS);
}

function updWeeklyProg(done, total) {
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  const off = 169.6 - (pct / 100) * 169.6;
  const r = document.getElementById('ring-weekly');
  r.style.strokeDashoffset = off; r.style.stroke = pct === 100 ? '#34d399' : '#38bdf8';
  document.getElementById('ring-weekly-pct').textContent = pct + '%';
  document.getElementById('ring-weekly-pct').style.color = pct === 100 ? '#34d399' : '#38bdf8';
  document.getElementById('weekly-done').textContent = done;
  document.getElementById('weekly-total').textContent = total;
  const hint = document.getElementById('weekly-hint');
  if (total === 0) { hint.textContent = 'Keine Ziele'; hint.style.color = '#8b7aaa'; }
  else if (pct === 100) { hint.textContent = '🎉 Perfekte Woche!'; hint.style.color = '#34d399'; }
  else { hint.textContent = 'Noch ' + (total - done); hint.style.color = '#8b7aaa'; }
}

async function toggleWeeklyGoal(gid) {
  const wk = weekKey(), data = await normWD(wk);
  const g = goals.find(x => x.id === gid) || { weeklyTarget: 1 };
  const target = g.weeklyTarget || 1;
  let cur = data[gid] || 0; if (typeof cur !== 'number') cur = 0;
  let next = cur + 1; if (next > target) next = 0;
  data[gid] = next; await saveLS('weekly-' + wk, data);
  weeklyData = data;
  await renderWeeklySection();
  await renderTrainCalendar();
}

async function buildWeekstrip() {
  const strip = document.getElementById('weekstrip'); strip.innerHTML = '';
  const todayI = weekdayIdx(), wkMon = weekKey();
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const d = WEEKDAYS[i];
    const dk = getDateKeyForWeekday(i, wkMon);
    const isPast = i < todayI, isToday = i === todayI, isFuture = i > todayI;
    const hasData = await storageHas('daily-' + dk);
    const active = getActiveGoals(dk, 'daily');
    const dayData = hasData ? await loadLS('daily-' + dk, {}) : {};
    const doneCount = active.filter(g => dayData[g.id]).length;
    const totalG = active.length;
    const isComplete = hasData && totalG > 0 && doneCount === totalG;
    const isPartial = hasData && doneCount > 0 && !isComplete;
    const el = document.createElement('div');
    let cls = 'weekday';
    if (isToday) cls += ' today';
    if (!isFuture && hasData) { if (isComplete) cls += ' done-day'; else if (isPartial) cls += ' partial-day'; }
    if (isPast) cls += ' past'; if (isFuture) cls += ' future';
    el.className = cls; let ind = '';
    if (!isFuture && hasData && isComplete) ind = '<span class="day-check">✓</span>';
    else if (!isFuture && hasData && isPartial) ind = `<span class="day-pct">${doneCount}/${totalG}</span>`;
    else if (isPast && hasData && doneCount === 0) ind = '<span class="day-pct">–</span>';
    el.innerHTML = `<span>${d}</span>${ind}`;
    if (!isFuture) { el.style.cursor = 'pointer'; el.onclick = () => openDayModal(i, dk, wkMon); }
    strip.appendChild(el);
  }
}

async function getWeekCellHtml(wk, allFuture) {
  if (allFuture) return '<div class="cal-week-cell w-none"></div>';
  const active = getActiveGoals(wk, 'weekly');
  if (active.length === 0) return '<div class="cal-week-cell w-empty">–</div>';
  const wd = await normWD(wk); let doneC = 0, partC = 0;
  active.forEach(g => { const cur = typeof wd[g.id] === 'number' ? wd[g.id] : 0; if (cur >= (g.weeklyTarget || 1)) doneC++; else if (cur > 0) partC++; });
  if (doneC === active.length) return '<div class="cal-week-cell w-gruen">✓</div>';
  if (doneC > 0 || partC > 0) return `<div class="cal-week-cell w-orange">${doneC + partC}/${active.length}</div>`;
  return '<div class="cal-week-cell w-rot">–</div>';
}

let trainCalYear = new Date().getFullYear();
let trainCalMonth = new Date().getMonth();
async function trainCalPrev() { trainCalMonth--; if (trainCalMonth < 0) { trainCalMonth = 11; trainCalYear--; } await renderTrainCalendar(); }
async function trainCalNext() {
  const now = new Date();
  if (trainCalYear > now.getFullYear() || (trainCalYear === now.getFullYear() && trainCalMonth >= now.getMonth())) return;
  trainCalMonth++; if (trainCalMonth > 11) { trainCalMonth = 0; trainCalYear++; } await renderTrainCalendar();
}
async function renderTrainCalendar() {
  const yr = trainCalYear, mo = trainCalMonth, today = todayKey();
  document.getElementById('train-cal-month-label').textContent = new Date(yr, mo, 1).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' });
  const firstDay = new Date(yr, mo, 1).getDay();
  const startOff = firstDay === 0 ? 6 : firstDay - 1;
  const dim = new Date(yr, mo + 1, 0).getDate();
  let html = '';
  ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(d => { html += `<div class="cal-day-header">${d}</div>`; });
  html += '<div class="cal-week-header">W</div>';

  let col = 0;
  // Tagesziele Stats
  let totalT = 0, comp = 0, part = 0, miss = 0;
  // Wochenziele Stats
  let totalW = 0, wG = 0, wO = 0, wR = 0;

  let lastDkInRow = null, rowAllFuture = true;

  async function addWeekStat(wk, allFuture){
    if(allFuture) return;
    const activeW = getActiveGoals(wk,'weekly');
    if(!activeW || activeW.length===0) return;
    const wd = await normWD(wk);
    let doneC = 0, partC = 0;
    activeW.forEach(g=>{
      const target = g.weeklyTarget || 1;
      const cur = (typeof wd[g.id] === 'number') ? wd[g.id] : 0;
      if(cur >= target) doneC++; else if(cur > 0) partC++;
    });
    totalW++;
    if(doneC === activeW.length) wG++;
    else if(doneC > 0 || partC > 0) wO++;
    else wR++;
  }

  for (let i = 0; i < startOff; i++) { html += '<div class="cal-day empty"></div>'; col++; }

  for (let d = 1; d <= dim; d++) {
    const dk = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isFut = dk > today, isT = dk === today;
    const hasData = await storageHas('daily-' + dk);
    const active = getActiveGoals(dk, 'daily');
    const dayD = hasData ? await loadLS('daily-' + dk, {}) : {};
    const dc = active.filter(g => dayD[g.id]).length;
    const tg = active.length;
    const isComp = hasData && tg > 0 && dc === tg;
    const isPart = hasData && dc > 0 && !isComp;
    let cls = 'cal-day';
    if (isFut) cls += ' future-day'; else if (isT) cls += ' today-marker'; else cls += ' past-day';
    if (!isFut && hasData && tg > 0) {
      totalT++;
      if (isComp) { cls += ' gruen'; comp++; }
      else if (isPart) { cls += ' orange'; part++; }
      else { cls += ' rot'; miss++; }
    }
    const dot = (!isFut && hasData && dc > 0) ? '<div class="cal-day-dot"></div>' : '';
    const wdi = new Date(dk + 'T12:00:00').getDay();
    const idx = wdi === 0 ? 6 : wdi - 1;
    const click = !isFut ? `onclick="openDayModal(${idx},'${dk}','${weekKeyFor(dk)}')"` : '';
    html += `<div class="${cls}" ${click}><div class="cal-day-num">${d}</div>${dot}</div>`;

    if (!isFut) rowAllFuture = false;
    lastDkInRow = dk;
    col++;

    if (col === 7) {
      const wk = weekKeyFor(dk);
      html += await getWeekCellHtml(wk, rowAllFuture);
      await addWeekStat(wk, rowAllFuture);
      col = 0;
      rowAllFuture = true;
    }
  }

  if (col > 0) {
    while (col < 7) { html += '<div class="cal-day empty"></div>'; col++; }
    const wk = lastDkInRow ? weekKeyFor(lastDkInRow) : null;
    if (wk) {
      html += await getWeekCellHtml(wk, rowAllFuture);
      await addWeekStat(wk, rowAllFuture);
    } else {
      html += '<div class="cal-week-cell w-none"></div>';
    }
  }

  document.getElementById('train-cal-grid').innerHTML = html;

  const sEl = document.getElementById('train-cal-stats');

  const pC = totalT > 0 ? Math.round(comp / totalT * 100) : 0;
  const pP = totalT > 0 ? Math.round(part / totalT * 100) : 0;
  const pM = totalT > 0 ? Math.round(miss / totalT * 100) : 0;

  const pWG = totalW > 0 ? Math.round(wG / totalW * 100) : 0;
  const pWO = totalW > 0 ? Math.round(wO / totalW * 100) : 0;
  const pWR = totalW > 0 ? Math.round(wR / totalW * 100) : 0;

  const mn = new Date(yr, mo, 1).toLocaleDateString('de-AT', { month: 'long' });

  sEl.innerHTML = `
    <div class="cal-stats-title">📊 ${mn} im Überblick</div>

    <div style="font-size:12px;font-weight:800;opacity:.85;margin:6px 0 10px">Tagesziele</div>
    <div class="cal-stats-bars">
      <div class="cal-stat-row"><div class="cal-stat-name">✅ Alle</div><div class="cal-stat-bar-wrap"><div class="cal-stat-bar gruen" style="width:${pC}%"></div></div><div class="cal-stat-count gruen">${comp}</div></div>
      <div class="cal-stat-row"><div class="cal-stat-name">⚡ Teils</div><div class="cal-stat-bar-wrap"><div class="cal-stat-bar orange" style="width:${pP}%"></div></div><div class="cal-stat-count orange">${part}</div></div>
      <div class="cal-stat-row"><div class="cal-stat-name">❌ Nichts</div><div class="cal-stat-bar-wrap"><div class="cal-stat-bar rot" style="width:${pM}%"></div></div><div class="cal-stat-count rot">${miss}</div></div>
    </div>

    <div style="height:1px;background:var(--border2);margin:14px 0"></div>

    <div style="font-size:12px;font-weight:800;opacity:.85;margin:0 0 10px">Wochenziele</div>
    ${totalW===0 ? `<div style="font-size:12px;color:var(--text-muted);opacity:.8">Keine Wochenziele in diesem Monat.</div>` : `
      <div class="cal-stats-bars">
        <div class="cal-stat-row"><div class="cal-stat-name">✅ Alle</div><div class="cal-stat-bar-wrap"><div class="cal-stat-bar gruen" style="width:${pWG}%"></div></div><div class="cal-stat-count gruen">${wG}</div></div>
        <div class="cal-stat-row"><div class="cal-stat-name">⚡ Teils</div><div class="cal-stat-bar-wrap"><div class="cal-stat-bar orange" style="width:${pWO}%"></div></div><div class="cal-stat-count orange">${wO}</div></div>
        <div class="cal-stat-row"><div class="cal-stat-name">❌ Nichts</div><div class="cal-stat-bar-wrap"><div class="cal-stat-bar rot" style="width:${pWR}%"></div></div><div class="cal-stat-count rot">${wR}</div></div>
      </div>
    `}
  `;
}


let editDateKey = null, editWeekKey = null;
async function openDayModal(wdI, dk, wkMon) {
  editDateKey = dk; editWeekKey = wkMon || weekKeyFor(dk);
  const names = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
  const ds = new Date(dk + 'T12:00:00').toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('dayModalTitle').textContent = dk === todayKey() ? `Heute, ${ds}` : `${names[wdI]}, ${ds}`;
  await renderDMC(); document.getElementById('dayModal').classList.add('open');
}
async function renderDMC() {
  const aD = getActiveGoals(editDateKey, 'daily');
  const key = 'daily-' + editDateKey;
  const hasD = await storageHas(key);
  const dD = hasD ? await loadLS(key, {}) : {};
  const dc = aD.filter(g => dD[g.id]).length;
  const isC = aD.length > 0 && dc === aD.length && hasD;
  let badge;
  if (aD.length === 0) badge = '<div class="day-modal-badge none">Keine Tagesziele aktiv</div>';
  else if (isC) badge = '<div class="day-modal-badge full">🎉 Tagesziel erreicht!</div>';
  else if (dc > 0) badge = `<div class="day-modal-badge partial">⚡ ${dc} von ${aD.length} erledigt</div>`;
  else badge = '<div class="day-modal-badge none">Nichts eingetragen</div>';
  document.getElementById('dayModalBadge').innerHTML = badge;
  let h = `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:8px">Täglich</div>`;
  if (aD.length === 0) h += '<div style="font-size:13px;color:var(--text-muted);padding:8px 0">Keine Tagesziele für diesen Tag.</div>';
  else aD.forEach(g => {
    const done = !!dD[g.id], cl = CATEGORIES[g.category].color;
    h += `<div class="day-edit-row ${done ? 'done-' + cl : ''}" onclick="toggleDayTask('${g.id}')">\n      <div class="day-edit-check ${done ? 'done-' + cl : ''}">${done ? '✓' : ''}</div>\n      <div class="day-edit-label ${done ? 'done' : ''}">${CATEGORIES[g.category].emoji} ${esc(g.title)}<div style="font-size:11px;color:var(--text-muted);margin-top:1px">${esc(g.description || '')}</div></div></div>`;
  });
  const wkL = new Date(editWeekKey + 'T12:00:00').toLocaleDateString('de-AT', { day: 'numeric', month: 'short' });
  h += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin:14px 0 8px">Wöchentlich (${wkL}-Woche)</div>`;
  const aW = getActiveGoals(editWeekKey, 'weekly');
  const wD = normWD(editWeekKey);
  if (aW.length === 0) h += '<div style="font-size:13px;color:var(--text-muted);padding:8px 0">Keine Wochenziele für diese Woche.</div>';
  else aW.forEach(g => {
    const target = g.weeklyTarget || 1;
    let cur = wD[g.id] || 0; if (typeof cur !== 'number') cur = 0;
    const done = cur >= target, cl = CATEGORIES[g.category].color;
    const ct = done ? '✓' : (cur > 0 ? String(cur) : '');
    h += `<div class="day-edit-row ${done ? 'done-' + cl : ''}" onclick="toggleDayWeeklyTask('${g.id}')">\n      <div class="day-edit-check ${done ? 'done-' + cl : ''}">${ct}</div>\n      <div class="day-edit-label ${done ? 'done' : ''}">${CATEGORIES[g.category].emoji} ${esc(g.title)}<div style="font-size:11px;color:var(--text-muted);margin-top:1px">${esc(g.description || '')} · ${cur}/${target}</div></div></div>`;
  });
  document.getElementById('dayModalTasks').innerHTML = h;
}
async function toggleDayTask(gid) {
  const k = 'daily-' + editDateKey, d = await loadLS(k, {});
  d[gid] = !d[gid]; await saveLS(k, d);
  if (editDateKey === todayKey()) { dailyData = d; await renderTrainingGoals(); }
  await buildWeekstrip(); await renderTrainCalendar(); await renderDMC();
}
async function toggleDayWeeklyTask(gid) {
  const k = 'weekly-' + editWeekKey, d = await normWD(editWeekKey);
  const g = goals.find(x => x.id === gid) || { weeklyTarget: 1 };
  const target = g.weeklyTarget || 1;
  let cur = d[gid] || 0; let next = cur + 1; if (next > target) next = 0;
  d[gid] = next; await saveLS(k, d);
  if (editWeekKey === weekKey()) { weeklyData = d; await renderWeeklySection(); }
  await renderTrainCalendar();
  await renderDMC();
}
function closeDayModal() { document.getElementById('dayModal').classList.remove('open'); editDateKey = null; editWeekKey = null; }
document.getElementById('dayModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeDayModal(); });

let editGoalId = null, newGoalType = 'daily';
function openGoalModal(type, goalId) {
  editGoalId = goalId || null; const isE = !!editGoalId;
  document.getElementById('goalModalTitle').textContent = isE ? 'Ziel bearbeiten' : 'Neues Ziel';
  document.getElementById('gmDeleteBtn').style.display = isE ? '' : 'none';
  document.getElementById('gmTypeSection').style.display = isE ? 'none' : '';
  const wf = document.getElementById('gmWeeklyTargetField');
  if (isE) {
    const g = goals.find(x => x.id === editGoalId); if (!g) return;
    document.getElementById('gmTitle').value = g.title || '';
    document.getElementById('gmDesc').value = g.description || '';
    document.getElementById('gmCat').value = g.category || 'kraft';
    newGoalType = g.type;
    if (g.type === 'weekly') { wf.style.display = 'block'; document.getElementById('gmWeeklyTarget').value = g.weeklyTarget || 1; }
    else { wf.style.display = 'none'; document.getElementById('gmWeeklyTarget').value = ''; }
  } else {
    document.getElementById('gmTitle').value = ''; document.getElementById('gmDesc').value = '';
    document.getElementById('gmCat').value = 'kraft'; newGoalType = type || 'daily'; selGoalType(newGoalType);
  }
  document.getElementById('goalModal').classList.add('open');
  setTimeout(() => document.getElementById('gmTitle').focus(), 100);
}
function closeGoalModal() { document.getElementById('goalModal').classList.remove('open'); editGoalId = null; }
document.getElementById('goalModal').addEventListener('click', e => {
  if (e.target !== e.currentTarget) return;
  try {
    const sel = window.getSelection ? window.getSelection().toString() : '';
    if (sel && sel.length > 0) return; // keep modal open if user is selecting text
  } catch (err) { }
  closeGoalModal();
});
function selGoalType(t) {
  newGoalType = t;
  document.getElementById('gmTypeDaily').className = 'gm-type-btn' + (t === 'daily' ? ' sel' : '');
  document.getElementById('gmTypeWeekly').className = 'gm-type-btn' + (t === 'weekly' ? ' sel' : '');
  const wf = document.getElementById('gmWeeklyTargetField');
  if (t === 'weekly') { wf.style.display = 'block'; if (!document.getElementById('gmWeeklyTarget').value) document.getElementById('gmWeeklyTarget').value = '1'; }
  else { wf.style.display = 'none'; document.getElementById('gmWeeklyTarget').value = ''; }
}
async function saveGoal() {
  const ti = document.getElementById('gmTitle').value.trim();
  const de = document.getElementById('gmDesc').value.trim();
  const ca = document.getElementById('gmCat').value;
  if (!ti) { document.getElementById('gmTitle').focus(); return; }
  let wt = null;
  if (newGoalType === 'weekly') {
    const v = parseInt(document.getElementById('gmWeeklyTarget').value, 10);
    if (!v || v < 1) { document.getElementById('gmWeeklyTarget').focus(); return; }
    wt = v;
  }
  if (editGoalId) {
    const g = goals.find(x => x.id === editGoalId);
    if (g) { g.title = ti; g.description = de; g.category = ca; if (g.type === 'weekly') g.weeklyTarget = wt || g.weeklyTarget || 1; }
  } else {
    const ef = newGoalType === 'weekly' ? weekKey() : todayKey();
    goals.push({ id: 'g_' + Date.now(), title: ti, description: de, category: ca, type: newGoalType, effectiveFrom: ef, deletedAt: null, weeklyTarget: newGoalType === 'weekly' ? (wt || 1) : null });
  }
  await saveLS('goals', goals); closeGoalModal();
  dailyData = await loadLS('daily-' + todayKey(), {});
  weeklyData = await normWD(weekKey());
  await renderTrainingGoals(); await buildWeekstrip(); await renderTrainCalendar();
}
async function deleteGoal() {
  if (!editGoalId) return;
  const g = goals.find(x => x.id === editGoalId);
  if (g) g.deletedAt = g.type === 'weekly' ? weekKey() : todayKey();
  await saveLS('goals', goals); closeGoalModal();
  await renderTrainingGoals(); await buildWeekstrip(); await renderTrainCalendar();
}

let ernaehrung;
let calViewYear  = new Date().getFullYear();
let calViewMonth = new Date().getMonth(); // 0-indexed

async function rateToday(color) {
  const key = todayKey();
  if (ernaehrung[key] === color) {
    // toggle off
    delete ernaehrung[key];
  } else {
    ernaehrung[key] = color;
  }
  await saveLS('ernaehrung', ernaehrung);
  renderErnaehrung();
}

function calPrevMonth() {
  calViewMonth--;
  if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
  renderCalendar();
  renderCalStats();
}
function calNextMonth() {
  calViewMonth++;
  if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
  renderCalendar();
  renderCalStats();
}

function renderErnaehrung() {
  const today = todayKey();
  const todayDate = new Date(today + 'T12:00:00');
  document.getElementById('ernaehr-today-date').textContent =
    todayDate.toLocaleDateString('de-AT', {weekday:'long', day:'numeric', month:'long'});

  // Highlight selected button
  const cur = ernaehrung[today];
  ['gruen','orange','rot'].forEach(c => {
    const btn = document.getElementById('erb-' + c);
    btn.className = 'ernaehr-rate-btn' + (cur === c ? ' selected-' + c : '');
  });

  renderCalendar();
  renderCalStats();
}

function renderCalendar() {
  const grid = document.getElementById('cal-grid');
  const today = todayKey();
  const todayDate = new Date();
  const yr = calViewYear, mo = calViewMonth;

  // Month label
  document.getElementById('cal-month-label').textContent =
    new Date(yr, mo, 1).toLocaleDateString('de-AT', {month:'long', year:'numeric'});

  const firstDay = new Date(yr, mo, 1).getDay(); // 0=Sun
  const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Mo=0
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();

  let html = '';
  // Day headers
  ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(d => {
    html += `<div class="cal-day-header">${d}</div>`;
  });

  // Empty cells before first
  for (let i = 0; i < startOffset; i++) {
    html += `<div class="cal-day empty"></div>`;
  }

  // Days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateKey === today;
    const isFuture = dateKey > today;
    const color = ernaehrung[dateKey];

    let cls = 'cal-day';
    if (isToday) cls += ' today-marker';
    if (isFuture) cls += ' future-day';
    else if (!color) cls += ' past-day';
    if (color) cls += ' ' + color;

    const dot = color ? `<div class="cal-day-dot"></div>` : '';
    const click = !isFuture ? `onclick="calDayClick('${dateKey}')"` : '';

    html += `<div class="${cls}" ${click}>
      <div class="cal-day-num">${d}</div>
      ${dot}
    </div>`;
  }

  grid.innerHTML = html;
}

async function calDayClick(dateKey) {
  const today = todayKey();
  if (dateKey > today) return;
  // Cycle through colors: none → gruen → orange → rot → none
  const cur = ernaehrung[dateKey];
  const cycle = [undefined, 'gruen', 'orange', 'rot'];
  const nextIdx = (cycle.indexOf(cur) + 1) % cycle.length;
  if (cycle[nextIdx] === undefined) {
    delete ernaehrung[dateKey];
  } else {
    ernaehrung[dateKey] = cycle[nextIdx];
  }
  await saveLS('ernaehrung', ernaehrung);
  renderErnaehrung();
}

function renderCalStats() {
  const el = document.getElementById('cal-stats');
  const yr = calViewYear, mo = calViewMonth;
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const today = todayKey();

  let gruen = 0, orange = 0, rot = 0, total = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dk = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (dk > today) continue;
    total++;
    const c = ernaehrung[dk];
    if (c === 'gruen') gruen++;
    else if (c === 'orange') orange++;
    else if (c === 'rot') rot++;
  }

  if (total === 0) { el.innerHTML = ''; return; }

  const pctG = Math.round(gruen/total*100);
  const pctO = Math.round(orange/total*100);
  const pctR = Math.round(rot/total*100);

  const monthName = new Date(yr, mo, 1).toLocaleDateString('de-AT', {month:'long'});

  el.innerHTML = `<div class="cal-stats-title">📊 ${monthName} im Überblick</div>
  <div class="cal-stats-bars">
    <div class="cal-stat-row">
      <div class="cal-stat-name">🟢 Grün</div>
      <div class="cal-stat-bar-wrap"><div class="cal-stat-bar gruen" style="width:${pctG}%"></div></div>
      <div class="cal-stat-count gruen">${gruen}</div>
    </div>
    <div class="cal-stat-row">
      <div class="cal-stat-name">🟠 Orange</div>
      <div class="cal-stat-bar-wrap"><div class="cal-stat-bar orange" style="width:${pctO}%"></div></div>
      <div class="cal-stat-count orange">${orange}</div>
    </div>
    <div class="cal-stat-row">
      <div class="cal-stat-name">🔴 Rot</div>
      <div class="cal-stat-bar-wrap"><div class="cal-stat-bar rot" style="width:${pctR}%"></div></div>
      <div class="cal-stat-count rot">${rot}</div>
    </div>
  </div>`;
}

const COACH_TIPS = [
  // Motivation & Mindset
  "Jeder große Fortschritt beginnt mit einem kleinen Schritt. Du hast dich heute entschieden, aktiv zu sein — das ist bereits der wichtigste Schritt.",
  "Stell dir vor, wie du dich in 3 Monaten fühlst, wenn du heute wieder durchhältst. Dieses Bild ist dein stärkster Antrieb.",
  "Motivation bringt dich in Gang, Gewohnheit hält dich in Bewegung. Mach deine Übungen so selbstverständlich wie Zähneputzen.",
  "Perfekt gibt es nicht. Aber konsequent — das gibt es. Ein mittelmäßiges Training heute schlägt kein Training bei weitem.",
  "Vergleiche dich nur mit der Person, die du gestern warst. Du bist schon weiter als du denkst.",
  "Dein Körper schafft fast immer mehr als dein Kopf glaubt. Wenn du an deine Grenzen stößt — atme durch und mach noch eine Wiederholung.",
  "Die härteste Wiederholung ist die erste. Danach läuft alles von alleine.",
  "Erfolg ist die Summe kleiner Anstrengungen, die Tag für Tag wiederholt werden. Du sammelst diese Summe gerade.",
  "Ein schlechter Tag ist kein Grund aufzuhören — sondern ein Grund, morgen wieder anzufangen.",
  "Dein zukünftiges Ich wird dir für jeden heutigen Schritt dankbar sein.",

  // Abnehmen & Ernährung
  "−1,5 kg pro Monat klingt wenig. Aber in 6 Monaten sind das 9 kg — eine echte, nachhaltige Veränderung ohne Jo-Jo-Effekt.",
  "Wer langsam abnimmt, behält das Ergebnis. Crash-Diäten bauen Muskel ab — dein Plan baut Muskel auf.",
  "Ernährung macht ca. 70 % des Abnehmens aus. Ein grüner Tag bei der Ernährung wirkt mehr als eine extra Sportstunde.",
  "Hunger ist nicht immer Hunger — oft ist es Durst. Trink ein großes Glas Wasser und warte 10 Minuten.",
  "Iss langsam. Der Körper braucht 20 Minuten, um das Sättigungsgefühl zu registrieren. Wer schnell isst, isst mehr.",
  "Proteinreiche Mahlzeiten halten länger satt und schützen deine Muskeln beim Abnehmen. Eier, Hühnchen, Hülsenfrüchte — deine besten Freunde.",
  "Ein orangener oder roter Ernährungstag ist keine Niederlage. Er zeigt dir, wo du Spielraum hast — und morgen machst du es besser.",
  "Kalorien in flüssiger Form werden oft unterschätzt. Säfte, Kaffeegetränke und Alkohol können schnell 300–500 kcal extra bedeuten.",
  "Vorkochen am Wochenende ist eine der wirkungsvollsten Strategien. Wenn gesundes Essen bereit steht, greifst du seltener zu schlechten Optionen.",
  "Iss nicht aus Langeweile — iss wenn du wirklich hungrig bist. Stell dir die Frage: Würde ich jetzt einen Apfel essen? Wenn nein, bist du nicht wirklich hungrig.",

  // Krafttraining
  "Krafttraining verbrennt nicht nur während des Trainings Kalorien — dein Stoffwechsel bleibt danach bis zu 48 Stunden erhöht.",
  "Mit jedem Krafttraining baust du Muskelmasse auf. Muskeln verbrennen im Ruhezustand mehr Kalorien als Fett — dein Körper wird zur Fettverbrennungsmaschine.",
  "Sit-ups und Brustdrücken klingen einfach — aber 3 Sätze à 20 konsequent jeden Tag formt deinen Körper mehr als du denkst.",
  "Progressive Überladung ist das Geheimnis: Werde jede Woche ein kleines bisschen stärker. Heute schaffst du 20 Wiederholungen — in 2 Monaten machst du sie mit Leichtigkeit.",
  "Kurze Pausen zwischen den Sätzen (30–60 Sekunden) erhöhen den Trainingseffekt. Gönne dir Ruhe — aber nicht zu lange.",
  "Achte bei Sit-ups auf die Körperspannung: Bauch anspannen, nicht am Nacken ziehen. Qualität schlägt Quantität.",
  "Beim Brustdrücken: Schulterblätter zusammenziehen, Brust nach vorne — das schützt die Schultern und macht die Übung effektiver.",
  "3 Einheiten Krafttraining pro Woche reichen aus, um messbare Ergebnisse zu erzielen — wenn du konsequent dabei bleibst.",
  "Muskelkater am nächsten Tag? Das ist ein gutes Zeichen. Deine Muskeln passen sich an und werden stärker.",
  "Dein Körper braucht Ruhe genauso wie Training. Erholungstage sind kein Versagen — sie sind Teil des Plans.",

  // Ausdauer & Bewegung
  "Schon 30 Minuten zügiges Gehen verbrennt ca. 150–200 kcal und hebt die Stimmung durch Endorphine.",
  "Wandern ist unterschätztes Training. Unebenes Gelände aktiviert Muskeln, die beim Joggen kaum beansprucht werden.",
  "Beim Radeln: Wähle hin und wieder eine härtere Route. Die Abwechslung hält die Motivation hoch und den Körper auf Trab.",
  "Laufen ist Meditation in Bewegung. Lass die Gedanken fließen — viele große Ideen entstehen beim Laufen.",
  "Ausdauertraining stärkt das Herz, verbessert den Schlaf und reduziert Stress. Es ist kein Zusatz — es ist Grundlage.",
  "Fang langsam an, bleib lange dabei. Wer zu schnell startet, gibt zu früh auf. Tempo und Intensität kommen von alleine.",
  "Musik oder Podcasts beim Training machen die Zeit kürzer und die Einheit angenehmer. Leg eine Trainings-Playlist an.",
  "Bewegung in den Alltag integrieren: Treppen statt Lift, zu Fuß zum Einkaufen, kurze Spaziergänge in der Mittagspause — alles zählt.",
  "2 Ausdauereinheiten pro Woche verbessern nachweislich die Fettverbrennung und die Herz-Kreislauf-Gesundheit.",
  "Frische Luft beim Training ist ein Bonus. Tageslicht reguliert den Schlaf-Wach-Rhythmus und hebt die Stimmung.",

  // Schlaf & Erholung
  "Schlaf ist die mächtigste Erholungsmaßnahme. Wer weniger als 7 Stunden schläft, baut langsamer Muskeln auf und nimmt schwerer ab.",
  "Im Schlaf schüttet der Körper Wachstumshormone aus — deine Muskeln wachsen nicht im Training, sondern in der Nacht danach.",
  "Stress erhöht Cortisol, Cortisol fördert Fetteinlagerung besonders am Bauch. Erholung und Entspannung sind aktiver Teil deines Abnehmplans.",
  "Ein kurzer Mittagsschlaf (10–20 Minuten) kann Konzentration und Trainingslust am Nachmittag deutlich steigern.",
  "Leg das Handy 30 Minuten vor dem Schlafen weg. Besserer Schlaf = bessere Erholung = bessere Trainingsresultate.",

  // Gewicht & Fortschritt
  "Das Gewicht schwankt täglich um 1–2 kg durch Wasser, Verdauung und Hormone. Lass dich davon nicht irritieren — der Trend zählt.",
  "Messe deinen Fortschritt auch an Energie, Stimmung und Kraft — nicht nur an der Zahl auf der Waage.",
  "Bauchfett ist oft das hartnäckigste — aber es ist auch das erste, das sich bei konsequentem Training und Ernährung verändert.",
  "Muskel wiegt mehr als Fett. Wenn du trainierst und die Waage stagniert, kann es sein, dass du trotzdem Fett verlierst und Muskeln aufbaust.",
  "Dein Ziel bis Dezember: 70,8 kg. Das sind rund 0,35 kg pro Woche — sehr machbar, wenn du dran bleibst.",

  // Visualisierung & Mindset
  "Deine tägliche Visualisierung ist mächtiger als du denkst. Das Gehirn unterscheidet kaum zwischen lebhafter Vorstellung und Realität.",
  "Stell dir beim Visualisieren nicht nur das Zielgewicht vor — stell dir vor, wie du dich bewegst, was du anziehst, wie andere dich wahrnehmen.",
  "Athleten visualisieren ihren Erfolg bevor sie ihn erleben. Du tust heute dasselbe.",
  "5 Minuten täglich mentales Training können über Wochen messbare physische Auswirkungen haben. Deine Routine ist wissenschaftlich fundiert.",
  "Positives Denken alleine reicht nicht — aber positives Denken kombiniert mit täglichem Handeln ist unschlagbar.",

  // Wochenplanung
  "Mo · Mi · Fr für Krafttraining, Di · Do oder Sa für Ausdauer — diese Verteilung gibt deinem Körper ideale Erholungszeiten.",
  "Plane dein Training wie einen Termin. Was im Kalender steht, wird gemacht.",
  "Sonntag ist der beste Tag um die Woche zu reflektieren: Was lief gut? Was kann ich verbessern? 5 Minuten Reflexion machen den Unterschied.",
  "Eine gute Woche braucht nicht perfekt zu sein. Sie braucht nur mehr gute Entscheidungen als schlechte.",
  "Wenn du eine Einheit verpasst: Mach sie nicht nach — bleib einfach beim nächsten geplanten Termin. Kein Schuldgefühl nötig.",

  // Hydration & Basics
  "Trink täglich mindestens 2 Liter Wasser. Schon leichte Dehydration reduziert die Trainingsleistung um bis zu 10 %.",
  "Morgens als erstes ein großes Glas Wasser trinken startet den Stoffwechsel und gibt dir direkt Energie.",
  "Kaffee vor dem Training kann die Leistung steigern. Aber: Kein Kaffee auf leeren Magen und Maßhalten.",
  "Nach dem Training: Proteine essen. Das Zeitfenster in den ersten 30–60 Minuten ist ideal für Muskelregeneration.",
  "Warmes Aufwärmen vor dem Training verhindert Verletzungen und verbessert die Übungsausführung. 2–3 Minuten reichen.",

  // Langzeitperspektive
  "Du baust gerade einen Lebensstil auf — keine Diät, kein Programm mit Ablaufdatum. Das ist der Unterschied zwischen Erfolg und Jo-Jo.",
  "In 6 Monaten wirst du froh sein, heute angefangen zu haben. In 2 Jahren wirst du kaum glauben, wie weit du gekommen bist.",
  "Kleine tägliche Verbesserungen summieren sich zu massiven Ergebnissen. 1 % besser jeden Tag macht dich in einem Jahr 37× besser.",
  "Das Wichtigste ist nicht das Gewicht auf der Waage — sondern das Gefühl in deinem Körper. Energie, Stärke, Wohlbefinden.",
  "Du machst das nicht für andere. Du machst das für das beste, gesündeste, stärkste Ich, das du sein kannst.",
  "Rückschläge gehören dazu. Die Frage ist nicht ob du fällst — sondern wie schnell du wieder aufstehst.",
  "Wer seinen Körper respektiert, ernährt ihn gut, bewegt ihn regelmäßig und gibt ihm ausreichend Ruhe. Das ist kein Opfer — das ist Selbstliebe.",
  "Dein Körper ist der einzige Ort, in dem du definitiv für immer wohnen wirst. Investiere in ihn.",
  "Konsistenz über Intensität. Lieber 3× pro Woche moderate Einheiten als einmal brutal und dann wochenlang nichts.",
  "Feiere jeden Meilenstein. −1,5 kg bedeutet: Du hast es geschafft. Das verdient Anerkennung — auch wenn es sich klein anfühlt.",
];

function renderCoach() {
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
  const tipIndex = dayOfYear % COACH_TIPS.length;
  const tip = COACH_TIPS[tipIndex];

  const dayNames = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  const dayName = dayNames[today.getDay()];
  const dateStr = today.toLocaleDateString('de-AT', {day:'numeric', month:'long'});

  const dayEl = document.getElementById('coach-day');
  const tipEl = document.getElementById('coach-tip');
  if (dayEl) dayEl.textContent = `Tipp für ${dayName}, ${dateStr}`;
  if (tipEl) tipEl.textContent = tip;
}

let isLight;

function applyTheme() {
  if (isLight) {
    document.body.classList.add('light');
    document.getElementById('themeToggle').textContent = '🌙';
  } else {
    document.body.classList.remove('light');
    document.getElementById('themeToggle').textContent = '☀️';
  }
}

async function toggleTheme() {
  isLight = !isLight;
  await saveLS('theme', isLight);
  applyTheme();
}

const MILESTONE_DATES = [
  '2026-05-15','2026-06-15','2026-07-15','2026-08-15',
  '2026-09-15','2026-10-15','2026-11-15','2026-12-15'
];
const STEPS = MILESTONE_DATES.length - 1; // 7 steps

function getGoalWeight() {
  return weightSettings.goalWeight !== undefined ? weightSettings.goalWeight : DEFAULT_GOAL_WEIGHT;
}

function getStartWeight() {
  const entries = getSortedWeightEntries();
  const startEntry = getStartEntry(entries);
  return startEntry ? startEntry.weight : DEFAULT_START_WEIGHT;
}

function getMilestoneTarget(idx) {
  const startWeight = getStartWeight();
  const goalWeight = getGoalWeight();
  const stepSize = (startWeight - goalWeight) / STEPS;
  return +(startWeight - idx * stepSize).toFixed(1);
}

function getWeightOnOrBefore(dateKey) {
  const allDates = Object.keys(weights).sort();
  let best = null;
  for (const d of allDates) {
    if (d <= dateKey) best = d;
  }
  return best ? weights[best] : null;
}

function formatWeightDate(dateKey) {
  return new Date(dateKey + 'T12:00:00').toLocaleDateString('de-AT', { day:'2-digit', month:'short' });
}

function getSortedWeightEntries() {
  return Object.entries(weights)
    .map(([date, weight]) => ({ date, weight }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getStartEntry(entries) {
  if (!entries.length) return null;
  if (weightSettings.startDate) {
    const startWeight = weights[weightSettings.startDate];
    if (startWeight !== undefined) {
      return { date: weightSettings.startDate, weight: startWeight };
    }
  }
  return entries[0];
}

function parseDateKey(key) {
  return new Date(key + 'T12:00:00');
}
function diffDays(from, to) {
  const diff = to.getTime() - from.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}
function addDays(date, count) {
  const result = new Date(date);
  result.setDate(result.getDate() + count);
  return result;
}
function formatDayMonthYear(date) {
  return date.toLocaleDateString('de-AT', { day:'numeric', month:'short', year:'numeric' });
}
function getBMI(weight, heightCm) {
  if (!weight || !heightCm) return null;
  const meters = heightCm / 100;
  return weight / (meters * meters);
}
function getBMICategory(bmi) {
  if (bmi === null) return '–';
  if (bmi < 18.5) return 'Untergewicht';
  if (bmi < 25) return 'Normalgewicht';
  if (bmi < 30) return 'Übergewicht';
  return 'Adipositas';
}
function getTrend(entries) {
  if (entries.length < 2) return null;
  const first = entries[0];
  const last = entries[entries.length - 1];
  const days = diffDays(parseDateKey(first.date), parseDateKey(last.date));
  if (days <= 0) return null;
  const totalLoss = first.weight - last.weight;
  const daily = totalLoss / days;
  return {
    daily,
    weekly: daily * 7,
    monthly: daily * 30,
    days,
    totalLoss,
  };
}
function getForecastDate(current, target, trend) {
  if (!trend || trend.daily <= 0) return null;
  const remaining = current - target;
  if (remaining <= 0) return new Date();
  const days = Math.round(remaining / trend.daily);
  if (days <= 0) return new Date();
  return addDays(new Date(), days);
}
function renderWeightSettings() {
  const section = document.getElementById('weight-settings-section');
  if (!section) return;
  section.innerHTML = `<div class="weight-settings-card">
      <div class="weight-settings-block">
        <div class="weight-settings-label">Körpergröße</div>
        <input id="weightHeightInput" class="weight-settings-input" type="number" min="110" max="240" step="1" value="${weightSettings.height}" autocomplete="off">
        <div class="weight-summary-sub">Für BMI &amp; Zielprognose</div>
      </div>
      <div class="weight-settings-block">
        <div class="weight-settings-label">Zieldatum</div>
        <input id="weightGoalDateInput" class="weight-settings-input" type="date" min="${todayKey()}" value="${weightSettings.goalDate}" autocomplete="off">
        <div class="weight-summary-sub">Bis wann möchtest du dein Ziel erreichen?</div>
      </div>
      <div class="weight-settings-block" style="grid-column: span 2; display:flex; flex-direction:column; gap:10px; justify-content:flex-end;">
        <button class="weight-quick-add-button save" onclick="saveWeightSettings()">Einstellungen speichern</button>
      </div>
    </div>`;
}
function renderWeightAnalytics() {
  const section = document.getElementById('weight-analytics-section');
  if (!section) return;
  const entries = getSortedWeightEntries();
  if (!entries.length) {
    section.innerHTML = `<div class="weight-chart-card">
      <div class="weight-chart-title">Analytics</div>
      <div style="font-size:13px;color:var(--text-muted);">Trage Gewicht ein, um BMI, Tempo und Prognosen zu sehen.</div>
    </div>`;
    return;
  }
  const first = entries[0].weight;
  const last = entries[entries.length - 1].weight;
  const trend = getTrend(entries);
  const bmi = getBMI(last, weightSettings.height);
  const forecastDate = getForecastDate(last, END_WEIGHT, trend);
  const remaining = +(last - END_WEIGHT).toFixed(1);
  const goalDate = parseDateKey(weightSettings.goalDate);
  const daysToGoal = diffDays(new Date(), goalDate);
  const monthsToGoal = daysToGoal > 0 ? daysToGoal / 30 : 0;
  const requiredPerMonth = monthsToGoal > 0 ? +(remaining / monthsToGoal).toFixed(1) : null;
  section.innerHTML = `<div class="weight-analytics-grid">
      <div class="weight-analytics-card">
        <div class="weight-analytics-label">BMI</div>
        <div class="weight-analytics-value">${bmi ? bmi.toFixed(1) : '–'}</div>
        <div class="weight-analytics-sub">${bmi ? getBMICategory(bmi) : 'Körpergröße fehlt'}</div>
      </div>
      <div class="weight-analytics-card">
        <div class="weight-analytics-label">Tempo</div>
        <div class="weight-analytics-value">${trend ? `${Math.abs(trend.weekly).toFixed(1)} kg/Woche` : '–'}</div>
        <div class="weight-analytics-sub">${trend ? `durchschnittlich über ${trend.days} Tage` : 'Mehr als ein Eintrag nötig'}</div>
      </div>
      <div class="weight-analytics-card">
        <div class="weight-analytics-label">Prognose</div>
        <div class="weight-analytics-value">${forecastDate ? formatDayMonthYear(forecastDate) : 'Keine Prognose'}</div>
        <div class="weight-analytics-sub">${forecastDate ? 'bei aktuellem Tempo' : 'Trend nicht fallend'}</div>
      </div>
      <div class="weight-analytics-card">
        <div class="weight-analytics-label">Monatsziel</div>
        <div class="weight-analytics-value">${requiredPerMonth !== null ? `${Math.abs(requiredPerMonth).toFixed(1)} kg` : '–'}</div>
        <div class="weight-analytics-sub">${monthsToGoal > 0 ? `bis ${formatDayMonthYear(goalDate)}` : 'Ungültiges Ziel-Datum'}</div>
      </div>
    </div>`;
}
function renderWeightQuickAdd() {
  const section = document.getElementById('weight-quick-add-section');
  if (!section) return;
  section.innerHTML = `<div class="weight-quick-add-card">
      <div>
        <div class="weight-summary-label">Schnelleingabe</div>
        <div class="weight-quick-add-text">Tippe auf das Diagramm oder nutze die Schaltfläche, um dein heutiges Gewicht schnell zu erfassen.</div>
      </div>
      <button class="weight-quick-add-button save" onclick="openWeightModal()">Heute eintragen</button>
    </div>`;
}

async function saveWeightSettings() {
  const height = parseInt(document.getElementById('weightHeightInput').value, 10);
  const goalDate = document.getElementById('weightGoalDateInput').value;
  if (height >= 110 && height <= 240) {
    weightSettings.height = height;
  }
  if (goalDate) {
    weightSettings.goalDate = goalDate;
  }
  await saveLS('weightSettings', weightSettings);
  renderMilestones();
}

function renderWeightOverview() {
  const section = document.getElementById('weight-summary');
  if (!section) return;
  const entries = getSortedWeightEntries();
  if (!entries.length) {
    section.innerHTML = `<div class="plan-box" style="padding:16px;display:flex;flex-direction:column;gap:8px;">
      <div style="font-size:14px;font-weight:700;color:var(--text-strong);">Noch kein Gewicht eingetragen</div>
      <div style="font-size:13px;color:var(--text-muted);">Trage den ersten Eintrag ein, um deinen Verlauf zu starten.</div>
      <button class="empty-btn" onclick="openWeightModal()" style="align-self:flex-start;">Eintragen</button>
    </div>`;
    return;
  }

  const startEntry = getStartEntry(entries);
  if (!startEntry) return;
  const last = entries[entries.length - 1];
  const start = startEntry.weight;
  const current = last.weight;
  const remaining = +(current - END_WEIGHT).toFixed(1);
  const change = +(current - start).toFixed(1);
  const pct = start === END_WEIGHT ? 100 : Math.min(100, Math.max(0, ((start - current) / (start - END_WEIGHT)) * 100));
  const displayPct = Math.round(pct);
  const startLabel = weightSettings.startDate ? formatDayMonthYear(parseDateKey(startEntry.date)) : 'Erster Eintrag';

  const goalDisplay = formatDayMonthYear(parseDateKey(weightSettings.goalDate));
  document.getElementById('weightGoalValue').textContent = `${start.toFixed(1)} → ${END_WEIGHT.toFixed(1)} kg`;
  document.getElementById('weightGoalHint').textContent = `Aktuell ${current.toFixed(1)} kg · ${displayPct}% zum Ziel · bis ${goalDisplay}`;

  section.innerHTML = `
    <div class="weight-summary-grid">
      <div class="weight-summary-card" style="cursor:pointer;" onclick="openWeightModal(todayKey(),'start')">
        <div class="weight-summary-label">Start</div>
        <div class="weight-summary-value">${start.toFixed(1)} kg</div>
        <div class="weight-summary-sub">${weightSettings.startDate ? `Seit ${startLabel}` : 'Neuen Start festlegen'}</div>
      </div>
      <div class="weight-summary-card">
        <div class="weight-summary-label">Aktuell</div>
        <div class="weight-summary-value">${current.toFixed(1)} kg</div>
        <div class="weight-summary-sub">Letzter Eintrag</div>
      </div>
      <div class="weight-summary-card">
        <div class="weight-summary-label">Ziel</div>
        <div class="weight-summary-value">${END_WEIGHT.toFixed(1)} kg</div>
        <div class="weight-summary-sub">15. jeden Monats</div>
      </div>
    </div>
    <div class="weight-progress-bar">
      <div class="weight-progress-track">
        <div class="weight-progress-fill" style="width:${displayPct}%;"></div>
      </div>
      <div class="weight-progress-meta">${displayPct}% erreicht · ${remaining > 0 ? `noch ${Math.abs(remaining).toFixed(1)} kg` : 'Ziel erreicht!'}</div>
    </div>`;
}

function renderWeightLog() {
  const log = document.getElementById('weight-log-section');
  if (!log) return;
  const entries = getSortedWeightEntries().reverse();
  if (!entries.length) {
    log.innerHTML = `<div class="empty-state">
      <div class="empty-emoji">⚖️</div>
      <div class="empty-text">Trage dein Startgewicht ein, um zu beginnen</div>
      <button class="empty-btn" onclick="openWeightModal()">Jetzt eintragen →</button>
    </div>`;
    return;
  }

  log.innerHTML = entries.map((entry, index) => {
    const prev = entries[index + 1]?.weight ?? null;
    const diff = prev !== null ? +(entry.weight - prev).toFixed(1) : null;
    const diffText = diff === null ? '' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg`;
    const diffClass = diff === null ? '' : diff > 0 ? 'weight-log-up' : diff < 0 ? 'weight-log-down' : 'weight-log-same';
    return `<div class="weight-log-row">
      <div>
        <div class="weight-log-date">${formatWeightDate(entry.date)}</div>
        <div class="weight-log-day">${weekday(entry.date)}</div>
      </div>
      <div class="weight-log-value">${entry.weight.toFixed(1)} kg</div>
      <div class="weight-log-diff ${diffClass}">${diffText}</div>
    </div>`;
  }).join('');
}

function renderWeightChart() {
  const section = document.getElementById('weight-chart-section');
  if (!section) return;
  const entries = getSortedWeightEntries();
  if (entries.length < 2) {
    section.innerHTML = `<div class="weight-chart-card">
      <div class="weight-chart-title">Gewichtsverlauf</div>
      <div style="font-size:13px;color:var(--text-muted);">Mindestens 2 Einträge erforderlich, um das Diagramm anzuzeigen.</div>
    </div>`;
    return;
  }

  const values = entries.map(e => e.weight);
  const minW = Math.min(...values) - 1;
  const maxW = Math.max(...values) + 1;
  const len = entries.length;
  const range = maxW - minW || 1;
  const points = entries.map((entry, idx) => {
    const x = 16 + (idx / (len - 1)) * 100;
    const y = 100 - ((entry.weight - minW) / range) * 80;
    return `${x},${y}`;
  }).join(' ');

  const firstWeight = entries[0].weight;
  const lastWeight = entries[len - 1].weight;
  const trendStartY = 100 - ((firstWeight - minW) / (maxW - minW)) * 80;
  const trendEndY = 100 - ((lastWeight - minW) / (maxW - minW)) * 80;

  section.innerHTML = `<div class="weight-chart-card weight-chart-clickable" onclick="openWeightModal()">
    <div class="weight-chart-title">Gewichtsverlauf</div>
    <div class="weight-summary-sub" style="margin-bottom:10px;">Tippe auf das Diagramm, um schnell einen Eintrag hinzuzufügen.</div>
    <svg class="weight-chart-svg" viewBox="0 0 120 120" preserveAspectRatio="none">
      <defs>
        <linearGradient id="weightFlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35" />
          <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="M${points} L116,100 L16,100 Z" fill="url(#weightFlow)" />
      <line x1="16" y1="${trendStartY}" x2="116" y2="${trendEndY}" stroke="#a5b4fc" stroke-width="1" stroke-dasharray="4 3" />
      <polyline points="${points}" fill="none" stroke="#38bdf8" stroke-width="2.2" />
      ${entries.map((entry, idx) => {
        const x = 16 + (idx / (len - 1)) * 100;
        const y = 100 - ((entry.weight - minW) / (maxW - minW)) * 80;
        return `<circle cx="${x}" cy="${y}" r="2.5" fill="#fff" stroke="#38bdf8" stroke-width="1.2" />`;
      }).join('')}
      ${entries.map((entry, idx) => {
        const x = 16 + (idx / (len - 1)) * 100;
        const y = 100 - ((entry.weight - minW) / (maxW - minW)) * 80;
        return `<text x="${x}" y="${y - 6}" text-anchor="middle" font-size="6.5" fill="#a5b4fc">${entry.weight.toFixed(1)}</text>`;
      }).join('')}
    </svg>
  </div>`;
}

function getLastWeight() {
  const allDates = Object.keys(weights).sort();
  if (!allDates.length) return null;
  return weights[allDates[allDates.length - 1]];
}

function renderNextGoalSection() {
  const el = document.getElementById('next-goal-section');
  const today = todayKey();
  // Find next upcoming milestone
  const next = MILESTONE_DATES.find(d => d > today);
  if (!next) { el.innerHTML = ''; return; }
  const idx = MILESTONE_DATES.indexOf(next);
  const target = getMilestoneTarget(idx);
  const lastW = getLastWeight();
  const nextDate = new Date(next + 'T12:00:00').toLocaleDateString('de-AT', {day:'numeric', month:'long', year:'numeric'});

  if (lastW === null) {
    el.innerHTML = `<div class="next-goal-card">
      <div class="next-goal-label">Nächster Meilenstein</div>
      <div class="next-goal-date">📅 ${nextDate}</div>
      <div style="font-size:13px;color:#5b4e78;">Trage dein Gewicht ein um loszulegen.</div>
    </div>`;
    return;
  }

  const stillNeeded = +(lastW - target).toFixed(1);
  const sign = stillNeeded > 0 ? '−' : '+';

  el.innerHTML = `<div class="next-goal-card">
    <div class="next-goal-label">Nächster Meilenstein</div>
    <div class="next-goal-date">📅 ${nextDate}</div>
    <div class="next-goal-row">
      <div class="next-goal-box">
        <div class="next-goal-box-label">Aktuell</div>
        <div class="next-goal-box-val">${lastW.toLocaleString('de-AT')} kg</div>
        <div class="next-goal-box-sub">letzter Eintrag</div>
      </div>
      <div class="next-goal-box">
        <div class="next-goal-box-label">Ziel am 15.</div>
        <div class="next-goal-box-val target">${target.toLocaleString('de-AT')} kg</div>
        <div class="next-goal-box-sub">−1,5 kg/Monat</div>
      </div>
      <div class="next-goal-box">
        <div class="next-goal-box-label">Noch</div>
        <div class="next-goal-box-val still">${sign}${Math.abs(stillNeeded).toLocaleString('de-AT')} kg</div>
        <div class="next-goal-box-sub">abzunehmen</div>
      </div>
    </div>
  </div>`;
}

function renderMilestones() {
  renderNextGoalSection();
  const list = document.getElementById('milestone-list');
  const today = todayKey();
  let html = '';

  MILESTONE_DATES.forEach((ms, idx) => {
    const msDate = new Date(ms + 'T12:00:00');
    const label = msDate.toLocaleDateString('de-AT', {day:'numeric', month:'long', year:'numeric'});
    const target = getMilestoneTarget(idx);
    const actual = getWeightOnOrBefore(ms);
    const isPast = ms < today;
    const isToday = ms === today;
    const isFuture = ms > today;

    let status, icon;
    if (isFuture) {
      status = 'future'; icon = '·';
    } else if (actual === null) {
      status = 'pending'; icon = '?';
    } else if (idx === 0) {
      status = 'pending'; icon = '⚖';
    } else {
      status = actual <= target ? 'achieved' : 'missed';
      icon = actual <= target ? '✓' : '✗';
    }

    const actualDisplay = actual !== null
      ? `${actual.toLocaleString('de-AT')} kg`
      : (isFuture ? '–' : 'Kein Eintrag');

    const diffBadge = (() => {
      if (status === 'future') return `<div class="ms-diff-badge future">geplant</div>`;
      if (status === 'pending' && idx === 0) return `<div class="ms-diff-badge pending">Start</div>`;
      if (status === 'pending') return `<div class="ms-diff-badge pending">Eintragen!</div>`;
      const diff = +(actual - target).toFixed(1);
      const txt = diff <= 0 ? `${diff} kg ✓` : `+${diff} kg`;
      return `<div class="ms-diff-badge ${status}">${txt}</div>`;
    })();

    html += `<div class="milestone-row">
      <div class="ms-side ${status}">
        <div class="ms-side-icon">${icon}</div>
        <div class="ms-side-num">15.</div>
      </div>
      <div class="ms-body ${status}">
        <div class="ms-date-label${status==='future'?' future':''}">${label}</div>
        <div class="ms-vals-row">
          <div class="ms-val-block">
            <div class="ms-val-title">Eingetragen</div>
            <div class="ms-val-num actual ${status}">${actualDisplay}</div>
          </div>
          <div class="ms-divider"></div>
          <div class="ms-val-block">
            <div class="ms-val-title">Zielgewicht</div>
            <div class="ms-val-num goal">${target.toLocaleString('de-AT')} kg</div>
          </div>
          ${diffBadge}
        </div>
      </div>
    </div>`;
  });

  list.innerHTML = html || `<div class="empty-state">
    <div class="empty-emoji">⚖️</div>
    <div class="empty-text">Trage dein Startgewicht ein, um zu beginnen</div>
    <button class="empty-btn" onclick="openWeightModal()">Jetzt eintragen →</button>
  </div>`;

  renderWeightOverview();
  renderWeightChart();
  renderWeightSettings();
  renderWeightAnalytics();
  renderWeightQuickAdd();
  renderWeightLog();
}

function openWeightModal(dateKey = todayKey(), mode = 'weight') {
  weightModalMode = mode;
  const today = todayKey();
  const dateInput = document.getElementById('weightDateInput');
  document.getElementById('modalMonthLabel').textContent = mode === 'start' ? 'Startdatum festlegen' : 'Datum auswählen';
  dateInput.value = dateKey;
  dateInput.max = today;
  document.getElementById('weightInput').value = weights[dateKey] || '';
  document.getElementById('weightModal').classList.add('open');
  setTimeout(()=>document.getElementById('weightInput').focus(),100);
}
function closeWeightModal() {
  document.getElementById('weightModal').classList.remove('open');
}
async function saveWeight() {
  const dateValue = document.getElementById('weightDateInput').value || todayKey();
  const raw = document.getElementById('weightInput').value.replace(',','.');
  const val = parseFloat(raw);
  if (!dateValue || isNaN(val)) return;
  weights[dateValue] = val;
  await saveLS('weights', weights);
  if (weightModalMode === 'start') {
    weightSettings.startDate = dateValue;
    await saveLS('weightSettings', weightSettings);
  } else if (weightSettings.startDate && weights[weightSettings.startDate] === undefined) {
    weightSettings.startDate = null;
    await saveLS('weightSettings', weightSettings);
  }
  closeWeightModal();
  renderMilestones();
  renderWeightOverview();
  renderWeightChart();
  renderWeightAnalytics();
  renderWeightQuickAdd();
  renderWeightLog();
}
document.getElementById('weightInput').addEventListener('keydown', e => { if(e.key==='Enter') saveWeight(); });
document.getElementById('weightDateInput').addEventListener('change', () => {
  const dateValue = document.getElementById('weightDateInput').value || todayKey();
  document.getElementById('weightInput').value = weights[dateValue] || '';
});
document.getElementById('weightModal').addEventListener('click', e => { if(e.target===e.currentTarget) closeWeightModal(); });


async function showTab(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'ernaehrung') { renderErnaehrung(); renderCoach(); }
  if (name === 'training') { await renderTrainingGoals(); await buildWeekstrip(); await renderTrainCalendar(); }
}



async function init() {
  await initStorage();
  weights = await loadLS('weights', {});
  weightSettings = await loadLS('weightSettings', weightSettings);
  if (!weightSettings || !weightSettings.height || !weightSettings.goalDate) {
    weightSettings = {
      height: weightSettings?.height || DEFAULT_WEIGHT_HEIGHT,
      goalDate: weightSettings?.goalDate || DEFAULT_WEIGHT_GOAL_DATE,
    };
    await saveLS('weightSettings', weightSettings);
  }
  goals = await loadLS('goals', null);
  if (goals === null) { goals = []; await saveLS('goals', goals); }
  await normalizeGoals();
  dailyData = await loadLS('daily-' + todayKey(), {});
  weeklyData = await normWD(weekKey());
  ernaehrung = await loadLS('ernaehrung', {});
  isLight = (await loadLS('theme', false)) === true || (await loadLS('theme', false)) === 'true';

  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })();
  if (weights[yesterday] !== undefined) { delete weights[yesterday]; await saveLS('weights', weights); }
  const today = todayKey();
  if (!weights[today]) { weights[today] = 81.3; await saveLS('weights', weights); }
  document.getElementById('todayDate').textContent =
    new Date().toLocaleDateString('de-AT', {weekday:'long', day:'numeric', month:'long'});
  applyTheme();
  await initCommitment();
  await buildWeekstrip();
  await renderTrainingGoals();
  renderMilestones();
  renderErnaehrung();
  await renderTrainCalendar();
  renderCoach();
}
init();


if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

