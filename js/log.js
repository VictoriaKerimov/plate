/* ---------- Log food with AI ---------- */
const SYSTEM = `You are a careful nutrition estimator inside a calorie tracking app. The user describes food and/or sends a photo. Reply with ONLY a JSON object, no prose and no code fences, in exactly this shape:
{"items":[{"name":"short food name","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"sodium_mg":0,"health":0,"amount":"6 oz"}],"water_oz":0}
List each distinct food as its own item. health is a whole number from 1 to 100 rating how healthy that food is: about 90 to 100 for vegetables, fruit, legumes, whole grains, fish and lean protein; 60 to 80 for decent mixed meals; 30 to 50 for refined carbs, processed meats and rich desserts; 5 to 25 for fried food, candy, soda and heavily ultra-processed items. Rate the food itself, not the portion size. amount is what the user ate, as a number plus a unit: use oz or cups for foods measured by weight or volume (for example "6 oz" or "1.5 cups"), or a count for countable foods (for example "2 slices"). Never use the word serving. Only when the user assembled a food from separate components (a salad bar salad, a build-your-own bowl or sandwich, or a homemade dish where they listed the ingredients), also add an "ingredients" array to that item, each with name, qty (a number), unit (like cup, tbsp, oz, g, slice or piece), calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g and sodium_mg, and make the item's own numbers equal their sums. Never break down a single prepared dish such as pasta, pizza, a burger, a dining hall entree or a menu sandwich. Estimate realistic portions from the description or photo. Set water_oz only if the user mentions drinking water, otherwise 0. If the input has no food at all, return {"items":[],"water_oz":0}.`;

function setStatus(t, err){ const s = $('#status'); s.textContent = t; s.className = err ? 'err' : ''; }

/* Shows what the AI found; resolves true on Add, false on Cancel/Esc */
function confirmLog(made, w){
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
    const made = (out.items || []).map((it, i) => {
      const ings = Array.isArray(it.ingredients) ? it.ingredients : [];
      ings.forEach(g => { if (applyMenu(g, mi)) matched++; });
      const hit = ings.length < 2 && applyMenu(it, mi);
      if (hit) matched++;
      const mg = mapIng(it), base = hit ? it._base : (mg.ing ? null : parseServing(it.amount));
      return {
        id: t + i, meal, hall: hall || '', name: String(it.name || 'Food').slice(0, 80),
        kcal: Math.round(num(it.calories)), p: num(it.protein_g), c: num(it.carbs_g), f: num(it.fat_g),
        fiber: num(it.fiber_g), sugar: num(it.sugar_g), sodium: num(it.sodium_mg), health: Math.max(0, Math.min(100, Math.round(num(it.health)))), ...mg,
        ...(hit ? { portion: it._menu, simple: true } : {}),
        ...(base ? { base, ...(hit ? {} : { portion: 1, simple: true }) } : {})
      };
    });
    const w = Math.round(num(out.water_oz));
    if (!made.length && w <= 0) return setStatus('I couldn’t find any food in that. Try describing it differently.', true);
    const msg = !atHall ? 'Logged.' : !mi.length ? 'Logged. No menu for today, so I estimated.' : matched ? `Logged. ${matched} matched to the menu.` : 'Logged. Nothing matched the menu, so I estimated.';
    if (profile.confirmLog !== false && made.length){
      setStatus('');
      if (!(await confirmLog(made, w))){ setStatus('Not added. Your text is still there if you want to change it.'); return; }
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
