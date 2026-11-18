/* ---------- Streak + calendar ---------- */
const hasFood = k => !!(days[k] && days[k].entries && days[k].entries.length);
function streakCount(){
  const d = new Date(); if (!hasFood(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0; while (hasFood(dayKey(d))){ n++; d.setDate(d.getDate() - 1); } return n;
}
function renderStreak(){
  const n = streakCount(), b = $('#streakBtn');
  b.innerHTML = `<span class="fl">🔥</span>${n}`; b.className = 'streak' + (n ? '' : ' zero');
  b.setAttribute('aria-label', `${n} day streak. Open calendar.`);
}
function dayScore(day){
  const rated = ((day && day.entries) || []).filter(e => num(e.health) > 0);
  let hs = 0, hw = 0; rated.forEach(e => { const w = Math.max(num(e.kcal), 25); hs += num(e.health) * w; hw += w; });
  return hw ? Math.max(1, Math.min(100, Math.round(hs / hw))) : 0;
}
function scoreColor(s){
  const cs = getComputedStyle(document.documentElement), c = (v, d) => cs.getPropertyValue(v).trim() || d, t = s < 50 ? s / 50 : (s - 50) / 50;
  return s < 50 ? mixHex(c('--hr', '#ff9aae'), c('--hy', '#ffd60a'), t) : mixHex(c('--hy', '#ffd60a'), c('--hg', '#8ce6b2'), t);
}
let calMonth = new Date(), calSel = dayKey();
const longDate = (y, m, d) => new Date(y, m, d).toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
function renderCal(){
  const y = calMonth.getFullYear(), m = calMonth.getMonth(), tk = dayKey();
  $('#calTitle').textContent = new Date(y, m, 1).toLocaleDateString(undefined, { month:'long', year:'numeric' });
  const g = $('#calGrid'); g.innerHTML = '';
  for (let i = 0; i < new Date(y, m, 1).getDay(); i++) g.append(document.createElement('div'));
  for (let d = 1, n = new Date(y, m + 1, 0).getDate(); d <= n; d++){
    const k = dayKey(new Date(y, m, d)), b = document.createElement('button');
    b.type = 'button'; b.textContent = d;
    if (hasFood(k)) b.classList.add('logged');
    const sc = dayScore(days[k]); if (sc) b.style.setProperty('--sc', scoreColor(sc));
    if (k === tk) b.classList.add('today');
    if (k === calSel) b.classList.add('sel');
    if (k > tk){ b.classList.add('future'); b.disabled = true; }
    b.setAttribute('aria-label', longDate(y, m, d) + (hasFood(k) ? ', food logged' : ''));
    b.onclick = () => { calSel = k; renderCal(); };
    g.append(b);
  }
  renderDetail();
}
function renderDetail(){
  const box = $('#calDetail'); box.innerHTML = '';
  const [y, m, d] = calSel.split('-').map(Number), day = days[calSel] || {};
  const es = day.entries || [], ws = day.workouts || [], water = day.water || 0;
  const sc = dayScore(day), head = document.createElement('div'); head.className = 'dhead';
  const h = document.createElement('h3'); h.textContent = longDate(y, m - 1, d); head.append(h);
  if (sc){
    const q = document.createElement('span'); q.className = 'qb'; q.setAttribute('aria-label', `Food quality ${sc}`);
    const dot = document.createElement('i'); dot.style.background = scoreColor(sc);
    q.append(dot, document.createTextNode(sc)); head.append(q);
  }
  box.append(head);
  if (!es.length && !ws.length && !water){
    const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'Nothing logged this day.'; box.append(p); return;
  }
  const t = { kcal:0, p:0, c:0, f:0 }; es.forEach(e => { t.kcal += num(e.kcal); t.p += num(e.p); t.c += num(e.c); t.f += num(e.f); });
  const burn = ws.reduce((a, w) => a + num(w.kcal), 0);
  const sum = document.createElement('p'); sum.className = 'dsum';
  sum.textContent = [`${Math.round(t.kcal).toLocaleString()} cal eaten`, `P ${Math.round(t.p)}g · C ${Math.round(t.c)}g · F ${Math.round(t.f)}g`, water ? `${water} oz water` : '', burn ? `${Math.round(burn).toLocaleString()} cal burned` : ''].filter(Boolean).join(' · ');
  box.append(sum);
  ['Breakfast','Lunch','Dinner','Snack'].forEach(meal => {
    const items = es.filter(e => e.meal === meal); if (!items.length) return;
    const mh = document.createElement('p'); mh.className = 'mealh'; mh.textContent = meal; box.append(mh);
    const wrap = document.createElement('div');
    items.forEach(e => {
      const row = document.createElement('div'); row.className = 'entry';
      const info = document.createElement('div'), s = document.createElement('strong'), sm = document.createElement('small');
      s.textContent = e.name; sm.textContent = `P ${Math.round(e.p)}g · C ${Math.round(e.c)}g · F ${Math.round(e.f)}g`;
      info.append(s, sm);
      if (asks() || e.hall){ const lc = document.createElement('small'); lc.textContent = 'Location: ' + locText(e.hall); info.append(lc); }
      const kc = document.createElement('span'); kc.className = 'kc'; kc.textContent = Math.round(e.kcal);
      row.append(info, kc); wrap.append(row);
    });
    box.append(wrap);
  });
}
$('#streakBtn').onclick = () => { calMonth = new Date(); calSel = dayKey(); renderCal(); $('#cal').showModal(); };
$('#calPrev').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCal(); };
$('#calNext').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCal(); };
$('#calClose').onclick = () => $('#cal').close();

const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.replace('#', '').slice(i - 1, i + 1), 16));
const mixHex = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; };
function renderHealth(score, n){
  const cs = getComputedStyle(document.documentElement), c = (v, d) => cs.getPropertyValue(v).trim() || d, mark = $('#hMark');
  if (!n){ mark.style.display = 'none'; $('#hScore').textContent = '—'; return; }
  const s = Math.max(1, Math.min(100, score)), t = s < 50 ? s / 50 : (s - 50) / 50;
  mark.style.display = 'block'; mark.style.left = ((s - 1) / 99 * 100) + '%';
  mark.style.background = s < 50 ? mixHex(c('--hr', '#ff9aae'), c('--hy', '#ffd60a'), t) : mixHex(c('--hy', '#ffd60a'), c('--hg', '#8ce6b2'), t);
  $('#hScore').innerHTML = `${s}<small>${s < 35 ? 'Low' : s < 65 ? 'Okay' : s < 85 ? 'Good' : 'Great'}</small>`;
}
