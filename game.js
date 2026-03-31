// Colony Builder 3D — Three.js renderer
// ============================================================
// Constants
// ============================================================
const TILE = 40;
const COLS = 40;
const ROWS = 30;
const T = { GRASS:0, FOREST:1, STONE:2, WATER:3, DIRT:4 };

const BUILDINGS = {
  house:      { name:'House',      icon:'🏠', cost:{wood:5,stone:3}, housing:3,  size:1, maxHp:100 },
  farm:       { name:'Farm',       icon:'🌾', cost:{wood:4},          produces:'food',  rate:0.05, size:2, maxHp:60 },
  woodcutter: { name:'Woodcutter', icon:'🪓', cost:{wood:3},          produces:'wood',  rate:0.04, size:1, maxHp:60 },
  quarry:     { name:'Quarry',     icon:'⛏',  cost:{wood:5},          produces:'stone', rate:0.03, size:1, maxHp:80 },
  storehouse: { name:'Storehouse', icon:'📦', cost:{wood:6,stone:4},  storage:200,      size:1, maxHp:80 },
  wall:       { name:'Wall',       icon:'🧱', cost:{stone:2},          isBarrier:true,   size:1, maxHp:300 },
  tower:      { name:'Tower',      icon:'🗼', cost:{wood:4,stone:8},  attackRange:5, attackDamage:12, attackRate:80, size:1, maxHp:150 },
  barracks:   { name:'Barracks',   icon:'⚔',  cost:{wood:6,stone:4},                    size:1, maxHp:120 },
};

const COLONIST_NAMES = ['Aldric','Berta','Cormac','Dagmar','Edwyn','Freya','Godwin','Hilda','Ivar','Judith','Kelda','Leofric','Marta','Nolan','Oswin','Petra','Rowan','Sigrid','Tobias','Ulf','Vilda','Wulfric','Yrsa','Zora'];
const SEASON_NAMES  = ['Spring','Summer','Autumn','Winter'];
const SEASON_COLORS = ['#4a9a4a','#3a8a3a','#b06020','#b0c8d8'];
const FOOD_SEASON_MULT = [1.0,1.2,0.8,0.4];

const TRAITS = {
  swift:      { label:'Swift',       desc:'+35% move speed',        color:'#60d0ff' },
  strong:     { label:'Strong',      desc:'+50% build/chop speed',  color:'#ff9040' },
  green_thumb:{ label:'Green Thumb', desc:'+50% farm yield',        color:'#60d840' },
  brave:      { label:'Brave',       desc:'+40% HP, fights back',   color:'#ffd040' },
  hungry:     { label:'Hungry',      desc:'Eats 2× food',           color:'#ff6060' },
  lucky:      { label:'Lucky',       desc:'Chance bonus resources', color:'#d060ff' },
};
const TRAIT_KEYS=Object.keys(TRAITS);

const EVENTS = [
  { id:'trader',    title:'Merchant Caravan',   body:'A trader offers goods.',
    color:'#c8a84a', choices:[
      { label:'Buy food (10 wood)',   fn:s=>{ if(s.resources.wood>=10){s.resources.wood-=10;s.resources.food+=30;return'Traded 10 wood for 30 food.';}return'Not enough wood.';} },
      { label:'Buy stone (10 wood)',  fn:s=>{ if(s.resources.wood>=10){s.resources.wood-=10;s.resources.stone+=20;return'Traded 10 wood for 20 stone.';}return'Not enough wood.';} },
      { label:'Send them away',       fn:s=>'The merchant moves on.' },
    ]},
  { id:'wanderers', title:'Wandering Family',   body:'A family arrives seeking shelter.',
    color:'#60d0a0', choices:[
      { label:'Welcome them',  fn:s=>{ for(let i=0;i<2;i++)spawnColonist();return'2 new colonists joined!';} },
      { label:'Turn them away',fn:s=>'They move on reluctantly.' },
    ]},
  { id:'winter',    title:'Harsh Winter',       body:'A bitter frost grips the land. Food stores dwindle faster.',
    color:'#90c0e0', choices:[
      { label:'Ration food',  fn:s=>{ s._harshWinter=120;return'Food consumption doubled for 24 days.';} },
      { label:'Push through', fn:s=>{ s._harshWinter=120;return'The cold will be hard on everyone.';} },
    ]},
  { id:'harvest',   title:'Bumper Harvest',     body:'Exceptional growing conditions bless your farms!',
    color:'#c0d040', choices:[
      { label:'Celebrate!',   fn:s=>{ s.resources.food+=50;return'+50 food from the harvest bounty!';} },
    ]},
  { id:'wolves',    title:'Wolf Pack',          body:'A pack of wolves has been spotted near the settlement!',
    color:'#e06030', choices:[
      { label:'Organize a hunt', fn:s=>{ const wolves=2+Math.floor(s.day/20); for(let i=0;i<wolves;i++) s.raiders.push({id:Date.now()+i,x:(Math.random()<0.5?1:COLS-2)*TILE,y:Math.floor(Math.random()*ROWS)*TILE,hp:15,maxHp:15,attackCooldown:0,blinkTimer:0,_wolf:true,path:[],pathGoal:null,pathCooldown:0,_wallTarget:null}); soundRaidAlarm(); return`${wolves} wolves attacking!`;} },
      { label:'Reinforce walls', fn:s=>{ s.nextRaidIn+=200;return'Wolves kept at bay for now.';} },
    ]},
  { id:'sickness',  title:'Illness Spreads',    body:'A sickness moves through the settlement.',
    color:'#90a840', choices:[
      { label:'Quarantine',   fn:s=>{ const c=s.colonists[Math.floor(Math.random()*s.colonists.length)];if(c){c.hp=Math.max(1,Math.round(c.hp*0.4));return`${c.name} is gravely ill (HP: ${c.hp}).`;}return'No one fell ill.';} },
      { label:'Pray',         fn:s=>{ const c=s.colonists[Math.floor(Math.random()*s.colonists.length)];if(c){c.hp=Math.max(1,Math.round(c.hp*0.6));return`${c.name} is weakened.`;}return'Everyone survives.';} },
    ]},
];
let _pendingEvent=null;

// ============================================================
// State
// ============================================================
let state = {
  resources:{wood:20,stone:10,food:30},
  population:0, housing:0,
  day:1, tick:0, seasonTick:0, season:0,
  tiles:[], buildings:[], colonists:[], raiders:[],
  floats:[], particles:[],
  nextRaidIn:900,
  usedNames:[],
  placing:null, selectedTile:null, selectedColonist:null, hoverTile:null,
  gameOver:false, wonShown:false,
  camTarget:{x:COLS/2, z:ROWS/2}, camZoom:18,
  isDragging:false, dragStart:null,
  timeOfDay:0,
  _harshWinter:0,
};

// ============================================================
// Map generation
// ============================================================
function generateMap() {
  const tiles=[];
  for (let r=0;r<ROWS;r++) {
    tiles[r]=[];
    for (let c=0;c<COLS;c++) {
      const nx=c/COLS, ny=r/ROWS;
      const v=Math.sin(nx*7.3+1.2)*Math.cos(ny*5.1+0.8)
             +Math.sin(nx*13.7-0.5)*Math.sin(ny*11.3+2.1)*0.5
             +Math.cos(nx*3.1+ny*4.7)*0.3;
      let type;
      if      (v>0.7)  type=T.STONE;
      else if (v>0.2)  type=T.FOREST;
      else if (v<-0.8) type=T.WATER;
      else             type=T.GRASS;
      tiles[r][c]={
        type,
        resource: type===T.FOREST ? 8+Math.floor(Math.random()*5)
                : type===T.STONE  ? 6+Math.floor(Math.random()*4) : 0,
        building:null,
      };
    }
  }
  const cr=Math.floor(ROWS/2), cc=Math.floor(COLS/2);
  for (let dr=-3;dr<=3;dr++)
    for (let dc=-4;dc<=4;dc++) {
      const t=tiles[cr+dr]?.[cc+dc];
      if (t&&t.type!==T.WATER){t.type=T.GRASS;t.resource=0;}
    }
  state.tiles=tiles;
}

// ============================================================
// Colonist
// ============================================================
function pickName() {
  const unused=COLONIST_NAMES.filter(n=>!state.usedNames.includes(n));
  const pool=unused.length>0?unused:COLONIST_NAMES;
  const name=pool[Math.floor(Math.random()*pool.length)];
  state.usedNames.push(name); return name;
}

function spawnColonist() {
  const cr=Math.floor(ROWS/2), cc=Math.floor(COLS/2);
  state.colonists.push({
    id:state.colonists.length, name:pickName(),
    x:cc*TILE+TILE/2+(Math.random()-0.5)*40,
    y:cr*TILE+TILE/2+(Math.random()-0.5)*40,
    job:null, hunger:100, hp:30, maxHp:30, starving:0,
    color:`hsl(${Math.floor(Math.random()*360)},60%,70%)`,
    blinkTimer:0, fleeing:false,
    path:[], pathTarget:null, pathCooldown:0, attackCooldown:0,
  });
  // Assign 1-2 random traits (no duplicates)
  const c=state.colonists[state.colonists.length-1];
  const numTraits=Math.random()<0.3?2:1;
  c.traits=[];
  const pool=[...TRAIT_KEYS];
  for(let i=0;i<numTraits;i++){
    const idx=Math.floor(Math.random()*pool.length);
    c.traits.push(pool.splice(idx,1)[0]);
  }
  if(c.traits.includes('brave'))c.maxHp=Math.round(c.maxHp*1.4),c.hp=c.maxHp;
  state.population++;
  updateResourceUI();
}

function assignJobs() {
  const prod=new Set(['farm','woodcutter','quarry','barracks']);
  const unassigned=state.colonists.filter(c=>c.job===null);
  // Priority 1: construction sites need builders (up to 3 per site)
  const constructing=state.buildings.filter(b=>b.constructing&&b.workers<3);
  unassigned.forEach(c=>{
    const b=constructing.find(b=>b.workers<3);
    if(b){c.job=b.id;b.workers++;log(`🔨 ${c.name} → build ${BUILDINGS[b.type].name}`);return;}
  });
  // Priority 2: production buildings
  const stillFree=state.colonists.filter(c=>c.job===null);
  const needsWorker=state.buildings.filter(b=>prod.has(b.type)&&!b.constructing&&b.workers<2&&b.hp>0);
  stillFree.forEach(c=>{
    const b=needsWorker.find(b=>b.workers<2);
    if(b){c.job=b.id;b.workers++;log(`${c.name} assigned to ${BUILDINGS[b.type].name}`);}
  });
}

// ============================================================
// Raiders & combat
// ============================================================
function addFloat(wx,wz,text,color) {
  state.floats.push({wx,wz,wy:1.5,text,life:70,maxLife:70,color:color||'#fff'});
}

function spawnRaid() {
  const size=1+Math.floor(state.day/15);
  log(`⚔ Raiders approaching! (${size} attackers)`);
  soundRaidAlarm();
  for(let i=0;i<size;i++){
    const edge=Math.floor(Math.random()*4);
    let r,c;
    if(edge===0){r=0;c=Math.floor(Math.random()*COLS);}
    else if(edge===1){r=ROWS-1;c=Math.floor(Math.random()*COLS);}
    else if(edge===2){r=Math.floor(Math.random()*ROWS);c=0;}
    else{r=Math.floor(Math.random()*ROWS);c=COLS-1;}
    state.raiders.push({
      id:Date.now()+i,
      x:c*TILE+TILE/2, y:r*TILE+TILE/2,
      hp:30+Math.floor(state.day/5)*5,
      maxHp:30+Math.floor(state.day/5)*5,
      attackCooldown:0, blinkTimer:Math.floor(Math.random()*60),
      path:[],pathGoal:null,pathCooldown:0,_wallTarget:null,
    });
  }
}

