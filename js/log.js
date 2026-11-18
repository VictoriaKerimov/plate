/* ---------- Log food with AI ---------- */
const SYSTEM = `You are a careful nutrition estimator inside a calorie tracking app. The user describes food and/or sends a photo. Reply with ONLY a JSON object, no prose and no code fences, in exactly this shape:
{"items":[{"name":"short food name","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"sodium_mg":0,"health":0,"amount":"6 oz"}],"water_oz":0}
List each distinct food as its own item. health is a whole number from 1 to 100 rating how healthy that food is: about 90 to 100 for vegetables, fruit, legumes, whole grains, fish and lean protein; 60 to 80 for decent mixed meals; 30 to 50 for refined carbs, processed meats and rich desserts; 5 to 25 for fried food, candy, soda and heavily ultra-processed items. Rate the food itself, not the portion size. amount is what the user ate, as a number plus a unit: use oz or cups for foods measured by weight or volume (for example "6 oz" or "1.5 cups"), or a count for countable foods (for example "2 slices"). Never use the word serving. Only when the user assembled a food from separate components (a salad bar salad, a build-your-own bowl or sandwich, or a homemade dish where they listed the ingredients), also add an "ingredients" array to that item, each with name, qty (a number), unit (like cup, tbsp, oz, g, slice or piece), calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g and sodium_mg, and make the item's own numbers equal their sums. Never break down a single prepared dish such as pasta, pizza, a burger, a dining hall entree or a menu sandwich. Estimate realistic portions from the description or photo. Set water_oz only if the user mentions drinking water, otherwise 0. If the input has no food at all, return {"items":[],"water_oz":0}.`;

function setStatus(t, err){ const s = $('#status'); s.textContent = t; s.className = err ? 'err' : ''; }

/* Shows what the AI found; resolves true on Add, false on Cancel/Esc.
   tags = Map of entry id -> small source label ("On menu", "Not on menu, estimated", ...) */
function confirmLog(made, w, tags = new Map()){
  return new Promise(res => {
    const dlg = $('#confirmDlg'), box = $('#confirmItems');
    const draw = () => {
      box.innerHTML = '';
      made.forEach(e => {
        const row = document.createElement('div'); row.className = 'entry tap';
        row.tabIndex = 0; row.setAttribute('role', 'button'); row.setAttribute('aria-label', 'Edit ' + e.name);
        row.onclick = () => openEdit(e.id, e, draw);
        row.onkeydown = ev => { if (ev.key === 'Enter') openEdit(e.id, e, draw); };
        const info = document.createElement('div'), s = document.createElement('strong'), m = document.createElement('small');
        s.textContent = e.name;
        m.textContent = [amtText(e) || (e.ing && e.ing.length > 1 ? e.ing.length + ' ingredients' : ''), `P ${Math.round(e.p)}g · C ${Math.round(e.c)}g · F ${Math.round(e.f)}g`].filter(Boolean).join(' · ');
        info.append(s, m);
        if (tags.has(e.id)){ const tg = document.createElement('small'); tg.textContent = tags.get(e.id); info.append(tg); }
        const kc = document.createElement('span'); kc.className = 'kc'; kc.textContent = Math.round(e.kcal) + ' cal';
        row.append(info, kc); box.append(row);
      });
      if (w > 0){ const p = document.createElement('p'); p.className = 'hint'; p.textContent = `Also adds ${w} oz of water.`; box.append(p); }
    };
    draw();
    let done = false;
    const fin = v => { if (done) return; done = true; if (dlg.open) dlg.close(); res(v); };
    $('#confirmYes').onclick = () => fin(true);
    $('#confirmNo').onclick = () => fin(false);
    dlg.oncancel = () => fin(false);
    dlg.showModal();
  });
}
function commitLog(made, w, msg){
  const d = today();
  made.forEach(e => d.entries.push(e));
  if (w > 0){ d.water += w; d.adds.push(w); }
  saveDays(); $('#food').value = ''; resetWhere(); $('#clearPhoto').click(); setStatus(msg); render();
}

