(() => {
'use strict';

/* ============ CONFIGURACIÓN ============
   1) Crea un proyecto en supabase.com
   2) Ejecuta schema.sql en el SQL Editor
   3) Pega aquí tu "Project URL" y tu clave "anon / publishable"
   (la clave anon es pública por diseño; la seguridad la dan las reglas RLS del schema.sql)
   Si los dejas vacíos, la página funciona en MODO DEMO (datos solo en este navegador). */
const CONFIG = {
  SUPABASE_URL: "https://thakmgdfqcgtrvrksveu.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_MwfJIwW07xbzdzrBs-FYDA_MPGrLWE_"
};

const CATS = ['Comida','Transporte','Estudios','Compras','Entretenimiento','Ahorro','Trabajo','Otros'];
const ICONS = {Comida:'🍽️',Transporte:'🚌',Estudios:'📚',Compras:'🛍️',Entretenimiento:'🎬',Ahorro:'🐷',Trabajo:'💼',Otros:'✨'};

const CLOUD = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && window.supabase);
const sb = CLOUD ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;

/* ============ Utilidades ============ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => 'S/ ' + Number(n || 0).toLocaleString('es-PE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const fmtDate = s => {
  const [y, m, d] = String(s).split('-');
  return Number(y) === new Date().getFullYear() ? `${d}/${m}` : `${d}/${m}/${y}`;
};
/* Rango lunes-domingo. offset = 0 es esta semana, -1 la anterior, etc. */
function weekRange(offset = 0) {
  const d = new Date();
  const idx = (d.getDay() + 6) % 7;            // lunes = 0
  const s = new Date(d); s.setDate(d.getDate() - idx + offset * 7);
  const e = new Date(s); e.setDate(s.getDate() + 6);
  return [ymd(s), ymd(e), idx];
}
/* Rango del mes. offset = 0 es este mes, -1 el anterior, etc. */
function monthRange(offset = 0) {
  const d = new Date();
  const s = new Date(d.getFullYear(), d.getMonth() + offset, 1), e = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
  return [ymd(s), ymd(e)];
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

let toastTimer;
function toast(msg, action) {
  const t = $('#toast'); t.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-act'; b.textContent = action.label;
    b.onclick = () => { t.classList.remove('show'); action.fn(); };
    t.appendChild(b);
  }
  t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), action ? 7000 : 3200);
}
function setMsg(el, kind, text) { el.className = 'msg ' + (kind || ''); el.textContent = text || ''; }

/* ============ Modales ============ */
let lastFocus = null, confirmResolve = null;
function openModal(id) {
  lastFocus = document.activeElement;
  const m = $('#' + id); m.hidden = false;
  const f = m.querySelector('input:not([type=hidden]):not([hidden]), button.btn, textarea');
  setTimeout(() => f && f.focus(), 30);
}
function closeModal(id) {
  const m = $('#' + id); if (m.hidden) return;
  m.hidden = true;
  if (id === 'confirmModal' && confirmResolve) { const r = confirmResolve; confirmResolve = null; r(false); }
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { $$('.modal').forEach(m => !m.hidden && closeModal(m.id)); return; }
  if (e.key !== 'Tab') return;
  const m = $$('.modal').find(x => !x.hidden); if (!m) return;   // mantiene el foco dentro de la ventana abierta
  const f = $$('button, input, select, textarea, a[href]', m).filter(el => !el.disabled && el.offsetParent !== null && el.type !== 'hidden');
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && (document.activeElement === first || !m.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !m.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
});
$$('.modal').forEach(m => m.addEventListener('mousedown', e => { if (e.target === m) closeModal(m.id); }));
$$('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));

function confirmBox({title, text, ok = 'Aceptar', danger = false}) {
  return new Promise(res => {
    $('#cTitle').textContent = title; $('#cText').textContent = text;
    const okb = $('#cOk'); okb.textContent = ok; okb.className = 'btn' + (danger ? ' danger' : '');
    confirmResolve = res;
    okb.onclick = () => { const r = confirmResolve; confirmResolve = null; $('#confirmModal').hidden = true; r && r(true); };
    $('#cNo').onclick = () => closeModal('confirmModal');
    openModal('confirmModal');
  });
}

/* ============ Estado y almacenamiento ============ */
let user = null;
const emptyGoal = () => ({nombre: '', objetivo: 0, ahorrado: 0});
const state = {movs: [], budget: 0, hist: {}, catLim: {}, goal: emptyGoal(), loaded: false};
const objOr = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};

const LS = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v)   { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k)      { try { localStorage.removeItem(k); } catch {} }
};
const normMov = r => ({id: String(r.id), tipo: r.tipo, monto: Number(r.monto), descripcion: r.descripcion || '', categoria: r.categoria, fecha: String(r.fecha).slice(0, 10), ...(r.demo ? {demo: true} : {})});
const cleanMov = ({tipo, monto, descripcion, categoria, fecha}) => ({tipo, monto, descripcion, categoria, fecha});

/* Error con un mensaje pensado para la persona usuaria */
const userErr = (text, cause) => Object.assign(new Error(text), {userMsg: text, cause});
/* Si la base de datos aún no tiene las columnas nuevas (falta ejecutar schema.sql) */
const missingColumn = err => err && (err.code === 'PGRST204' || err.code === '42703' || /column/i.test(err.message || ''));
const sortMovs = a => a.sort((x, y) => y.fecha.localeCompare(x.fecha));