function updateRaiders() {
  state.nextRaidIn--;
  if(state.nextRaidIn<=0){spawnRaid();state.nextRaidIn=Math.max(500,1400-state.day*10);}
  state.raiders.forEach(raider=>{
    raider.blinkTimer=(raider.blinkTimer+1)%60;
    if(raider.attackCooldown>0){raider.attackCooldown--;return;}
    // Find nearest non-wall target (colonist or building)
    let nd=Infinity,nx=null,ny=null,nc=null,nb=null;
    state.colonists.forEach(c=>{
      const dx=c.x-raider.x,dy=c.y-raider.y,d=Math.sqrt(dx*dx+dy*dy);
      if(d<nd){nd=d;nx=c.x;ny=c.y;nc=c;nb=null;}
    });
    state.buildings.filter(b=>b.type!=='wall'&&b.hp>0).forEach(b=>{
      const bx=(b.c+0.5)*TILE,by=(b.r+0.5)*TILE;
      const dx=bx-raider.x,dy=by-raider.y,d=Math.sqrt(dx*dx+dy*dy);
      if(d<nd){nd=d;nx=bx;ny=by;nc=null;nb=b;}
    });
    if(nx===null)return;
    const attackRange=TILE*0.9;
    if(nd>attackRange){
      const goalR=Math.max(0,Math.min(ROWS-1,Math.floor(ny/TILE)));
      const goalC=Math.max(0,Math.min(COLS-1,Math.floor(nx/TILE)));
      const curR=Math.max(0,Math.min(ROWS-1,Math.floor(raider.y/TILE)));
      const curC=Math.max(0,Math.min(COLS-1,Math.floor(raider.x/TILE)));
      // Ensure path fields exist (for raiders created before this update)
      if(!raider.path)raider.path=[];
      if(!raider.pathCooldown)raider.pathCooldown=0;
      // Recompute path when goal changes, path empty, or cooldown elapsed
      const goalChanged=!raider.pathGoal||raider.pathGoal.r!==goalR||raider.pathGoal.c!==goalC;
      if(goalChanged||raider.path.length===0||raider.pathCooldown<=0){
        raider.path=astar(curR,curC,goalR,goalC)||[];
        raider.pathGoal={r:goalR,c:goalC};
        raider.pathCooldown=18;
        // If A* returns no path (completely walled off), find nearest wall to attack
        if(raider.path.length===0&&(curR!==goalR||curC!==goalC)){
          let nw=null,nwd=Infinity;
          state.buildings.filter(b=>b.type==='wall'&&b.hp>0).forEach(b=>{
            const bx=(b.c+0.5)*TILE,by=(b.r+0.5)*TILE;
            const dx=bx-raider.x,dy=by-raider.y,d=Math.sqrt(dx*dx+dy*dy);
            if(d<nwd){nwd=d;nw=b;}
          });
          raider._wallTarget=nw;
        } else {
          raider._wallTarget=null;
        }
      }
      if(raider.pathCooldown>0)raider.pathCooldown--;
      // Mode 1: punch through wall
      if(raider._wallTarget&&raider._wallTarget.hp>0){
        const wbx=(raider._wallTarget.c+0.5)*TILE,wby=(raider._wallTarget.r+0.5)*TILE;
        const dx=wbx-raider.x,dy=wby-raider.y,dist=Math.sqrt(dx*dx+dy*dy);
        if(dist>attackRange){
          raider.x+=(dx/dist)*0.7;raider.y+=(dy/dist)*0.7;
        } else {
          raider.attackCooldown=60;
          raider._wallTarget.hp-=15;
          addFloat(wbx/TILE,wby/TILE,'-15','#ff6644');
          soundHit();
          if(raider._wallTarget.hp<=0){
            log('⚠ Wall section breached!');
            raider._wallTarget.hp=0;rebuildBuildingMesh(raider._wallTarget.id);
            raider._wallTarget=null;raider.path=[];raider.pathCooldown=0;
          }
        }
      // Mode 2: follow A* path around walls
      } else if(raider.path.length>0){
        const next=raider.path[0];
        const tx=(next.c+0.5)*TILE,ty=(next.r+0.5)*TILE;
        const dx=tx-raider.x,dy=ty-raider.y,dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<3)raider.path.shift();
        else{raider.x+=(dx/dist)*0.7;raider.y+=(dy/dist)*0.7;}
      // Mode 3: direct movement (no walls in the way)
      } else {
        const dx=nx-raider.x,dy=ny-raider.y,dist=Math.sqrt(dx*dx+dy*dy);
        if(dist>0.1){raider.x+=(dx/dist)*0.7;raider.y+=(dy/dist)*0.7;}
      }
    } else {
      raider.attackCooldown=60;
      if(nc){
        nc.hp-=10;addFloat(nc.x/TILE,nc.y/TILE,'-10','#ff4444');soundHit();
        if(nc.hp<=0)killColonist(nc.id);
      } else if(nb){
        nb.hp-=15;addFloat(nx/TILE,ny/TILE,'-15','#ff6644');soundHit();
        if(nb.hp<=0){log(`⚠ ${BUILDINGS[nb.type].name} destroyed!`);nb.hp=0;rebuildBuildingMesh(nb.id);}
      }
    }
  });
}

function killColonist(id) {
  const idx=state.colonists.findIndex(c=>c.id===id);
  if(idx===-1)return;
  const c=state.colonists[idx];
  if(c.job!==null){const b=state.buildings[c.job];if(b)b.workers=Math.max(0,b.workers-1);}
  log(`💀 ${c.name} has died`);soundColonistDie();
  const mesh=colonistMeshes.get(id);
  if(mesh){unitGroup.remove(mesh);colonistMeshes.delete(id);}
  state.colonists.splice(idx,1);
  state.population--;
  updateResourceUI();
}

const ASSIGNABLE=new Set(['farm','woodcutter','quarry','barracks']);
const MAX_WORKERS=2;

function assignColonistToBuilding(colonistId,buildingId) {
  const c=state.colonists.find(col=>col.id===colonistId);
  if(!c)return;
  if(c.job!==null){const old=state.buildings[c.job];if(old)old.workers=Math.max(0,old.workers-1);}
  if(buildingId===null){
    c.job=null;c.path=[];c.pathTarget=null;log(`${c.name} unassigned`);
  } else {
    const b=state.buildings[buildingId];
    if(!b||b.hp<=0){log('That building is destroyed');return;}
    c.job=buildingId;b.workers++;c.path=[];c.pathTarget=null;
    const action=b.constructing?'build':'work at';
    log(`${c.name} → ${action} ${BUILDINGS[b.type].name}`);
  }
}

function showColonistInfo(c) {
  const b=c.job!==null?state.buildings[c.job]:null;
  let jobName='Unassigned';
  if(b){
    if(b.constructing)jobName=`Building ${BUILDINGS[b.type].name}`;
    else jobName=BUILDINGS[b.type].name;
  }
  let html=`<b>${c.name}</b>${b?.type==='barracks'?' ⚔':''}<br>`+
    `Job: ${jobName}<br>Hunger: ${Math.floor(c.hunger)}/100<br>HP: ${c.hp}/${c.maxHp}<br><br>`+
    `<span style="color:#7ec8e3">Click a work building<br>to assign, or open<br>ground to unassign.</span>`;
  if(c.traits?.length){
    const traitHtml=c.traits.map(t=>`<span style="color:${TRAITS[t].color};font-size:10px;background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;margin-right:3px">${TRAITS[t].label}</span>`).join('');
    html+=`<br><div style="margin-top:4px">${traitHtml}</div>`;
  }
  document.getElementById('info-content').innerHTML=html;
}

function updateTowers() {
  state.buildings.filter(b=>b.type==='tower'&&b.hp>0).forEach(b=>{
    if(!b.attackTimer)b.attackTimer=0;
    b.attackTimer++;
    const def=BUILDINGS.tower;
    if(b.attackTimer<def.attackRate)return;
    b.attackTimer=0;
    const bx=(b.c+0.5)*TILE,by=(b.r+0.5)*TILE,range=def.attackRange*TILE;
    let target=null,bestDist=range;
    state.raiders.forEach(r=>{
      const dx=r.x-bx,dy=r.y-by,d=Math.sqrt(dx*dx+dy*dy);
      if(d<bestDist){bestDist=d;target=r;}
    });
    if(target){
      target.hp-=def.attackDamage;
      addFloat(target.x/TILE,target.y/TILE,`-${def.attackDamage}`,'#ffdd44');
      if(target.hp<=0){
        const m=raiderMeshes.get(target.id);
        if(m){unitGroup.remove(m);raiderMeshes.delete(target.id);}
        state.raiders=state.raiders.filter(r=>r.id!==target.id);
        log('⚔ Raider slain by tower');
      }
    }
  });
}

// ============================================================
// A* Pathfinding
// ============================================================
function astar(startR,startC,goalR,goalC) {
  if(startR===goalR&&startC===goalC)return[];
  function passable(r,c){
    if(r<0||r>=ROWS||c<0||c>=COLS)return false;
    const tile=state.tiles[r][c];
    if(tile.type===T.WATER)return false;
    if(tile.building!==null){const b=state.buildings[tile.building];if(b&&BUILDINGS[b.type].isBarrier&&b.hp>0)return false;}
    return true;
  }
  const key=(r,c)=>r*COLS+c, h=(r,c)=>Math.abs(r-goalR)+Math.abs(c-goalC);
  const open=new Map(),closed=new Set();
  open.set(key(startR,startC),{r:startR,c:startC,g:0,f:h(startR,startC),parent:null});
  const DIRS=[[-1,0],[1,0],[0,-1],[0,1]];
  let iters=0;
  while(open.size>0&&iters++<800){
    let cur=null;
    for(const node of open.values())if(!cur||node.f<cur.f)cur=node;
    if(cur.r===goalR&&cur.c===goalC){
      const path=[];let n=cur;while(n){path.push({r:n.r,c:n.c});n=n.parent;}return path.reverse();
    }
    open.delete(key(cur.r,cur.c));closed.add(key(cur.r,cur.c));
    for(const[dr,dc]of DIRS){
      const nr=cur.r+dr,nc=cur.c+dc;
      if(!passable(nr,nc))continue;
      const k=key(nr,nc);if(closed.has(k))continue;
      const g=cur.g+1,ex=open.get(k);
      if(!ex||g<ex.g)open.set(k,{r:nr,c:nc,g,f:g+h(nr,nc),parent:cur});
    }
  }
  return null;
}

// ============================================================
// Building placement
// ============================================================
function canPlace(r,c,type){
  const def=BUILDINGS[type],sz=def.size;
  for(let dr=0;dr<sz;dr++)for(let dc=0;dc<sz;dc++){
    const tile=state.tiles[r+dr]?.[c+dc];
    if(!tile||tile.type===T.WATER||tile.building)return false;
  }
  return true;
}

function placeBuilding(r,c,type){
  const def=BUILDINGS[type],res=state.resources;
  for(const[k,v]of Object.entries(def.cost||{}))if((res[k]||0)<v){log(`Not enough ${k}!`);return false;}
  if(!canPlace(r,c,type)){log('Cannot build there!');return false;}
  for(const[k,v]of Object.entries(def.cost||{}))res[k]-=v;
  const id=state.buildings.length;
  const instant=(type==='wall'||type==='tower');
  const b={id,type,r,c,workers:0,progress:0,active:instant,constructing:!instant,hp:def.maxHp,attackTimer:0};
  state.buildings.push(b);
  const sz=def.size;
  for(let dr=0;dr<sz;dr++)for(let dc=0;dc<sz;dc++)state.tiles[r+dr][c+dc].building=id;
  if(instant){
    log(`Built ${def.name}`);
    if(type==='house'){
      state.housing+=def.housing;
      const toSpawn=Math.min(def.housing,Math.floor(state.resources.food/5));
      for(let i=0;i<toSpawn;i++)if(state.population<state.housing)spawnColonist();
    }
  } else {
    log(`🔨 ${def.name} placed — waiting for builders`);
  }
  addBuildingMesh(b);
  assignJobs(); // assign idle colonists to build or work
  updateResourceUI();
  return true;
}

// ============================================================
// Tick / simulation
// ============================================================
const TICKS_PER_DAY=200, DAYS_PER_SEASON=5;

function th(r,c,salt){return(((r*73856093)^(c*19349663)^(salt*83492791))&0xFFFF)/0xFFFF;}

function depleteTile(b){
  const targetType=b.type==='woodcutter'?T.FOREST:T.STONE;
  let nearest=null,bestDist=Infinity;
  for(let dr=-5;dr<=5;dr++)for(let dc=-5;dc<=5;dc++){
    const tr=b.r+dr,tc=b.c+dc,tile=state.tiles[tr]?.[tc];
    if(tile&&tile.type===targetType&&tile.resource>0&&tile.building===null){
      const d=Math.sqrt(dr*dr+dc*dc);
      if(d<bestDist){bestDist=d;nearest={r:tr,c:tc,tile};}
    }
  }
  if(!nearest)return;
  nearest.tile.resource--;
  if(nearest.tile.resource<=0){
    nearest.tile.type=targetType===T.FOREST?T.GRASS:T.DIRT;
    nearest.tile.resource=0;
    log(targetType===T.FOREST?'🌲 Forest patch cleared':'⛏ Stone deposit exhausted');
    refreshTileMesh(nearest.r,nearest.c);
  } else refreshTileDecos(nearest.r,nearest.c);
}

function regrowTiles(){
  const DIRS=[[-1,0],[1,0],[0,-1],[0,1]];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const tile=state.tiles[r][c];
    if(tile.building!==null)continue;
    const pt=tile.type,pr=tile.resource;
    if(tile.type===T.FOREST&&tile.resource<10&&Math.random()<0.4)tile.resource++;
    if(tile.type===T.STONE&&tile.resource<8&&Math.random()<0.15)tile.resource++;
    if(tile.type===T.GRASS&&Math.random()<0.08&&DIRS.some(([dr,dc])=>state.tiles[r+dr]?.[c+dc]?.type===T.FOREST)){tile.type=T.FOREST;tile.resource=3;}
    if(tile.type===T.DIRT&&Math.random()<0.03&&DIRS.some(([dr,dc])=>state.tiles[r+dr]?.[c+dc]?.type===T.STONE)){tile.type=T.STONE;tile.resource=2;}
    if(tile.type!==pt)refreshTileMesh(r,c);
    else if(tile.resource!==pr)refreshTileDecos(r,c);
  }
}

