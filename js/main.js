/* ---------- Start ---------- */
(function init(){
  fillWhere();
  const h = new Date().getHours();
  $('#meal').value = h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 21 ? 'Dinner' : 'Snack';
  if (!profile){ applyTheme('lavender'); openSettings(); }
  else { applyTheme(profile.theme, profile.light); render(); }
})();
renderLimit(); nudgeCheck(); setInterval(nudgeCheck, 600000);
document.addEventListener('visibilitychange', () => { if (!document.hidden){ renderLimit(); nudgeCheck(); } });
