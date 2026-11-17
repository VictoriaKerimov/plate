/* ---------- Storage ---------- */
const $ = s => document.querySelector(s);
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
let profile = store.get('plate.profile', null);
let days = store.get('plate.days', {});
let menus = {}, photo = null;

const DEF_MODEL = { gemini: 'gemini-3.1-flash-lite', anthropic: 'claude-haiku-5-5' };
function normProfile(p){
  if (p && !p.provider){ p.provider = p.apiKey ? 'anthropic' : 'gemini'; p.keyA = p.apiKey || ''; p.modelA = p.model || ''; p.keyG = ''; p.modelG = ''; }
  return p;
}
normProfile(profile);
const aiProv = () => (profile && profile.provider) || 'gemini';
const aiKey = () => !profile ? '' : ((aiProv() === 'gemini' ? profile.keyG : profile.keyA) || '');
const aiModel = () => !profile ? DEF_MODEL.gemini : ((aiProv() === 'gemini' ? profile.modelG : profile.modelA) || DEF_MODEL[aiProv()]);

const pad = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => (days[dayKey()] ||= { entries: [], water: 0, adds: [] });
const saveDays = () => store.set('plate.days', days);
const num = v => Number.isFinite(+v) ? +v : 0;

function applyTheme(id, light){
  const t = THEMES[id] || THEMES.lavender, v = light && t.light ? t.light : t.vars;
  for (const [k, val] of Object.entries(v)) document.documentElement.style.setProperty('--' + k, val);
  document.documentElement.style.colorScheme = light ? 'light' : 'dark';
  document.querySelector('meta[name=theme-color]').content = v.bg;
}