function checkWinLose(){
  if(state.gameOver)return;
  if(state.population===0&&state.colonists.length===0&&state.tick>200){
    state.gameOver=true;
    showOverlay('Colony Lost',`Your colony survived <b>${state.day}</b> days before the last colonist fell.`,'Try Again',()=>location.reload());
  }
  if(!state.wonShown&&state.population>=20){
    state.wonShown=true;
    showOverlay('Colony Thriving!',`Your settlement has grown to <b>${state.population}</b> souls!`,'Keep Playing',()=>{document.getElementById('game-overlay').style.display='none';});
  }
}

function showOverlay(title,body,btnLabel,btnAction){
  document.getElementById('overlay-title').textContent=title;
  document.getElementById('overlay-body').innerHTML=body;
  const btn=document.getElementById('overlay-btn');btn.textContent=btnLabel;btn.onclick=btnAction;
  document.getElementById('game-overlay').style.display='flex';
}

function tick(){
  if(state.gameOver)return;
  state.tick++;const t=state.tick;
  // Construction — only advances when a builder colonist is nearby
  state.buildings.forEach(b=>{
    if(!b.constructing)return;
    const sz=BUILDINGS[b.type].size;
    const bx=(b.c+sz/2)*TILE, by=(b.r+sz/2)*TILE;
    // Count builders in range (assigned to this building), applying Strong trait
    let buildPower=0;
    state.colonists.forEach(c=>{
      if(c.job!==b.id)return;
      const dx=c.x-bx,dy=c.y-by,d=Math.sqrt(dx*dx+dy*dy);
      if(d<TILE*1.8)buildPower+=(c.traits?.includes('strong')?1.5:1);
    });
    if(buildPower===0)return; // no one working → no progress
    b.progress+=buildPower; // more builders = faster
    if(b.progress>=120){
      b.constructing=false;b.active=true;b.progress=120;
      log(`✅ ${BUILDINGS[b.type].name} complete`);soundBuildComplete();
      if(b.type==='house'){
        state.housing+=BUILDINGS.house.housing;
        const toSpawn=Math.min(BUILDINGS.house.housing,Math.floor(state.resources.food/5));
        for(let i=0;i<toSpawn;i++)if(state.population<state.housing)spawnColonist();
      }
      // Unassign builders from this completed building, reassign them
      state.colonists.forEach(c=>{ if(c.job===b.id){c.job=null;c.path=[];c.pathTarget=null;} });
      b.workers=0;
      assignJobs();rebuildBuildingMesh(b.id);
    }
  });
  // Hammer sound: fire once per ~3s when any building is under construction
  if(t%15===0&&state.buildings.some(b=>b.constructing&&b.workers>0))soundHammer();
  // Auto-repair: assigned workers slowly restore HP to damaged buildings
  if(t%5===0){
    state.colonists.forEach(c=>{
      if(c.job===null)return;
      const b=state.buildings[c.job];
      if(!b||b.constructing||b.hp<=0)return;
      const maxHp=BUILDINGS[b.type].maxHp;
      if(b.hp>=maxHp)return;
      const sz=BUILDINGS[b.type].size;
      const bx=(b.c+sz/2)*TILE,by=(b.r+sz/2)*TILE;
      const dx=c.x-bx,dy=c.y-by;
      if(Math.sqrt(dx*dx+dy*dy)>TILE*2)return;
      const rate=c.traits?.includes('strong')?0.3:0.15;
      const wasLow=b.hp<maxHp;
      b.hp=Math.min(maxHp,b.hp+rate);
      if(wasLow&&b.hp>=maxHp)log(`🔧 ${BUILDINGS[b.type].name} fully repaired`);
    });
  }
  // Production + depletion
  state.buildings.forEach(b=>{
    if(!b.active)return;
    const def=BUILDINGS[b.type];
    if(!def.produces||b.workers===0)return;
    let rate=def.rate*b.workers;
    if(def.produces==='food')rate*=FOOD_SEASON_MULT[state.season];
    state.resources[def.produces]=(state.resources[def.produces]||0)+rate;
    if(b.type==='woodcutter'||b.type==='quarry'){
      if(!b.depletionAccum)b.depletionAccum=0;
      b.depletionAccum+=rate;
      if(b.depletionAccum>=1){b.depletionAccum-=1;depleteTile(b);}
    }
  });
  if(t%600===0)regrowTiles();
  // Smoke particles (3D world units)
  if(t%8===0){
    state.buildings.forEach(b=>{
      if(!b.active||!BUILDINGS[b.type].produces)return;
      state.particles.push({
        x:b.c+0.4+Math.random()*0.2, y:0.8, z:b.r+0.1,
        vx:(Math.random()-0.5)*0.008, vy:0.012+Math.random()*0.01, vz:(Math.random()-0.5)*0.008,
        life:50+Math.random()*30, maxLife:80,
      });
    });
  }
  state.particles=state.particles.filter(p=>{p.x+=p.vx;p.y+=p.vy;p.z+=p.vz;p.vx*=0.98;p.life--;return p.life>0;});
  if(state.particles.length>200)state.particles.splice(0,state.particles.length-200);
  // Hunger
  if(t%20===0){
    const toKill=[];
    state.colonists.forEach(c=>{
      c.hunger-=(c.traits?.includes('hungry')?4:2)*(state._harshWinter>0?2:1);
      if(c.hunger<=0){
        c.hunger=0;
        if(state.resources.food>=1){state.resources.food-=1;c.hunger=Math.min(100,c.hunger+60);c.starving=0;}
        else{c.starving=(c.starving||0)+1;if(c.starving>=15)toKill.push(c.id);}
      } else c.starving=0;
    });
    toKill.forEach(id=>killColonist(id));
  }
  updateRaiders();updateTowers();
  // Floats rise
  state.floats=state.floats.filter(f=>{f.wy+=0.03;f.life--;return f.life>0;});
  // Colonist combat
  state.colonists.forEach(c=>{
    if(c.attackCooldown>0){c.attackCooldown--;return;}
    const isSoldier=c.job!==null&&state.buildings[c.job]?.type==='barracks';
    const range=isSoldier?TILE*2.5:TILE*1.2,dmg=isSoldier?8:4,cooldown=isSoldier?70:110;
    let nearest=null,bestDist=range;
    state.raiders.forEach(r=>{const dx=r.x-c.x,dy=r.y-c.y,d=Math.sqrt(dx*dx+dy*dy);if(d<bestDist){bestDist=d;nearest=r;}});
    if(nearest){
      nearest.hp-=dmg;addFloat(nearest.x/TILE,nearest.y/TILE,`-${dmg}`,'#88ddff');c.attackCooldown=cooldown;
      if(nearest.hp<=0){
        const m=raiderMeshes.get(nearest.id);if(m){unitGroup.remove(m);raiderMeshes.delete(nearest.id);}
        state.raiders=state.raiders.filter(r=>r.id!==nearest.id);log(`⚔ ${c.name} slew a raider`);
      }
    }
  });
  // Colonist movement
  state.colonists.forEach(c=>{
    const cr2=Math.floor(ROWS/2),cc2=Math.floor(COLS/2);
    const curR=Math.max(0,Math.min(ROWS-1,Math.floor(c.y/TILE)));
    const curC=Math.max(0,Math.min(COLS-1,Math.floor(c.x/TILE)));
    const isSoldier=c.job!==null&&state.buildings[c.job]?.type==='barracks';
    let chasingRaider=false;
    if(isSoldier&&state.raiders.length>0){
      let nearest=null,bestDist=5*TILE;
      state.raiders.forEach(r=>{const dx=r.x-c.x,dy=r.y-c.y,d=Math.sqrt(dx*dx+dy*dy);if(d<bestDist){bestDist=d;nearest=r;}});
      if(nearest){
        const gr=Math.max(0,Math.min(ROWS-1,Math.floor(nearest.y/TILE)));
        const gc=Math.max(0,Math.min(COLS-1,Math.floor(nearest.x/TILE)));
        if(!c.pathTarget||c.pathTarget.r!==gr||c.pathTarget.c!==gc){c.pathTarget={r:gr,c:gc};c.path=astar(curR,curC,gr,gc)||[];}
        chasingRaider=true;
      }
    }
    if(!chasingRaider){
      if(c.job===null){
        if(c.pathCooldown<=0&&c.path.length===0){
          let gr=Math.round(cr2+(Math.random()-0.5)*10);let gc=Math.round(cc2+(Math.random()-0.5)*12);
          gr=Math.max(0,Math.min(ROWS-1,gr));gc=Math.max(0,Math.min(COLS-1,gc));
          c.pathTarget={r:gr,c:gc};c.path=astar(curR,curC,gr,gc)||[];c.pathCooldown=180+Math.floor(Math.random()*120);
        }
      } else {
        const b=state.buildings[c.job];
        if(b){const gr=b.r,gc=b.c;if(!c.pathTarget||c.pathTarget.r!==gr||c.pathTarget.c!==gc){c.pathTarget={r:gr,c:gc};c.path=astar(curR,curC,gr,gc)||[];}}
      }
    }
    if(c.pathCooldown>0)c.pathCooldown--;
    if(c.path.length>0){
      const next=c.path[0];const tx=(next.c+0.5)*TILE,ty=(next.r+0.5)*TILE;
      const dx=tx-c.x,dy=ty-c.y,dist=Math.sqrt(dx*dx+dy*dy);
      const spd=0.8*(c.traits?.includes('swift')?1.35:1);
      if(dist<3)c.path.shift();else{c.x+=(dx/dist)*spd;c.y+=(dy/dist)*spd;}
    } else if(c.pathTarget&&c.job!==null){
      const tx=(c.pathTarget.c+0.5)*TILE,ty=(c.pathTarget.r+0.5)*TILE;
      const dx=tx-c.x,dy=ty-c.y,dist=Math.sqrt(dx*dx+dy*dy);
      const spd=0.8*(c.traits?.includes('swift')?1.35:1);
      if(dist>3){c.x+=(dx/dist)*spd;c.y+=(dy/dist)*spd;}
    }
    c.blinkTimer=(c.blinkTimer+1)%60;
  });
  // Day/season
  if(t%TICKS_PER_DAY===0){
    state.day++;state.seasonTick++;
    if(state.seasonTick>=DAYS_PER_SEASON){
      state.seasonTick=0;state.season=(state.season+1)%4;
      log(`Season: ${SEASON_NAMES[state.season]}`);updateSeasonVisuals();
    }
    updateResourceUI();
    document.getElementById('day-label').textContent=`Day ${state.day}`;
    document.getElementById('season-label').textContent=SEASON_NAMES[state.season];
    document.getElementById('season-label').style.color=SEASON_COLORS[state.season];
    if(state.day>3&&state.day%7===0&&!_pendingEvent&&Math.random()<0.55){
      const ev=EVENTS[Math.floor(Math.random()*EVENTS.length)];
      showEvent(ev);
    }
    if(state._harshWinter>0)state._harshWinter--;
  }
  if(t%3===0)updateDayNight();
  checkWinLose();
  state.resources.wood=Math.max(0,Math.min(9999,state.resources.wood));
  state.resources.stone=Math.max(0,Math.min(9999,state.resources.stone));
  state.resources.food=Math.max(0,Math.min(9999,state.resources.food));
}

function showEvent(ev){
  _pendingEvent=ev;
  document.getElementById('event-title').textContent=ev.title;
  document.getElementById('event-title').style.color=ev.color;
  document.getElementById('event-body').textContent=ev.body;
  const btnContainer=document.getElementById('event-choices');
  btnContainer.innerHTML='';
  ev.choices.forEach(ch=>{
    const btn=document.createElement('button');
    btn.className='event-btn';btn.textContent=ch.label;
    btn.addEventListener('click',()=>{
      const result=ch.fn(state);
      log(`📜 ${result}`);
      updateResourceUI();
      document.getElementById('event-modal').style.display='none';
      _pendingEvent=null;
    });
    btnContainer.appendChild(btn);
  });
  document.getElementById('event-modal').style.display='flex';
}

// ============================================================
// THREE.JS — Scene setup
// ============================================================
let renderer,scene,camera,groundPlane;
let sunLight,hemiLight,fillLight;
let terrainGroup,decorGroup,buildingGroup,unitGroup;
let terrainMeshes=[],decorGroups=[];
let buildingMeshes=new Map(),colonistMeshes=new Map(),raiderMeshes=new Map();
let smokeMesh,ghostMesh=null;
let mmCanvas,mmCtx;

const SKY=[0x87ceeb,0x9ad8f5,0xd07030,0xc0d8e8];
const TCOLORS=[[0x5aaa48,0x2c561a,0x787068,0x2060cc,0x9a7840],[0x5aba4a,0x386820,0x787068,0x1848b0,0x9a7840],[0x9a7040,0x4a3410,0x787068,0x1848a0,0x8a6830],[0xb0b8c0,0x485850,0x909098,0x3060a0,0x909898]];