const store = {
  async load() {
    if (user && sb) {
      const [m, b, g] = await Promise.all([
        sb.from('movimientos').select('*').order('fecha', {ascending: false}).order('created_at', {ascending: false}),
        sb.from('presupuestos').select('*').maybeSingle(),
        sb.from('metas').select('nombre,objetivo,ahorrado').maybeSingle()
      ]);
      if (m.error) throw m.error;
      state.movs = m.data.map(normMov);
      state.budget = Number(b.data?.semanal || 0);
      state.hist = objOr(b.data?.historial);
      state.catLim = objOr(b.data?.categorias);
      state.goal = g.data ? {nombre: g.data.nombre || '', objetivo: Number(g.data.objetivo), ahorrado: Number(g.data.ahorrado)} : emptyGoal();
    } else {
      state.movs = sortMovs((LS.get('by_movs', []) || []).map(normMov));
      state.budget = Number(LS.get('by_budget', 0)) || 0;
      state.hist = objOr(LS.get('by_budget_hist', {}));
      state.catLim = objOr(LS.get('by_cat_limits', {}));
      state.goal = Object.assign(emptyGoal(), LS.get('by_goal', {}));
    }
    state.loaded = true;
  },
  async add(list) {
    if (user && sb) {
      const rows = list.map(m => ({user_id: user.id, ...cleanMov(m)}));
      const {error} = await sb.from('movimientos').insert(rows); if (error) throw error;
    } else {
      const cur = LS.get('by_movs', []) || [];
      list.forEach(m => cur.push({id: uid(), ...cleanMov(m), ...(m.demo ? {demo: true} : {})}));
      LS.set('by_movs', sortMovs(cur));
    }
  },
  async update(id, m) {
    if (user && sb) { const {error} = await sb.from('movimientos').update(cleanMov(m)).eq('id', id); if (error) throw error; }
    else LS.set('by_movs', sortMovs((LS.get('by_movs', []) || []).map(x => String(x.id) === String(id) ? {id: x.id, ...cleanMov(m)} : x)));
  },
  async remove(id) {
    if (user && sb) { const {error} = await sb.from('movimientos').delete().eq('id', id); if (error) throw error; }
    else LS.set('by_movs', (LS.get('by_movs', []) || []).filter(m => String(m.id) !== String(id)));
  },
  async clear() {
    if (user && sb) { const {error} = await sb.from('movimientos').delete().eq('user_id', user.id); if (error) throw error; }
    else LS.set('by_movs', []);
  },
  /* Guarda el presupuesto de esta semana y lo anota en el historial,
     así las semanas pasadas conservan el presupuesto que tenían. */
  async saveBudget(n) {
    const hist = {...state.hist, [weekRange(0)[0]]: n};
    if (user && sb) {
      const base = {user_id: user.id, semanal: n, updated_at: new Date().toISOString()};
      let {error} = await sb.from('presupuestos').upsert({...base, historial: hist});
      if (missingColumn(error)) ({error} = await sb.from('presupuestos').upsert(base));   // base de datos sin actualizar: guarda solo el monto
      if (error) throw error;
    } else { LS.set('by_budget', n); LS.set('by_budget_hist', hist); }
  },
  async saveCatLimits(lim) {
    if (user && sb) {
      const {error} = await sb.from('presupuestos').upsert({user_id: user.id, semanal: state.budget, categorias: lim, updated_at: new Date().toISOString()});
      if (missingColumn(error)) throw userErr('Para guardar límites por categoría hay que actualizar la base de datos (ejecutar schema.sql en Supabase).', error);
      if (error) throw error;
    } else LS.set('by_cat_limits', lim);
  },
  async saveGoal(g) {
    if (user && sb) { const {error} = await sb.from('metas').upsert({user_id: user.id, nombre: g.nombre, objetivo: g.objetivo, ahorrado: g.ahorrado, updated_at: new Date().toISOString()}); if (error) throw error; }
    else LS.set('by_goal', g);
  }
};

async function run(fn, okMsg) {
  try { await fn(); await store.load(); renderAll(); if (okMsg) toast(okMsg); return true; }
  catch (err) { console.error(err); toast(err.userMsg || 'No se pudo completar la acción. Revisa tu conexión e inténtalo otra vez.'); return false; }
}

/* ============ Cálculos ============ */
let weekOff = 0;    // semana que se ve en Presupuesto y Reporte
let monthOff = 0;   // mes que se ve en Reporte (vista mensual)
let per = 'week';   // periodo del reporte: 'week' o 'month'
let activeTab = 'tabMov';
let editingId = null;   // movimiento que se está editando
function calc(offset = 0, range = weekRange(offset)) {
  const [ws, we] = range;
  const inW = m => m.fecha >= ws && m.fecha <= we;
  let tIn = 0, tOut = 0, tSave = 0, wIn = 0, wOut = 0, wSave = 0;
  const byCat = {};
  for (const m of state.movs) {
    const isSave = m.tipo === 'gasto' && m.categoria === 'Ahorro';
    if (m.tipo === 'ingreso') { tIn += m.monto; if (inW(m)) wIn += m.monto; }
    else if (isSave)          { tSave += m.monto; if (inW(m)) wSave += m.monto; }
    else {
      tOut += m.monto;
      if (inW(m)) { wOut += m.monto; byCat[m.categoria] = (byCat[m.categoria] || 0) + m.monto; }
    }
  }
  return {avail: tIn - tOut - tSave, wIn, wOut, wSave, byCat};
}
/* Presupuesto que tenía una semana: el último guardado antes (o durante) esa semana. */
function budgetFor(offset) {
  if (offset >= 0) return state.budget;
  const ws = weekRange(offset)[0], keys = Object.keys(state.hist).sort();
  if (!keys.length) return state.budget;                 // sin historial: usa el actual
  let v = Number(state.hist[keys[0]]) || 0;              // antes del primer registro: el más antiguo
  for (const k of keys) if (k <= ws) v = Number(state.hist[k]) || 0;
  return v;
}

