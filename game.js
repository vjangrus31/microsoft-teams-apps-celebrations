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
    });
  }
}

function updateRaiders() {
  state.nextRaidIn--;
  if(state.nextRaidIn<=0){spawnRaid();state.nextRaidIn=Math.max(500,1400-state.day*10);}
  state.raiders.forEach(raider=>{
    raider.blinkTimer=(raider.blinkTimer+1)%60;
    if(raider.attackCooldown>0){raider.attackCooldown--;return;}
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
      const dx=nx-raider.x,dy=ny-raider.y,dist=Math.sqrt(dx*dx+dy*dy),speed=0.7;
      const nnx=raider.x+(dx/dist)*speed,nny=raider.y+(dy/dist)*speed;
      const tc=Math.floor(nnx/TILE),tr=Math.floor(nny/TILE);
      const tile=state.tiles[tr]?.[tc];
      if(tile&&tile.building!==null){
        const bk=state.buildings[tile.building];
        if(bk&&BUILDINGS[bk.type].isBarrier){
          const tc2=Math.floor((raider.x+(dx/dist)*speed)/TILE),tr2=Math.floor(raider.y/TILE);
          const t2=state.tiles[tr2]?.[tc2];
          if(!t2||t2.building===null||!BUILDINGS[state.buildings[t2.building]?.type]?.isBarrier)
            raider.x=raider.x+(dx/dist)*speed;
          else raider.y=raider.y+(dy/dist)*speed;
          return;
        }
      }
      raider.x=nnx;raider.y=nny;
    } else {
      raider.attackCooldown=60;
      if(nc){
        nc.hp-=10;
        addFloat(nc.x/TILE,nc.y/TILE,'-10','#ff4444');
        if(nc.hp<=0)killColonist(nc.id);
      } else if(nb){
        nb.hp-=15;
        addFloat(nx/TILE,ny/TILE,'-15','#ff6644');
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
  log(`💀 ${c.name} has died`);
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
  document.getElementById('info-content').innerHTML=
    `<b>${c.name}</b>${b?.type==='barracks'?' ⚔':''}<br>`+
    `Job: ${jobName}<br>Hunger: ${Math.floor(c.hunger)}/100<br>HP: ${c.hp}/${c.maxHp}<br><br>`+
    `<span style="color:#7ec8e3">Click a work building<br>to assign, or open<br>ground to unassign.</span>`;
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
    // Count builders in range (assigned to this building)
    let builders=0;
    state.colonists.forEach(c=>{
      if(c.job!==b.id)return;
      const dx=c.x-bx, dy=c.y-by, d=Math.sqrt(dx*dx+dy*dy);
      if(d<TILE*1.8)builders++;
    });
    if(builders===0)return; // no one working → no progress
    b.progress+=builders; // more builders = faster
    if(b.progress>=120){
      b.constructing=false;b.active=true;b.progress=120;
      log(`✅ ${BUILDINGS[b.type].name} complete`);
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
      c.hunger-=2;
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
      if(dist<3)c.path.shift();else{c.x+=(dx/dist)*0.8;c.y+=(dy/dist)*0.8;}
    } else if(c.pathTarget&&c.job!==null){
      const tx=(c.pathTarget.c+0.5)*TILE,ty=(c.pathTarget.r+0.5)*TILE;
      const dx=tx-c.x,dy=ty-c.y,dist=Math.sqrt(dx*dx+dy*dy);
      if(dist>3){c.x+=(dx/dist)*0.8;c.y+=(dy/dist)*0.8;}
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
  }
  checkWinLose();
  state.resources.wood=Math.max(0,Math.min(9999,state.resources.wood));
  state.resources.stone=Math.max(0,Math.min(9999,state.resources.stone));
  state.resources.food=Math.max(0,Math.min(9999,state.resources.food));
}

// ============================================================
// THREE.JS — Scene setup
// ============================================================
let renderer,scene,camera,groundPlane;
let terrainGroup,decorGroup,buildingGroup,unitGroup;
let terrainMeshes=[],decorGroups=[];
let buildingMeshes=new Map(),colonistMeshes=new Map(),raiderMeshes=new Map();
let smokeMesh,ghostMesh=null;
let mmCanvas,mmCtx;

const SKY=[0x87ceeb,0x9ad8f5,0xd07030,0xc0d8e8];
const TCOLORS=[[0x5aaa48,0x2c561a,0x787068,0x2060cc,0x9a7840],[0x5aba4a,0x386820,0x787068,0x1848b0,0x9a7840],[0x9a7040,0x4a3410,0x787068,0x1848a0,0x8a6830],[0xb0b8c0,0x485850,0x909098,0x3060a0,0x909898]];

function mat(col,opts={}){return new THREE.MeshLambertMaterial({color:col,...opts});}
function bmat(col){return new THREE.MeshBasicMaterial({color:col});}

function initThree(){
  const area=document.getElementById('game-area');
  renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setSize(area.clientWidth,area.clientHeight);
  area.appendChild(renderer.domElement);
  scene=new THREE.Scene();
  scene.background=new THREE.Color(SKY[state.season]);
  scene.fog=new THREE.FogExp2(SKY[state.season],0.016);
  setupCamera();
  scene.add(new THREE.AmbientLight(0x8090b0,0.55));
  const sun=new THREE.DirectionalLight(0xfff8e0,1.0);
  sun.position.set(20,30,10);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);
  const sc=sun.shadow.camera;sc.left=-55;sc.right=55;sc.top=45;sc.bottom=-45;sc.near=1;sc.far=150;
  scene.add(sun);
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

function setupCamera(){
  const area=document.getElementById('game-area');
  const aspect=area.clientWidth/area.clientHeight;
  const fh=state.camZoom;
  camera=new THREE.OrthographicCamera(-fh*aspect/2,fh*aspect/2,fh/2,-fh/2,0.1,300);
  updateCameraPos();
}

function updateCameraPos(){
  const t=state.camTarget;
  camera.position.set(t.x+18,22,t.z+18);
  camera.lookAt(t.x,0,t.z);
}

function onResize(){
  const area=document.getElementById('game-area');
  const w=area.clientWidth,h=area.clientHeight,aspect=w/h,fh=state.camZoom;
  camera.left=-fh*aspect/2;camera.right=fh*aspect/2;camera.top=fh/2;camera.bottom=-fh/2;
  camera.updateProjectionMatrix();renderer.setSize(w,h);
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
function createColonistMesh(c){
  const g=new THREE.Group();
  const hue=(c.id*137)%360;
  const skinMat=new THREE.MeshLambertMaterial({color:0xf0c890});
  const shirtMat=new THREE.MeshLambertMaterial({color:new THREE.Color(`hsl(${hue},55%,40%)`)});
  const pantsMat=new THREE.MeshLambertMaterial({color:new THREE.Color(`hsl(${(hue+30)%360},30%,25%)`)});
  const hairMat=new THREE.MeshLambertMaterial({color:new THREE.Color(`hsl(${(c.id*53)%360},40%,20%)`)});
  const bootMat=new THREE.MeshLambertMaterial({color:0x3a2010});
  const woodMat=new THREE.MeshLambertMaterial({color:0x8a5020});
  const metalMat=new THREE.MeshLambertMaterial({color:0x808888});

  // Left leg pivot (at hip)
  const lLeg=new THREE.Group();lLeg.name='lLeg';lLeg.position.set(-0.07,0.27,0);
  const lLegM=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,0.18,6),pantsMat);
  lLegM.position.y=-0.09;lLeg.add(lLegM);
  const lBoot=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.08,0.12),bootMat);
  lBoot.position.set(0,-0.2,0.02);lLeg.add(lBoot);
  g.add(lLeg);
  // Right leg pivot
  const rLeg=new THREE.Group();rLeg.name='rLeg';rLeg.position.set(0.07,0.27,0);
  const rLegM=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,0.18,6),pantsMat);
  rLegM.position.y=-0.09;rLeg.add(rLegM);
  const rBoot=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.08,0.12),bootMat);
  rBoot.position.set(0,-0.2,0.02);rLeg.add(rBoot);
  g.add(rLeg);

  // Torso (pivotable for bending)
  const body=new THREE.Group();body.name='body';body.position.set(0,0.27,0);
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.22,0.14),shirtMat);
  torso.position.y=0.11;body.add(torso);

  // Left arm pivot (at shoulder)
  const lArm=new THREE.Group();lArm.name='lArm';lArm.position.set(-0.16,0.2,0);
  const lArmM=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.04,0.2,6),shirtMat);
  lArmM.position.y=-0.1;lArm.add(lArmM);
  const lHand=new THREE.Mesh(new THREE.SphereGeometry(0.035,6,4),skinMat);
  lHand.position.y=-0.22;lArm.add(lHand);
  body.add(lArm);
  // Right arm pivot
  const rArm=new THREE.Group();rArm.name='rArm';rArm.position.set(0.16,0.2,0);
  const rArmM=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.04,0.2,6),shirtMat);
  rArmM.position.y=-0.1;rArm.add(rArmM);
  const rHand=new THREE.Mesh(new THREE.SphereGeometry(0.035,6,4),skinMat);
  rHand.position.y=-0.22;rArm.add(rHand);
  // Tool attached to right hand
  const toolGroup=new THREE.Group();toolGroup.name='tool';toolGroup.visible=false;
  const handle=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,0.28,4),woodMat);
  handle.position.y=-0.08;toolGroup.add(handle);
  const axeH=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.1,0.06),metalMat);
  axeH.position.y=0.05;toolGroup.add(axeH);
  toolGroup.position.y=-0.22;
  rArm.add(toolGroup);
  body.add(rArm);

  // Head
  const headG=new THREE.Group();headG.name='head';headG.position.y=0.22;
  const headM=new THREE.Mesh(new THREE.SphereGeometry(0.12,8,6),skinMat);
  headM.position.y=0.1;headG.add(headM);
  const hairM=new THREE.Mesh(new THREE.SphereGeometry(0.125,8,6,0,Math.PI*2,0,Math.PI*0.55),hairMat);
  hairM.position.y=0.12;headG.add(hairM);
  body.add(headG);

  // Soldier gear (attached to body group)
  const soldierGroup=new THREE.Group();soldierGroup.name='soldier';soldierGroup.visible=false;
  const helm=new THREE.Mesh(new THREE.SphereGeometry(0.14,8,6,0,Math.PI*2,0,Math.PI*0.6),new THREE.MeshLambertMaterial({color:0x707880}));
  helm.position.y=0.34;soldierGroup.add(helm);
  const sword=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.32,0.04),new THREE.MeshLambertMaterial({color:0xb0b8c0}));
  sword.position.set(0.2,0.08,0);sword.rotation.z=-0.2;soldierGroup.add(sword);
  const hilt=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.02,0.06),new THREE.MeshLambertMaterial({color:0x6a4020}));
  hilt.position.set(0.18,-0.04,0);soldierGroup.add(hilt);
  body.add(soldierGroup);

  g.add(body);

  // Selection ring
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.25,0.32,16),new THREE.MeshBasicMaterial({color:0x40ff80,side:THREE.DoubleSide,transparent:true,opacity:0.85}));
  ring.rotation.x=-Math.PI/2;ring.position.y=0.02;ring.visible=false;ring.name='selring';
  g.add(ring);

  g.position.set(c.x/TILE,0,c.y/TILE);
  unitGroup.add(g);colonistMeshes.set(c.id,g);
}
function createRaiderMesh(r){
  const g=new THREE.Group();
  const armorMat=new THREE.MeshLambertMaterial({color:0x3a2020});
  const darkMat=new THREE.MeshLambertMaterial({color:0x1a0808});
  const metalMat=new THREE.MeshLambertMaterial({color:0x505058});
  const skinMat=new THREE.MeshLambertMaterial({color:0x6a4030});
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
  const wHandle=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.35,4),new THREE.MeshLambertMaterial({color:0x5a3010}));
  wHandle.rotation.z=0.5;wHandle.position.set(0.26,0.44,0);g.add(wHandle);
  const wHead=new THREE.Mesh(new THREE.DodecahedronGeometry(0.06,0),metalMat);
  wHead.position.set(0.36,0.56,0);g.add(wHead);
  // Shield on left arm
  const shield=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.2,0.18),new THREE.MeshLambertMaterial({color:0x5a2010}));
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
    g.position.set(c.x/TILE,0,c.y/TILE);
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
    g.position.set(r.x/TILE,0,r.y/TILE);
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