function mat(col,opts={}){return new THREE.MeshStandardMaterial({color:col,roughness:0.82,metalness:0.05,...opts});}
function metalMat(col){return new THREE.MeshStandardMaterial({color:col,roughness:0.35,metalness:0.7});}
function bmat(col){return new THREE.MeshBasicMaterial({color:col});}

function initThree(){
  const area=document.getElementById('game-area');
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setSize(area.clientWidth,area.clientHeight);
  area.appendChild(renderer.domElement);
  scene=new THREE.Scene();
  scene.background=new THREE.Color(SKY[state.season]);
  scene.fog=new THREE.FogExp2(SKY[state.season],0.016);
  setupCamera();
  // Hemisphere: sky blue top, warm ground bounce bottom
  hemiLight=new THREE.HemisphereLight(0x90b8d8,0x4a3820,0.7);
  scene.add(hemiLight);
  // Key sun light
  const sun=new THREE.DirectionalLight(0xfff4d0,1.3);
  sun.position.set(25,38,12);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  const sc=sun.shadow.camera;sc.left=-60;sc.right=60;sc.top=50;sc.bottom=-50;sc.near=1;sc.far=180;
  sun.shadow.bias=-0.0005;
  scene.add(sun);
  sunLight=sun;
  // Soft fill from opposite side
  const fill=new THREE.DirectionalLight(0x8090c0,0.3);
  fill.position.set(-15,20,-10);scene.add(fill);
  fillLight=fill;
  terrainGroup=new THREE.Group();scene.add(terrainGroup);
  decorGroup=new THREE.Group();scene.add(decorGroup);
  buildingGroup=new THREE.Group();scene.add(buildingGroup);
  unitGroup=new THREE.Group();scene.add(unitGroup);
  // Invisible ground for raycasting
  const pg=new THREE.PlaneGeometry(COLS+4,ROWS+4);
  const pm=new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide});
  groundPlane=new THREE.Mesh(pg,pm);
  groundPlane.rotation.x=-Math.PI/2;groundPlane.position.set(COLS/2,0,ROWS/2);
  scene.add(groundPlane);
  buildTerrainMeshes();
  initSmoke();
  initMinimap();
  window.addEventListener('resize',onResize);
}

// Smooth camera — actual rendered position lerps toward target each frame
let camCurrent={x:COLS/2, z:ROWS/2};
let camZoomCurrent=18;

function setupCamera(){
  const area=document.getElementById('game-area');
  const aspect=area.clientWidth/area.clientHeight;
  const fh=camZoomCurrent;
  camera=new THREE.OrthographicCamera(-fh*aspect/2,fh*aspect/2,fh/2,-fh/2,0.1,300);
  updateCameraPos();
}

function updateCameraPos(){
  // Called only for instant snaps (load, minimap click)
  camCurrent.x=state.camTarget.x;
  camCurrent.z=state.camTarget.z;
  camZoomCurrent=state.camZoom;
  applyCameraPos();
}

function applyCameraPos(){
  const t=camCurrent;
  camera.position.set(t.x+18,22,t.z+18);
  camera.lookAt(t.x,0,t.z);
}

function updateCameraFrustum(){
  const area=document.getElementById('game-area');
  const aspect=(renderer?.domElement.clientWidth||area.clientWidth)/(renderer?.domElement.clientHeight||area.clientHeight);
  const fh=camZoomCurrent;
  camera.left=-fh*aspect/2;camera.right=fh*aspect/2;
  camera.top=fh/2;camera.bottom=-fh/2;
  camera.updateProjectionMatrix();
}

function onResize(){
  const area=document.getElementById('game-area');
  renderer.setSize(area.clientWidth,area.clientHeight);
  updateCameraFrustum();
}

function tickCamera(){
  const lx=0.12, lz=0.12, lzoom=0.14;
  let changed=false;
  const dx=state.camTarget.x-camCurrent.x;
  const dz=state.camTarget.z-camCurrent.z;
  const dZoom=state.camZoom-camZoomCurrent;
  if(Math.abs(dx)>0.001){camCurrent.x+=dx*lx;changed=true;}
  if(Math.abs(dz)>0.001){camCurrent.z+=dz*lz;changed=true;}
  if(Math.abs(dZoom)>0.01){camZoomCurrent+=dZoom*lzoom;changed=true;}
  if(changed){applyCameraPos();updateCameraFrustum();}
}

function updateDayNight(){
  state.timeOfDay=(state.tick%(TICKS_PER_DAY))/TICKS_PER_DAY;
  const t=state.timeOfDay;
  const dayT=Math.max(0,Math.min(1,(t-0.1)/0.75));
  const sunHeight=Math.sin(dayT*Math.PI);

  let skyCol;
  if(t<0.1)      skyCol=new THREE.Color(0x1a0a1e).lerp(new THREE.Color(0xff7030),t/0.1);
  else if(t<0.2) skyCol=new THREE.Color(0xff7030).lerp(new THREE.Color(SKY[state.season]),(t-0.1)/0.1);
  else if(t<0.75)skyCol=new THREE.Color(SKY[state.season]);
  else if(t<0.85)skyCol=new THREE.Color(SKY[state.season]).lerp(new THREE.Color(0xcc4010),(t-0.75)/0.1);
  else           skyCol=new THREE.Color(0xcc4010).lerp(new THREE.Color(0x06050e),(t-0.85)/0.15);

  if(scene)scene.background=skyCol;
  if(scene&&scene.fog)scene.fog.color.copy(skyCol);

  if(sunLight){
    sunLight.intensity=0.2+sunHeight*1.2;
    sunLight.color.set(sunHeight>0.3?0xfff0c0:0xff6020);
  }
  if(hemiLight)hemiLight.intensity=0.3+sunHeight*0.5;
  if(fillLight)fillLight.intensity=0.1+sunHeight*0.25;
}

function updateSeasonVisuals(){
  scene.background=new THREE.Color(SKY[state.season]);
  scene.fog.color.setHex(SKY[state.season]);
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const m=terrainMeshes[r]?.[c];if(m)m.material.color.setHex(TCOLORS[state.season][state.tiles[r][c].type]);
  }
}

// ---- Terrain ----
function buildTerrainMeshes(){
  terrainMeshes=[];decorGroups=[];
  for(let r=0;r<ROWS;r++){
    terrainMeshes[r]=[];decorGroups[r]=[];
    for(let c=0;c<COLS;c++){
      const tile=state.tiles[r][c];
      const m=new THREE.Mesh(new THREE.BoxGeometry(1,0.15,1),mat(TCOLORS[state.season][tile.type]));
      m.position.set(c+0.5,tile.type===T.WATER?-0.04:0,r+0.5);
      m.receiveShadow=true;terrainGroup.add(m);terrainMeshes[r][c]=m;
      const dg=new THREE.Group();dg.position.set(c+0.5,0,r+0.5);decorGroup.add(dg);decorGroups[r][c]=dg;
      buildDecos(dg,r,c,tile);
    }
  }
}

function buildDecos(g,r,c,tile){
  while(g.children.length)g.remove(g.children[0]);
  const h1=th(r,c,0),h2=th(r,c,1),h3=th(r,c,2),h4=th(r,c,3);
  if(tile.type===T.FOREST&&tile.resource>0){
    addTree(g,(h1-0.5)*0.45,(h2-0.5)*0.45,0.35+h1*0.18,h3);
    if(tile.resource>4)addTree(g,(h2-0.5)*0.4+0.15,(h1-0.5)*0.35-0.1,0.26+h2*0.14,h4);
  }
  if(tile.type===T.STONE&&tile.resource>0){
    addRock(g,(h1-0.5)*0.35,(h2-0.5)*0.35,0.1+h1*0.07,h3*Math.PI*2,h4*0.4-0.2);
    if(tile.resource>3)addRock(g,(h2-0.5)*0.3-0.1,(h1-0.5)*0.25+0.1,0.08+h2*0.05,h1*Math.PI*2,h3*0.3);
  }
}

function addTree(g,ox,oz,size,hsh){
  const leafCols=[0x2d7a18,0x38962a,0x44b035];
  const col=leafCols[Math.floor(hsh*3)];
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(size*0.1,size*0.12,size*0.5,6),mat(0x6a3818));
  trunk.position.set(ox,0.15+size*0.25,oz);trunk.castShadow=true;g.add(trunk);
  [[0,size*0.9],[size*0.35,size*0.7],[size*0.62,size*0.52]].forEach(([yo,sc])=>{
    const cone=new THREE.Mesh(new THREE.ConeGeometry(sc*0.55,sc*0.7,7),mat(col));
    cone.position.set(ox,0.15+size*0.28+yo,oz);cone.castShadow=true;g.add(cone);
  });
}

function addRock(g,ox,oz,size,ry,rz){
  const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(size,0),mat(0x888078));
  rock.position.set(ox,0.15+size*0.5,oz);rock.rotation.y=ry;rock.rotation.z=rz;rock.castShadow=true;g.add(rock);
}

function refreshTileMesh(r,c){
  const tile=state.tiles[r][c],m=terrainMeshes[r][c];
  m.material.color.setHex(TCOLORS[state.season][tile.type]);
  m.position.y=tile.type===T.WATER?-0.04:0;
  buildDecos(decorGroups[r][c],r,c,tile);
}
function refreshTileDecos(r,c){buildDecos(decorGroups[r][c],r,c,state.tiles[r][c]);}

// ---- Building meshes ----
function bx(g,w,h,d,col,x,y,z){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(col));
  m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
}
function cy(g,rt,rb,h,seg,col,x,y,z){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),mat(col));
  m.position.set(x,y,z);m.castShadow=true;g.add(m);return m;
}