/* ============ Render ============ */
function barClass(p) { return p > 100 ? 'bad' : p >= 80 ? 'warn' : ''; }
function setBar(fillEl, pct) {
  fillEl.style.width = Math.min(100, Math.max(0, pct)) + '%';
  fillEl.className = barClass(pct);
}

function renderBalance() {
  const c = calc();
  if (!state.loaded) { $('#wAvail').textContent = 'Cargando tu balance…'; return; }
  const a = $('#wAvail'); a.textContent = money(c.avail); a.classList.toggle('neg', c.avail < 0);
  $('#wIn').textContent = money(c.wIn); $('#wOut').textContent = money(c.wOut); $('#wSave').textContent = money(c.wSave);
  const pct = state.budget > 0 ? (c.wOut / state.budget) * 100 : 0;
  $('#wBudgetTxt').textContent = state.budget > 0 ? `${Math.round(pct)}% de ${money(state.budget)}` : 'Sin presupuesto';
  setBar($('#wBarFill'), pct); $('#wBar').setAttribute('aria-valuenow', Math.round(Math.min(100, pct)));
}

function renderList() {
  const q = $('#qSearch').value.trim().toLowerCase(), t = $('#qType').value;
  const list = state.movs.filter(m => (t === 'todos' || m.tipo === t) && (!q || (m.descripcion + ' ' + m.categoria).toLowerCase().includes(q)));
  const ul = $('#movList');
  if (!list.length) {
    ul.innerHTML = `<li class="empty">${state.movs.length ? 'No hay resultados con ese filtro.' : 'Aún no tienes movimientos. Añade el primero o prueba con datos de ejemplo.'}</li>`;
    return;
  }
  ul.innerHTML = list.map(m => `
    <li class="mov${m.id === editingId ? ' editing' : ''}">
      <span class="mov-ico" aria-hidden="true">${ICONS[m.categoria] || '✨'}</span>
      <div class="mov-main"><strong>${esc(m.descripcion || m.categoria)}</strong><small>${esc(m.categoria)} · ${esc(fmtDate(m.fecha))}</small></div>
      <span class="mov-amt ${m.tipo === 'ingreso' ? 'ingreso' : 'gasto'}">${m.tipo === 'ingreso' ? '+' : '−'}${money(m.monto)}</span>
      <span class="mov-acts"><button class="icon-btn edit" type="button" data-edit="${esc(m.id)}" aria-label="Editar movimiento" title="Editar">✎</button><button class="icon-btn" type="button" data-del="${esc(m.id)}" aria-label="Eliminar movimiento" title="Eliminar">✕</button></span>
    </li>`).join('');
}

function weekLabel(offset) {
  if (offset === 0) return 'Esta semana';
  if (offset === -1) return 'Semana pasada';
  const [ws, we] = weekRange(offset);
  return `Semana del ${fmtDate(ws)} al ${fmtDate(we)}`;
}
function monthLabel(offset) {
  if (offset === 0) return 'Este mes';
  if (offset === -1) return 'Mes pasado';
  const t = new Date(monthRange(offset)[0] + 'T00:00:00').toLocaleDateString('es-PE', {month: 'long', year: 'numeric'});
  return t.charAt(0).toUpperCase() + t.slice(1);
}
const monthMode = () => activeTab === 'tabRep' && per === 'month';
function renderWeekNav() {
  const mm = monthMode(), off = mm ? monthOff : weekOff;
  $('#wkLabel').textContent = mm ? monthLabel(off) : weekLabel(off);
  $('#wkNext').disabled = off >= 0;
  $('#wkPrev').setAttribute('aria-label', mm ? 'Mes anterior' : 'Semana anterior');
  $('#wkNext').setAttribute('aria-label', mm ? 'Mes siguiente' : 'Semana siguiente');
  $('#pWeek').setAttribute('aria-pressed', per === 'week'); $('#pMonth').setAttribute('aria-pressed', per === 'month');
}

function renderBudget() {
  const c = calc(weekOff), cur = weekOff === 0, bud = budgetFor(weekOff);
  const inp = $('#bInput'); if (document.activeElement !== inp) inp.value = state.budget > 0 ? state.budget : '';
  renderCatLimits(c);
  const pct = bud > 0 ? (c.wOut / bud) * 100 : 0;
  $('#bPct').textContent = Math.round(pct) + '%'; setBar($('#bFill'), pct);
  if (bud <= 0) { $('#bUsedTxt').textContent = cur ? 'Sin presupuesto definido' : 'Esa semana no tenías presupuesto'; $('#bHint').textContent = cur ? 'Define un monto para ver cuánto te queda esta semana.' : ''; return; }
  $('#bUsedTxt').textContent = `${money(c.wOut)} gastados de ${money(bud)}`;
  const left = bud - c.wOut;
  $('#bHint').textContent = cur
    ? (left >= 0 ? `Te quedan ${money(left)} para esta semana.` : `Te pasaste por ${money(-left)} esta semana.`)
    : (left >= 0 ? `Esa semana te sobraron ${money(left)}.` : `Esa semana te pasaste por ${money(-left)}.`);
}

