/* ---------- Settings ---------- */
const dlg = $('#settings');
THEMES && Object.entries(THEMES).forEach(([id, t]) => $('#sTheme').add(new Option(t.name, id)));
function whereOpts(sel, placeholder, school){
  sel.innerHTML = ''; sel.add(new Option(placeholder, '')); sel.add(new Option('Not at a dining hall', 'none'));
  ((SCHOOLS[school] || {}).halls || []).forEach(h => sel.add(new Option(h.name, h.id)));
}
function resetWhere(){ $('#where').value = (profile && profile.defWhere) || ''; }
function syncDef(){
  const sc = $('#sSchool').value, cur = $('#sDefWhere').value;
  $('#defWhereField').hidden = !sc;
  whereOpts($('#sDefWhere'), 'None (choose each time)', sc);
  $('#sDefWhere').value = [...$('#sDefWhere').options].some(o => o.value === cur) ? cur : '';
}
$('#sSchool').addEventListener('change', syncDef);
function fillWhere(){
  const sc = schoolOf(profile);
  whereOpts($('#where'), 'Where did you eat?', sc); whereOpts($('#edWhere'), '(no data)', sc);
  $('#whereBox').hidden = !asks(); resetWhere();
}

let provCur = 'gemini', provVals = {};
function showProv(){
  const g = provCur === 'gemini', v = provVals[provCur] || {};
  $('#sKey').value = v.key || ''; $('#sModel').value = v.model || ''; $('#sModel').placeholder = DEF_MODEL[provCur];
  $('#keyLbl').textContent = g ? 'Gemini API key' : 'Anthropic API key'; $('#sKey').placeholder = g ? 'AIza…' : 'sk-ant-…';
  $('#keyHint').textContent = g ? 'Free key at aistudio.google.com/apikey. On the free tier Google may use what you send to improve its products.' : 'Paid. Get a key at console.anthropic.com.';
}
function syncProv(){
  provVals[provCur] = { key: $('#sKey').value.trim(), model: $('#sModel').value.trim() };
  provCur = $('#sProv').value; showProv();
}
$('#sProv').addEventListener('change', syncProv);