function addBuildingMesh(b){
  const g=new THREE.Group();buildingGroup.add(g);buildingMeshes.set(b.id,g);assembleBuildingGeo(b,g);
}
function rebuildBuildingMesh(id){
  const b=state.buildings[id];if(!b)return;
  let g=buildingMeshes.get(id);
  if(!g){g=new THREE.Group();buildingGroup.add(g);buildingMeshes.set(id,g);}
  while(g.children.length)g.remove(g.children[0]);
  assembleBuildingGeo(b,g);
}
function assembleBuildingGeo(b,g){
  const sz=BUILDINGS[b.type].size;
  g.position.set(b.c+sz/2,0,b.r+sz/2);
  if(b.constructing){
    const pct=b.progress/120;
    const stage=Math.floor(pct*5); // 0..4
    b._stage=stage; // track for rebuild detection

    // Stage 0 (0-20%): Cleared dirt patch with stakes
    if(stage===0){
      bx(g,sz*0.92,0.06,sz*0.92,0x6a5030,0,0.03,0); // dirt patch
      const hw=sz*0.4;
      [[hw,hw],[hw,-hw],[-hw,hw],[-hw,-hw]].forEach(([px,pz])=>{
        bx(g,0.04,0.3,0.04,0x8a6030,px,0.15,pz); // stakes
      });
    }
    // Stage 1 (20-40%): Stone foundation
    else if(stage===1){
      bx(g,sz*0.92,0.06,sz*0.92,0x6a5030,0,0.03,0); // dirt
      bx(g,sz*0.88,0.14,sz*0.88,0x808078,0,0.13,0); // stone foundation
    }
    // Stage 2 (40-60%): Foundation + half walls
    else if(stage===2){
      bx(g,sz*0.88,0.14,sz*0.88,0x808078,0,0.07,0); // foundation
      const wh=0.25; // half wall height
      bx(g,sz*0.84,wh,0.08,0x7a5530,0,0.20+wh/2,sz*0.42);  // front wall
      bx(g,sz*0.84,wh,0.08,0x7a5530,0,0.20+wh/2,-sz*0.42); // back wall
      bx(g,0.08,wh,sz*0.84,0x7a5530,sz*0.42,0.20+wh/2,0);  // right wall
      bx(g,0.08,wh,sz*0.84,0x7a5530,-sz*0.42,0.20+wh/2,0); // left wall
      // scaffold poles
      const hw=sz*0.44;
      [[hw,hw],[-hw,-hw]].forEach(([px,pz])=>{
        bx(g,0.05,0.7,0.05,0xc09030,px,0.35,pz);
      });
    }
    // Stage 3 (60-80%): Full walls, door hole, no roof
    else if(stage===3){
      bx(g,sz*0.88,0.14,sz*0.88,0x808078,0,0.07,0); // foundation
      const wh=0.5;
      bx(g,sz*0.84,wh,0.08,0x7a5530,0,0.14+wh/2,sz*0.42);  // front
      bx(g,sz*0.84,wh,0.08,0x7a5530,0,0.14+wh/2,-sz*0.42); // back
      bx(g,0.08,wh,sz*0.84,0x7a5530,sz*0.42,0.14+wh/2,0);  // right
      bx(g,0.08,wh,sz*0.84,0x7a5530,-sz*0.42,0.14+wh/2,0); // left
      // door opening (front face)
      bx(g,0.18,0.28,0.09,0x3a1800,0,0.28,sz*0.43);
      // scaffold
      const hw=sz*0.44;
      [[hw,hw],[hw,-hw],[-hw,hw],[-hw,-hw]].forEach(([px,pz])=>{
        bx(g,0.05,0.9,0.05,0xc09030,px,0.45,pz);
      });
      bx(g,sz*0.82,0.04,0.05,0xc09030,0,0.75,0); // top scaffold beam
    }
    // Stage 4 (80-100%): Walls + partial roof frame
    else {
      bx(g,sz*0.88,0.14,sz*0.88,0x808078,0,0.07,0); // foundation
      const wh=0.55;
      bx(g,sz*0.84,wh,0.08,0x7a5530,0,0.14+wh/2,sz*0.42);
      bx(g,sz*0.84,wh,0.08,0x7a5530,0,0.14+wh/2,-sz*0.42);
      bx(g,0.08,wh,sz*0.84,0x7a5530,sz*0.42,0.14+wh/2,0);
      bx(g,0.08,wh,sz*0.84,0x7a5530,-sz*0.42,0.14+wh/2,0);
      bx(g,0.18,0.28,0.09,0x3a1800,0,0.28,sz*0.43); // door
      // Partial roof frame
      bx(g,sz*0.86,0.06,sz*0.86,0x9a6020,0,wh+0.17,0); // flat roof planks
      bx(g,sz*0.3,0.08,0.06,0x9a6020,0,wh+0.28,0); // ridge beam
    }

    // Progress bar above everything — always visible
    const barY=stage<3?0.6:1.0;
    const barW=sz*0.7;
    const barBg=new THREE.Mesh(new THREE.BoxGeometry(barW,0.08,0.08),new THREE.MeshBasicMaterial({color:0x222222}));
    barBg.position.set(0,barY,0);g.add(barBg);
    const fillW=Math.max(0.02,barW*pct);
    const barFill=new THREE.Mesh(new THREE.BoxGeometry(fillW,0.09,0.09),new THREE.MeshBasicMaterial({color:pct<0.5?0xe0a020:0x40d060}));
    barFill.name='pbar';barFill.position.set(-barW/2+fillW/2,barY,0.01);g.add(barFill);
    return;
  }
  switch(b.type){
    case'house':
      bx(g,0.9,0.12,0.9,0x8a7060,0,0.06,0);bx(g,0.85,0.55,0.85,0x7a5030,0,0.4,0);
      bx(g,0.12,0.12,0.02,0x8090cc,0.2,0.44,0.43);bx(g,0.12,0.12,0.02,0x8090cc,-0.2,0.44,0.43);
      bx(g,0.2,0.28,0.02,0x3a1800,0,0.28,0.43);cy(g,0,0.65,0.45,4,0xb08020,0,0.89,0);break;
    case'farm':
      bx(g,1.9,0.08,1.9,b.active?0x6a5030:0x5a4020,0,0.04,0);
      for(let i=-3;i<=3;i++)bx(g,1.8,0.02,0.05,0x8a6040,0,0.09,i*0.25);
      if(b.active){bx(g,0.04,0.5,0.04,0x7a4a20,0.5,0.3,-0.5);bx(g,0.35,0.04,0.04,0x7a4a20,0.5,0.4,-0.5);cy(g,0,0.1,0.15,8,0xd0a020,0.5,0.55,-0.5);}
      break;
    case'woodcutter':
      bx(g,0.9,0.12,0.9,0x8a7060,0,0.06,0);bx(g,0.8,0.5,0.8,0x6a4020,0,0.37,0);
      bx(g,0.2,0.28,0.02,0x3a1800,0,0.24,0.41);cy(g,0,0.55,0.35,4,0x9a3010,0,0.8,0);
      for(let i=0;i<3;i++){const cl=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.35,8),mat(0x8a5020));cl.rotation.z=Math.PI/2;cl.position.set(-0.38,0.15+i*0.1,0.1+i*0.05);g.add(cl);}
      break;
    case'quarry':
      bx(g,0.95,0.08,0.95,0x706860,0,-0.02,0);
      bx(g,0.95,0.1,0.08,0x808070,0,0.05,-0.44);bx(g,0.95,0.1,0.08,0x808070,0,0.05,0.44);
      addRock(g,-0.2,0,0.09,0.4,0.1);addRock(g,0.15,-0.1,0.07,1.2,0.2);
      bx(g,0.04,0.5,0.04,0x6a4020,0.3,0.28,0);bx(g,0.4,0.04,0.04,0x6a4020,0.1,0.52,0);break;
    case'storehouse':
      bx(g,0.9,0.12,0.9,0x8a7060,0,0.06,0);bx(g,0.88,0.55,0.88,0x7a5030,0,0.4,0);
      cy(g,0.2,0.6,0.3,4,0x503010,0,0.75,0);
      {const bar=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.22,12),mat(0x6a3818));bar.position.set(0.3,0.18,0.3);g.add(bar);}break;
    case'wall':
      bx(g,0.95,0.6,0.95,0x909088,0,0.3,0);
      [-0.3,0.3].forEach(i=>{bx(g,0.2,0.18,0.2,0xa0a090,i,0.69,0);bx(g,0.2,0.18,0.2,0xa0a090,0,0.69,i);});break;
    case'tower':
      bx(g,0.85,0.2,0.85,0x888078,0,0.1,0);bx(g,0.75,1.4,0.75,0x808070,0,0.9,0);
      bx(g,0.08,0.25,0.02,0x1a1408,0,0.9,0.38);
      [-0.25,0.25].forEach(i=>{bx(g,0.2,0.2,0.2,0x909080,i,1.7,0);bx(g,0.2,0.2,0.2,0x909080,0,1.7,i);});break;
    case'barracks':
      bx(g,0.9,0.12,0.9,0x8a7060,0,0.06,0);bx(g,0.85,0.55,0.85,0x7a6050,0,0.4,0);
      cy(g,0,0.65,0.4,4,0x8a2010,0,0.87,0);bx(g,0.18,0.25,0.02,0x2a1000,0,0.24,0.43);
      bx(g,0.04,0.3,0.04,0xc0a030,-0.25,0.3,-0.2);bx(g,0.04,0.3,0.04,0xc0a030,0.25,0.3,-0.2);break;
  }
  if(b.hp<=0){const ov=new THREE.Mesh(new THREE.BoxGeometry(sz*0.9,0.3,sz*0.9),mat(0x332211,{transparent:true,opacity:0.85}));ov.position.y=0.2;g.add(ov);}
}

// ── Unit meshes ──────────────────────────────────────────────────────────────
// Skin tones vary slightly per colonist
const SKIN_TONES=[0xf5c99a,0xedb87a,0xe8a060,0xc87a50,0x8a5030];
const HAIR_COLORS=[0x1a0e06,0x3d1f08,0x7a3d10,0x8a6030,0xb09060,0xc8b880,0x6a2818,0x484030];

function sMat(col,rough=0.85,metal=0){return new THREE.MeshStandardMaterial({color:col,roughness:rough,metalness:metal});}