/* Límites por categoría */
const LIM_CATS = CATS.filter(c => c !== 'Ahorro');
$('#catLimits').innerHTML = LIM_CATS.map((c, i) => `
  <div class="cl-row">
    <label for="cl${i}" style="margin:0">${ICONS[c]} ${esc(c)}</label>
    <div><div class="bar"><i id="clFill${i}"></i></div><small id="clTxt${i}">Sin límite</small></div>
    <input id="cl${i}" type="number" inputmode="decimal" step="0.01" min="0" max="1000000" placeholder="S/ —" aria-label="Límite semanal para ${esc(c)} (S/)">
  </div>`).join('');
function renderCatLimits(c) {
  LIM_CATS.forEach((cat, i) => {
    const lim = Number(state.catLim[cat]) || 0, spent = c.byCat[cat] || 0, inp = $('#cl' + i), txt = $('#clTxt' + i);
    if (document.activeElement !== inp) inp.value = lim > 0 ? lim : '';
    const pct = lim > 0 ? (spent / lim) * 100 : 0;
    setBar($('#clFill' + i), pct);
    txt.className = lim > 0 && spent > lim ? 'over' : '';
    txt.textContent = lim > 0
      ? (spent > lim ? `${money(spent)} de ${money(lim)} · te pasaste por ${money(spent - lim)}` : `${money(spent)} de ${money(lim)}`)
      : (spent > 0 ? `${money(spent)} · sin límite` : 'Sin límite');
  });
}
$('#clSave').onclick = () => {
  const lim = {};
  for (let i = 0; i < LIM_CATS.length; i++) {
    const raw = $('#cl' + i).value.trim(); if (!raw) continue;
    const n = num(raw);
    if (!(n >= 0) || n > 1e6) return toast(`Revisa el límite de ${LIM_CATS[i]}.`);
    if (n > 0) lim[LIM_CATS[i]] = Math.round(n * 100) / 100;
  }
  run(() => store.saveCatLimits(lim), 'Límites guardados');
};

function renderReport() {
  const mm = per === 'month', off = mm ? monthOff : weekOff;
  const c = mm ? calc(0, monthRange(off)) : calc(off);
  const prev = mm ? calc(0, monthRange(off - 1)) : calc(off - 1);
  const lbl = mm ? monthLabel(off) : weekLabel(off);
  $('#repTitle').textContent = `Gastos por categoría (${off === 0 || off === -1 ? lbl.toLowerCase() : lbl})`;
  const unit = mm ? 'el mes anterior' : 'la semana anterior';
  $('#repCompare').textContent = !(c.wOut > 0) || !(prev.wOut > 0) ? ''
    : Math.abs(c.wOut - prev.wOut) < 0.005 ? `Gastaste lo mismo que ${unit}.`
    : c.wOut > prev.wOut ? `Gastaste ${Math.round((c.wOut / prev.wOut - 1) * 100)}% más que ${unit} (${money(prev.wOut)}).`
    : `Gastaste ${Math.round((1 - c.wOut / prev.wOut) * 100)}% menos que ${unit} (${money(prev.wOut)}). ¡Bien!`;
  $('#rIn').textContent = money(c.wIn); $('#rOut').textContent = money(c.wOut); $('#rNet').textContent = money(c.wIn - c.wOut - c.wSave);
  const entries = Object.entries(c.byCat).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 0;
  $('#repCats').innerHTML = entries.length
    ? entries.map(([k, v]) => `<div class="rep-row"><span>${esc(ICONS[k] || '')} ${esc(k)}</span><div class="bar"><i style="width:${max ? (v / max) * 100 : 0}%"></i></div><b>${esc(money(v))}</b></div>`).join('')
    : `<div class="empty">${off === 0 ? (mm ? 'Todavía no hay gastos este mes.' : 'Todavía no hay gastos esta semana.') : (mm ? 'No hubo gastos ese mes.' : 'No hubo gastos esa semana.')}</div>`;
}

/* Lo ahorrado = ahorro inicial + todos los movimientos de la categoría "Ahorro".
   Así la meta siempre coincide con tus movimientos (al editar, borrar o borrar todo). */
const savedIn = list => list.reduce((t, m) => t + (m.tipo === 'gasto' && m.categoria === 'Ahorro' ? m.monto : 0), 0);
const goalSaved = () => Math.round(((Number(state.goal.ahorrado) || 0) + savedIn(state.movs)) * 100) / 100;
function renderGoal() {
  const g = state.goal, has = g.objetivo > 0, saved = goalSaved();
  const pct = has ? Math.min(100, (saved / g.objetivo) * 100) : 0;
  $('#gTitle').textContent = g.nombre || (has ? 'Mi meta' : 'Aún no tienes una meta');
  $('#gPct').textContent = Math.round(pct) + '%';
  $('#gFill').style.width = pct + '%';
  $('#gSavedTxt').textContent = `${money(saved)} ahorrados`;
  $('#gLeftTxt').textContent = !has ? '—' : saved >= g.objetivo ? '¡Meta cumplida! 🎉' : `Te faltan ${money(g.objetivo - saved)}`;
  if (document.activeElement !== $('#gName')) $('#gName').value = g.nombre || '';
  if (document.activeElement !== $('#gTarget')) $('#gTarget').value = g.objetivo || '';
  if (document.activeElement !== $('#gSaved')) $('#gSaved').value = g.ahorrado || '';
}