/* ---------- Render ---------- */
function render(){
  const d = today(); d.workouts ||= [];
  const sum = { kcal:0, p:0, c:0, f:0, fiber:0, sugar:0, sodium:0 };
  d.entries.forEach(e => { for (const k in sum) sum[k] += num(e[k]); });
  const burn = d.workouts.reduce((a, w) => a + num(w.kcal), 0), extra = profile.addBurn ? burn : 0;
  const goal = profile.calGoal + extra, left = goal - sum.kcal;

  $('#hi').textContent = profile.name ? `Hi, ${profile.name}` : 'Today';
  renderStreak();
  renderFavs();
  const rated = d.entries.filter(e => num(e.health) > 0);
  let hs = 0, hw = 0; rated.forEach(e => { const w = Math.max(num(e.kcal), 25); hs += num(e.health) * w; hw += w; });
  renderHealth(hw ? Math.round(hs / hw) : 0, rated.length);
  $('#date').textContent = new Date().toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
  $('#left').textContent = `${Math.round(sum.kcal)}/${Math.round(goal)}`;
  $('#left').classList.toggle('over', left < 0);
  $('#left').setAttribute('aria-label', `${Math.round(sum.kcal)} of ${Math.round(goal)} calories eaten`);

  const setRing = (id, r, frac) => { const el = $(id), C = 2 * Math.PI * r; el.style.strokeDasharray = C; el.style.strokeDashoffset = C * (1 - Math.max(0, Math.min(frac, 1))); };
  setRing('#ring', 72, sum.kcal / goal);
  $('#ring').classList.toggle('over', left < 0);
  const T = macroGoals(goal), tp = T.p, tc = T.c, tf = T.f;
  setRing('#ringP', 59, sum.p / tp); setRing('#ringC', 46, sum.c / tc); setRing('#ringF', 33, sum.f / tf);
  const tfi = T.fiber, tsu = T.sugar;
  $('#mlist').innerHTML = [['Protein','p',tp,'g','var(--rp)'],['Carbs','c',tc,'g','var(--rc)'],['Fat','f',tf,'g','var(--rf)'],['Fiber','fiber',tfi,'g','var(--neutral)'],['Sugar','sugar',tsu,'g','var(--neutral)']]
    .map(([n,k,t,u,c]) => `<div class="mi"><i style="background:${c}"></i><span>${n}</span><b>${Math.round(sum[k])}<small>/${t}${u}</small></b></div>`).join('');

  $('#waterText').textContent = `${d.water} of ${profile.waterGoal} oz`;
  $('#waterBar').style.width = Math.min(100, d.water / profile.waterGoal * 100) + '%';
  $('#undoWater').disabled = !d.adds.length;
  $('#burnText').textContent = burn ? `${Math.round(burn).toLocaleString()} cal burned${extra ? ', added to goal' : ''}` : '';
  const wl = $('#wList'); wl.innerHTML = '';
  d.workouts.forEach(w => {
    const row = document.createElement('div'); row.className = 'entry';
    const info = document.createElement('div');
    const s = document.createElement('strong'); s.textContent = w.name;
    const m = document.createElement('small'); m.textContent = w.src;
    info.append(s, m);
    const kc = document.createElement('span'); kc.className = 'kc'; kc.textContent = Math.round(w.kcal);
    const del = document.createElement('button'); del.textContent = '×'; del.setAttribute('aria-label', 'Delete ' + w.name);
    del.onclick = () => { d.workouts = d.workouts.filter(x => x.id !== w.id); saveDays(); render(); };
    row.append(info, kc, del); wl.append(row);
  });

  const box = $('#entries'); box.innerHTML = '';
  if (!d.entries.length){ const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'Nothing logged yet. Describe a meal or add a photo.'; box.append(p); }
  d.entries.forEach(e => {
    const row = document.createElement('div'); row.className = 'entry';
    const info = document.createElement('div');
    const s = document.createElement('strong'); s.textContent = e.name;
    const m = document.createElement('small'); m.textContent = `${e.meal}${e.ing && e.ing.length > 1 ? ' · ' + e.ing.length + ' ingredients' : ''} · P ${Math.round(e.p)}g · C ${Math.round(e.c)}g · F ${Math.round(e.f)}g`;
    info.append(s, m);
    if (asks() || e.hall){ const l = document.createElement('small'); l.textContent = 'Location: ' + locText(e.hall); info.append(l); }
    const kc = document.createElement('span'); kc.className = 'kc'; kc.textContent = Math.round(e.kcal);
    const del = document.createElement('button'); del.textContent = '×'; del.setAttribute('aria-label', 'Delete ' + e.name);
    del.onclick = ev => { ev.stopPropagation(); d.entries = d.entries.filter(x => x.id !== e.id); saveDays(); render(); };
    info.tabIndex = 0; info.setAttribute('role', 'button'); info.setAttribute('aria-label', 'Edit ' + e.name);
    info.onkeydown = ev => { if (ev.key === 'Enter') openEdit(e.id); };
    row.classList.add('tap'); row.onclick = () => openEdit(e.id);
    row.append(info, kc, del); box.append(row);
  });
}

/* ---------- Water ---------- */
document.querySelectorAll('[data-water]').forEach(b => b.onclick = () => {
  const d = today(), oz = +b.dataset.water; d.water += oz; d.adds.push(oz); saveDays(); render();
});
$('#undoWater').onclick = () => { const d = today(), oz = d.adds.pop(); if (oz){ d.water = Math.max(0, d.water - oz); saveDays(); render(); } };

/* ---------- Photo ---------- */
$('#photoBtn').onclick = () => $('#photoIn').click();
$('#photoIn').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { photo = await shrink(f); $('#previewImg').src = photo; $('#preview').style.display = 'block'; setStatus(''); }
  catch (err) { setStatus(err.message, true); }
};
$('#clearPhoto').onclick = () => { photo = null; $('#preview').style.display = 'none'; };
function shrink(file){
  return new Promise((ok, no) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, 1024 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url); ok(cv.toDataURL('image/jpeg', .82));
    };
    img.onerror = () => no(new Error('Could not read that photo. Try another one.'));
    img.src = url;
  });
}
