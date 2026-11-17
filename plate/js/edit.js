/* ---------- Edit a logged food + favorites ---------- */
const EF = [['kcal','#edKcal'],['p','#edP'],['c','#edC'],['f','#edF'],['fiber','#edFi'],['sugar','#edSu'],['sodium','#edSo']];
const KEYS = EF.map(x => x[0]);
const shown = (k, v) => (k === 'kcal' || k === 'sodium') ? Math.round(v) : Math.round(v * 10) / 10;
const ingTotals = list => { const t = {}; KEYS.forEach(k => { t[k] = list.reduce((a, i) => a + num(i[k]), 0); }); return t; };
const ISYS = `You estimate nutrition for a single ingredient inside a calorie tracking app. The user gives an ingredient with an amount. Reply with ONLY a JSON object, no prose and no code fences: {"name":"ingredient name","qty":0,"unit":"cup","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"sodium_mg":0}. qty is a number and unit is a short unit like cup, tbsp, oz, g, slice or piece. The numbers are for the full amount given. If no amount is given, assume one typical serving. This is a single ingredient, not a meal.`;
let ed = null, favs = store.get('plate.favs', []), favEdit = false;
const saveFavs = () => store.set('plate.favs', favs);

function mapIng(it){
  const L = (Array.isArray(it.ingredients) ? it.ingredients : []).slice(0, 12).map(g => ({
    name: String(g.name || 'Ingredient').slice(0, 60), qty: num(g.qty) || 1, unit: String(g.unit || '').slice(0, 20),
    kcal: num(g.calories), p: num(g.protein_g), c: num(g.carbs_g), f: num(g.fat_g), fiber: num(g.fiber_g), sugar: num(g.sugar_g), sodium: num(g.sodium_mg)
  }));
  if (L.length < 2) return {};
  const t = ingTotals(L); t.kcal = Math.round(t.kcal);
  return { ing: L, ...t };
}