function renderAuth() {
  const a = $('#authArea');
  if (!CLOUD) {
    a.innerHTML = `<button class="btn ghost sm" data-auth="login" type="button">Iniciar sesión</button><a class="btn sm" href="#organizador">Empezar gratis</a>`;
  } else if (user) {
    a.innerHTML = `<span class="user-chip" title="${esc(user.email)}">${esc(user.email)}</span><button class="btn ghost sm" id="btnLogout" type="button">Salir</button>`;
  } else {
    a.innerHTML = `<button class="btn ghost sm" data-auth="login" type="button">Iniciar sesión</button><button class="btn sm" data-auth="signup" type="button">Empezar gratis</button>`;
  }
  $('#demoBar').hidden = CLOUD;
  $('#accountZone').hidden = !(CLOUD && user);
  $('#btnDemo').hidden = !!(CLOUD && user);   // con cuenta no se mezclan datos falsos con los reales
  $('#orgLead').textContent = !CLOUD ? 'Tus movimientos se guardan solo en este navegador (modo demo).'
    : user ? 'Tus movimientos están guardados en tu cuenta y los ves desde cualquier dispositivo.'
    : 'Puedes probar ahora; crea una cuenta gratis para guardar tus datos y verlos desde cualquier dispositivo.';
}

function renderAll() { renderAuth(); renderBalance(); renderList(); renderWeekNav(); renderBudget(); renderReport(); renderGoal(); }


/* ============ Formulario de movimientos ============ */
let tipo = 'gasto';
function setTipo(t) { tipo = t; $('#tGasto').setAttribute('aria-pressed', t === 'gasto'); $('#tIngreso').setAttribute('aria-pressed', t === 'ingreso'); }
$('#tGasto').onclick = () => setTipo('gasto');
$('#tIngreso').onclick = () => setTipo('ingreso');
$('#fCat').innerHTML = CATS.map(c => `<option>${esc(c)}</option>`).join('');
$('#fFecha').value = todayStr();