function createColonistMesh(c){
  const g=new THREE.Group();
  const hue=(c.id*137)%360;
  const skinTone=SKIN_TONES[c.id%SKIN_TONES.length];
  const hairColor=HAIR_COLORS[c.id%HAIR_COLORS.length];
  const hairStyle=c.id%4; // 0=short, 1=medium, 2=long back, 3=bald

  const skinM=sMat(skinTone,0.88);
  const shirtM=sMat(new THREE.Color(`hsl(${hue},60%,38%)`),0.92);
  const pantsM=sMat(new THREE.Color(`hsl(${(hue+40)%360},25%,22%)`),0.92);
  const hairM=sMat(hairColor,0.9);
  const bootM=sMat(0x2a1808,0.8);
  const beltM=sMat(0x3a2010,0.75,0.1);
  const buckleM=sMat(0xa08040,0.4,0.7);
  const woodM=sMat(0x7a4418,0.85);
  const ironM=sMat(0x707880,0.45,0.6);
  const leatherM=sMat(0x5a3820,0.85);

  // ── Legs ──
  const lLeg=new THREE.Group();lLeg.name='lLeg';lLeg.position.set(-0.07,0.27,0);
  const lLegM=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,0.2,7),pantsM);
  lLegM.position.y=-0.1;lLeg.add(lLegM);
  // Boot with heel
  const lBootBase=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.07,0.13),bootM);
  lBootBase.position.set(0,-0.22,0.01);lLeg.add(lBootBase);
  const lBootHeel=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.03,0.05),bootM);
  lBootHeel.position.set(0,-0.25,-0.05);lLeg.add(lBootHeel);
  g.add(lLeg);

  const rLeg=new THREE.Group();rLeg.name='rLeg';rLeg.position.set(0.07,0.27,0);
  const rLegM=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,0.2,7),pantsM);
  rLegM.position.y=-0.1;rLeg.add(rLegM);
  const rBootBase=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.07,0.13),bootM);
  rBootBase.position.set(0,-0.22,0.01);rLeg.add(rBootBase);
  const rBootHeel=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.03,0.05),bootM);
  rBootHeel.position.set(0,-0.25,-0.05);rLeg.add(rBootHeel);
  g.add(rLeg);

  // ── Body pivot ──
  const body=new THREE.Group();body.name='body';body.position.set(0,0.27,0);

  // Torso — tapered slightly (wider at shoulders)
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.26,0.24,0.15),shirtM);
  torso.position.y=0.12;torso.castShadow=true;body.add(torso);
  // Collar
  const collar=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.065,0.05,8),shirtM);
  collar.position.y=0.26;body.add(collar);
  // Belt
  const belt=new THREE.Mesh(new THREE.BoxGeometry(0.28,0.04,0.17),beltM);
  belt.position.y=0.03;body.add(belt);
  const buckle=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.03,0.03),buckleM);
  buckle.position.set(0,0.03,0.09);body.add(buckle);
  // Shoulder caps
  [-0.15,0.15].forEach(x=>{
    const cap=new THREE.Mesh(new THREE.SphereGeometry(0.06,7,5),shirtM);
    cap.position.set(x,0.23,0);body.add(cap);
  });

  // ── Arms ──
  const lArm=new THREE.Group();lArm.name='lArm';lArm.position.set(-0.16,0.2,0);
  const lArmU=new THREE.Mesh(new THREE.CylinderGeometry(0.038,0.042,0.14,7),shirtM);
  lArmU.position.y=-0.07;lArm.add(lArmU);
  const lArmL=new THREE.Mesh(new THREE.CylinderGeometry(0.033,0.038,0.12,7),skinM);
  lArmL.position.y=-0.19;lArm.add(lArmL);
  const lHand=new THREE.Mesh(new THREE.SphereGeometry(0.038,7,5),skinM);
  lHand.position.y=-0.27;lArm.add(lHand);
  body.add(lArm);

  const rArm=new THREE.Group();rArm.name='rArm';rArm.position.set(0.16,0.2,0);
  const rArmU=new THREE.Mesh(new THREE.CylinderGeometry(0.038,0.042,0.14,7),shirtM);
  rArmU.position.y=-0.07;rArm.add(rArmU);
  const rArmL=new THREE.Mesh(new THREE.CylinderGeometry(0.033,0.038,0.12,7),skinM);
  rArmL.position.y=-0.19;rArm.add(rArmL);
  const rHand=new THREE.Mesh(new THREE.SphereGeometry(0.038,7,5),skinM);
  rHand.position.y=-0.27;rArm.add(rHand);

  // Tool in right hand
  const toolGroup=new THREE.Group();toolGroup.name='tool';toolGroup.visible=false;
  toolGroup.position.y=-0.27;
  const hndl=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.016,0.32,6),woodM);
  hndl.position.y=-0.1;toolGroup.add(hndl);
  const blade=new THREE.Mesh(new THREE.BoxGeometry(0.025,0.11,0.06),ironM);
  blade.position.y=0.07;blade.rotation.z=0.15;toolGroup.add(blade);
  const bladeEdge=new THREE.Mesh(new THREE.BoxGeometry(0.008,0.1,0.03),sMat(0xd0d8e0,0.3,0.8));
  bladeEdge.position.set(-0.01,0.07,0.04);toolGroup.add(bladeEdge);
  const wrap=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.05,6),leatherM);
  wrap.position.y=-0.18;toolGroup.add(wrap);
  rArm.add(toolGroup);
  body.add(rArm);

  // ── Head ──
  const headG=new THREE.Group();headG.name='head';headG.position.y=0.23;
  // Skull — slightly flattened
  const skull=new THREE.Mesh(new THREE.SphereGeometry(0.115,9,7),skinM);
  skull.scale.y=1.08;skull.position.y=0.115;headG.add(skull);
  // Jaw / chin — slightly wider
  const jaw=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.06,0.12),skinM);
  jaw.position.y=0.06;headG.add(jaw);
  // Ears
  [-0.12,0.12].forEach(x=>{
    const ear=new THREE.Mesh(new THREE.SphereGeometry(0.025,5,4),skinM);
    ear.scale.set(0.5,0.8,0.8);ear.position.set(x,0.11,0);headG.add(ear);
  });
  // Nose
  const nose=new THREE.Mesh(new THREE.SphereGeometry(0.022,5,4),skinM);
  nose.scale.set(0.8,0.7,1.2);nose.position.set(0,0.1,0.11);headG.add(nose);
  // Eyes — white + iris + pupil
  [-0.04,0.04].forEach(x=>{
    const white=new THREE.Mesh(new THREE.SphereGeometry(0.022,6,5),sMat(0xf0f0f0,0.5));
    white.position.set(x,0.135,0.095);headG.add(white);
    const iris=new THREE.Mesh(new THREE.SphereGeometry(0.014,6,5),sMat(new THREE.Color(`hsl(${hue},50%,30%)`),0.4));
    iris.position.set(x,0.135,0.105);headG.add(iris);
    const pupil=new THREE.Mesh(new THREE.SphereGeometry(0.009,5,4),sMat(0x080808,0.3));
    pupil.position.set(x,0.135,0.112);headG.add(pupil);
  });
  // Eyebrows
  [-0.04,0.04].forEach(x=>{
    const brow=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.008,0.01),sMat(hairColor,0.9));
    brow.position.set(x,0.158,0.1);headG.add(brow);
  });
  // Mouth
  const mouth=new THREE.Mesh(new THREE.BoxGeometry(0.046,0.01,0.01),sMat(0x8a3a30,0.8));
  mouth.position.set(0,0.08,0.11);headG.add(mouth);
  // Hair by style
  if(hairStyle===0){ // short crop
    const cap=new THREE.Mesh(new THREE.SphereGeometry(0.12,9,7,0,Math.PI*2,0,Math.PI*0.48),hairM);
    cap.position.y=0.13;headG.add(cap);
  } else if(hairStyle===1){ // medium
    const cap=new THREE.Mesh(new THREE.SphereGeometry(0.125,9,7,0,Math.PI*2,0,Math.PI*0.6),hairM);
    cap.position.y=0.12;headG.add(cap);
    const back=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.1,0.05),hairM);
    back.position.set(0,0.09,-0.1);headG.add(back);
  } else if(hairStyle===2){ // longer back
    const cap=new THREE.Mesh(new THREE.SphereGeometry(0.125,9,7,0,Math.PI*2,0,Math.PI*0.58),hairM);
    cap.position.y=0.12;headG.add(cap);
    const back=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.18,0.06),hairM);
    back.position.set(0,0.03,-0.1);headG.add(back);
  } else { // bald / stubble
    const stubble=new THREE.Mesh(new THREE.SphereGeometry(0.118,9,7,0,Math.PI*2,0,Math.PI*0.35),sMat(hairColor,0.95));
    stubble.position.y=0.15;headG.add(stubble);
  }

  body.add(headG);

  // ── Soldier gear ──
  const soldierG=new THREE.Group();soldierG.name='soldier';soldierG.visible=false;
  const helm=new THREE.Mesh(new THREE.SphereGeometry(0.135,9,7,0,Math.PI*2,0,Math.PI*0.62),sMat(0x606870,0.4,0.65));
  helm.position.y=0.35;soldierG.add(helm);
  const helmBrim=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.14,0.025,10),sMat(0x505860,0.4,0.65));
  helmBrim.position.y=0.32;soldierG.add(helmBrim);
  const neckGuard=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.04,0.06),sMat(0x505860,0.4,0.65));
  neckGuard.position.set(0,0.29,-0.08);soldierG.add(neckGuard);
  // Sword + scabbard on left hip
  const scabbard=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.24,0.04),leatherM);
  scabbard.position.set(-0.16,-0.08,-0.02);scabbard.rotation.z=0.15;soldierG.add(scabbard);
  const blade2=new THREE.Mesh(new THREE.BoxGeometry(0.018,0.28,0.03),sMat(0xc0c8d0,0.35,0.75));
  blade2.position.set(-0.15,0.0,-0.01);blade2.rotation.z=0.15;soldierG.add(blade2);
  const crossguard=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.015,0.025),sMat(0x908060,0.4,0.7));
  crossguard.position.set(-0.17,0.11,-0.01);crossguard.rotation.z=0.15;soldierG.add(crossguard);
  body.add(soldierG);

  g.add(body);

  // Selection ring
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.25,0.33,20),new THREE.MeshBasicMaterial({color:0x40ff80,side:THREE.DoubleSide,transparent:true,opacity:0.8}));
  ring.rotation.x=-Math.PI/2;ring.position.y=0.01;ring.visible=false;ring.name='selring';
  g.add(ring);

  g.position.set(c.x/TILE,0,c.y/TILE);
  unitGroup.add(g);colonistMeshes.set(c.id,g);
}
function createRaiderMesh(r){
  const g=new THREE.Group();
  const armorMat=new THREE.MeshStandardMaterial({roughness:0.8,metalness:0.05,color:0x3a2020});
  const darkMat=new THREE.MeshStandardMaterial({roughness:0.8,metalness:0.05,color:0x1a0808});
  const metalMat=new THREE.MeshStandardMaterial({roughness:0.8,metalness:0.05,color:0x505058});
  const skinMat=new THREE.MeshStandardMaterial({roughness:0.8,metalness:0.05,color:0x6a4030});
  // Boots
  [[-0.08,0.07],[0.08,0.07]].forEach(([x,y])=>{
    const boot=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.09,0.14),darkMat);
    boot.position.set(x,y,0.02);g.add(boot);
  });
  // Legs
  [[-0.08,0.2],[0.08,0.2]].forEach(([x,y])=>{
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,0.2,6),armorMat);
    leg.position.set(x,y,0);g.add(leg);
  });
  // Torso (armored)
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.28,0.24,0.16),armorMat);
  torso.position.y=0.42;g.add(torso);
  // Shoulder pads
  [[-0.18,0.5],[0.18,0.5]].forEach(([x,y])=>{
    const pad=new THREE.Mesh(new THREE.SphereGeometry(0.06,6,4),metalMat);
    pad.position.set(x,y,0);g.add(pad);
  });
  // Arms
  [[-0.18,0.36],[0.18,0.36]].forEach(([x,y])=>{
    const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.045,0.22,6),armorMat);
    arm.position.set(x,y,0);g.add(arm);
  });
  // Head
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.13,8,6),skinMat);
  head.position.y=0.62;g.add(head);
  // Helmet
  const helm=new THREE.Mesh(new THREE.SphereGeometry(0.145,8,6,0,Math.PI*2,0,Math.PI*0.6),metalMat);
  helm.position.y=0.66;g.add(helm);
  const helmSpike=new THREE.Mesh(new THREE.ConeGeometry(0.03,0.15,6),metalMat);
  helmSpike.position.y=0.8;g.add(helmSpike);
  // Weapon — mace/axe
  const wHandle=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.35,4),new THREE.MeshStandardMaterial({roughness:0.8,metalness:0.05,color:0x5a3010}));
  wHandle.rotation.z=0.5;wHandle.position.set(0.26,0.44,0);g.add(wHandle);
  const wHead=new THREE.Mesh(new THREE.DodecahedronGeometry(0.06,0),metalMat);
  wHead.position.set(0.36,0.56,0);g.add(wHead);
  // Shield on left arm
  const shield=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.2,0.18),new THREE.MeshStandardMaterial({roughness:0.8,metalness:0.05,color:0x5a2010}));
  shield.position.set(-0.22,0.38,0);g.add(shield);
  const shieldBoss=new THREE.Mesh(new THREE.SphereGeometry(0.035,6,4),metalMat);
  shieldBoss.position.set(-0.24,0.38,0);g.add(shieldBoss);

  g.position.set(r.x/TILE,0,r.y/TILE);
  unitGroup.add(g);raiderMeshes.set(r.id,g);
}
function syncUnits(){
  // colonists
  const t=state.tick;
  state.colonists.forEach(c=>{
    if(!colonistMeshes.has(c.id))createColonistMesh(c);
    const g=colonistMeshes.get(c.id);
    // Lerp toward game-logic position for smooth 60fps movement
    const tx=c.x/TILE, tz=c.y/TILE;
    const cdx=tx-g.position.x, cdz=tz-g.position.z;
    g.position.x+=cdx*0.22; g.position.z+=cdz*0.22;
    // Face movement direction smoothly
    if(Math.abs(cdx)+Math.abs(cdz)>0.003){
      const targetAngle=Math.atan2(cdx,cdz);
      let da=targetAngle-g.rotation.y;
      if(da>Math.PI)da-=Math.PI*2; if(da<-Math.PI)da+=Math.PI*2;
      g.rotation.y+=da*0.18;
    }
    const ring=g.getObjectByName('selring');
    if(ring)ring.visible=(state.selectedColonist===c.id);

    const body=g.getObjectByName('body');
    const lLeg=g.getObjectByName('lLeg');
    const rLeg=g.getObjectByName('rLeg');
    const lArm=body?.getObjectByName('lArm');
    const rArm=body?.getObjectByName('rArm');
    const head=body?.getObjectByName('head');
    const tool=body?.getObjectByName('tool');
    const soldier=body?.getObjectByName('soldier');

    const b=c.job!==null?state.buildings[c.job]:null;
    const isSoldier=b&&b.type==='barracks';
    const isBuilder=b&&b.constructing;
    const isWorker=b&&!b.constructing&&(b.type==='woodcutter'||b.type==='quarry');
    const isFarmer=b&&!b.constructing&&b.type==='farm';
    const hasToolJob=isBuilder||isWorker||isFarmer;
    if(tool)tool.visible=!!hasToolJob;
    if(soldier)soldier.visible=!!isSoldier;

    const walking=c.path&&c.path.length>0;
    const phase=t*0.15+c.id*2.3; // unique phase per colonist
    // Determine if colonist is at their workplace
    const atWork=b&&!walking&&Math.abs(c.x/TILE-(b.c+0.5))<1.5&&Math.abs(c.y/TILE-(b.r+0.5))<1.5;

    if(walking){
      // ── Walk cycle: legs and arms swing opposite ──
      const swing=Math.sin(phase*2)*0.45;
      if(lLeg)lLeg.rotation.x=swing;
      if(rLeg)rLeg.rotation.x=-swing;
      if(lArm)lArm.rotation.x=-swing*0.6;
      if(rArm)rArm.rotation.x=swing*0.6;
      if(body)body.rotation.x=0;
      if(head)head.rotation.x=0;
      g.position.y=Math.abs(Math.sin(phase*2))*0.03;
    } else if(atWork&&isBuilder){
      // ── Hammering: right arm swings down, body bends forward ──
      const hammer=Math.sin(phase*3);
      if(rArm)rArm.rotation.x=hammer>0?-hammer*1.2:-0.1;
      if(lArm)lArm.rotation.x=-0.3;
      if(body)body.rotation.x=0.15+Math.max(0,hammer)*0.1;
      if(lLeg)lLeg.rotation.x=0;
      if(rLeg)rLeg.rotation.x=0;
      if(head)head.rotation.x=-0.1;
      g.position.y=0;
    } else if(atWork&&isWorker){
      // ── Chopping/mining: two-handed overhead swing ──
      const chop=Math.sin(phase*2.5);
      const armAng=chop>0?-chop*1.4:-0.2;
      if(rArm)rArm.rotation.x=armAng;
      if(lArm)lArm.rotation.x=armAng*0.7;
      if(body)body.rotation.x=0.1+Math.max(0,chop)*0.15;
      if(lLeg)lLeg.rotation.x=0.05;
      if(rLeg)rLeg.rotation.x=-0.05;
      if(head)head.rotation.x=-0.1;
      g.position.y=0;
    } else if(atWork&&isFarmer){
      // ── Farming: bending down and up, arms reach to ground ──
      const bend=Math.sin(phase*1.5)*0.5+0.5; // 0..1 range
      if(body)body.rotation.x=bend*0.4;
      if(rArm)rArm.rotation.x=bend*0.6;
      if(lArm)lArm.rotation.x=bend*0.6;
      if(lLeg)lLeg.rotation.x=0;
      if(rLeg)rLeg.rotation.x=0;
      if(head)head.rotation.x=-bend*0.2;
      g.position.y=0;
    } else if(atWork&&isSoldier){
      // ── Training: sword practice swings ──
      const sw=Math.sin(phase*2);
      if(rArm)rArm.rotation.x=sw*0.8;
      if(lArm)lArm.rotation.x=-sw*0.4;
      if(body)body.rotation.x=sw*0.05;
      if(lLeg)lLeg.rotation.x=sw*0.2;
      if(rLeg)rLeg.rotation.x=-sw*0.2;
      if(head)head.rotation.x=0;
      g.position.y=0;
    } else if(c.attackCooldown>0){
      // ── Combat strike ──
      const strike=Math.sin(t*0.5)*0.8;
      if(rArm)rArm.rotation.x=strike;
      if(lArm)lArm.rotation.x=0;
      if(body)body.rotation.x=0.1;
      if(lLeg)lLeg.rotation.x=0;
      if(rLeg)rLeg.rotation.x=0;
      g.position.y=0;
    } else {
      // ── Idle: gentle breathing sway ──
      const idle=Math.sin(phase*0.5)*0.03;
      if(lLeg)lLeg.rotation.x=0;
      if(rLeg)rLeg.rotation.x=0;
      if(lArm)lArm.rotation.x=idle;
      if(rArm)rArm.rotation.x=-idle;
      if(body)body.rotation.x=0;
      if(head)head.rotation.x=0;
      g.position.y=0;
    }
  });
  colonistMeshes.forEach((g,id)=>{
    if(!state.colonists.find(c=>c.id===id)){unitGroup.remove(g);colonistMeshes.delete(id);}
  });
  // raiders
  state.raiders.forEach(r=>{
    if(!raiderMeshes.has(r.id))createRaiderMesh(r);
    const g=raiderMeshes.get(r.id);
    const rtx=r.x/TILE, rtz=r.y/TILE;
    const rdx=rtx-g.position.x, rdz=rtz-g.position.z;
    g.position.x+=rdx*0.22; g.position.z+=rdz*0.22;
    // Face movement direction
    if(Math.abs(rdx)+Math.abs(rdz)>0.002)g.rotation.y=Math.atan2(rdx,rdz);
  });
  raiderMeshes.forEach((g,id)=>{
    if(!state.raiders.find(r=>r.id===id)){unitGroup.remove(g);raiderMeshes.delete(id);}
  });
}

