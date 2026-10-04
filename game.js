const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d');
const $ = (selector) => document.querySelector(selector);
const TAU = Math.PI * 2;

const BUILDINGS = {
  workbench: { label: '工作桌', cost: { wood: 2, steel: 1 }, w: 2.0, d: 1.2, h: 1.1, color: '#8f6a47' },
  house: { label: '小屋', cost: { wood: 8, steel: 4, glass: 2, stone: 4 }, w: 3.8, d: 3.2, h: 2.8, color: '#a77b55' },
  wall: { label: '圍牆', cost: { wood: 3, steel: 1, stone: 2 }, w: 3.6, d: .3, h: 1.8, color: '#86725e' },
  lamp: { label: '燈具', cost: { steel: 2, screws: 3, glass: 1 }, w: .55, d: .55, h: 2.3, color: '#c69755' }
};
const MATERIAL_LABELS = { steel: '鋼材', wood: '木板', glass: '玻璃', screws: '螺絲', stone: '石塊' };
const DEFAULT_STATE = {
  inventory: { steel: 7, wood: 8, glass: 4, screws: 6, stone: 8 },
  weather: 'sunny', revival: 0, cleaned: [], placed: [], crouched: false,
  settings: { lookSensitivity: 1, cameraMotion: true, showHints: true }
};

let state = loadState();
let settings = { ...DEFAULT_STATE.settings, ...(state.settings || {}) };
let view = { w: innerWidth, h: innerHeight, dpr: Math.min(devicePixelRatio || 1, 2) };
let player = { x: 0, z: 13, angle: 0, pitch: 0, speed: 4.2 };
let keys = new Set();
let joystick = { active: false, id: null, value: { x: 0, y: 0 } };
let look = { active: false, id: null, x: 0, y: 0 };
let crouched = state.crouched || false;
let buildMode = false;
let selectedBuild = 'workbench';
let lastTime = performance.now();
let elapsed = 0;
let toastTimer = 0;

const salvage = [
  { id: 'car', name: '廢棄汽車', x: 7, z: -5, w: 4.2, d: 2.2, h: 1.2, color: '#554c47', drop: { steel: 3, glass: 1, screws: 2 } },
  { id: 'door', name: '破舊木門', x: -5.2, z: -3.1, w: 1.3, d: .35, h: 2.1, color: '#5b4636', drop: { wood: 3, screws: 1 } },
  { id: 'table', name: '舊木桌', x: 4, z: 4, w: 2.2, d: 1.1, h: 1.0, color: '#6d513d', drop: { wood: 3, screws: 1 } },
  { id: 'cabinet', name: '生鏽鐵櫃', x: 9, z: 4, w: 1.4, d: 1.2, h: 2.0, color: '#4b514e', drop: { steel: 2, screws: 2 } },
  { id: 'barrel', name: '鐵桶', x: -4, z: 4, w: 1.0, d: 1.0, h: 1.2, color: '#3f453d', drop: { steel: 2 } },
  { id: 'rubble', name: '碎石堆', x: 13, z: -1, w: 1.8, d: 1.2, h: .7, color: '#777263', drop: { stone: 4 } }
];
const world = {
  structures: [
    { name: '荒廢屋', x: -10, z: -8, w: 9.5, d: 6.6, h: 4.6, color: '#77766d', roof: '#393d3a' },
    { name: '遠方廢屋', x: 15, z: -15, w: 7, d: 5, h: 3.6, color: '#67655e', roof: '#343936' }
  ],
  trees: [{x:-18,z:-14},{x:18,z:11},{x:20,z:-13}],
  water: { x: 14, z: -7, w: 11, d: 6 },
  patches: []
};