$('#movForm').addEventListener('submit', async e => {
  e.preventDefault();
  const monto = num($('#fMonto').value), fecha = $('#fFecha').value, cat = $('#fCat').value, desc = $('#fDesc').value.trim().slice(0, 80);
  const msg = $('#movMsg');
  if (!(monto > 0) || monto > 1e6) return setMsg(msg, 'err', 'Escribe un monto válido mayor que 0.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return setMsg(msg, 'err', 'Elige una fecha.');
  if (!CATS.includes(cat)) return setMsg(msg, 'err', 'Elige una categoría.');
  setMsg(msg, '', '');
  const mov = {tipo, monto: Math.round(monto * 100) / 100, descripcion: desc, categoria: cat, fecha};
  const toGoal = savedIn([mov]) > 0 && state.goal.objetivo > 0;
  if (editingId) {
    const id = editingId;
    const ok = await run(() => store.update(id, mov), 'Movimiento actualizado');
    if (ok) exitEdit();
    return;
  }
  const ok = await run(() => store.add([mov]), toGoal ? 'Movimiento añadido y sumado a tu meta' : 'Movimiento añadido');
  if (ok) { $('#fMonto').value = ''; $('#fDesc').value = ''; $('#fCat').value = CATS[0]; $('#fMonto').focus(); }
/* Editar un movimiento: se carga en el formulario de la izquierda */
function startEdit(m) {
  editingId = m.id;
  setTipo(m.tipo);
  $('#fMonto').value = m.monto; $('#fFecha').value = m.fecha; $('#fDesc').value = m.descripcion; $('#fCat').value = m.categoria;
  $('#movFormTitle').textContent = 'Editar movimiento'; $('#movSubmit').textContent = 'Guardar cambios'; $('#movCancel').hidden = false;
  setMsg($('#movMsg'), '', '');
  renderList();
  $('#movForm').scrollIntoView({behavior: 'smooth', block: 'start'});
  setTimeout(() => $('#fMonto').focus({preventScroll: true}), 250);
}
function exitEdit() {
  editingId = null;
  $('#movFormTitle').textContent = 'Nuevo movimiento'; $('#movSubmit').textContent = '+ Añadir movimiento'; $('#movCancel').hidden = true;
  $('#fMonto').value = ''; $('#fDesc').value = ''; $('#fFecha').value = todayStr(); setTipo('gasto');
$('#fMonto').value = ''; $('#fDesc').value = ''; $('#fFecha').value = todayStr(); setTipo('gasto'); $('#fCat').value = CATS[0];
  $('#fMonto').value = ''; $('#fDesc').value = ''; $('#fFecha').value = todayStr(); setTipo('gasto'); $('#fCat').value = CATS[0];}
$('#movCancel').onclick = exitEdit;

$('#movList').addEventListener('click', e => {
  const ed = e.target.closest('[data-edit]');
  if (ed) { const m = state.movs.find(x => String(x.id) === ed.dataset.edit); if (m) startEdit(m); return; }
  const b = e.target.closest('[data-del]'); if (!b) return;
  const m = state.movs.find(x => String(x.id) === b.dataset.del); if (!m) return;
  const {tipo, monto, descripcion, categoria, fecha} = m;
  if (editingId === m.id) exitEdit();
  run(() => store.remove(m.id)).then(ok => {
    if (ok) toast('Movimiento eliminado', {label: 'Deshacer', fn: () => run(() => store.add([{tipo, monto, descripcion, categoria, fecha, ...(m.demo ? {demo: true} : {})}]), 'Movimiento recuperado')});
  });
});
$('#qSearch').addEventListener('input', renderList);
$('#qType').addEventListener('change', renderList);

$('#btnDemo').onclick = async () => {
  if (CLOUD && user) return;   // nunca se guardan datos de ejemplo en una cuenta real
  const [ws, , idx] = weekRange();
  const start = new Date(ws + 'T00:00:00');
  const at = off => { const d = new Date(start); d.setDate(start.getDate() + Math.min(off, idx)); return ymd(d); };
  const S = [
    ['ingreso', 120, 'Pago part-time', 'Trabajo', 0], ['ingreso', 50, 'Propina familiar', 'Otros', 1],
    ['gasto', 12, 'Almuerzo menú', 'Comida', 0], ['gasto', 8, 'Pasajes', 'Transporte', 0],
    ['gasto', 6.5, 'Fotocopias', 'Estudios', 1], ['gasto', 25, 'Cine con amigos', 'Entretenimiento', 2],
    ['gasto', 5, 'Snack', 'Comida', 2], ['gasto', 20, 'Alcancía', 'Ahorro', 3]
  ].map(([t, m, d, c, o]) => ({tipo: t, monto: m, descripcion: d, categoria: c, fecha: at(o), demo: true}));
  run(() => store.add(S), 'Datos de ejemplo añadidos (no se pasan a tu cuenta si te registras)');
};

$('#btnClear').onclick = async () => {
  if (!state.movs.length) return toast('No hay movimientos para borrar.');
  const ok = await confirmBox({title: '¿Borrar todos los movimientos?', text: 'Se borrarán tus movimientos. Tu presupuesto y tu meta se mantienen, pero lo ahorrado en la meta bajará porque también se borran tus movimientos de ahorro. Esta acción no se puede deshacer.', ok: 'Sí, borrar', danger: true});
  if (ok) { if (editingId) exitEdit(); run(() => store.clear(), 'Movimientos borrados'); }
};

function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;        // evita fórmulas maliciosas al abrir en Excel
  return '"' + s.replace(/"/g, '""') + '"';
}
$('#btnCsv').onclick = () => {
  if (!state.movs.length) return toast('No hay movimientos para descargar.');
  const rows = [['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto (S/)']]
    .concat(state.movs.map(m => [m.fecha, m.tipo, m.categoria, m.descripcion, m.monto.toFixed(2)]));
  const blob = new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], {type: 'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `balance-young-${todayStr()}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/* ============ Pestañas ============ */
const TABS = {tabMov: 'paneMov', tabBud: 'paneBud', tabRep: 'paneRep'};
const TAB_IDS = Object.keys(TABS);
function selectTab(id, focus) {
  Object.entries(TABS).forEach(([t, p]) => {
    const on = t === id, tb = $('#' + t);
    tb.setAttribute('aria-selected', on); tb.tabIndex = on ? 0 : -1; $('#' + p).hidden = !on;
  });
  activeTab = id;
  $('#weekNav').hidden = id === 'tabMov';
  renderWeekNav();
  if (focus) $('#' + id).focus();
}
TAB_IDS.forEach(id => {
  const tb = $('#' + id);
  tb.addEventListener('click', () => selectTab(id));
  tb.addEventListener('keydown', e => {
    const i = TAB_IDS.indexOf(id);
    const next = e.key === 'ArrowRight' ? (i + 1) % TAB_IDS.length : e.key === 'ArrowLeft' ? (i - 1 + TAB_IDS.length) % TAB_IDS.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? TAB_IDS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault(); selectTab(TAB_IDS[next], true);
  });
});
function shiftPeriod(d) {
  if (monthMode()) monthOff = Math.min(0, monthOff + d); else weekOff = Math.min(0, weekOff + d);
  renderWeekNav(); renderBudget(); renderReport();
}
$('#wkPrev').onclick = () => shiftPeriod(-1);
$('#wkNext').onclick = () => shiftPeriod(1);
$('#pWeek').onclick = () => { per = 'week'; renderWeekNav(); renderReport(); };
$('#pMonth').onclick = () => { per = 'month'; renderWeekNav(); renderReport(); };

/* ============ Presupuesto y meta ============ */
$('#bSave').onclick = () => {
  const n = num($('#bInput').value);
  if (!(n >= 0) || n > 1e6) return toast('Escribe un presupuesto válido.');
  run(() => store.saveBudget(Math.round(n * 100) / 100), 'Presupuesto guardado');
};
$('#goalForm').addEventListener('submit', e => {
  e.preventDefault();
  const nombre = $('#gName').value.trim().slice(0, 60), objetivo = num($('#gTarget').value), ahorrado = num($('#gSaved').value || 0);
  const msg = $('#goalMsg');
  if (!nombre) return setMsg(msg, 'err', 'Ponle un nombre a tu meta.');
  if (!(objetivo > 0) || objetivo > 1e8) return setMsg(msg, 'err', 'Escribe una meta mayor que 0.');
  if (!(ahorrado >= 0) || ahorrado > 1e8) return setMsg(msg, 'err', 'El ahorro inicial no es válido.');
  setMsg(msg, '', '');
  run(() => store.saveGoal({nombre, objetivo: Math.round(objetivo * 100) / 100, ahorrado: Math.round(ahorrado * 100) / 100}), 'Meta guardada');
});
$('#gAddBtn').onclick = () => {
  const add = num($('#gAdd').value);
  if (!(add > 0) || add > 1e8) return toast('Escribe un monto válido.');
  if (!(state.goal.objetivo > 0)) return toast('Primero guarda tu meta.');
  // Se registra como movimiento de ahorro, así tu saldo y tu meta siempre coinciden.
  const mov = {tipo: 'gasto', monto: Math.round(add * 100) / 100, descripcion: ('Ahorro: ' + (state.goal.nombre || 'mi meta')).slice(0, 80), categoria: 'Ahorro', fecha: todayStr()};
  run(() => store.add([mov]), 'Ahorro añadido a tu meta').then(ok => { if (ok) $('#gAdd').value = ''; });
};

/* ============ Cuentas ============ */
let mode = 'login';
const MODES = {
  login:  {title: 'Inicia sesión', sub: 'Entra para ver tus movimientos en cualquier dispositivo.', btn: 'Entrar', pass: true, auto: 'current-password'},
  signup: {title: 'Crea tu cuenta gratis', sub: 'Guarda tu balance, presupuesto y metas en la nube.', btn: 'Crear cuenta', pass: true, auto: 'new-password'},
  reset:  {title: 'Recupera tu contraseña', sub: 'Te enviaremos un enlace a tu correo.', btn: 'Enviar enlace', pass: false},
  newpass:{title: 'Nueva contraseña', sub: 'Elige una contraseña nueva para tu cuenta.', btn: 'Guardar contraseña', pass: true, auto: 'new-password', noEmail: true}
};
function setMode(m) {
  mode = m; const c = MODES[m];
  $('#authTitle').textContent = c.title; $('#authSub').textContent = c.sub; $('#authSubmit').textContent = c.btn;
  $('#passWrap').hidden = !c.pass; $('#emailWrap').hidden = !!c.noEmail;
  $('#oauthWrap').hidden = !(m === 'login' || m === 'signup');
  $('#authLegal').hidden = !(m === 'signup' || m === 'login');
  if (c.auto) $('#aPass').setAttribute('autocomplete', c.auto);
  $('#aPassLbl').textContent = m === 'newpass' ? 'Nueva contraseña' : 'Contraseña';
  setMsg($('#authMsg'), '', '');
  const alt = $('#authAlt');
  alt.innerHTML = m === 'login'
    ? `<span>¿No tienes cuenta? <button class="link-btn" data-mode="signup" type="button">Crear cuenta</button></span><button class="link-btn" data-mode="reset" type="button">Olvidé mi contraseña</button>`
    : m === 'signup' ? `<span>¿Ya tienes cuenta? <button class="link-btn" data-mode="login" type="button">Iniciar sesión</button></span>`
    : m === 'reset' ? `<button class="link-btn" data-mode="login" type="button">← Volver</button>` : '';
}
$('#authAlt').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });

function authError(err) {
  const m = String(err?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (m.includes('already registered')) return 'Ese correo ya tiene una cuenta. Prueba iniciar sesión.';
  if (m.includes('not confirmed')) return 'Confirma tu correo antes de entrar (revisa tu bandeja).';
  if (m.includes('password')) return 'La contraseña debe tener al menos 8 caracteres.';
  if (m.includes('rate') || m.includes('seconds')) return 'Demasiados intentos. Espera un momento y vuelve a probar.';
  if (m.includes('email')) return 'Revisa que el correo esté bien escrito.';
  return 'No se pudo completar. Inténtalo de nuevo.';
}

$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!CLOUD) return;
  const email = $('#aEmail').value.trim(), pass = $('#aPass').value, msg = $('#authMsg'), btn = $('#authSubmit');
  if (mode !== 'newpass' && !/^\S+@\S+\.\S+$/.test(email)) return setMsg(msg, 'err', 'Escribe un correo válido.');
  if (MODES[mode].pass && pass.length < 8) return setMsg(msg, 'err', 'La contraseña debe tener al menos 8 caracteres.');
  btn.disabled = true; setMsg(msg, '', '');
  try {
    if (mode === 'login') {
      const {error} = await sb.auth.signInWithPassword({email, password: pass}); if (error) throw error;
      $('#aPass').value = ''; closeModal('authModal');
    } else if (mode === 'signup') {
      const {data, error} = await sb.auth.signUp({email, password: pass}); if (error) throw error;
      $('#aPass').value = '';
      if (data.session) closeModal('authModal');
      else { setMode('login'); setMsg(msg, 'ok', 'Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.'); }
    } else if (mode === 'reset') {
      const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname}); if (error) throw error;
      setMsg(msg, 'ok', 'Si el correo existe, te enviamos un enlace para cambiar tu contraseña.');
    } else if (mode === 'newpass') {
      const {error} = await sb.auth.updateUser({password: pass}); if (error) throw error;
      $('#aPass').value = ''; closeModal('authModal'); toast('Contraseña actualizada');
    }
  } catch (err) { console.error(err); setMsg(msg, 'err', authError(err)); }
  finally { btn.disabled = false; }
});