/* ---------- Menu vs AI estimate ---------- */
const CMP = { kcalAbs: 75, kcalPct: .25, macAbs: 8, macPct: .35 };  // how far apart counts as "considerable"
const MAC = [['p', 'Protein'], ['c', 'Carbs'], ['f', 'Fat']];
const differs = (a, b, abs, pct) => { const d = Math.abs(a - b); return d >= abs && d >= pct * Math.max(a, b); };
const sumLine = e => `${Math.round(e.kcal)} cal · P ${Math.round(e.p)}g · C ${Math.round(e.c)}g · F ${Math.round(e.f)}g`;
function compareEntries(menu, ai){
  if (!(ai.kcal > 0)) return null;
  if (differs(menu.kcal, ai.kcal, CMP.kcalAbs, CMP.kcalPct)) return { kind: 'cal' };
  const macros = MAC.filter(([k]) => differs(menu[k], ai[k], CMP.macAbs, CMP.macPct)).map(([k]) => k);
  return macros.length ? { kind: 'mac', macros } : null;
}
function seg(name, a, b, col){
  const w = document.createElement('div'); w.className = 'seg' + (col ? ' col' : '');
  [['menu', a], ['ai', b]].forEach(([v, text], i) => {
    const l = document.createElement('label'), r = document.createElement('input'), s = document.createElement('span');
    r.type = 'radio'; r.name = name; r.value = v; r.checked = i === 0; s.textContent = text; l.append(r, s); w.append(l);
  });
  return w;
}
/* Asks which version to log; edits `made` in place. Resolves false on Cancel/Esc. */
function resolveDiffs(made, diffs){
  return new Promise(res => {
    const dlg = $('#cmpDlg'), box = $('#cmpItems'); box.innerHTML = '';
    const val = n => (dlg.querySelector(`input[name="${n}"]:checked`) || {}).value;
    diffs.forEach((d, n) => {
      const sec = document.createElement('div'); sec.className = 'field cmp';
      const h = document.createElement('strong'); h.textContent = d.menu.name;
      const p = document.createElement('p'); p.className = 'hint'; sec.append(h, p);
      if (d.kind === 'cal'){
        p.textContent = 'Calories are far apart, so the whole food switches.';
        sec.append(seg(`cmp${n}`, `Menu: ${sumLine(d.menu)}`, `AI: ${sumLine(d.ai)}`, true));
      } else {
        p.textContent = 'Calories are close, but these macros differ. Pick one for each.';
        d.macros.forEach(k => {
          const lb = document.createElement('p'); lb.className = 'hint'; lb.textContent = MAC.find(m => m[0] === k)[1];
          sec.append(lb, seg(`cmp${n}${k}`, `Menu ${Math.round(d.menu[k])}g`, `AI ${Math.round(d.ai[k])}g`));
        });
      }
      box.append(sec);
    });
    let done = false;
    const fin = ok => {
      if (done) return; done = true;
      if (ok) diffs.forEach((d, n) => {
        if (d.kind === 'cal'){ if (val(`cmp${n}`) === 'ai') made[d.idx] = d.ai; }
        else d.macros.forEach(k => { if (val(`cmp${n}${k}`) === 'ai') made[d.idx][k] = d.ai[k]; });
      });
      if (dlg.open) dlg.close(); res(ok);
    };
    $('#cmpYes').onclick = () => fin(true);
    $('#cmpNo').onclick = () => fin(false);
    dlg.oncancel = () => fin(false);
    dlg.showModal();
  });
}