// ── Smoke particles ──────────────────────────────────────────────────────────
let smokeGeo,smokePositions,smokeData=[];
const MAX_SMOKE=200;
function initSmoke(){
  smokeGeo=new THREE.BufferGeometry();
  smokePositions=new Float32Array(MAX_SMOKE*3);
  smokeGeo.setAttribute('position',new THREE.BufferAttribute(smokePositions,3));
  const smokeMat=new THREE.PointsMaterial({color:0x888888,size:0.22,transparent:true,opacity:0.35,sizeAttenuation:true,depthWrite:false});
  const pts=new THREE.Points(smokeGeo,smokeMat);
  scene.add(pts);
  for(let i=0;i<MAX_SMOKE;i++)smokeData.push({active:false,x:0,y:0,z:0,vx:0,vy:0,vz:0,life:0});
}
function spawnSmoke(wx,wz){
  for(let i=0;i<MAX_SMOKE;i++){
    if(!smokeData[i].active){
      smokeData[i]={active:true,x:wx+(Math.random()-0.5)*0.3,y:0.6,z:wz+(Math.random()-0.5)*0.3,
        vx:(Math.random()-0.5)*0.008,vy:0.012+Math.random()*0.01,vz:(Math.random()-0.5)*0.008,life:60+Math.random()*40};
      return;
    }
  }
}
function updateSmokeSystem(){
  let idx=0;
  // spawn from active buildings with chimneys
  if(state.tick%8===0){
    Object.values(state.buildings).forEach(b=>{
      if(!b.constructing&&b.hp>0&&(b.type==='house'||b.type==='woodcutter'||b.type==='barracks')){
        const sz=BUILDINGS[b.type].size;
        spawnSmoke(b.c+sz/2,b.r+sz/2);
      }
    });
  }
  smokeData.forEach(p=>{
    if(p.active){
      p.x+=p.vx;p.y+=p.vy;p.z+=p.vz;p.life--;
      if(p.life<=0)p.active=false;
    }
    if(p.active){smokePositions[idx*3]=p.x;smokePositions[idx*3+1]=p.y;smokePositions[idx*3+2]=p.z;}
    else{smokePositions[idx*3]=0;smokePositions[idx*3+1]=-999;smokePositions[idx*3+2]=0;}
    idx++;
  });
  smokeGeo.attributes.position.needsUpdate=true;
}

// ── Floating text (CSS divs — pooled) ────────────────────────────────────────
let floatContainer;
const floatDivPool=[];
function initFloats(){
  floatContainer=document.getElementById('float-container');
  // Pre-create pool
  for(let i=0;i<32;i++){
    const d=document.createElement('div');
    d.className='float-label';d.style.display='none';
    floatContainer.appendChild(d);floatDivPool.push(d);
  }
}
function updateFloatDivs(){
  state.floats=state.floats.filter(f=>f.life>0);
  const w=renderer.domElement.clientWidth,h=renderer.domElement.clientHeight;
  let pi=0;
  state.floats.forEach(f=>{
    f.life--;
    const v=new THREE.Vector3(f.wx,f.wy+(1-(f.life/f.maxLife))*1.0,f.wz);
    v.project(camera);
    const sx=(v.x*0.5+0.5)*w;
    const sy=(-v.y*0.5+0.5)*h;
    const d=floatDivPool[pi++];if(!d)return;
    d.style.display='block';
    d.style.left=sx+'px';d.style.top=sy+'px';
    d.style.color=f.color;
    d.style.opacity=Math.min(1,f.life/18);
    d.textContent=f.text;
  });
  // Hide unused pool entries
  for(let i=pi;i<floatDivPool.length;i++)floatDivPool[i].style.display='none';
}

// ── Minimap ───────────────────────────────────────────────────────────────────
let minimapCtx,minimapCanvas;
const MM_W=160,MM_H=120;
function initMinimap(){
  minimapCanvas=document.getElementById('minimap-canvas');
  minimapCtx=minimapCanvas.getContext('2d');
  minimapCanvas.addEventListener('click',e=>{
    const rect=minimapCanvas.getBoundingClientRect();
    const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    state.camTarget.x=(mx/MM_W)*COLS;
    state.camTarget.z=(my/MM_H)*ROWS;
    clampCameraTarget();updateCameraPos();
  });
}
const MM_COLORS={0:'#4a7a3a',1:'#2d5c1e',2:'#7a7060',3:'#2a4a7a',4:'#6a5030'};
function drawMinimap(){
  if(!minimapCtx)return;
  const tw=MM_W/COLS,th=MM_H/ROWS;
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      minimapCtx.fillStyle=MM_COLORS[state.tiles[r]?.[c]?.type]||'#4a7a3a';
      minimapCtx.fillRect(c*tw,r*th,tw+0.5,th+0.5);
    }
  }
  // buildings
  Object.values(state.buildings).forEach(b=>{
    const sz=BUILDINGS[b.type].size;
    minimapCtx.fillStyle=b.hp<=0?'#444':BUILDINGS[b.type].color||'#888';
    minimapCtx.fillRect(b.c*tw,b.r*th,sz*tw,sz*th);
  });
  // colonists
  minimapCtx.fillStyle='#40e080';
  state.colonists.forEach(c=>{minimapCtx.fillRect((c.x/TILE)*tw-1,(c.y/TILE)*th-1,3,3);});
  // raiders
  minimapCtx.fillStyle='#e04040';
  state.raiders.forEach(r=>{minimapCtx.fillRect((r.x/TILE)*tw-1,(r.y/TILE)*th-1,3,3);});
  // viewport rect
  if(camera&&scene){
    const fh=state.camZoom;
    const aspect=renderer.domElement.clientWidth/renderer.domElement.clientHeight;
    const vw=(fh*aspect/TILE)*tw*0.5,vh=(fh/TILE)*th*0.5;
    const vx=(state.camTarget.x/COLS)*MM_W;
    const vy=(state.camTarget.z/ROWS)*MM_H;
    minimapCtx.strokeStyle='rgba(255,255,255,0.6)';
    minimapCtx.lineWidth=1;
    minimapCtx.strokeRect(vx-vw,vy-vh,vw*2,vh*2);
  }
}

// ── Placement ghost ──────────────────────────────────────────────────────────
function updatePlacementGhost(){
  if(!state.placing||!state.hoverTile){
    if(ghostMesh){scene.remove(ghostMesh);ghostMesh=null;}
    return;
  }
  const {r,c}=state.hoverTile;
  const sz=BUILDINGS[state.placing]?.size||1;
  if(!ghostMesh){
    ghostMesh=new THREE.Mesh(
      new THREE.BoxGeometry(sz*0.95,0.5,sz*0.95),
      new THREE.MeshBasicMaterial({color:0x40c0ff,transparent:true,opacity:0.4,wireframe:false})
    );
    scene.add(ghostMesh);
  }
  ghostMesh.position.set(c+sz/2,0.25,r+sz/2);
  // color: red if can't place, blue if ok
  const canPlace=canBuildAt(r,c,sz);
  ghostMesh.material.color.set(canPlace?0x40c0ff:0xff4040);
}
function canBuildAt(r,c,sz){
  if(r<0||c<0||r+sz>ROWS||c+sz>COLS)return false;
  for(let dr=0;dr<sz;dr++)for(let dc=0;dc<sz;dc++){
    const t=state.tiles[r+dr]?.[c+dc];
    if(t?.type===T.WATER)return false;
    if(Object.values(state.buildings).some(b=>{
      const bs=BUILDINGS[b.type].size;
      return !(c+sz<=b.c||c>=b.c+bs||r+sz<=b.r||r>=b.r+bs);
    }))return false;
  }
  return true;
}

// ── Main draw loop ──────────────────────────────────────────────────────────
function syncBuildings(){
  state.buildings.forEach(b=>{
    if(!b.constructing)return;
    const newStage=Math.floor((b.progress/120)*5);
    // Rebuild mesh when construction stage changes
    if(b._stage!==undefined&&b._stage!==newStage){
      rebuildBuildingMesh(b.id);
    }
    // Update progress bar fill width
    const g=buildingMeshes.get(b.id);if(!g)return;
    const bar=g.getObjectByName('pbar');if(!bar)return;
    const sz=BUILDINGS[b.type].size;
    const pct=Math.max(0.01, b.progress/120);
    const barW=sz*0.7;
    const fillW=Math.max(0.02,barW*pct);
    bar.scale.x=1; // reset scale; update geometry via position
    bar.position.x=-barW/2+fillW/2;
    // Update bar geometry width by scaling
    const baseW=bar.geometry.parameters?.width||0.02;
    bar.scale.x=fillW/baseW;
    bar.material.color.set(pct<0.5?0xe0a020:0x40d060);
  });
}
function draw(){
  requestAnimationFrame(draw);
  tickCamera();
  syncUnits();
  syncBuildings();
  updateSmokeSystem();
  updateFloatDivs();
  updatePlacementGhost();
  drawMinimap();
  renderer.render(scene,camera);
}

// ── UI helpers ───────────────────────────────────────────────────────────────
const JOB_LABELS={farm:'Farmer',woodcutter:'Woodcutter',quarry:'Miner',barracks:'Soldier',storehouse:'Hauler'};
function updateResourceUI(){
  document.getElementById('res-wood').textContent=Math.floor(state.resources.wood);
  document.getElementById('res-stone').textContent=Math.floor(state.resources.stone);
  document.getElementById('res-food').textContent=Math.floor(state.resources.food);
  document.getElementById('res-pop').textContent=state.colonists.length;
  document.getElementById('res-housing').textContent=state.housing;
  document.getElementById('season-label').textContent=SEASON_NAMES[state.season];
  document.getElementById('day-label').textContent='Day '+state.day;
  const ra=document.getElementById('raid-alert');
  if(state.raiders.length>0)ra.classList.add('active');else ra.classList.remove('active');
  updateColonistRoster();
}
let _rosterHash='';
function updateColonistRoster(){
  const list=document.getElementById('roster-list');
  if(!list)return;
  // Build a lightweight hash — only rebuild DOM when something meaningful changed
  const hash=state.colonists.map(c=>{
    const b=c.job!==null?state.buildings[c.job]:null;
    return `${c.id}:${c.hp}:${c.job}:${b?.constructing?1:0}:${state.selectedColonist===c.id?1:0}`;
  }).join('|')+`|${state.colonists.length}`;
  if(hash===_rosterHash)return;
  _rosterHash=hash;

  list.innerHTML='';
  state.colonists.forEach(c=>{
    const b=c.job!==null?state.buildings[c.job]:null;
    const jobLabel=b?(b.constructing?'Builder':JOB_LABELS[b.type]||b.type):'Idle';
    const hpPct=Math.max(0,Math.min(100,(c.hp/c.maxHp)*100));
    const hpColor=hpPct>60?'#40c070':hpPct>30?'#c0a020':'#c03030';
    const hue=(c.id*137)%360;
    const traitDots=(c.traits||[]).map(t=>`<span style="color:${TRAITS[t].color}" title="${TRAITS[t].label}">●</span>`).join('');
    const row=document.createElement('div');
    row.className='colonist-row'+(state.selectedColonist===c.id?' selected':'');
    row.innerHTML=`
      <div class="col-dot" style="background:hsl(${hue},55%,45%)"></div>
      <div class="col-name">${c.name}${traitDots?'<span style="margin-left:3px">'+traitDots+'</span>':''}</div>
      <div class="col-job">${jobLabel}</div>
      <div class="col-hp">
        <div class="col-hp-bar"><div class="col-hp-fill" style="width:${hpPct}%;background:${hpColor}"></div></div>
      </div>`;
    row.addEventListener('click',()=>{
      state.selectedColonist=c.id;
      // Pan camera to colonist
      state.camTarget.x=c.x/TILE;
      state.camTarget.z=c.y/TILE;
      clampCameraTarget();updateCameraPos();
      showColonistInfo(c);
      updateColonistRoster();
    });
    list.appendChild(row);
  });
}
function log(msg){
  const lc=document.getElementById('log-content');
  const d=document.createElement('div');d.textContent=msg;
  lc.insertBefore(d,lc.firstChild);
  while(lc.children.length>40)lc.removeChild(lc.lastChild);
}
function showTileInfo(r,c){
  const ic=document.getElementById('info-content');
  if(r===null){ic.textContent='Click a tile to inspect';return;}
  const tt=['Grass','Forest','Stone','Water','Dirt'][state.tiles[r]?.[c]?.type]||'?';
  const bld=Object.values(state.buildings).find(b=>{const s=BUILDINGS[b.type].size;return r>=b.r&&r<b.r+s&&c>=b.c&&c<b.c+s;});
  let html=`<b>Tile (${r},${c})</b><br>Terrain: ${tt}`;
  if(bld){
    const maxHp=BUILDINGS[bld.type].maxHp;
    const hpPct=Math.floor((bld.hp/maxHp)*100);
    const hpCol=hpPct>60?'#70d070':hpPct>30?'#d0a020':'#d04030';
    html+=`<br><br><b>${BUILDINGS[bld.type].name}</b>`;
    html+=`<br>HP: <span style="color:${hpCol}">${Math.ceil(bld.hp)}/${maxHp}</span>`;
    if(bld.constructing){
      const pct=Math.floor((bld.progress/120)*100);
      html+=`<br>🔨 Building… ${pct}%`;
    } else if(bld.hp<maxHp&&bld.hp>0){
      html+=`<br><span style="color:#d09020">⚠ Damaged (${hpPct}%)</span>`;
      html+=`<br><span style="color:#60b080;font-size:10px">Assign worker to repair</span>`;
    }
    html+=`<br>Workers: ${bld.workers}`;
    if(bld.active!==undefined&&!bld.constructing)html+=`<br>Active: ${bld.active?'Yes':'No'}`;
  }
  ic.innerHTML=html;
}