$('#btnGoogle').addEventListener('click', async () => {
  if (!CLOUD) return;
  const msg = $('#authMsg'), btn = $('#btnGoogle');
  btn.disabled = true; setMsg(msg, '', '');
  try {
    const {error} = await sb.auth.signInWithOAuth({provider: 'google', options: {redirectTo: location.origin + location.pathname}});
    if (error) throw error;                      // si todo va bien, el navegador se redirige a Google
  } catch (err) {
    console.error(err); btn.disabled = false;
    setMsg(msg, 'err', 'No se pudo conectar con Google. Inténtalo de nuevo.');
  }
});

document.addEventListener('click', e => {
  const a = e.target.closest('[data-auth]');
  if (a) {
    if (!CLOUD) return toast('Las cuentas se activan al conectar Supabase (mira el archivo LEEME.md).');
    setMode(a.dataset.auth); openModal('authModal'); return;
  }
  if (e.target.closest('#btnLogout')) {
    sb.auth.signOut().then(() => toast('Sesión cerrada'));
  }
  const c = e.target.closest('[data-contact]');
  if (c) { $('#cInterest').value = c.dataset.contact; setMsg($('#cStatus'), '', ''); openModal('contactModal'); }
});

/* Eliminar cuenta (usa la función delete_my_account de schema.sql) */
$('#btnDeleteAccount').addEventListener('click', async () => {
  if (!user || !sb) return;
  const ok = await confirmBox({title: '¿Eliminar tu cuenta?', text: 'Se borrarán para siempre tu cuenta, tus movimientos, tu presupuesto y tu meta. Esta acción no se puede deshacer.', ok: 'Sí, eliminar mi cuenta', danger: true});
  if (!ok) return;
  try {
    const {error} = await sb.rpc('delete_my_account'); if (error) throw error;
    await sb.auth.signOut({scope: 'local'}).catch(() => {});
    toast('Tu cuenta y tus datos fueron eliminados.');
  } catch (err) {
    console.error(err);
    toast('No se pudo eliminar la cuenta. Escríbenos a holabalanceyoung@gmail.com y lo hacemos por ti.');
  }
});