/* favorites */
function favFrom(e){
  const f = { id: 'f' + Date.now(), name: e.name }; KEYS.forEach(k => { f[k] = num(e[k]); });
  f.health = num(e.health); f.hall = e.hall || ''; if (e.portion) f.portion = e.portion; if (e.base) f.base = e.base; if (e.ing) f.ing = e.ing.map(i => ({ ...i })); return f;
}
const locText = h => h === 'none' ? 'Not at a dining hall' : (h ? hallName(h) : '(no data)');
function renderFavs(){
  $('#favOpen').textContent = favs.length ? `★ Favorites (${favs.length})` : '★ Favorites';
  const box = $('#favItems'); box.innerHTML = '';
  if (!favs.length){ const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No favorites yet. Open a food and tap the ☆ to save it here.'; box.append(p); return; }
  favs.forEach(f => {
    const row = document.createElement('div'); row.className = 'entry tap';
    const info = document.createElement('div'), s = document.createElement('strong'), m = document.createElement('small');
    s.textContent = f.name; m.textContent = `P ${Math.round(num(f.p))}g · C ${Math.round(num(f.c))}g · F ${Math.round(num(f.f))}g`; info.append(s, m);
    if (asks() || f.hall){ const l = document.createElement('small'); l.textContent = 'Location: ' + locText(f.hall); info.append(l); }
    info.tabIndex = 0; info.setAttribute('role', 'button'); info.setAttribute('aria-label', 'Add ' + f.name);
    info.onkeydown = ev => { if (ev.key === 'Enter') quickAdd(f); };
    const kc = document.createElement('span'); kc.className = 'kc'; kc.textContent = Math.round(num(f.kcal));
    const del = document.createElement('button'); del.type = 'button'; del.textContent = '×'; del.setAttribute('aria-label', 'Remove ' + f.name);
    del.onclick = ev => { ev.stopPropagation(); favs = favs.filter(x => x.id !== f.id); saveFavs(); renderFavs(); };
    row.onclick = () => quickAdd(f); row.append(info, kc, del); box.append(row);
  });
}
function quickAdd(f){
  const meal = $('#favMeal').value, hall = f.hall ? f.hall : (asks() ? $('#where').value : '');
  const copy = JSON.parse(JSON.stringify(f)); delete copy.hall;
  Object.assign(copy, { id: Date.now(), meal, hall, favId: f.id });
  today().entries.push(copy); saveDays(); $('#favDlg').close(); setStatus(`Added ${f.name}.`); render();
}
$('#favOpen').onclick = () => { $('#favMeal').value = $('#meal').value; renderFavs(); $('#favDlg').showModal(); };
$('#favClose').onclick = () => $('#favDlg').close();

/* edit sheet */
function fillSimple(v){ EF.forEach(([k, sel]) => { $(sel).value = shown(k, v[k]); }); }
function setUnit(v, portion){ ed.unit = {}; KEYS.forEach(k => { ed.unit[k] = num(v[k]) / (portion || 1); }); }
function updTotals(){
  if (!ed) return;
  const t = ed.ing ? ingTotals(ed.ing) : Object.fromEntries(EF.map(([k, sel]) => [k, num($(sel).value)]));
  $('#bigK').textContent = Math.round(t.kcal).toLocaleString();
  $('#bigM').textContent = `P ${shown('p', t.p)}g · C ${shown('c', t.c)}g · F ${shown('f', t.f)}g`;
}
function setStar(){
  const b = $('#edFav'); b.textContent = ed.fav ? '★' : '☆'; b.setAttribute('aria-pressed', String(ed.fav));
  b.setAttribute('aria-label', ed.fav ? 'Remove from favorites' : 'Add to favorites');
}
function openEdit(id){
  const e = today().entries.find(x => x.id === id); if (!e) return;
  const isFav = !!(e.favId && favs.some(f => f.id === e.favId));
  const portion = e.portion > 0 ? e.portion : 1, base = e.base || null;
  const one = () => ({ name: e.name, qty: base ? +(portion * base.qty).toFixed(2) : portion, unit: base ? base.unit : 'serving', ...Object.fromEntries(KEYS.map(k => [k, num(e[k])])) });
  ed = { id, base, ing: e.simple ? null : (e.ing && e.ing.length ? e.ing.map(i => ({ ...i })) : [one()]), portion, fav: isFav, wasFav: isFav };
  $('#edName').value = e.name; whereOpts($('#edWhere'), '(no data)', schoolOf(profile)); if (e.hall && e.hall !== 'none' && ![...$('#edWhere').options].some(o => o.value === e.hall)) $('#edWhere').add(new Option(hallName(e.hall), e.hall)); $('#edWhere').value = e.hall || ''; $('#edWhereField').hidden = !(asks() || e.hall); fillSimple(e); portionUI(); setUnit(e, ed.portion);
  $('#edStatus').textContent = ''; setStar(); drawEdit(); $('#edit').showModal();
}
function drawEdit(){
  $('#edSimple').hidden = !!ed.ing; $('#edIngBox').hidden = !ed.ing;
  if (ed.ing) drawIng();
  updTotals();
}
function mkIn(type, val, cls, label, on, step){
  const i = document.createElement('input'); i.type = type; i.className = cls; i.value = val ?? ''; i.placeholder = label; i.setAttribute('aria-label', label);
  if (type === 'number'){ i.inputMode = 'decimal'; i.min = '0'; if (step) i.step = step; }
  i.addEventListener('input', () => on(i.value)); return i;
}
function wrapL(text, input){ const l = document.createElement('label'), s = document.createElement('span'); s.textContent = text; l.append(s, input); return l; }
function drawIng(){
  const box = $('#edIngList'); box.innerHTML = '';
  ed.ing.forEach((it, idx) => {
    const nums = {}, row = document.createElement('div'); row.className = 'ing';
    const nm = document.createElement('span'); nm.className = 'ing-nm'; nm.textContent = it.name || 'Ingredient';
    const sum = document.createElement('span'); sum.className = 'ing-sum';
    const setSum = () => { sum.textContent = `${Math.round(num(it.kcal))} cal · P ${shown('p', it.p)} · C ${shown('c', it.c)} · F ${shown('f', it.f)}`; };
    setSum();
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'ing-t'; toggle.setAttribute('aria-expanded', 'false'); toggle.append(nm, sum);
    let lastQ = num(it.qty) > 0 ? num(it.qty) : 0;
    const qty = mkIn('number', it.qty, 'ing-qty', 'Amount', v => {
      const nq = num(v);
      if (nq > 0 && lastQ > 0 && nq !== lastQ){
        const f = nq / lastQ; KEYS.forEach(k => { it[k] = num(it[k]) * f; });
        KEYS.forEach(k => { nums[k].value = shown(k, it[k]); }); setSum();
      }
      if (nq > 0) lastQ = nq; it.qty = nq; updTotals();
    }, '0.25');
    const unit = document.createElement('span'); unit.className = 'ing-u'; unit.textContent = it.unit || '';
    const del = document.createElement('button'); del.type = 'button'; del.className = 'ing-x'; del.textContent = '×'; del.setAttribute('aria-label', 'Remove ' + (it.name || 'ingredient'));
    del.onclick = () => { ed.ing.splice(idx, 1); drawIng(); };
    const top = document.createElement('div'); top.className = 'ing-top'; top.append(toggle, qty, unit, del);
    const panel = document.createElement('div'); panel.className = 'ing-panel'; panel.hidden = true;
    panel.append(
      wrapL('Name', mkIn('text', it.name, '', 'Name', v => { it.name = v; nm.textContent = v || 'Ingredient'; })),
      wrapL('Unit', mkIn('text', it.unit, '', 'Unit', v => { it.unit = v; unit.textContent = v; }))
    );
    [['kcal','Calories'],['p','Protein g'],['c','Carbs g'],['f','Fat g'],['fiber','Fiber g'],['sugar','Sugar g'],['sodium','Sodium mg']].forEach(([k, lab]) => {
      nums[k] = mkIn('number', shown(k, it[k]), '', lab, v => { it[k] = num(v); setSum(); updTotals(); });
      panel.append(wrapL(lab, nums[k]));
    });
    toggle.onclick = () => { const open = panel.hidden; panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); };
    row.append(top, panel); box.append(row);
  });
  updTotals();
}

