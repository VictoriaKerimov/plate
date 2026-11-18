/* ---------- Themes: add a new one by copying a block ---------- */
const THEMES = {
  lavender: { name: 'Lavender',
    vars:  { bg:'#121212', s1:'#1b1b1d', s2:'#262628', line:'#363639', text:'#f0f0f2', muted:'#9a9aa2', accent:'#b7a2ff', accent2:'#d8cbff', on:'#1a1033', rp:'#ff9ec7', rc:'#ffd28a', rf:'#7fe0c3', m3:'#ff8a8a', water:'#8fb8ff', hr:'#ff9aae', hy:'#ffd60a', hg:'#8ce6b2' },
    light: { bg:'#f6f3ff', s1:'#ffffff', s2:'#efe9ff', line:'#ddd3f5', text:'#241b3d', muted:'#6d6490', accent:'#7a5cff', accent2:'#5b3fd1', on:'#ffffff', rp:'#e0568f', rc:'#d98a14', rf:'#1fa384', m3:'#d93b3b', water:'#3b7de0', hr:'#f4929e', hy:'#ffc400', hg:'#7ed8a4' } },
  blue: { name: 'Blue',
    vars:  { bg:'#121212', s1:'#1b1b1d', s2:'#262628', line:'#363639', text:'#f0f0f2', muted:'#9a9aa2', accent:'#6fa8ff', accent2:'#b9d3ff', on:'#0a1730', rp:'#ff9fb2', rc:'#ffd68a', rf:'#7fe6d0', m3:'#ff8a8a', water:'#66d9ef', hr:'#ff9aae', hy:'#ffd60a', hg:'#86e8c6' },
    light: { bg:'#f0f5ff', s1:'#ffffff', s2:'#e2ecff', line:'#cddcf5', text:'#0f2040', muted:'#5b7197', accent:'#2f6fe0', accent2:'#1f55b8', on:'#ffffff', rp:'#e0456b', rc:'#d98a0f', rf:'#14a58a', m3:'#d93b3b', water:'#0f9fc4', hr:'#f4929e', hy:'#ffc400', hg:'#76d8bc' } },
  plum: { name: 'Plum',
    vars:  { bg:'#121212', s1:'#1b1b1d', s2:'#262628', line:'#363639', text:'#f0f0f2', muted:'#9a9aa2', accent:'#e39bff', accent2:'#f3cfff', on:'#2a0f36', rp:'#ff9ab0', rc:'#ffc58f', rf:'#8ee0d6', m3:'#ff8a8a', water:'#8fb8ff', hr:'#ff9fb4', hy:'#ffd60a', hg:'#92e6b6' },
    light: { bg:'#fbf3ff', s1:'#ffffff', s2:'#f6e6ff', line:'#e8cdf5', text:'#2e1740', muted:'#7d5f92', accent:'#a63fd6', accent2:'#8a2bb8', on:'#ffffff', rp:'#e0456b', rc:'#d9802f', rf:'#1a9a8c', m3:'#d93b3b', water:'#3b7de0', hr:'#f593a8', hy:'#ffc400', hg:'#7ed8a4' } },
  moss: { name: 'Moss',
    vars:  { bg:'#121212', s1:'#1b1b1d', s2:'#262628', line:'#363639', text:'#f0f0f2', muted:'#9a9aa2', accent:'#9be3b5', accent2:'#cdf3da', on:'#0c2216', rp:'#ffd08a', rc:'#8fc4ff', rf:'#f5a3c7', m3:'#ff8a8a', water:'#7fd6e8', hr:'#ff9d90', hy:'#ffd60a', hg:'#a0eeb0' },
    light: { bg:'#f1f8f3', s1:'#ffffff', s2:'#e4f1e8', line:'#cfe3d6', text:'#14281c', muted:'#5d7a68', accent:'#23844b', accent2:'#1c6b3c', on:'#ffffff', rp:'#c77d0a', rc:'#2f7fd1', rf:'#d6457f', m3:'#d93b3b', water:'#1e9fb8', hr:'#f4968a', hy:'#ffc400', hg:'#86d8a0' } }
};
const SCHOOLS = {
  umd: { name: 'UMD', halls: [
    { id:'251-north',    name:'251 North' },
    { id:'south-campus', name:'South Campus' },
    { id:'the-y',        name:'Yahentamitsi (The Y)' }
  ] },
  uconn: { name: 'UConn', halls: [
    { id:'uconn-connecticut-hall', name:'Connecticut Hall' },
    { id:'uconn-gelfenbien',       name:'Gelfenbien (Towers)' },
    { id:'uconn-mcmahon',          name:'McMahon' },
    { id:'uconn-north',            name:'North' },
    { id:'uconn-northwest',        name:'Northwest' },
    { id:'uconn-putnam',           name:'Putnam' },
    { id:'uconn-south',            name:'South' },
    { id:'uconn-whitney',          name:'Whitney' }
  ] }
};
const HALLS = Object.entries(SCHOOLS).flatMap(([k, s]) => s.halls.map(h => ({ ...h, school: k })));
const schoolOf = p => !p ? 'umd' : (p.school !== undefined ? p.school : (p.askUMD === false ? '' : 'umd'));
const schoolName = id => { const h = HALLS.find(x => x.id === id); return h ? SCHOOLS[h.school].name : 'campus'; };
