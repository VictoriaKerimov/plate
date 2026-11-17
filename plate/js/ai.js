/* ---------- UMD dining hall menu (menu/<hall>.json, filled in by the Step 2 script) ---------- */
const hallName = id => (HALLS.find(h => h.id === id) || {}).name || '';
const asks = () => !!schoolOf(profile);
  async function loadMenu(hall){
  const c = menus[hall];
  if (c && ((c.data && c.data.date === dayKey()) || Date.now() - c.t < 5 * 60000)) return c.data;
  let data = null;
  try { const r = await fetch(`menu/${hall}.json?t=${Date.now()}`, { cache:'no-store' }); if (r.ok) data = await r.json(); } catch {}
  menus[hall] = { data, t: Date.now() };
  return data;
}
async function menuItems(meal, hall){
  const m = await loadMenu(hall);
  if (!m || m.date !== dayKey()) return [];
  const lists = meal === 'Snack' ? Object.values(m.meals || {}) : [(m.meals || {})[meal] || []];
  const seen = new Set(), out = [];
  lists.forEach(l => l.forEach(i => {
    const k = i.name + '|' + i.serving;
    if (seen.has(k) || /\bBAR\b/i.test(i.serving || '')) return;
    seen.add(k); out.push(i);
  }));
  return out;
}
function menuContext(items, hall, meal){
  if (!items.length) return '';
  const label = meal === 'Snack' ? 'all-day' : meal.toLowerCase();
  return `\n\nToday's ${hallName(hall) || 'campus'} dining hall ${label} menu, as id|name|serving size:\n` +
    items.map((m, i) => `${i + 1}|${m.name}|${m.serving || '1 serving'}`).join('\n') +
    `\n\nFor each food I ate (or each ingredient, if I built it from parts) that is on this menu, add "menu_id" (the id above) and "servings" (how many of that menu serving size I ate, use a fraction when I ate less than one serving: e.g. 2 for two slices when the serving is 1 slice, 2 for 8 oz when the serving is 4 oz, and 0.5 for 2 oz when the serving is 4 oz) to that item or ingredient. The app fills in the nutrition from the menu, so its numbers don't matter. If it isn't on the menu, leave menu_id out and estimate as usual. Only match when it is clearly the same food.`;
}
const MEASURE = /^(oz|cups?|tbsp|tsp|g|kg|ml|l|lb|lbs)$/;
const UNIT_ALIAS = { ozl: 'oz', ounce: 'oz', ounces: 'oz', tbl: 'tbsp', tb: 'tbsp', ea: 'each' };
/* "4 OZ" -> {qty:4, unit:'oz'}, "1/2 CUP" -> {qty:0.5, unit:'cup'}, "1/16 PIE" -> {qty:1, unit:'× 1/16 pie'}; null if unreadable */
function parseServing(s){
  const str = String(s || '').replace(/`/g, '').trim();
  const m = str.match(/^(\d+\/\d+|\d+(?:\.\d+)?(?:\s+\d+\/\d+)?)\s*(.*)$/);
  if (!m) return null;
  let q = 0; m[1].split(/\s+/).forEach(p => { q += p.includes('/') ? p.split('/')[0] / p.split('/')[1] : +p; });
  let unit = m[2].trim().toLowerCase(); unit = UNIT_ALIAS[unit] || unit;
  if (!(q > 0) || !unit) return null;
  if (q < 1 && !MEASURE.test(unit)) return /^[a-z ]{1,12}$/.test(unit) ? { qty: 1, unit: `× ${m[1]} ${unit}` } : null;
  return { qty: q, unit };
}
const amtText = e => e.base ? `${+((e.portion > 0 ? e.portion : 1) * e.base.qty).toFixed(2)} ${e.base.unit}` : '';
function applyMenu(o, items){
  const id = Math.round(num(o.menu_id)), m = id >= 1 ? items[id - 1] : null;
  if (!m) return false;
  const s = Math.min(20, num(o.servings) > 0 ? num(o.servings) : 1), b = parseServing(m.serving);
  Object.assign(o, { name: m.name, qty: b ? +(s * b.qty).toFixed(2) : s, unit: b ? b.unit : 'serving', calories: m.cal * s, protein_g: m.p * s, carbs_g: m.c * s,
    fat_g: m.f * s, fiber_g: m.fiber * s, sugar_g: m.sugar * s, sodium_mg: m.sodium * s, _menu: s, _base: b });
  return true;
}


const WSYS = `You estimate calories burned for a workout inside a calorie tracking app. The user describes a workout and may give body details. Reply with ONLY a JSON object, no prose and no code fences: {"name":"short workout name","calories":0}. calories is the extra energy the workout itself burned, above resting. Give a realistic estimate; if duration or intensity is missing, assume a typical moderate 30 minute session. If the input is not a workout, return {"name":"","calories":0}.`;
function aiError(status, msg){
  if (status === 429){ markHit(); return aiProv() === 'gemini' ? `The free AI limit was hit. Per-minute limits clear in a minute. If it’s the daily limit, it resets around ${resetTime()}.` : 'Too many requests. Wait a minute and try again.'; }
  if (status === 401 || status === 403) return 'That API key was rejected. Check it in settings.';
  if (/credit/i.test(msg || '')) return 'Your Anthropic credit is out. Add credit at console.anthropic.com.';
  if (status === 400 && /api key/i.test(msg || '')) return 'That API key was not accepted. Check it in settings.';
  return msg || `Request failed (${status})`;
}
async function post(url, headers, body){
  try { return await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) }); }
  catch { throw new Error('Couldn’t reach the AI service. Check your connection and try again.'); }
}
async function callAI(system, content, maxTokens){
  trackUse();
  const key = aiKey(), model = aiModel();
  if (aiProv() === 'gemini'){
    const parts = content.map(b => b.type === 'text' ? { text: b.text } : { inlineData: { mimeType: b.source.media_type, data: b.source.data } });
    const res = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { 'content-type': 'application/json', 'x-goog-api-key': key },
      { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: Math.max(maxTokens, 2048), responseMimeType: 'application/json' } });
    if (!res.ok){ const j = await res.json().catch(() => ({})); throw new Error(aiError(res.status, j.error && j.error.message)); }
    const data = await res.json(), c = data.candidates && data.candidates[0];
    return ((c && c.content && c.content.parts) || []).map(p => p.text || '').join('');
  }
  const res = await post('https://api.anthropic.com/v1/messages',
    { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] });
  if (!res.ok){ const j = await res.json().catch(() => ({})); throw new Error(aiError(res.status, j.error && j.error.message)); }
  const data = await res.json(); return data.content.map(b => b.text || '').join('');
}
async function ask(system, content){
  const raw = await callAI(system, [{ type: 'text', text: content }], 400);
  return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
}