/* Portion box shows the real amount (oz / cups / pieces) when the food has a base serving, otherwise a × multiplier */
function portionUI(){
  $('#edPortionLbl').textContent = ed.base ? `Portion (${ed.base.unit})` : 'Portion (×)';
  $('#edPortion').value = ed.base ? +(ed.portion * ed.base.qty).toFixed(2) : ed.portion;
}
$('#edPortion').addEventListener('input', () => {
  const raw = num($('#edPortion').value); if (!ed || ed.ing || !(raw > 0)) return;
  const np = ed.base ? raw / ed.base.qty : raw;
  ed.portion = np; EF.forEach(([k, sel]) => { $(sel).value = shown(k, ed.unit[k] * np); }); updTotals();
});
document.querySelectorAll('#edit [data-p]').forEach(b => b.onclick = () => { $('#edPortion').value = ed && ed.base ? +(b.dataset.p * ed.base.qty).toFixed(2) : b.dataset.p; $('#edPortion').dispatchEvent(new Event('input')); });
EF.forEach(([k, sel]) => $(sel).addEventListener('input', () => { if (ed && !ed.ing){ ed.unit[k] = num($(sel).value) / (ed.portion || 1); updTotals(); } }));
$('#edFav').onclick = () => { if (ed){ ed.fav = !ed.fav; setStar(); } };

