/* ---------- Coach, reminders and free-limit warning ---------- */
const CC = { strict: 3, detail: 3, nudges: 3, limit: 250 };
const cc = () => Object.assign({}, CC, (profile && profile.coach) || {});
function setCC(k, v){ if (!profile) return; profile.coach = Object.assign({}, profile.coach || {}, { [k]: v }); store.set('plate.profile', profile); }
const SLABEL = ['Very gentle', 'Gentle', 'Balanced', 'Direct', 'Strict'], DLABEL = ['Very brief', 'Brief', 'Balanced', 'Detailed', 'In-depth'];
const STRICT = [
  'Very gentle and encouraging. Celebrate small wins and suggest rather than instruct.',
  'Warm and supportive. Offer gentle nudges.',
  'Balanced. Friendly but honest, and name gaps plainly.',
  'Direct and no-nonsense. Call out misses clearly and give specific next steps, while staying respectful.',
  'Very strict accountability coach. Blunt, specific and demanding about their own targets, but never insulting or shaming.'
];
const DETAIL = [
  'Reply in one sentence.',
  'Reply in at most 2 to 3 short sentences.',
  'Reply in a short paragraph of about 3 to 5 sentences, with a brief reason.',
  'Be thorough: explain the reasoning and give a few concrete options, up to about 200 words.',
  'Be in depth: explain the why, use their numbers, and give a concrete plan, up to about 350 words.'
];
const DCAP = [120, 220, 420, 700, 1100];
let unread = +store.get('plate.unread', 0) || 0, limitWarn = false;
const coachNameOf = () => ((profile && profile.coachName) || '').trim() || 'Coach';
function coachLabel(){
  const b = $('#coachBtn'); b.classList.toggle('unread', unread > 0);
  b.setAttribute('aria-label', coachNameOf() + (unread ? ', new reminder' : '') + (limitWarn ? ', AI limit warning' : ''));
}
let chat = store.get('plate.chat', []), usage = store.get('plate.usage', { d: '', n: 0 }), nudgeSt = store.get('plate.nudges', { d: '', n: 0, last: 0, k: {} }), coachBusy = false;