// ── Save / Load ───────────────────────────────────────────────────────────────
function saveGame(){
  try{
    const s=JSON.stringify({...state,floats:[],selectedColonist:null});
    localStorage.setItem('colonyBuilder3D',s);
    log('Game saved.');
  }catch(e){log('Save failed: '+e.message);}
}
function loadGame(){
  try{
    const raw=localStorage.getItem('colonyBuilder3D');
    if(!raw){log('No save found.');return;}
    const loaded=JSON.parse(raw);
    Object.assign(state,loaded);
    state.floats=[];
    // Rebuild all meshes
    buildingMeshes.forEach(g=>buildingGroup.remove(g));buildingMeshes.clear();
    colonistMeshes.forEach(g=>unitGroup.remove(g));colonistMeshes.clear();
    raiderMeshes.forEach(g=>unitGroup.remove(g));raiderMeshes.clear();
    terrainGroup.children.length=0;decorGroup.children.length=0;
    buildTerrainMeshes();
    Object.keys(state.buildings).forEach(id=>addBuildingMesh(state.buildings[id]));
    updateCameraPos();
    updateResourceUI();
    log('Game loaded.');
  }catch(e){log('Load failed: '+e.message);}
}

// ── Input / raycasting ────────────────────────────────────────────────────────
let raycaster,mouse;
function initInput(){
  raycaster=new THREE.Raycaster();
  mouse=new THREE.Vector2();
  const area=document.getElementById('game-area');

  function getCanvasXY(e){
    const r=renderer.domElement.getBoundingClientRect();
    return{cx:e.clientX-r.left,cy:e.clientY-r.top};
  }
  function toNDC(cx,cy){
    const w=renderer.domElement.clientWidth,h=renderer.domElement.clientHeight;
    return{x:(cx/w)*2-1,y:-(cy/h)*2+1};
  }
  function screenToTile(e){
    const{cx,cy}=getCanvasXY(e);
    const{x,y}=toNDC(cx,cy);
    mouse.set(x,y);
    raycaster.setFromCamera(mouse,camera);
    const hits=raycaster.intersectObject(groundPlane);
    if(!hits.length)return null;
    const p=hits[0].point;
    const r=Math.floor(p.z),c=Math.floor(p.x);
    if(r<0||r>=ROWS||c<0||c>=COLS)return null;
    return{r,c};
  }

  // Mouse move: hover tile
  area.addEventListener('mousemove',e=>{
    if(state.isDragging){
      const{cx,cy}=getCanvasXY(e);
      const sdx=cx-state.dragStart.cx;
      const sdy=cy-state.dragStart.cy;
      const scale=state.camZoom/renderer.domElement.clientHeight*0.707;
      // Isometric grab-and-drag: camera right=(1,0,-1)/√2, camera down=(1,0,1)/√2
      state.camTarget.x=state.dragStart.tx-(sdx+sdy)*scale;
      state.camTarget.z=state.dragStart.tz+(sdx-sdy)*scale;
      clampCameraTarget();updateCameraPos();
      return;
    }
    const t=screenToTile(e);
    state.hoverTile=t;
  });

  area.addEventListener('mousedown',e=>{
    if(e.button===2){
      const{cx,cy}=getCanvasXY(e);
      state.isDragging=true;
      state.dragStart={cx,cy,tx:state.camTarget.x,tz:state.camTarget.z};
      return;
    }
  });

  area.addEventListener('mouseup',e=>{
    if(e.button===2){state.isDragging=false;return;}
    if(state.isDragging)return;
    if(state.gameOver)return;
    const t=screenToTile(e);
    if(!t)return;
    if(state.placing&&state.placing!=='none'){
      const btype=state.placing;
      // placeBuilding handles cost check and deduction internally
      if(placeBuilding(t.r,t.c,btype)!==false)setPlacing(null);
    } else {
      // Check if clicking a colonist
      let hitColonist=null;
      state.colonists.forEach(c=>{
        const dx=c.x/TILE-t.c-0.5,dz=c.y/TILE-t.r-0.5;
        if(Math.abs(dx)<0.5&&Math.abs(dz)<0.5)hitColonist=c.id;
      });

      if(hitColonist!==null){
        state.selectedColonist=hitColonist;
        const c=state.colonists.find(x=>x.id===hitColonist);
        if(c)showColonistInfo(c);
        updateColonistRoster();
      } else if(state.selectedColonist!==null){
        const bld=state.buildings.find(b=>{
          const s=BUILDINGS[b.type].size;
          return t.r>=b.r&&t.r<b.r+s&&t.c>=b.c&&t.c<b.c+s;
        });
        if(bld&&bld.hp>0){
          assignColonistToBuilding(state.selectedColonist,bld.id);
          const c=state.colonists.find(x=>x.id===state.selectedColonist);
          if(c)showColonistInfo(c);
          updateColonistRoster();
        } else {
          assignColonistToBuilding(state.selectedColonist,null);
          const c=state.colonists.find(x=>x.id===state.selectedColonist);
          if(c)showColonistInfo(c);
          updateColonistRoster();
        }
      } else {
        showTileInfo(t.r,t.c);
      }
    }
  });

  // Right-drag context: also right-click to cancel placing
  area.addEventListener('contextmenu',e=>{
    e.preventDefault();
    if(state.isDragging){state.isDragging=false;return;}
    if(state.placing){setPlacing(null);return;}
    // right-click to move selected colonist
    const t=screenToTile(e);
    if(t&&state.selectedColonist!==null){
      const c=state.colonists.find(x=>x.id===state.selectedColonist);
      if(c){c.task='idle';c.target=null;c.dest={x:t.c*TILE+20,y:t.r*TILE+20};log(`Colonist ordered to (${t.r},${t.c})`);}
    }
  });

  // Scroll zoom
  area.addEventListener('wheel',e=>{
    e.preventDefault();
    const delta=e.deltaY>0?1.5:-1.5;
    state.camZoom=Math.max(8,Math.min(35,state.camZoom+delta));
    setupCamera();
  },{passive:false});

  // Keyboard
  document.addEventListener('keydown',e=>{
    if(e.key==='s'||e.key==='S')saveGame();
    if(e.key==='l'||e.key==='L')loadGame();
    if(e.key==='Escape'){setPlacing(null);state.selectedColonist=null;}
  });

  // Build buttons
  document.querySelectorAll('.build-btn[data-type]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const t=btn.dataset.type;
      if(t==='none'){setPlacing(null);return;}
      if(t==='')return;
      setPlacing(state.placing===t?null:t);
    });
  });

  document.getElementById('btn-save').addEventListener('click',saveGame);
  document.getElementById('btn-load').addEventListener('click',loadGame);

}

// ── Misc helpers ─────────────────────────────────────────────────────────────
function setPlacing(type){
  state.placing=type;
  document.querySelectorAll('.build-btn[data-type]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.type===type);
  });
  document.getElementById('game-area').classList.toggle('placing',!!type);
}
function clampCameraTarget(){
  state.camTarget.x=Math.max(4,Math.min(COLS-4,state.camTarget.x));
  state.camTarget.z=Math.max(3,Math.min(ROWS-3,state.camTarget.z));
}
function resetGame(){
  // Reload page for cleanest reset
  location.reload();
}
// ── Sound Engine (Web Audio API — no files needed) ────────────────────────────
let audioCtx=null;
let _ambientStarted=false;
function initAudio(){
  const unlock=()=>{
    if(audioCtx){if(audioCtx.state==='suspended')audioCtx.resume();return;}
    try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();startAmbient();}catch(e){}
  };
  document.addEventListener('click',unlock);
  document.addEventListener('keydown',unlock);
}
function _tone(freq,type,dur,vol,delay=0){
  if(!audioCtx||audioCtx.state==='suspended')return;
  try{
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.connect(g);g.connect(audioCtx.destination);
    o.type=type;o.frequency.value=freq;
    const t=audioCtx.currentTime+delay;
    g.gain.setValueAtTime(0.001,t);
    g.gain.linearRampToValueAtTime(vol,t+0.01);
    g.gain.exponentialRampToValueAtTime(0.001,t+Math.max(0.01,dur));
    o.start(t);o.stop(t+dur+0.06);
  }catch(e){}
}
function _noise(dur,vol,filtFreq=600,Q=1.5){
  if(!audioCtx||audioCtx.state==='suspended')return;
  try{
    const sr=audioCtx.sampleRate,len=Math.max(1,Math.ceil(sr*dur));
    const buf=audioCtx.createBuffer(1,len,sr);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
    const src=audioCtx.createBufferSource();src.buffer=buf;
    const flt=audioCtx.createBiquadFilter();flt.type='bandpass';flt.frequency.value=filtFreq;flt.Q.value=Q;
    const g=audioCtx.createGain();
    g.gain.setValueAtTime(vol,audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+Math.max(0.01,dur));
    src.connect(flt);flt.connect(g);g.connect(audioCtx.destination);src.start();
  }catch(e){}
}
function soundBuildComplete(){
  // Ascending major chord: C5, E5, G5, C6
  [[523,0],[659,0.07],[784,0.14],[1047,0.21]].forEach(([f,d])=>_tone(f,'triangle',0.65,0.07,d));
}
function soundHammer(){
  // Short metallic tap
  _noise(0.05,0.038,650,2.2);
  _tone(190,'sine',0.03,0.022);
}
function soundHit(){
  // Impact thud
  _noise(0.06,0.05,350,1.1);
  _tone(120,'sine',0.04,0.03);
}
function soundRaidAlarm(){
  // Urgent horn triplet
  [0,0.38,0.76].forEach(d=>{
    _tone(220,'sawtooth',0.3,0.11,d);
    _tone(330,'sawtooth',0.3,0.055,d);
  });
}
function soundColonistDie(){
  // Sad descending sine
  [[370,0],[270,0.13],[170,0.27]].forEach(([f,d])=>_tone(f,'sine',0.13,0.05,d));
}
function startAmbient(){
  if(!audioCtx||_ambientStarted)return;
  _ambientStarted=true;
  try{
    const sr=audioCtx.sampleRate,len=sr*4;
    const buf=audioCtx.createBuffer(1,len,sr);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
    const src=audioCtx.createBufferSource();src.buffer=buf;src.loop=true;
    const flt=audioCtx.createBiquadFilter();flt.type='lowpass';flt.frequency.value=280;
    const g=audioCtx.createGain();g.gain.value=0.011;
    src.connect(flt);flt.connect(g);g.connect(audioCtx.destination);src.start();
  }catch(e){}
}

// ── Boot ──────────────────────────────────────────────────────────────────────
function init(){
  generateMap();
  initThree();
  initInput();
  initFloats();
  initAudio();
  updateResourceUI();
  log('Colony founded. Build a house to attract settlers.');
  // Spawn initial colonist
  const startC=Math.floor(COLS/2),startR=Math.floor(ROWS/2);
  spawnColonist(startC*TILE+20,startR*TILE+20);
  setInterval(()=>{
    if(!state.gameOver)tick();
  },200);
  draw();
}

window.addEventListener('load',init);