$('#edToIng').onclick = () => {
  const v = {}; EF.forEach(([k, sel]) => { v[k] = num($(sel).value); });
  ed.ing = [{ name: $('#edName').value.trim() || 'Food', qty: ed.base ? +(ed.portion * ed.base.qty).toFixed(2) : 1, unit: ed.base ? ed.base.unit : 'serving', ...v }];
  drawEdit(); $('#edStatus').textContent = 'Adjust this ingredient and add the rest below.';
};
$('#edToTotal').onclick = () => {
  const t = ingTotals(ed.ing), r = ed.ing[0];
  ed.base = (ed.base && ed.ing.length === 1 && r.unit === ed.base.unit && num(r.qty) > 0) ? { qty: num(r.qty), unit: r.unit } : null;
  ed.ing = null; ed.portion = 1; portionUI();
  fillSimple(t); setUnit(t, 1); $('#edStatus').textContent = ''; drawEdit();
};
$('#edAdd').onclick = async () => {
  const txt = $('#edAddTxt').value.trim(), st = $('#edStatus');
  if (!txt){ st.textContent = 'Type an ingredient, like 2 tbsp ranch dressing.'; return; }
  if (!aiKey()){
    ed.ing.push({ name: txt.slice(0, 60), qty: 1, unit: '', kcal: 0, p: 0, c: 0, f: 0, fiber: 0, sugar: 0, sodium: 0 });
    $('#edAddTxt').value = ''; st.textContent = 'Add your API key in settings to auto-fill numbers, or tap the ingredient to type them in.'; return drawIng();
  }
  const btn = $('#edAdd'); btn.disabled = true; st.textContent = 'Estimating…';
  try {
    const o = await ask(ISYS, txt);
    ed.ing.push({ name: String(o.name || txt).slice(0, 60), qty: num(o.qty) || 1, unit: String(o.unit || '').slice(0, 20), kcal: num(o.calories), p: num(o.protein_g), c: num(o.carbs_g), f: num(o.fat_g), fiber: num(o.fiber_g), sugar: num(o.sugar_g), sodium: num(o.sodium_mg) });
    $('#edAddTxt').value = ''; st.textContent = ''; drawIng();
  } catch (err) { st.textContent = err instanceof SyntaxError ? 'Got a confusing reply. Try again, or add it blank and type the numbers in.' : err.message; }
  finally { btn.disabled = false; }
};
$('#edCancel').onclick = () => $('#edit').close();
$('#edSave').onclick = () => {
  const e = today().entries.find(x => x.id === ed.id); if (!e) return $('#edit').close();
  if (ed.ing && !ed.ing.length){ $('#edStatus').textContent = 'Keep at least one ingredient, or choose “Use one total instead”.'; return; }
  e.name = $('#edName').value.trim().slice(0, 80) || e.name; e.hall = $('#edWhere').value;
  if (ed.ing && ed.ing.length > 1){
    e.ing = ed.ing.map(i => ({ name: String(i.name || 'Ingredient').slice(0, 60), qty: num(i.qty), unit: String(i.unit || '').slice(0, 20), kcal: num(i.kcal), p: num(i.p), c: num(i.c), f: num(i.f), fiber: num(i.fiber), sugar: num(i.sugar), sodium: num(i.sodium) }));
    Object.assign(e, ingTotals(e.ing)); e.kcal = Math.round(e.kcal); delete e.portion; delete e.simple; delete e.base;
  } else if (ed.ing){
    const r = ed.ing[0]; delete e.ing; delete e.simple;
    KEYS.forEach(k => { e[k] = Math.max(0, num(r[k])); }); e.kcal = Math.round(e.kcal);
    if (ed.base && r.unit === ed.base.unit && num(r.qty) > 0){ e.portion = num(r.qty) / ed.base.qty; e.base = ed.base; }
    else if (r.unit === 'serving' && num(r.qty) > 0){ e.portion = num(r.qty); delete e.base; }
    else { delete e.portion; delete e.base; }
  } else {
    delete e.ing; EF.forEach(([k, sel]) => { e[k] = Math.max(0, num($(sel).value)); }); e.portion = ed.portion; e.simple = true; if (ed.base) e.base = ed.base; else delete e.base;
  }
  if (ed.fav && !ed.wasFav){ const f = favFrom(e); e.favId = f.id; favs.push(f); saveFavs(); }
  else if (!ed.fav && ed.wasFav){ favs = favs.filter(x => x.id !== e.favId); delete e.favId; saveFavs(); }
  saveDays(); $('#edit').close(); render();
};