function loadState() {
  const fresh = () => JSON.parse(JSON.stringify(DEFAULT_STATE));
  try { return { ...fresh(), ...JSON.parse(localStorage.getItem('wasteland-web-save') || '{}') }; }
  catch { return fresh(); }
}
function saveState() { localStorage.setItem('wasteland-web-save', JSON.stringify(state)); }
function resize() { view = { w: innerWidth, h: innerHeight, dpr: Math.min(devicePixelRatio || 1, 2) }; canvas.width = view.w * view.dpr; canvas.height = view.h * view.dpr; canvas.style.width = `${view.w}px`; canvas.style.height = `${view.h}px`; ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); }
function showMessage(text, seconds = 3) { if (!settings.showHints) return; $('#messageText').textContent = text; toastTimer = seconds; }
function weatherName() { return { sunny:'晴天', cloudy:'陰天', rain:'小雨' }[state.weather]; }
function weatherColors() { return { sunny:['#91a7a7','#d1c398'], cloudy:['#596d71','#9aa6a1'], rain:['#43565e','#899596'] }[state.weather]; }
function updateHUD() {
  const i = state.inventory;
  $('#inventoryText').textContent = `鋼材 ${i.steel} · 木板 ${i.wood} · 玻璃 ${i.glass} · 螺絲 ${i.screws} · 石塊 ${i.stone}`;
  $('#weatherPill').textContent = weatherName();
  $('#revivalPill').textContent = `復甦 ${state.revival}%`;
}
function costText(cost) { return Object.entries(cost).map(([key, value]) => `${MATERIAL_LABELS[key]} ${value}`).join(' · '); }
function canPay(cost) { return Object.entries(cost).every(([key, value]) => state.inventory[key] >= value); }
function pay(cost) { Object.entries(cost).forEach(([key, value]) => state.inventory[key] -= value); }
function addDrop(drop) { Object.entries(drop).forEach(([key, value]) => state.inventory[key] += value); }
function forward() { return { x: Math.sin(player.angle), z: -Math.cos(player.angle) }; }
function right() { return { x: Math.cos(player.angle), z: Math.sin(player.angle) }; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function worldToCamera(item) { const f = forward(), r = right(); const dx = item.x - player.x, dz = item.z - player.z; return { depth: dx * f.x + dz * f.z, side: dx * r.x + dz * r.z }; }
function project(item) { const cam = worldToCamera(item); if (cam.depth <= .25) return null; const focal = Math.min(view.w * .9, 900); const scale = focal / cam.depth; return { x: view.w / 2 + cam.side * scale, ground: view.h * .53 + player.pitch * 80 + scale * .23, scale, depth: cam.depth }; }
function visibleTarget() { const candidates = [...salvage.filter(o => !state.cleaned.includes(o.id)), ...state.placed.map((o, i) => ({ ...o, id: `placed-${i}`, name: BUILDINGS[o.kind]?.label || '建造物', type:'placed' }))]; let best = null; for (const item of candidates) { const p = project(item); if (!p || p.depth > 7) continue; const half = Math.max(14, (item.w * p.scale) / 2); if (Math.abs(p.x - view.w / 2) < half && (!best || p.depth < best.depth)) best = { ...item, depth: p.depth }; } return best; }

function drawWorld() {
  const [sky, horizon] = weatherColors();
  const g = ctx.createLinearGradient(0, 0, 0, view.h); g.addColorStop(0, sky); g.addColorStop(.54, horizon); g.addColorStop(.55, '#665f4f'); g.addColorStop(1, '#2f332d'); ctx.fillStyle = g; ctx.fillRect(0, 0, view.w, view.h);
  drawMountains();
  const sun = state.weather === 'sunny' ? .18 : .07; ctx.fillStyle = `rgba(255,239,177,${sun})`; ctx.beginPath(); ctx.arc(view.w * .78, view.h * .19, 50, 0, TAU); ctx.fill();
  drawGrassPlane();
  drawGroundTexture();
  drawWater();
  drawRoad();
  const items = [...world.structures, ...salvage.filter(o => !state.cleaned.includes(o.id)), ...state.placed];
  items.sort((a,b) => worldToCamera(b).depth - worldToCamera(a).depth);
  for (const item of items) drawItem(item);
  drawTrees(); drawPatches();
  if (state.weather === 'rain') drawRain();
  drawVignette();
}
function drawMountains() { const base=view.h*.48; const farOffset=Math.sin(player.angle)*view.w*.018; const nearOffset=Math.sin(player.angle)*view.w*.035; ctx.save(); ctx.translate(farOffset,0); ctx.fillStyle=state.weather==='cloudy'?'#47595a':'#53665f'; ctx.beginPath();ctx.moveTo(-80,base);ctx.lineTo(-80,base*.72);ctx.lineTo(view.w*.12,base*.46);ctx.lineTo(view.w*.25,base*.7);ctx.lineTo(view.w*.39,base*.38);ctx.lineTo(view.w*.55,base*.67);ctx.lineTo(view.w*.72,base*.43);ctx.lineTo(view.w*.9,base*.68);ctx.lineTo(view.w+80,base*.52);ctx.lineTo(view.w+80,base);ctx.closePath();ctx.fill();ctx.fillStyle='rgba(223,226,207,.18)';ctx.beginPath();ctx.moveTo(view.w*.12,base*.46);ctx.lineTo(view.w*.15,base*.55);ctx.lineTo(view.w*.2,base*.56);ctx.lineTo(view.w*.39,base*.38);ctx.lineTo(view.w*.43,base*.52);ctx.lineTo(view.w*.48,base*.54);ctx.lineTo(view.w*.72,base*.43);ctx.lineTo(view.w*.76,base*.55);ctx.closePath();ctx.fill();ctx.restore(); ctx.save();ctx.translate(nearOffset,0);ctx.fillStyle='rgba(44,66,57,.44)';ctx.beginPath();ctx.moveTo(-50,base*.92);ctx.lineTo(view.w*.18,base*.63);ctx.lineTo(view.w*.33,base*.82);ctx.lineTo(view.w*.56,base*.59);ctx.lineTo(view.w*.82,base*.82);ctx.lineTo(view.w+50,base*.64);ctx.lineTo(view.w+50,base);ctx.lineTo(-50,base);ctx.closePath();ctx.fill();ctx.restore(); }
function drawGrassPlane() { const horizon=view.h*.48; const grass=ctx.createLinearGradient(0,horizon,0,view.h); grass.addColorStop(0,'#789361'); grass.addColorStop(.25,'#648451'); grass.addColorStop(.6,'#4f713f'); grass.addColorStop(1,'#365b37'); ctx.fillStyle=grass; ctx.fillRect(0,horizon,view.w,view.h-horizon); const colors=['#466d3e','#507844','#5b8148','#668b4d','#739452','#3e663b','#7d9b58']; for(let i=0;i<1000;i++){ const n=(i*92821+173)%100000; const t=((i*7919)%1000)/1000; const y=horizon+Math.pow(t,1.55)*(view.h-horizon); const x=((n*37)%10000)/10000*view.w; const size=3+t*24; const w=size*(.7+((n%11)/20)); const h=Math.max(1,size*(.18+((n%7)/28))); ctx.fillStyle=colors[n%colors.length]; ctx.globalAlpha=.52+((n%7)/18); ctx.fillRect(x,y,w,h); if(i%5===0&&t>.32){ctx.strokeStyle='rgba(172,196,111,.55)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+w*.5,y);ctx.lineTo(x+w*.35,y-h*2.8);ctx.moveTo(x+w*.5,y);ctx.lineTo(x+w*.7,y-h*2.1);ctx.stroke();} } ctx.globalAlpha=1; }
function drawGroundTexture() { return; }
function projectGroundPoint(x,z) { return project({x,z,w:0,h:0}); }
function drawWater() { const q=world.water, points=[projectGroundPoint(q.x-q.w/2,q.z-q.d/2),projectGroundPoint(q.x+q.w/2,q.z-q.d/2),projectGroundPoint(q.x+q.w/2,q.z+q.d/2),projectGroundPoint(q.x-q.w/2,q.z+q.d/2)]; if(points.some(p=>!p))return; ctx.fillStyle=state.weather==='rain'?'rgba(83,132,145,.72)':'rgba(67,126,143,.78)'; ctx.beginPath(); points.forEach((p,i)=>i?ctx.lineTo(p.x,p.ground):ctx.moveTo(p.x,p.ground)); ctx.closePath(); ctx.fill(); ctx.strokeStyle='rgba(185,220,212,.42)'; ctx.lineWidth=1.5; for(let i=0;i<4;i++){const a=points[i],b=points[(i+1)%4];ctx.beginPath();ctx.moveTo(a.x,a.ground-5);ctx.lineTo(b.x,b.ground-5);ctx.stroke();} }
function drawRoad() { const y=view.h*.49; const top=view.w*.5; ctx.fillStyle='#777263'; ctx.beginPath(); ctx.moveTo(top-92,y); ctx.lineTo(top-46,y); ctx.lineTo(top-26,view.h); ctx.lineTo(top-285,view.h); ctx.closePath(); ctx.fill(); ctx.strokeStyle='rgba(30,35,30,.22)'; ctx.lineWidth=2; ctx.beginPath();ctx.moveTo(top-92,y);ctx.lineTo(top-285,view.h);ctx.moveTo(top-46,y);ctx.lineTo(top-26,view.h);ctx.stroke(); }
function drawItem(item) { const p=project(item); if(!p||p.x<-250||p.x>view.w+250)return; const w=item.w*p.scale,h=item.h*p.scale,x=p.x-w/2,y=p.ground-h; ctx.globalAlpha=item.type==='preview'?.5:1; ctx.fillStyle='rgba(20,28,20,.32)';ctx.beginPath();ctx.ellipse(p.x+p.scale*.12,p.ground+3,Math.max(6,w*.46),Math.max(2,w*.14),-.08,0,TAU);ctx.fill(); ctx.fillStyle=item.color||'#876b4b';ctx.fillRect(x,y,w,h);ctx.fillStyle='rgba(15,20,19,.34)';ctx.fillRect(x,y+h*.7,w,h*.3); drawMaterialDetail(item,x,y,w,h,p.scale); if(item.roof){ctx.fillStyle=item.roof;ctx.beginPath();ctx.moveTo(x-5,y);ctx.lineTo(p.x,y-h*.23);ctx.lineTo(x+w+5,y);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(25,25,20,.55)';ctx.lineWidth=Math.max(1,p.scale*.018);ctx.stroke();} if(item.kind==='lamp'){ctx.fillStyle='#ffe18f';ctx.globalAlpha=.9;ctx.beginPath();ctx.arc(p.x,y+h*.14,Math.max(3,p.scale*.08),0,TAU);ctx.fill();ctx.fillStyle='rgba(255,211,112,.12)';ctx.beginPath();ctx.arc(p.x,y+h*.14,p.scale*.65,0,TAU);ctx.fill();} ctx.globalAlpha=1; }
function drawMaterialDetail(item,x,y,w,h,scale) { const isRuin=item.name&&(/廢|破|鏽|舊/.test(item.name)); const isHouse=item.name&&/屋/.test(item.name); if(isRuin||isHouse){const rust=isHouse?'rgba(52,50,43,.32)':'rgba(142,73,43,.5)'; for(let i=0;i<Math.max(3,Math.floor(w/18));i++){const xx=x+(i*37%Math.max(10,w)); const yy=y+(i*19%Math.max(10,h)); ctx.fillStyle=rust;ctx.fillRect(xx,yy,Math.max(2,scale*.055),Math.max(5,h*.12));} ctx.strokeStyle='rgba(25,28,24,.5)';ctx.lineWidth=Math.max(1,scale*.014); for(let i=0;i<3;i++){const xx=x+w*(.2+i*.27);ctx.beginPath();ctx.moveTo(xx,y+h*.2);ctx.lineTo(xx-w*.05,y+h*(.45+i*.1));ctx.lineTo(xx+w*.03,y+h*.72);ctx.stroke();} if(isHouse){ctx.fillStyle='rgba(205,200,170,.25)';ctx.fillRect(x+w*.08,y+h*.12,w*.2,h*.18);ctx.fillRect(x+w*.64,y+h*.3,w*.16,h*.22);} } if(item.kind==='wall'){ctx.strokeStyle='rgba(34,31,25,.55)';ctx.lineWidth=Math.max(1,scale*.02);ctx.beginPath();ctx.moveTo(x+w*.3,y+h*.1);ctx.lineTo(x+w*.38,y+h*.5);ctx.lineTo(x+w*.26,y+h*.85);ctx.moveTo(x+w*.72,y+h*.18);ctx.lineTo(x+w*.62,y+h*.62);ctx.stroke();} }
function drawTrees() { for (const tree of world.trees) { const p = project({ ...tree, w: 1, h: 3.6 }); if (!p) continue; const h = 3.6 * p.scale, x = p.x, y = p.ground; ctx.fillStyle = '#3e3930'; ctx.fillRect(x - p.scale * .1, y - h * .55, p.scale * .2, h * .55); ctx.fillStyle = state.revival > 45 ? '#628453' : '#45483c'; ctx.beginPath(); ctx.arc(x, y - h * .65, h * .28, 0, TAU); ctx.arc(x - h * .17, y - h * .52, h * .2, 0, TAU); ctx.arc(x + h * .18, y - h * .5, h * .2, 0, TAU); ctx.fill(); } }
function drawPatches() { for (const patch of world.patches) { const p = project({ ...patch, w: .8, h: .7 }); if (!p) continue; const count = state.revival > 35 ? 7 : 4; for (let i=0;i<count;i++) { const xx = p.x + (i - count/2) * p.scale * .08; const yy = p.ground - p.scale * (.15 + (i%3)*.08); ctx.strokeStyle = i%3 === 0 && state.revival > 25 ? '#d7a4ba' : '#81ad69'; ctx.lineWidth = Math.max(1, p.scale * .018); ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + p.scale*.03, yy-p.scale*(.12+(i%2)*.08)); ctx.stroke(); } } }
function drawRain() { ctx.strokeStyle = 'rgba(209,229,231,.25)'; ctx.lineWidth = 1; for (let i=0;i<90;i++) { const x = (i*83 + elapsed*170) % view.w, y = (i*47 + elapsed*280) % view.h; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-4,y+14); ctx.stroke(); } }
function drawVignette() { const v = ctx.createRadialGradient(view.w/2,view.h*.48,view.h*.12,view.w/2,view.h*.5,view.w*.72); v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(8,13,13,.46)'); ctx.fillStyle=v; ctx.fillRect(0,0,view.w,view.h); }
function drawFirstPersonPresence() { const moving=Math.hypot(joystick.value.x,joystick.value.y)>.08||['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].some(k=>keys.has(k)); const bob=settings.cameraMotion&&moving?Math.sin(elapsed*9)*3:0; const base=view.h+4; ctx.save(); ctx.translate(0,bob); const grassCount=Math.max(24,Math.floor(view.w/18)); for(let i=0;i<grassCount;i++){const x=(i*83+29)%view.w;const h=12+(i%7)*4;ctx.strokeStyle=i%3===0?'rgba(154,190,104,.88)':'rgba(68,105,57,.85)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,base);ctx.quadraticCurveTo(x-5,base-h*.55,x-2,base-h);ctx.moveTo(x+4,base);ctx.quadraticCurveTo(x+8,base-h*.45,x+6,base-h*.82);ctx.stroke();} const armY=view.h*.86; ctx.fillStyle='#4b554a'; ctx.beginPath();ctx.moveTo(view.w*.26,view.h);ctx.lineTo(view.w*.37,armY);ctx.lineTo(view.w*.44,view.h);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(view.w*.74,view.h);ctx.lineTo(view.w*.63,armY);ctx.lineTo(view.w*.56,view.h);ctx.closePath();ctx.fill(); ctx.fillStyle='#c28e68';ctx.beginPath();ctx.ellipse(view.w*.405,armY+4,view.w*.045,view.h*.045,-.18,0,TAU);ctx.ellipse(view.w*.595,armY+4,view.w*.045,view.h*.045,.18,0,TAU);ctx.fill(); ctx.strokeStyle='#9aa095';ctx.lineWidth=Math.max(4,view.w*.006);ctx.beginPath();ctx.moveTo(view.w*.58,armY+8);ctx.lineTo(view.w*.67,view.h*.71);ctx.stroke();ctx.strokeStyle='#d0ad72';ctx.lineWidth=Math.max(2,view.w*.003);ctx.beginPath();ctx.moveTo(view.w*.67,view.h*.71);ctx.lineTo(view.w*.7,view.h*.67);ctx.stroke();ctx.restore(); }

function render() { drawWorld(); const target = visibleTarget(); $('#interactionPrompt').textContent = buildMode ? `建造預覽：${BUILDINGS[selectedBuild].label}` : target ? `點「互動」拆解：${target.name}` : ''; if (buildMode) { const f = forward(); const b = BUILDINGS[selectedBuild]; drawItem({ ...b, type:'preview', x: player.x + f.x*4, z: player.z + f.z*4, roof: selectedBuild === 'house' ? '#6d4c3c' : undefined }); } drawFirstPersonPresence(); }
function blockedAt(x,z) { const blockers=[...world.structures,...salvage.filter(o=>!state.cleaned.includes(o.id)),...state.placed]; for(const item of blockers){ const pad=.42; if(Math.abs(x-item.x)<item.w/2+pad && Math.abs(z-item.z)<item.d/2+pad)return true; } const water=world.water; if(Math.abs(x-water.x)<water.w/2-.35 && Math.abs(z-water.z)<water.d/2-.35)return true; return false; }
function move(dt) { let x=0,y=0; if (keys.has('w')||keys.has('arrowup')) y -= 1; if (keys.has('s')||keys.has('arrowdown')) y += 1; if (keys.has('a')||keys.has('arrowleft')) x -= 1; if (keys.has('d')||keys.has('arrowright')) x += 1; if (Math.hypot(joystick.value.x,joystick.value.y)>.08) { x=joystick.value.x; y=joystick.value.y; } const len=Math.hypot(x,y)||1; const speed = crouched ? 2.3 : player.speed; const nextX=player.x+(x/len)*speed*dt, nextZ=player.z+(y/len)*speed*dt; if(!blockedAt(nextX,player.z))player.x=nextX; if(!blockedAt(player.x,nextZ))player.z=nextZ; player.x = Math.max(-24,Math.min(24,player.x)); player.z = Math.max(-22,Math.min(20,player.z)); }
function interact() { if (buildMode) return; const target = visibleTarget(); if (!target || target.type === 'placed') { showMessage('眼前沒有需要整理的物件；慢慢走走也很好。'); return; } state.cleaned.push(target.id); addDrop(target.drop); state.revival = Math.min(100, state.revival + 10); world.patches.push({ x: target.x, z: target.z }); saveState(); updateHUD(); showMessage(`已拆解「${target.name}」，這裡開始長出新綠。`); }
function placeBuild() { const b = BUILDINGS[selectedBuild]; if (!canPay(b.cost)) { showMessage(`材料不足：${b.label}需要 ${costText(b.cost)}。`); return; } const f = forward(); state.placed.push({ kind:selectedBuild, x:player.x+f.x*4, z:player.z+f.z*4, w:b.w, d:b.d, h:b.h, color:b.color, rotation:player.angle }); pay(b.cost); state.revival = Math.min(100,state.revival+3); saveState(); updateHUD(); showMessage(`已放置「${b.label}」，你的小鎮正在慢慢成形。`); }
function setWeather(weather) { state.weather = weather; saveState(); updateHUD(); $('#weatherMenu').classList.add('hidden'); showMessage(`天氣切換為${weatherName()}，只改變氛圍，不會造成傷害。`); }
function openBuild() { buildMode = true; $('#buildMenu').classList.remove('hidden'); renderBuildOptions(); }
function closeBuild() { buildMode = false; $('#buildMenu').classList.add('hidden'); }
function renderBuildOptions() { $('#buildOptions').innerHTML = Object.entries(BUILDINGS).map(([key,b]) => `<button class="${key===selectedBuild?'selected':''}" data-build="${key}"><strong>${b.label}</strong><span>${costText(b.cost)}</span></button>`).join(''); $('#buildHint').textContent = `${BUILDINGS[selectedBuild].label}｜${costText(BUILDINGS[selectedBuild].cost)}`; document.querySelectorAll('[data-build]').forEach(btn=>btn.addEventListener('click',()=>{selectedBuild=btn.dataset.build;renderBuildOptions();})); }
function setCrouch() { crouched=!crouched; state.crouched=crouched; $('#crouchButton').textContent=crouched?'起身':'蹲下'; saveState(); showMessage(crouched?'已蹲下，慢慢觀察草地。':'已起身。'); }

function bindTouch() {
  const joy = $('#joystick'), knob = $('#joystickKnob'); const setJoy = (event) => { const r=joy.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2; const dx=event.clientX-cx, dy=event.clientY-cy, max=r.width*.36; const mag=Math.hypot(dx,dy)||1; const nx=Math.abs(dx)>max?dx/mag*max:dx, ny=Math.abs(dy)>max?dy/mag*max:dy; joystick.value={x:nx/max,y:ny/max}; knob.style.transform=`translate(calc(-50% + ${nx}px),calc(-50% + ${ny}px))`; };
  const resetJoy=()=>{joystick.active=false;joystick.id=null;joystick.value={x:0,y:0};knob.style.transform='translate(-50%,-50%)';};
  joy.addEventListener('pointerdown',e=>{joystick.active=true;joystick.id=e.pointerId;joy.setPointerCapture(e.pointerId);setJoy(e);}); joy.addEventListener('pointermove',e=>{if(joystick.active&&e.pointerId===joystick.id)setJoy(e);}); joy.addEventListener('pointerup',resetJoy); joy.addEventListener('pointercancel',resetJoy);
  const pad=$('#lookPad'); pad.addEventListener('pointerdown',e=>{look.active=true;look.id=e.pointerId;look.x=e.clientX;look.y=e.clientY;pad.setPointerCapture(e.pointerId);}); pad.addEventListener('pointermove',e=>{if(!look.active||e.pointerId!==look.id)return; player.angle+=(e.clientX-look.x)*.006*settings.lookSensitivity; player.pitch=Math.max(-.4,Math.min(.4,player.pitch+(e.clientY-look.y)*.003*settings.lookSensitivity)); look.x=e.clientX;look.y=e.clientY;}); const endLook=()=>{look.active=false;look.id=null;}; pad.addEventListener('pointerup',endLook); pad.addEventListener('pointercancel',endLook);
  $('#interactButton').addEventListener('click',interact); $('#buildButton').addEventListener('click',openBuild); $('#crouchButton').addEventListener('click',setCrouch); $('#weatherButton').addEventListener('click',()=>$('#weatherMenu').classList.toggle('hidden')); $('#closeBuild').addEventListener('click',closeBuild); $('#closeWeather').addEventListener('click',()=>$('#weatherMenu').classList.add('hidden')); $('#placeButton').addEventListener('click',placeBuild); document.querySelectorAll('[data-weather]').forEach(btn=>btn.addEventListener('click',()=>setWeather(btn.dataset.weather)));
  $('#settingsButton').addEventListener('click',()=>{ $('#settingsMenu').classList.remove('hidden'); $('#lookSensitivity').value=settings.lookSensitivity; $('#cameraMotion').checked=settings.cameraMotion; $('#showHints').checked=settings.showHints; }); $('#closeSettings').addEventListener('click',()=>$('#settingsMenu').classList.add('hidden')); $('#hintToggle').addEventListener('click',()=>{const card=$('#hintCard');card.classList.toggle('collapsed');$('#hintToggle').textContent=card.classList.contains('collapsed')?'提示詞⌄':'提示詞⌃';}); $('#lookSensitivity').addEventListener('input',e=>{settings.lookSensitivity=Number(e.target.value);state.settings=settings;saveState();}); $('#cameraMotion').addEventListener('change',e=>{settings.cameraMotion=e.target.checked;state.settings=settings;saveState();}); $('#showHints').addEventListener('change',e=>{settings.showHints=e.target.checked;state.settings=settings;saveState();$('#hintCard').classList.toggle('hidden',!settings.showHints);}); $('#resetSave').addEventListener('click',()=>{if(confirm('確定要重設本機進度嗎？')){localStorage.removeItem('wasteland-web-save');location.reload();}});
}
function bindKeyboard() { addEventListener('keydown',e=>{keys.add(e.key.toLowerCase()); if(e.key==='e')interact(); if(e.key==='b')openBuild(); if(e.key==='Escape'){closeBuild();$('#weatherMenu').classList.add('hidden');}}); addEventListener('keyup',e=>keys.delete(e.key.toLowerCase())); canvas.addEventListener('click',()=>{if(buildMode)placeBuild();}); }
function loop(now) { const dt=Math.min(.05,(now-lastTime)/1000); lastTime=now; elapsed+=dt; if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('#messageText').textContent='這裡可以慢慢整理。滑動右側看風景。';} move(dt); render(); requestAnimationFrame(loop); }

addEventListener('resize',resize); resize(); bindTouch(); bindKeyboard(); crouched=!!state.crouched; $('#hintCard').classList.toggle('hidden',!settings.showHints); updateHUD();
$('#startButton').addEventListener('click',()=>{$('#startScreen').classList.add('hidden');showMessage('沿著小路走走，先看看這座安靜的小鎮。',4);});
if (new URLSearchParams(location.search).has('demo')) $('#startScreen').classList.add('hidden');
requestAnimationFrame(loop);