function openSettings(){
  const p = profile || { name:'', calGoal:2000, waterGoal:64, school:'umd', theme:'lavender', provider:'gemini', keyG:'', modelG:'', keyA:'', modelA:'' };
  $('#sName').value = p.name; $('#sCal').value = p.calGoal; $('#sWater').value = p.waterGoal;
  $('#sSchool').value = schoolOf(p); syncDef(); $('#sDefWhere').value = p.defWhere || ''; $('#sTheme').value = p.theme; $('#sLight').checked = !!p.light; provVals = { gemini: { key: p.keyG || '', model: p.modelG || '' }, anthropic: { key: p.keyA || '', model: p.modelA || '' } }; provCur = p.provider || 'gemini'; $('#sProv').value = provCur; showProv();
  $('#setTitle').textContent = profile ? 'Settings' : 'Set up Plate';
  $('#setLead').textContent = profile ? 'Everything is saved on this phone only.' : 'Pick your goals. Everything is saved on this phone only.';
  $('#cancelSet').hidden = !profile; $('#setErr').textContent = '';
  const b = p.body || {};
  $('#bAge').value = b.age || ''; $('#bFt').value = b.ft || ''; $('#bIn').value = b.inch ?? ''; $('#bLb').value = b.lb || '';
  document.querySelectorAll('input[name=sex]').forEach(r => r.checked = r.value === b.sex);
  $('#sMode').value = p.calMode || 'own'; $('#sAddBurn').checked = !!p.addBurn; $('#sConfirm').checked = p.confirmLog !== false;
  estimate(); syncDef(); syncTune(); loadMac(p);
  if (!dlg.open) dlg.showModal();
}
/* ---------- Calorie estimator ---------- */
let est = null;
const fmt = x => Math.round(x).toLocaleString();
function readBody(){
  return { age:+$('#bAge').value || 0, ft:+$('#bFt').value || 0, inch:+$('#bIn').value || 0, lb:+$('#bLb').value || 0,
    sex:(document.querySelector('input[name=sex]:checked') || {}).value || '' };
}
function syncMode(){
  const e = $('#sMode').value === 'est';
  $('#ownBox').hidden = e; $('#estBox').hidden = !e;
}
function estimate(){
  syncMode(); updateWaterRec();
  const b = readBody(), base = $('#bBase'), res = $('#bRes'); est = null;
  if (!(b.age >= 14 && b.age <= 100 && b.ft >= 3 && b.ft <= 8 && b.lb >= 60 && b.lb <= 700 && b.sex)){
    base.textContent = 'Fill in age, sex, height and weight to see your estimate.'; res.textContent = ''; recMac(); return;
  }
  const kg = b.lb * 0.45359237, cm = (b.ft * 12 + b.inch) * 2.54;
  const bmr = 10 * kg + 6.25 * cm - 5 * b.age + (b.sex === 'm' ? 5 : -161), maint = bmr * 1.2;
  base.textContent = `Your body burns about ${fmt(bmr)} cal/day at rest. With normal daily movement, about ${fmt(maint)} maintains your weight.`;
  est = Math.round(maint / 10) * 10; res.textContent = `Daily goal: ${fmt(est)} cal.`; recMac();
}
['#bAge','#bFt','#bIn','#bLb','#sMode'].forEach(s => { $(s).addEventListener('input', estimate); $(s).addEventListener('change', estimate); });
document.querySelectorAll('input[name=sex]').forEach(r => r.addEventListener('change', estimate));
function updateWaterRec(){
  const lb = +$('#bLb').value, known = lb >= 60, oz = known ? Math.min(160, Math.max(40, Math.round(lb * 0.5))) : 64;
  const b = $('#waterRec'); b.textContent = `Recommended: ${oz} oz`; b.dataset.oz = oz;
  $('#waterHint').textContent = known ? 'About half an ounce per pound of body weight. Tap the recommendation to use it.' : 'A general starting point. Add your weight under “Get an estimate” for a personal number.';
}
$('#waterRec').onclick = () => { $('#sWater').value = $('#waterRec').dataset.oz; };

$('#openSettings').onclick = openSettings;
$('#cancelSet').onclick = () => { applyTheme(profile.theme, profile.light); dlg.close(); };
dlg.addEventListener('cancel', e => { if (!profile) e.preventDefault(); });
const previewTheme = () => applyTheme($('#sTheme').value, $('#sLight').checked);
$('#sTheme').onchange = previewTheme; $('#sLight').onchange = previewTheme;

$('#saveSet').onclick = () => {
  const mode = $('#sMode').value; estimate();
  const cal = mode === 'est' ? est : Math.round(+$('#sCal').value), water = Math.round(+$('#sWater').value);
  if (mode === 'est' && !est) return $('#setErr').textContent = 'Fill in age, sex, height and weight for an estimate, or choose “Put in your own”.';
  if (!(cal >= 800 && cal <= 6000)) return $('#setErr').textContent = 'Enter a daily calorie goal between 800 and 6,000.';
  if (!(water >= 16 && water <= 300)) return $('#setErr').textContent = 'Enter a water goal between 16 and 300 oz.';
  stashMac();
  const macros = {}, macroPct = {}, mrec = macroRec(cal);
  for (const k in MACN){
    const m = macVals[k] || {}, v = Math.round(+m.v);
    if (m.u === '%' && PCTREC[k]){ if (v > 0 && v <= 100 && v !== PCTREC[k]) macroPct[k] = v; }
    else if (v > 0 && v <= 2000 && v !== mrec[k]) macros[k] = v;
  }
  provVals[provCur] = { key: $('#sKey').value.trim(), model: $('#sModel').value.trim() };
  profile = {
    name: $('#sName').value.trim().slice(0, 30), calGoal: cal, macros, macroPct, waterGoal: water,
    school: $('#sSchool').value, defWhere: $('#sSchool').value ? $('#sDefWhere').value : '', theme: $('#sTheme').value, light: $('#sLight').checked,
    provider: provCur, keyG: (provVals.gemini || {}).key || '', modelG: (provVals.gemini || {}).model || '', keyA: (provVals.anthropic || {}).key || '', modelA: (provVals.anthropic || {}).model || '', body: readBody(), calMode: mode, addBurn: $('#sAddBurn').checked, confirmLog: $('#sConfirm').checked, coachName: profile && profile.coachName, coach: { strict: +$('#cStrict').value, detail: +$('#cDetail').value, nudges: +$('#cNudge').value, limit: Math.round(+$('#cLimit').value) >= 10 ? Math.round(+$('#cLimit').value) : CC.limit }
  };
  store.set('plate.profile', profile); menus = {}; fillWhere();
  applyTheme(profile.theme, profile.light); dlg.close(); render(); renderLimit();
};