$('#logBtn').onclick = async () => {
  const text = $('#food').value.trim(), meal = $('#meal').value, hall = asks() ? $('#where').value : '';
  if (!text && !photo) return setStatus('Describe what you ate or add a photo.', true);
  if (!aiKey()){ setStatus('Add your API key in settings first.', true); return openSettings(); }
  const btn = $('#logBtn'); btn.disabled = true; setStatus('Analyzing…');
  try {
    const atHall = !!hall && hall !== 'none';
    const mi = atHall ? await menuItems(meal, hall) : [];
    const content = [];
    if (photo) content.push({ type:'image', source:{ type:'base64', media_type:'image/jpeg', data: photo.split(',')[1] } });
    content.push({ type:'text', text: `Meal: ${meal}\nWhat I ate: ${text || '(see photo)'}${atHall ? `\nI ate at the ${hallName(hall)} dining hall at ${schoolName(hall)}.` : ''}${menuContext(mi, hall, meal)}` });
    const raw = await callAI(SYSTEM, content, 1000);
    const out = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const t = Date.now();
    let matched = 0;
    const diffs = [], menuIds = new Set();
    const made = (out.items || []).map((it, i) => {
      const orig = JSON.parse(JSON.stringify(it));   // the AI's own numbers, before the menu overwrites them
      const ings = Array.isArray(it.ingredients) ? it.ingredients : [];
      let ingHit = false;
      ings.forEach(g => { if (applyMenu(g, mi)){ matched++; ingHit = true; } });
      const hit = ings.length < 2 && applyMenu(it, mi);
      if (hit) matched++;
      const build = (src, h) => {
        const mg = mapIng(src), base = h ? src._base : (mg.ing ? null : parseServing(src.amount));
        return {
          id: t + i, meal, hall: hall || '', name: String(src.name || 'Food').slice(0, 80),
          kcal: Math.round(num(src.calories)), p: num(src.protein_g), c: num(src.carbs_g), f: num(src.fat_g),
          fiber: num(src.fiber_g), sugar: num(src.sugar_g), sodium: num(src.sodium_mg), health: Math.max(0, Math.min(100, Math.round(num(src.health)))), ...mg,
          ...(h ? { portion: src._menu, simple: true } : {}),
          ...(base ? { base, ...(h ? {} : { portion: 1, simple: true }) } : {})
        };
      };
      const e = build(it, hit);
      if (hit || ingHit){
        menuIds.add(e.id);
        const ai = build(orig, false), c = compareEntries(e, ai);
        if (c) diffs.push({ ...c, idx: i, menu: e, ai });
      }
      return e;
    });
    const w = Math.round(num(out.water_oz));
    if (!made.length && w <= 0) return setStatus('I couldn’t find any food in that. Try describing it differently.', true);
    const msg = !atHall ? 'Logged.' : !mi.length ? 'Logged. No menu for today, so I estimated.' : matched ? `Logged. ${matched} matched to the menu.` : 'Logged. Nothing matched the menu, so I estimated.';
    if (diffs.length){
      setStatus('');
      if (!(await resolveDiffs(made, diffs))){ setStatus('Not added. Your text is still there if you want to change it.'); return; }
    }
    const tags = new Map();
    if (atHall) made.forEach((e, i) => {
      const d = diffs.find(x => x.idx === i);
      tags.set(e.id,
        !mi.length ? 'No menu today, estimated'
        : !menuIds.has(e.id) ? 'Not on menu, estimated'
        : d && d.kind === 'cal' && e === d.ai ? 'AI estimate (menu differed)'
        : d && d.kind === 'mac' && d.macros.some(k => e[k] === d.ai[k]) ? 'On menu, some macros from AI'
        : 'On menu');
    });
    if (profile.confirmLog !== false && made.length){
      setStatus('');
      if (!(await confirmLog(made, w, tags))){ setStatus('Not added. Your text is still there if you want to change it.'); return; }
    }
    commitLog(made, w, msg);
  } catch (err) {
    setStatus(err instanceof SyntaxError ? 'Got a confusing reply. Try again.' : err.message, true);
  } finally { btn.disabled = false; }
};

/* ---------- Workouts ---------- */
function wStatus(t, err){ const s = $('#wStatus'); s.textContent = t; s.className = 'hint' + (err ? ' err' : ''); }
function pushWorkout(w){ const d = today(); d.workouts ||= []; d.workouts.push(w); saveDays(); render(); }

$('#wAdd').onclick = async () => {
  const name = $('#wName').value.trim(), cal = Math.round(+$('#wCal').value);
  if (cal > 0){
    if (cal > 5000) return wStatus('That looks too high. Enter calories under 5,000.', true);
    $('#wName').value = ''; $('#wCal').value = ''; wStatus('');
    return pushWorkout({ id: Date.now(), name: (name || 'Workout').slice(0, 60), kcal: cal, src: 'Entered' });
  }
  if (!name) return wStatus('Describe the workout, or enter the calories.', true);
  if (!aiKey()){ wStatus('Add your API key in settings to estimate, or enter the calories.', true); return openSettings(); }
  const btn = $('#wAdd'); btn.disabled = true; wStatus('Estimating…');
  try {
    const b = profile.body || {};
    const who = b.lb ? `Body weight about ${b.lb} lb${b.age ? `, age ${b.age}` : ''}${b.sex ? `, ${b.sex === 'm' ? 'male' : 'female'}` : ''}.` : 'Body weight unknown; assume an average adult.';
    const out = await ask(WSYS, `${who}\nWorkout: ${name}`), kcal = Math.round(num(out.calories));
    if (!(kcal > 0)) throw new Error('Couldn’t estimate that one. Add the minutes, or enter the calories.');
    $('#wName').value = ''; wStatus('');
    pushWorkout({ id: Date.now(), name: String(out.name || name).slice(0, 60), kcal, src: 'Estimated' });
  } catch (err) { wStatus(err instanceof SyntaxError ? 'Got a confusing reply. Try again.' : err.message, true); }
  finally { btn.disabled = false; }
};

$('#wPaste').onclick = async () => {
  try {
    const t = await navigator.clipboard.readText(), m = String(t).match(/\d+(\.\d+)?/), kcal = m ? Math.round(+m[0]) : 0;
    if (!(kcal > 0 && kcal <= 5000)) return wStatus('Run your Health shortcut first so the calories are copied, then tap this.', true);
    const d = today(); d.workouts = (d.workouts || []).filter(w => w.src !== 'Apple Health');
    wStatus('Added from Apple Health.');
    pushWorkout({ id: Date.now(), name: 'Apple Health activity', kcal, src: 'Apple Health' });
  } catch { wStatus('Couldn’t read the clipboard. Tap Paste if your phone asks.', true); }
};