/* free-limit tracking (Gemini daily quotas reset at midnight Pacific time) */
const ptDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
function resetTime(){
  const ptNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const ms = 86400000 - (ptNow - new Date(ptNow.getFullYear(), ptNow.getMonth(), ptNow.getDate()));
  return new Date(Date.now() + ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function useRec(){ const d = ptDay(); if (usage.d !== d) usage = { d, n: 0 }; return usage; }
function trackUse(){ if (aiProv() !== 'gemini') return; useRec().n++; store.set('plate.usage', usage); renderLimit(); }
function markHit(){ if (aiProv() !== 'gemini') return; useRec().hit = Date.now(); store.set('plate.usage', usage); renderLimit(); }
function renderLimit(){
  const b = $('#coachBtn'), m = $('#meter');
  if (aiProv() !== 'gemini'){
    b.classList.remove('warn'); limitWarn = false; coachLabel(); m.classList.remove('warn');
    m.textContent = 'Using Anthropic (pay as you go). No daily limit tracked here.'; return;
  }
  const u = useRec(), lim = cc().limit, recent = !!u.hit && Date.now() - u.hit < 15 * 60000, warn = recent || u.n >= lim * 0.8;
  b.classList.toggle('warn', warn); limitWarn = warn; coachLabel(); m.classList.toggle('warn', warn);
  m.textContent = recent ? `The AI limit was hit a moment ago. Per-minute limits clear in a minute. Daily limits reset around ${resetTime()}.` : `Today: ${u.n} of ${lim} AI requests. Resets around ${resetTime()}.`;
}

/* chat */
function coachContext(){
  const d = today(), w = d.workouts || [];
  const sum = { kcal: 0, p: 0, c: 0, f: 0, fiber: 0, sugar: 0 }; d.entries.forEach(e => { for (const k in sum) sum[k] += num(e[k]); });
  const burn = w.reduce((a, x) => a + num(x.kcal), 0), goal = profile.calGoal + (profile.addBurn ? burn : 0);
  const T = macroGoals(goal), tp = T.p, tc = T.c, tf = T.f, L = [];
  L.push(`Name: ${profile.name || 'not given'}`);
  const b = profile.body || {}; if (b.age && b.lb && b.ft) L.push(`Body: age ${b.age}, ${b.sex === 'f' ? 'female' : 'male'}, ${b.ft} ft ${b.inch || 0} in, ${b.lb} lb`);
  L.push(`Local time: ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  L.push(`Calories today: ${Math.round(sum.kcal)} of ${Math.round(goal)}`);
  L.push(`Protein ${Math.round(sum.p)} of ${tp} g, carbs ${Math.round(sum.c)} of ${tc} g, fat ${Math.round(sum.f)} of ${tf} g, fiber ${Math.round(sum.fiber)} of ${T.fiber} g, sugar ${Math.round(sum.sugar)} of ${T.sugar} g`);
  L.push(`Water: ${d.water} of ${profile.waterGoal} oz`);
  L.push(`Exercise today: ${w.length ? w.map(x => `${x.name} (${Math.round(x.kcal)} cal)`).join(', ') : 'none logged'}`);
  const sc = dayScore(d); L.push(`Food quality score today (1-100, AI estimate): ${sc || 'not rated yet'}`);
  const meals = ['Breakfast', 'Lunch', 'Dinner', 'Snack'].map(m => { const it = d.entries.filter(e => e.meal === m); return it.length ? `${m}: ${it.map(e => `${e.name} (${Math.round(e.kcal)} cal)`).join(', ')}` : ''; }).filter(Boolean);
  L.push(`Foods today: ${meals.length ? meals.join('; ') : 'nothing logged yet'}`);
  const past = []; for (let i = 1; i <= 7; i++){ const x = new Date(); x.setDate(x.getDate() - i); const es = (days[dayKey(x)] && days[dayKey(x)].entries) || []; past.push(es.length ? Math.round(es.reduce((a, e) => a + num(e.kcal), 0)) : 'not logged'); }
  L.push(`Calories eaten on the past 7 days, most recent first: ${past.join(', ')}`);
  L.push(`Logging streak: ${streakCount()} days`);
  return L.join('\n');
}
function coachSystem(){
  const c = cc();
  return `You are a nutrition coach inside a calorie and habit tracking app. You help one person with food, hydration, exercise and habits, using the data below. The person calls you ${coachNameOf()}.
Strictness level ${c.strict} of 5: ${STRICT[c.strict - 1]}
Detail level ${c.detail} of 5: ${DETAIL[c.detail - 1]}
Rules:
- Plain text only. No markdown, headers or bullet symbols. Use short sentences.
- Use only the data below. If something is not logged, say so instead of guessing.
- You are not a doctor. Give general guidance only.
- Never encourage very low calorie intake, skipping meals, fasting to make up for eating, purging, or extreme exercise. Never shame or moralize about food or bodies, and do not call foods good or bad.
- If the person mentions an eating disorder, self-harm, or a serious medical symptom, respond with care, do not give diet numbers, and encourage them to talk to a doctor, counselor, or someone they trust. If they may be in crisis, suggest local emergency services or a crisis line (in the US, call or text 988).
- Stay on food, water, exercise and the app. Politely decline unrelated requests.
Current data:
${coachContext()}`;
}
async function chatAI(system, history, maxTokens){
  trackUse();
  const key = aiKey(), model = aiModel(), h = [];
  history.slice(-12).forEach(m => { const last = h[h.length - 1]; if (last && last.r === m.r) last.t += '\n' + m.t; else h.push({ r: m.r, t: m.t }); });
  while (h.length && h[0].r !== 'user') h.shift();
  if (aiProv() === 'gemini'){
    const res = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { 'content-type': 'application/json', 'x-goog-api-key': key },
      { systemInstruction: { parts: [{ text: system }] }, contents: h.map(m => ({ role: m.r === 'user' ? 'user' : 'model', parts: [{ text: m.t }] })), generationConfig: { maxOutputTokens: Math.max(maxTokens, 1024) } });
    if (!res.ok){ const j = await res.json().catch(() => ({})); throw new Error(aiError(res.status, j.error && j.error.message)); }
    const data = await res.json(), c = data.candidates && data.candidates[0];
    return ((c && c.content && c.content.parts) || []).map(p => p.text || '').join('').trim();
  }
  const res = await post('https://api.anthropic.com/v1/messages',
    { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    { model, max_tokens: maxTokens, system, messages: h.map(m => ({ role: m.r, content: m.t })) });
  if (!res.ok){ const j = await res.json().catch(() => ({})); throw new Error(aiError(res.status, j.error && j.error.message)); }
  const data = await res.json(); return data.content.map(b => b.text || '').join('').trim();
}
function renderChat(){
  const box = $('#coachMsgs'); box.innerHTML = '';
  if (!chat.length){ const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'Ask about today’s food, water or workouts, or what to eat next.'; box.append(p); }
  chat.forEach(m => { const d = document.createElement('div'); d.className = 'msg ' + (m.r === 'user' ? 'u' : 'a'); d.textContent = m.t; box.append(d); });
  box.scrollTop = box.scrollHeight;
}
async function coachSend(){
  if (coachBusy) return;
  const t = $('#coachIn').value.trim(), st = $('#coachStatus'); if (!t) return;
  if (!aiKey()){ st.textContent = 'Add your API key in settings first.'; return; }
  coachBusy = true; $('#coachSend').disabled = true; st.textContent = 'Thinking…';
  chat.push({ r: 'user', t: t.slice(0, 1500) }); chat = chat.slice(-60); store.set('plate.chat', chat); $('#coachIn').value = ''; renderChat();
  try {
    const reply = await chatAI(coachSystem(), chat, DCAP[cc().detail - 1]);
    if (!reply) throw new Error('No reply came back. Try again.');
    chat.push({ r: 'assistant', t: reply }); chat = chat.slice(-60); store.set('plate.chat', chat); st.textContent = ''; renderChat();
  } catch (err) { st.textContent = err.message; }
  finally { coachBusy = false; $('#coachSend').disabled = false; }
}
function tuneLabels(){
  $('#cStrictV').textContent = SLABEL[+$('#cStrict').value - 1]; $('#cDetailV').textContent = DLABEL[+$('#cDetail').value - 1]; $('#cNudgeV').textContent = +$('#cNudge').value || 'Off';
}
function syncTune(){
  const c = cc();
  $('#cStrict').value = c.strict; $('#cDetail').value = c.detail; $('#cNudge').value = c.nudges; $('#cLimit').value = c.limit; tuneLabels();
}
['#cStrict', '#cDetail', '#cNudge'].forEach(sel => $(sel).addEventListener('input', tuneLabels));
$('#coachBtn').onclick = () => { if (!profile) return openSettings(); $('#coachName').value = coachNameOf(); unread = 0; store.set('plate.unread', 0); coachLabel(); syncTune(); renderChat(); renderLimit(); $('#coachDlg').showModal(); $('#coachName').blur(); $('#coachMsgs').scrollTop = $('#coachMsgs').scrollHeight; };
$('#coachClose').onclick = () => $('#coachDlg').close();
$('#coachName').addEventListener('input', () => { if (!profile) return; profile.coachName = $('#coachName').value.slice(0, 24); store.set('plate.profile', profile); coachLabel(); });
$('#coachName').addEventListener('change', () => { if (!profile) return; profile.coachName = $('#coachName').value.trim().slice(0, 24); store.set('plate.profile', profile); $('#coachName').value = coachNameOf(); coachLabel(); });
$('#cClear').onclick = () => { chat = []; store.set('plate.chat', chat); renderChat(); };
$('#coachSend').onclick = coachSend;
$('#coachIn').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); coachSend(); } });

/* reminders: shown while the app is open, no AI used */
function pickNudge(h){
  const d = today(), t = cc().strict <= 2 ? 0 : cc().strict === 3 ? 1 : 2, k = nudgeSt.k || {}, w = d.water, g = profile.waterGoal;
  const expected = g * Math.min(1, Math.max(0, (h - 8) / 13)), has = m => d.entries.some(e => e.meal === m);
  const burn = (d.workouts || []).reduce((a, x) => a + num(x.kcal), 0), goal = profile.calGoal + (profile.addBurn ? burn : 0), tp = macroGoals(goal).p;
  let sp = 0; d.entries.forEach(e => { sp += num(e.p); });
  const c = [];
  if (h >= 13 && !has('Breakfast') && !has('Lunch')) c.push(['meals', ['Haven’t seen a meal logged yet. Want to add what you’ve eaten?', 'No meals logged yet today. Add what you’ve had.', 'Nothing logged today. Log your meals as you eat them.'][t]]);
  if (h >= 19.5 && !has('Dinner')) c.push(['dinner', ['Dinner isn’t logged yet. Add it whenever you eat.', 'Dinner isn’t logged yet. Add it when you eat.', 'No dinner logged. Log it as soon as you eat.'][t]]);
  if (h >= 19 && streakCount() > 0 && !d.entries.length) c.push(['streak', `Log something today to keep your ${streakCount()}-day streak.`]);
  if (h >= 16 && !(d.workouts || []).length) c.push(['move', ['Maybe a short walk today? Even 10 minutes counts.', 'No workout logged today. Even a 15-minute walk helps.', 'No movement logged today. Get a workout in before the day ends.'][t]]);
  if (h >= 18 && d.entries.length && sp < tp * 0.6) c.push(['protein', [`Protein’s a bit low today. A little more at dinner could help.`, `Protein is at ${Math.round(sp)} of ${tp} g. Consider adding some at your next meal.`, `Protein is only ${Math.round(sp)} of ${tp} g. Fix that with your next meal.`][t]]);
  if (w < expected - 8) c.push(['water', [`A little water break? You’re at ${w} of ${g} oz.`, `Water check: ${w} of ${g} oz so far. Grab a glass.`, `You’re behind on water: ${w} of ${g} oz. Drink some now.`][t]]);
  return c.find(([kind]) => (k[kind] || 0) < (kind === 'water' ? 2 : 1)) || null;
}
function nudgeCheck(){
  if (!profile) return;
  const max = cc().nudges, now = new Date(), h = now.getHours() + now.getMinutes() / 60, dk = dayKey();
  if (nudgeSt.d !== dk){ nudgeSt = { d: dk, n: 0, last: 0, k: {} }; }
  if (!max || nudgeSt.n >= max || h < 8 || h >= 21) return;
  if (Date.now() - nudgeSt.last < Math.max(60, Math.floor(13 * 60 / max)) * 60000) return;
  const p = pickNudge(h); if (!p) return;
  chat.push({ r: 'assistant', t: p[1] }); chat = chat.slice(-60); store.set('plate.chat', chat);
  if ($('#coachDlg').open) renderChat(); else { unread++; store.set('plate.unread', unread); coachLabel(); }
  nudgeSt.n++; nudgeSt.last = Date.now(); nudgeSt.k[p[0]] = (nudgeSt.k[p[0]] || 0) + 1; store.set('plate.nudges', nudgeSt);
}