/* ---------- Macro goals ---------- */
const MACN = { p: 'Protein', c: 'Carbs', f: 'Fat', fiber: 'Fiber', sugar: 'Sugar' };
const PCTREC = { p: 25, c: 45, f: 30, sugar: 10 }, KPG = { p: 4, c: 4, f: 9, sugar: 4 };
let macCur = 'p', macVals = {};
function macroRec(goal){
  return { p: Math.round(goal * .25 / 4), c: Math.round(goal * .45 / 4), f: Math.round(goal * .30 / 9), fiber: Math.round(goal / 1000 * 14), sugar: Math.round(goal * .10 / 4) };
}
function macroGoals(goal){
  const r = macroRec(goal), o = (profile && profile.macros) || {}, pc = (profile && profile.macroPct) || {};
  for (const k in r){
    if (PCTREC[k] && num(pc[k]) > 0) r[k] = Math.round(num(pc[k]) / 100 * goal / KPG[k]);
    else if (num(o[k]) > 0) r[k] = Math.round(num(o[k]));
  }
  return r;
}
function settingsGoal(){
  const g = $('#sMode').value === 'est' ? est : Math.round(+$('#sCal').value);
  return g >= 800 && g <= 6000 ? g : ((profile && profile.calGoal) || 2000);
}
const macUnit = k => PCTREC[k] && $('#mUnit').value === '%' ? '%' : 'g';
function recMac(){
  const k = macCur, u = macUnit(k), b = $('#macRec'), val = u === '%' ? PCTREC[k] : macroRec(settingsGoal())[k];
  b.textContent = `Recommended: ${val}${u === '%' ? '%' : ' g'}`; b.dataset.g = val; $('#mVal').placeholder = String(val);
}
function showMac(){
  const k = macCur, m = macVals[k] || { v: '', u: 'g' };
  $('#mUnit').value = PCTREC[k] ? m.u : 'g'; $('#mUnit').disabled = !PCTREC[k];
  $('#mVal').value = m.v; recMac();
}
function stashMac(){ macVals[macCur] = { v: $('#mVal').value.trim(), u: macUnit(macCur) }; }
function loadMac(p){
  macVals = {};
  for (const k in MACN){
    if (p.macroPct && p.macroPct[k]) macVals[k] = { v: String(p.macroPct[k]), u: '%' };
    else macVals[k] = { v: p.macros && p.macros[k] ? String(p.macros[k]) : '', u: 'g' };
  }
  macCur = 'p'; $('#mSel').value = 'p'; showMac();
}
$('#mSel').addEventListener('change', () => { stashMac(); macCur = $('#mSel').value; showMac(); });
$('#mVal').addEventListener('input', stashMac);
$('#mUnit').addEventListener('change', () => {
  const k = macCur, old = (macVals[k] || {}).u || 'g', nu = $('#mUnit').value, goal = settingsGoal(), n = Math.round(+$('#mVal').value);
  let v = $('#mVal').value.trim();
  if (v && n > 0 && old !== nu) v = String(nu === '%' ? Math.round(n * KPG[k] / goal * 100) : Math.round(n / 100 * goal / KPG[k]));
  macVals[k] = { v, u: nu }; showMac();
});
$('#macRec').onclick = () => { $('#mVal').value = $('#macRec').dataset.g; stashMac(); };
$('#sCal').addEventListener('input', recMac);