// ── Floating text (CSS divs) ─────────────────────────────────────────────────
let floatContainer;
function initFloats(){floatContainer=document.getElementById('float-container');}
function updateFloatDivs(){
  // Remove all existing float divs and recreate
  while(floatContainer.firstChild)floatContainer.removeChild(floatContainer.firstChild);
  state.floats=state.floats.filter(f=>f.life>0);
  state.floats.forEach(f=>{
    f.life--;
    const v=new THREE.Vector3(f.wx,f.wy+(1-(f.life/f.maxLife))*0.8,f.wz);
    v.project(camera);
    const w=renderer.domElement.clientWidth,h=renderer.domElement.clientHeight;
    const sx=(v.x*0.5+0.5)*w;
    const sy=(-v.y*0.5+0.5)*h;
    const d=document.createElement('div');
    d.className='float-label';
    d.style.left=sx+'px';d.style.top=sy+'px';
    d.style.color=f.color;
    d.style.opacity=Math.min(1,f.life/20);
    d.textContent=f.text;
    floatContainer.appendChild(d);
  });
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
  syncUnits();
  syncBuildings();
  updateSmokeSystem();
  updateFloatDivs();
  updatePlacementGhost();
  drawMinimap();
  renderer.render(scene,camera);
}

// ── UI helpers ───────────────────────────────────────────────────────────────
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
    html+=`<br><br><b>${BUILDINGS[bld.type].name}</b><br>HP: ${bld.hp}/${BUILDINGS[bld.type].maxHp}`;
    if(bld.constructing){
      const pct=Math.floor((bld.progress/120)*100);
      html+=`<br>🔨 Building… ${pct}%`;
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
        // Select the colonist
        state.selectedColonist=hitColonist;
        const c=state.colonists.find(x=>x.id===hitColonist);
        if(c)showColonistInfo(c);
      } else if(state.selectedColonist!==null){
        // A colonist is selected — check if clicking a building to assign
        const bld=state.buildings.find(b=>{
          const s=BUILDINGS[b.type].size;
          return t.r>=b.r&&t.r<b.r+s&&t.c>=b.c&&t.c<b.c+s;
        });
        if(bld&&bld.hp>0){
          assignColonistToBuilding(state.selectedColonist,bld.id);
          const c=state.colonists.find(x=>x.id===state.selectedColonist);
          if(c)showColonistInfo(c);
        } else {
          // Clicked open ground — unassign colonist
          assignColonistToBuilding(state.selectedColonist,null);
          const c=state.colonists.find(x=>x.id===state.selectedColonist);
          if(c)showColonistInfo(c);
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
// ── Boot ──────────────────────────────────────────────────────────────────────
function init(){
  generateMap();
  initThree();
  initInput();
  initFloats();
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