/* Importar datos locales al crear cuenta */
async function offerImport() {
  if (!user || !sb) return;
  const local = (LS.get('by_movs', []) || []).map(normMov).filter(m => !m.demo);   // los datos de ejemplo no se importan
  if (!local.length || state.movs.length || LS.get('by_import_declined', false)) return;
  const ok = await confirmBox({title: 'Importar tus datos', text: `Encontramos ${local.length} movimientos guardados en este navegador. ¿Quieres pasarlos a tu cuenta?`, ok: 'Sí, importar'});
  if (!ok) { LS.set('by_import_declined', true); return; }
  const budget = Number(LS.get('by_budget', 0)) || 0, goal = Object.assign(emptyGoal(), LS.get('by_goal', {})), lim = objOr(LS.get('by_cat_limits', {}));
  await run(async () => {
    await store.add(local.map(cleanMov));
    if (budget > 0) await store.saveBudget(budget);
    if (goal.objetivo > 0) await store.saveGoal(goal);
    if (Object.keys(lim).length) await store.saveCatLimits(lim).catch(err => console.error(err));
    ['by_movs', 'by_budget', 'by_budget_hist', 'by_cat_limits', 'by_goal'].forEach(k => LS.del(k));
  }, 'Datos importados a tu cuenta');
}

/* ============ Contacto (Netlify Forms) ============ */
$('#contactForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, st = $('#cStatus'), btn = $('#cSend');
  if (!f.checkValidity()) return setMsg(st, 'err', 'Completa tu nombre, un correo válido y tu mensaje.');
  btn.disabled = true; setMsg(st, '', 'Enviando…');
  try {
    const r = await fetch('/', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams(new FormData(f)).toString()});
    if (!r.ok) throw new Error('http ' + r.status);
    f.reset(); setMsg(st, 'ok', '¡Listo! Recibimos tu consulta y te responderemos pronto.');
  } catch { setMsg(st, 'err', 'No pudimos enviar tu mensaje. Inténtalo de nuevo en un momento.'); }
  finally { btn.disabled = false; }
});

/* ============ Instalar como app ============ */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#btnInstall').hidden = false; });
window.addEventListener('appinstalled', () => { installEvt = null; $('#btnInstall').hidden = true; toast('¡Listo! Balance Young ya está en tu pantalla de inicio.'); });
$('#btnInstall').onclick = async () => {
  if (!installEvt) return;
  installEvt.prompt();
  try { await installEvt.userChoice; } catch {}
  installEvt = null; $('#btnInstall').hidden = true;
};
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(err => console.error(err)));
}

/* ============ Inicio ============ */
async function refresh() {
  try { await store.load(); } catch (err) { console.error(err); toast('No se pudieron cargar tus datos.'); state.loaded = true; }
  renderAll();
}

if (CLOUD) {
  let lastUser = undefined;
  sb.auth.onAuthStateChange((event, session) => {
    const prev = lastUser; user = session?.user || null; lastUser = user ? user.id : null;
    if (event === 'PASSWORD_RECOVERY') { setMode('newpass'); openModal('authModal'); }
    if (!['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT'].includes(event)) return;
    if (event === 'SIGNED_IN' && prev === lastUser) return;          // mismo usuario: nada que recargar
    setTimeout(async () => { state.loaded = false; renderBalance(); await refresh(); if (user) offerImport(); }, 0);
  });
  setMode('login');
} else {
  refresh();
}
renderAuth();
})();
