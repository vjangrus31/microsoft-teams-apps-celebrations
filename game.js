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
  market:     { name:'Market',     icon:'🏪', cost:{wood:8,stone:4},  size:1, maxHp:90 },
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

const TECHS = {
  // Tier 1
  improved_tools:{ tier:1, icon:'⚒', name:'Improved Tools',
    desc:'Woodcutters & quarries produce 30% more.',
    cost:{wood:10,stone:5}, requires:[] },
  agriculture:  { tier:1, icon:'🌱', name:'Agriculture',
    desc:'Farms yield 35% more food.',
    cost:{wood:8,food:8}, requires:[] },
  masonry:      { tier:1, icon:'🏛', name:'Masonry',
    desc:'Walls gain +80 max HP.',
    cost:{stone:15}, requires:[] },
  herbalism:    { tier:1, icon:'🌿', name:'Herbalism',
    desc:'Colonists slowly regenerate 1 HP every 10s.',
    cost:{food:12,wood:4}, requires:[] },
  // Tier 2
  advanced_tools:{ tier:2, icon:'🔧', name:'Advanced Tools',
    desc:'All resource production +20% additional.',
    cost:{wood:18,stone:12}, requires:['improved_tools'] },
  crop_rotation:{ tier:2, icon:'🌾', name:'Crop Rotation',
    desc:'Winter food penalty halved (0.4→0.7×).',
    cost:{food:15,wood:8}, requires:['agriculture'] },
  fortification:{ tier:2, icon:'🛡', name:'Fortification',
    desc:'Tower attack range +2 tiles, damage +8.',
    cost:{stone:20,wood:5}, requires:['masonry'] },
  field_medicine:{ tier:2, icon:'💊', name:'Field Medicine',
    desc:'Colonist max HP +20. Soldiers deal +4 damage.',
    cost:{food:15,stone:5}, requires:['herbalism'] },
  // Tier 3
  sawmill:      { tier:3, icon:'🪚', name:'Sawmill',
    desc:'Wood production doubled.',
    cost:{wood:25,stone:15}, requires:['advanced_tools'] },
  irrigation:   { tier:3, icon:'💧', name:'Irrigation',
    desc:'Farms produce at full rate in all seasons.',
    cost:{food:20,stone:15}, requires:['crop_rotation'] },
  ballista:     { tier:3, icon:'🎯', name:'Ballista',
    desc:'Towers fire twice per attack cycle.',
    cost:{stone:30,wood:15}, requires:['fortification'] },
  veteran_training:{ tier:3, icon:'🗡', name:'Veteran Training',
    desc:'Soldiers: +4 damage, +15 max HP.',
    cost:{food:25,wood:10}, requires:['field_medicine'] },
};

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
  techs:[],
  tradeRoute:null, // { give:'wood'|'stone'|'food', receive:'wood'|'stone'|'food', timer:0 }
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
    job:null, hunger:100, hp:30+techBonuses.maxHpBonus, maxHp:30+techBonuses.maxHpBonus, starving:0,
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

// Raider type definitions
const RAIDER_TYPES={
  scout: { hp:18, speed:1.15, dmgColonist:7,  dmgBuilding:8,  atkCd:45, label:'Scout'  },
  warrior:{ hp:35, speed:0.70, dmgColonist:10, dmgBuilding:15, atkCd:60, label:'Warrior' },
  brute:  { hp:80, speed:0.45, dmgColonist:18, dmgBuilding:30, atkCd:90, label:'Brute'  },
};
function spawnRaid() {
  const day=state.day;
  // Raid size grows with colony age, slower early on
  const size=1+Math.floor(day/12);
  // Type composition: scouts early, warriors/brutes later
  const bruteChance=Math.min(0.35,day/200);
  const warriorChance=Math.min(0.6,0.2+day/80);
  const types=['scout','warrior','brute'];
  const counts={scout:0,warrior:0,brute:0};
  const raidersOut=[];
  for(let i=0;i<size;i++){
    let type;
    const r2=Math.random();
    if(r2<bruteChance)type='brute';
    else if(r2<bruteChance+warriorChance)type='warrior';
    else type='scout';
    counts[type]++;
    const edge=Math.floor(Math.random()*4);
    let row,col;
    if(edge===0){row=0;col=Math.floor(Math.random()*COLS);}
    else if(edge===1){row=ROWS-1;col=Math.floor(Math.random()*COLS);}
    else if(edge===2){row=Math.floor(Math.random()*ROWS);col=0;}
    else{row=Math.floor(Math.random()*ROWS);col=COLS-1;}
    const def=RAIDER_TYPES[type];
    const hpBonus=Math.floor(day/8)*3;
    raidersOut.push({
      id:Date.now()+i,
      x:col*TILE+TILE/2, y:row*TILE+TILE/2,
      hp:def.hp+hpBonus, maxHp:def.hp+hpBonus,
      rType:type,
      attackCooldown:0, blinkTimer:Math.floor(Math.random()*60),
      path:[],pathGoal:null,pathCooldown:0,_wallTarget:null,
    });
  }
  state.raiders.push(...raidersOut);
  const parts=types.filter(t=>counts[t]>0).map(t=>`${counts[t]} ${RAIDER_TYPES[t].label}${counts[t]>1?'s':''}`);
  log(`⚔ Raiders! ${parts.join(', ')} — Day ${day}`);
  soundRaidAlarm();
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
    const rDef=RAIDER_TYPES[raider.rType]||RAIDER_TYPES.warrior;
    const rSpeed=rDef.speed;
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
          raider.x+=(dx/dist)*rSpeed;raider.y+=(dy/dist)*rSpeed;
        } else {
          raider.attackCooldown=rDef.atkCd;
          raider._wallTarget.hp-=rDef.dmgBuilding;
          addFloat(wbx/TILE,wby/TILE,`-${rDef.dmgBuilding}`,'#ff6644');
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
        else{raider.x+=(dx/dist)*rSpeed;raider.y+=(dy/dist)*rSpeed;}
      // Mode 3: direct movement (no walls in the way)
      } else {
        const dx=nx-raider.x,dy=ny-raider.y,dist=Math.sqrt(dx*dx+dy*dy);
        if(dist>0.1){raider.x+=(dx/dist)*rSpeed;raider.y+=(dy/dist)*rSpeed;}
      }
    } else {
      raider.attackCooldown=rDef.atkCd;
      if(nc){
        nc.hp-=rDef.dmgColonist;addFloat(nc.x/TILE,nc.y/TILE,`-${rDef.dmgColonist}`,'#ff4444');soundHit();
        if(nc.hp<=0)killColonist(nc.id);
      } else if(nb){
        nb.hp-=rDef.dmgBuilding;addFloat(nx/TILE,ny/TILE,`-${rDef.dmgBuilding}`,'#ff6644');soundHit();
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
    const bx=(b.c+0.5)*TILE,by=(b.r+0.5)*TILE,range=(def.attackRange+techBonuses.towerRange)*TILE;
    const tdmg=def.attackDamage+techBonuses.towerDmg;
    let target=null,bestDist=range;
    state.raiders.forEach(r=>{
      const dx=r.x-bx,dy=r.y-by,d=Math.sqrt(dx*dx+dy*dy);
      if(d<bestDist){bestDist=d;target=r;}
    });
    if(target){
      target.hp-=tdmg;
      addFloat(target.x/TILE,target.y/TILE,`-${tdmg}`,'#ffdd44');
      if(target.hp<=0){
        const m=raiderMeshes.get(target.id);
        if(m){unitGroup.remove(m);raiderMeshes.delete(target.id);}
        state.raiders=state.raiders.filter(r=>r.id!==target.id);
        log('⚔ Raider slain by tower');
      }
      // Ballista: fire at a second target
      if(techBonuses.towerDouble){
        let t2=null,d2=range;
        state.raiders.forEach(r=>{if(r===target)return;const dx=r.x-bx,dy=r.y-by,d=Math.sqrt(dx*dx+dy*dy);if(d<d2){d2=d;t2=r;}});
        if(t2){
          t2.hp-=tdmg;addFloat(t2.x/TILE,t2.y/TILE,`-${tdmg}`,'#ffdd44');
          if(t2.hp<=0){const m=raiderMeshes.get(t2.id);if(m){unitGroup.remove(m);raiderMeshes.delete(t2.id);}state.raiders=state.raiders.filter(r=>r.id!==t2.id);}
        }
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
    if(def.produces==='food'){
      let sm=FOOD_SEASON_MULT[state.season];
      if(techBonuses.allSeasonFarm)sm=1.0;
      else if(techBonuses.cropRotation)sm=Math.max(sm,0.7);
      rate*=sm*techBonuses.foodMult;
    }
    if(def.produces==='wood')rate*=techBonuses.woodMult;
    if(def.produces==='stone')rate*=techBonuses.stoneMult;
    state.resources[def.produces]=(state.resources[def.produces]||0)+rate;
    if(b.type==='woodcutter'||b.type==='quarry'){
      if(!b.depletionAccum)b.depletionAccum=0;
      b.depletionAccum+=rate;
      if(b.depletionAccum>=1){b.depletionAccum-=1;depleteTile(b);}
    }
  });
  if(t%600===0)regrowTiles();
  // Trade caravan logic
  if(state.tradeRoute){
    const tr=state.tradeRoute;
    tr.timer--;
    if(tr.timer<=0){
      // Caravan returns with goods
      const receiveAmt=tr.receiveAmt||30;
      state.resources[tr.receive]=(state.resources[tr.receive]||0)+receiveAmt;
      addFloat(COLS/2,ROWS/2,`+${receiveAmt} ${tr.receive}`,'#ffd040');
      log(`🏪 Caravan returned: +${receiveAmt} ${tr.receive}`);
      state.tradeRoute=null;
      updateResourceUI();
    }
  }
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
    const range=isSoldier?TILE*2.5:TILE*1.2;
    const dmg=isSoldier?(8+techBonuses.soldierDmg+(techBonuses.veteranBonus?4:0)):4;
    const cooldown=isSoldier?(techBonuses.veteranBonus?55:70):110;
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
      const seasonMsgs=['🌸 Spring has arrived — farms flourish.','☀ Summer heat — peak harvest time.','🍂 Autumn — gather stores before winter.','❄ Winter — farms slow, keep food stocked.'];
      log(seasonMsgs[state.season]);updateSeasonVisuals();
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
    if(techBonuses.hpRegen&&t%50===0)state.colonists.forEach(c=>{if(c.hp<c.maxHp)c.hp=Math.min(c.maxHp,c.hp+1);});
  }
  if(t%3===0)updateDayNight();
  if(t%600===0&&t>0){try{localStorage.setItem('colonyBuilder3D',JSON.stringify({...state,floats:[],selectedColonist:null}));}catch(e){}}
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
let weatherParticles=null,weatherGroup=null;

// Anime-vibrant palette
const SKY=[0xa8d8f8,0x78c8f8,0xf8b858,0xd0e8f8]; // spring,summer,autumn,winter
const TCOLORS=[
  [0x68d048,0x28a820,0xa8a8b8,0x50b8e8,0xb88038], // spring
  [0x58c838,0x18a010,0x9898a8,0x38a8e8,0xa87028], // summer
  [0xd09830,0x783808,0xa09890,0x3090c0,0x907028], // autumn
  [0xd8e8f8,0x507868,0xa8b0c8,0x4098c8,0xa8b8c8], // winter
];

let toonGrad=null,OUTLINE_MAT=null;
function createToonGrad(){
  const canvas=document.createElement('canvas');canvas.width=4;canvas.height=1;
  const ctx=canvas.getContext('2d');
  // 4 steps: cool purple shadow → muted mid → lit → bright highlight
  ['#38305a','#928898','#e8e0f0','#ffffff'].forEach((c,i)=>{ctx.fillStyle=c;ctx.fillRect(i,0,1,1);});
  const t=new THREE.CanvasTexture(canvas);
  t.minFilter=THREE.NearestFilter;t.magFilter=THREE.NearestFilter;
  return t;
}
function addOutlines(obj,scale=1.055){
  obj.traverse(child=>{
    if(!child.isMesh||child._ol||child.material?.isMeshBasicMaterial)return;
    child._ol=true;
    const ol=new THREE.Mesh(child.geometry,OUTLINE_MAT);
    ol.scale.setScalar(scale);child.add(ol);
  });
}
function mat(col,opts={}){return new THREE.MeshToonMaterial({color:col,gradientMap:toonGrad,...opts});}
function metalMat(col){return new THREE.MeshToonMaterial({color:col,gradientMap:toonGrad});}
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
  // Toon shading setup — must happen before any mat() calls
  toonGrad=createToonGrad();
  OUTLINE_MAT=new THREE.MeshBasicMaterial({color:0x1a1030,side:THREE.BackSide});
  scene=new THREE.Scene();
  scene.background=new THREE.Color(SKY[state.season]);
  scene.fog=new THREE.FogExp2(SKY[state.season],0.012);
  setupCamera();
  // Strong key light — toon shading needs clear directional light for step contrast
  hemiLight=new THREE.HemisphereLight(0xb8d8f8,0x3a2010,0.35);
  scene.add(hemiLight);
  const sun=new THREE.DirectionalLight(0xfff8d8,2.1);
  sun.position.set(22,36,10);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  const sc=sun.shadow.camera;sc.left=-60;sc.right=60;sc.top=50;sc.bottom=-50;sc.near=1;sc.far=180;
  sun.shadow.bias=-0.0006;
  scene.add(sun);
  sunLight=sun;
  // Subtle rim from opposite side
  const fill=new THREE.DirectionalLight(0x8090d0,0.18);
  fill.position.set(-15,18,-10);scene.add(fill);
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
  weatherGroup=new THREE.Group();scene.add(weatherGroup);
  buildTerrainMeshes();
  initWeatherParticles();
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
    sunLight.intensity=0.3+sunHeight*1.9; // toon needs strong directional
    sunLight.color.set(sunHeight>0.3?0xfff8d0:0xff7030);
  }
  if(hemiLight)hemiLight.intensity=0.18+sunHeight*0.28;
  if(fillLight)fillLight.intensity=0.06+sunHeight*0.14;
}

function updateSeasonVisuals(){
  scene.background=new THREE.Color(SKY[state.season]);
  scene.fog.color.setHex(SKY[state.season]);
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const m=terrainMeshes[r]?.[c];if(m)m.material.color.setHex(TCOLORS[state.season][state.tiles[r][c].type]);
    // Rebuild tree/rock decos to reflect new season colours
    if(decorGroups[r]?.[c])buildDecos(decorGroups[r][c],r,c,state.tiles[r][c]);
  }
  // Update building snow caps
  updateBuildingSnow();
  // Restart weather particles for new season
  initWeatherParticles();
}

function updateBuildingSnow(){
  // Remove any existing snow caps
  buildingGroup.children.forEach(g=>{
    const sc=g.getObjectByName('snowCap');if(sc)g.remove(sc);
  });
  if(state.season!==3)return; // only in winter
  state.buildings.forEach(b=>{
    const g=buildingMeshes.get(b.id);if(!g||b.constructing)return;
    const def=BUILDINGS[b.type];const sz=def.size;
    const cap=new THREE.Group();cap.name='snowCap';
    // Broad flat snow layer across building top
    const w=sz*0.95,d=sz*0.95;
    const snow=new THREE.Mesh(new THREE.BoxGeometry(w,0.07,d),mat(0xdeeeff));
    const roofY=b.type==='wall'?0.85:b.type==='tower'?2.2:1.45;
    snow.position.set(0,roofY,0);snow.castShadow=true;cap.add(snow);
    g.add(cap);
  });
}

// Weather particle system (snow in winter, leaves in autumn)
function initWeatherParticles(){
  if(weatherGroup){while(weatherGroup.children.length)weatherGroup.remove(weatherGroup.children[0]);}
  weatherParticles=null;
  if(state.season===3){
    // Snow: many small white sprites falling
    const COUNT=300;
    const geo=new THREE.BufferGeometry();
    const pos=new Float32Array(COUNT*3);
    const vel=new Float32Array(COUNT*3); // vx,vy,vz per particle
    for(let i=0;i<COUNT;i++){
      pos[i*3]  =Math.random()*COLS;
      pos[i*3+1]=Math.random()*12+1;
      pos[i*3+2]=Math.random()*ROWS;
      vel[i*3]  =(Math.random()-0.5)*0.008;
      vel[i*3+1]=-(0.012+Math.random()*0.016);
      vel[i*3+2]=(Math.random()-0.5)*0.008;
    }
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const mat2=new THREE.PointsMaterial({color:0xddeeff,size:0.12,transparent:true,opacity:0.75,depthWrite:false});
    const pts=new THREE.Points(geo,mat2);
    weatherGroup.add(pts);
    weatherParticles={type:'snow',pts,vel,COUNT};
  } else if(state.season===2){
    // Autumn: fewer bigger "leaf" sprites in orange/red
    const COUNT=80;
    const geo=new THREE.BufferGeometry();
    const pos=new Float32Array(COUNT*3);
    const vel=new Float32Array(COUNT*3);
    for(let i=0;i<COUNT;i++){
      pos[i*3]  =Math.random()*COLS;
      pos[i*3+1]=Math.random()*8+1;
      pos[i*3+2]=Math.random()*ROWS;
      vel[i*3]  =(Math.random()-0.5)*0.014;
      vel[i*3+1]=-(0.008+Math.random()*0.010);
      vel[i*3+2]=(Math.random()-0.5)*0.014;
    }
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const mat2=new THREE.PointsMaterial({color:0xe06820,size:0.18,transparent:true,opacity:0.7,depthWrite:false});
    const pts=new THREE.Points(geo,mat2);
    weatherGroup.add(pts);
    weatherParticles={type:'leaves',pts,vel,COUNT};
  }
}

function tickWeatherParticles(){
  if(!weatherParticles)return;
  const{pts,vel,COUNT}=weatherParticles;
  const pos=pts.geometry.attributes.position.array;
  const maxY=14, spawnY=13;
  for(let i=0;i<COUNT;i++){
    pos[i*3]  +=vel[i*3];
    pos[i*3+1]+=vel[i*3+1];
    pos[i*3+2]+=vel[i*3+2];
    // Wrap: when particle falls below ground, respawn at top
    if(pos[i*3+1]<-0.5){
      pos[i*3]  =Math.random()*COLS;
      pos[i*3+1]=spawnY+Math.random()*2;
      pos[i*3+2]=Math.random()*ROWS;
    }
    // Drift: add gentle sinusoidal sway
    vel[i*3]+=(Math.random()-0.5)*0.0006;
    vel[i*3]=Math.max(-0.02,Math.min(0.02,vel[i*3]));
  }
  pts.geometry.attributes.position.needsUpdate=true;
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
  const s=state.season;
  const trunkH=size*0.52;
  const trunkCol=s===3?0x6a3810:0x7a4018; // darker in winter
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(size*0.11,size*0.15,trunkH,8),mat(trunkCol));
  trunk.position.set(ox,0.15+trunkH/2,oz);trunk.castShadow=true;g.add(trunk);
  if(s===3){
    // Winter: bare branches (thin cylinders) + optional snow blob at top
    const branchDirs=[0,Math.PI*0.5,Math.PI,Math.PI*1.5,Math.PI*0.25,Math.PI*0.75];
    branchDirs.forEach((a,i)=>{
      const bh=size*0.28;
      const br=new THREE.Mesh(new THREE.CylinderGeometry(size*0.025,size*0.04,bh,5),mat(trunkCol));
      br.position.set(ox+Math.sin(a)*size*0.22,0.15+trunkH+size*0.1,oz+Math.cos(a)*size*0.22);
      br.rotation.z=(i%2===0?0.7:-0.7)*(1+i*0.05);br.castShadow=true;g.add(br);
    });
    // Snow cap blob
    const snow=new THREE.Mesh(new THREE.SphereGeometry(size*0.38,8,6),mat(0xe8f0ff));
    snow.scale.y=0.5;snow.position.set(ox,0.15+trunkH+size*0.18,oz);snow.castShadow=true;g.add(snow);
    return;
  }
  // Leaf colours by season
  const leafPalettes=[
    [0x40c830,0x30b820,0x58d840,0x28a818], // spring
    [0x30c020,0x20a810,0x48d030,0x18a008], // summer
    [0xe07820,0xc85010,0xd09018,0xb04008], // autumn
  ];
  const pal=leafPalettes[s]||leafPalettes[0];
  const c0=pal[Math.floor(hsh*4)%4];
  const c1=pal[(Math.floor(hsh*7)+2)%4];
  const main=new THREE.Mesh(new THREE.SphereGeometry(size*0.52,9,7),mat(c0));
  main.scale.y=0.9;main.position.set(ox,0.15+trunkH+size*0.38,oz);main.castShadow=true;g.add(main);
  [[size*0.32,size*0.52,0],[-size*0.30,size*0.46,size*0.2],[0,size*0.58,-size*0.28],[size*0.18,size*0.62,size*0.25]].forEach(([bx,by,bz])=>{
    const blob=new THREE.Mesh(new THREE.SphereGeometry(size*0.29,8,6),mat(c1));
    blob.position.set(ox+bx,0.15+trunkH+size*0.12+by,oz+bz);blob.castShadow=true;g.add(blob);
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
  const g=new THREE.Group();buildingGroup.add(g);buildingMeshes.set(b.id,g);
  assembleBuildingGeo(b,g);addOutlines(g);
}
function rebuildBuildingMesh(id){
  const b=state.buildings[id];if(!b)return;
  let g=buildingMeshes.get(id);
  if(!g){g=new THREE.Group();buildingGroup.add(g);buildingMeshes.set(id,g);}
  while(g.children.length)g.remove(g.children[0]);
  assembleBuildingGeo(b,g);addOutlines(g);
  // Re-apply snow cap if in winter
  if(state.season===3&&!b.constructing){
    const def=BUILDINGS[b.type];const sz=def.size;
    const cap=new THREE.Group();cap.name='snowCap';
    const snow=new THREE.Mesh(new THREE.BoxGeometry(sz*0.95,0.07,sz*0.95),mat(0xdeeeff));
    const roofY=b.type==='wall'?0.85:b.type==='tower'?2.2:1.45;
    snow.position.set(0,roofY,0);snow.castShadow=true;cap.add(snow);
    g.add(cap);
  }
}
// Gabled roof helper: two angled panels + ridge beam
function gableRoof(g,w,d,rh,col,wallY,ox=0,oz=0){
  const hd=d/2,sl=Math.sqrt(hd*hd+rh*rh),ang=Math.atan2(rh,hd);
  const rf1=new THREE.Mesh(new THREE.BoxGeometry(w+0.1,0.07,sl),mat(col));
  rf1.position.set(ox,wallY+rh/2,oz-hd/2);rf1.rotation.x=ang;rf1.castShadow=true;g.add(rf1);
  const rf2=new THREE.Mesh(new THREE.BoxGeometry(w+0.1,0.07,sl),mat(col));
  rf2.position.set(ox,wallY+rh/2,oz+hd/2);rf2.rotation.x=-ang;rf2.castShadow=true;g.add(rf2);
  bx(g,w+0.14,0.07,0.07,0x1a1008,ox,wallY+rh+0.01,oz); // ridge beam
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
    case'house':{
      // Stone foundation
      bx(g,0.94,0.15,0.94,0x8898b0,0,0.075,0);
      // Cream plaster walls
      bx(g,0.88,0.56,0.88,0xf0e4c4,0,0.43,0);
      // Dark timber framing — corner posts
      [[-0.42,0.42],[0.42,0.42],[0.42,-0.42],[-0.42,-0.42]].forEach(([px,pz])=>bx(g,0.055,0.58,0.055,0x2a1808,px,0.44,pz));
      // Horizontal mid-beams front/back/sides
      bx(g,0.9,0.045,0.045,0x2a1808,0,0.30,0.44);bx(g,0.9,0.045,0.045,0x2a1808,0,0.30,-0.44);
      bx(g,0.045,0.045,0.9,0x2a1808,0.44,0.30,0);bx(g,0.045,0.045,0.9,0x2a1808,-0.44,0.30,0);
      // Door — dark wood with cross-beam
      bx(g,0.22,0.32,0.055,0x4a2008,0,0.25,0.44);bx(g,0.22,0.04,0.056,0x2a1008,0,0.35,0.44);
      // Windows — sky blue
      bx(g,0.18,0.15,0.05,0x90c8f8,0.26,0.50,0.44);bx(g,0.18,0.15,0.05,0x90c8f8,-0.26,0.50,0.44);
      // Window frames
      bx(g,0.22,0.19,0.04,0x2a1808,0.26,0.50,0.43);bx(g,0.22,0.19,0.04,0x2a1808,-0.26,0.50,0.43);
      // Teal gable roof
      gableRoof(g,0.96,0.96,0.40,0x2a7860,0.72);
      // Chimney
      bx(g,0.13,0.30,0.13,0x7070a0,0.22,0.97,-0.15);bx(g,0.17,0.055,0.17,0x555565,0.22,1.12,-0.15);
      break;}
    case'farm':{
      // Rich brown soil
      bx(g,1.94,0.09,1.94,0x7a4820,0,0.045,0);
      // Bright crop rows
      for(let i=-3;i<=3;i++)bx(g,1.86,0.07,0.14,b.active?0x58c030:0x405018,0,0.10,i*0.26);
      // Wooden fence around perimeter
      for(let i=-3;i<=3;i+=2){
        bx(g,0.055,0.28,0.055,0x8a5020,i*0.3,0.18,-0.97);bx(g,0.055,0.28,0.055,0x8a5020,i*0.3,0.18,0.97);
        bx(g,0.055,0.28,0.055,0x8a5020,-0.97,0.18,i*0.3);bx(g,0.055,0.28,0.055,0x8a5020,0.97,0.18,i*0.3);
      }
      bx(g,1.94,0.04,0.04,0x8a5020,0,0.20,-0.97);bx(g,1.94,0.04,0.04,0x8a5020,0,0.20,0.97);
      bx(g,0.04,0.04,1.94,0x8a5020,-0.97,0.20,0);bx(g,0.04,0.04,1.94,0x8a5020,0.97,0.20,0);
      // Scarecrow when active
      if(b.active){
        bx(g,0.055,0.48,0.055,0xb07030,0.58,0.30,-0.60);bx(g,0.36,0.055,0.055,0xb07030,0.58,0.40,-0.60);
        bx(g,0.16,0.16,0.055,0xd09828,0.58,0.52,-0.60);
      }
      break;}
    case'woodcutter':{
      // Stone foundation
      bx(g,0.92,0.14,0.92,0x707868,0,0.07,0);
      // Warm log-cabin walls
      bx(g,0.86,0.54,0.86,0x9a5828,0,0.42,0);
      // Log texture strips
      for(let i=0;i<4;i++)bx(g,0.88,0.03,0.025,0x6a3818,0,0.20+i*0.12,0.44);
      // Door
      bx(g,0.22,0.34,0.055,0x3a1808,0,0.26,0.44);
      // Window
      bx(g,0.20,0.16,0.05,0x90c8f8,0.3,0.50,0.44);
      // Warm brown gabled roof
      gableRoof(g,0.92,0.92,0.38,0x7a3810,0.68);
      // Chimney
      bx(g,0.11,0.24,0.11,0x909090,-0.2,0.90,0.1);
      // Log pile
      for(let i=0;i<3;i++){const cl=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.08,0.38,8),mat(0x9a5828));cl.rotation.z=Math.PI/2;cl.position.set(-0.38,0.14+i*0.11,0.1+i*0.05);cl.castShadow=true;g.add(cl);}
      // Stump
      cy(g,0.13,0.15,0.13,8,0x7a4020,0.3,0.10,0.3);
      break;}
    case'quarry':{
      // Gray-blue stone floor
      bx(g,0.96,0.10,0.96,0x9098a8,0,-0.01,0);
      // Layered rock face at back
      bx(g,0.94,0.22,0.12,0xa0a8b8,0,0.16,-0.43);bx(g,0.94,0.16,0.12,0x888898,0,0.10,0.43);
      // Rock piles
      addRock(g,-0.22,0,0.11,0.4,0.1);addRock(g,0.18,-0.15,0.09,1.2,0.2);addRock(g,-0.05,0.28,0.08,2.1,0.15);
      // Wooden crane arm
      bx(g,0.055,0.52,0.055,0x7a4820,0.32,0.33,0);bx(g,0.44,0.05,0.05,0x7a4820,0.10,0.58,0);
      // Hanging rope
      bx(g,0.025,0.20,0.025,0x5a4020,-0.10,0.44,0);
      break;}
    case'storehouse':{
      // Stone foundation
      bx(g,0.94,0.14,0.94,0x8090a0,0,0.07,0);
      // Wide barn walls — warm amber
      bx(g,0.90,0.58,0.90,0xb06828,0,0.44,0);
      // Plank lines
      for(let i=0;i<5;i++)bx(g,0.92,0.025,0.025,0x8a4818,0,0.18+i*0.10,0.45);
      // Double barn doors
      bx(g,0.36,0.40,0.055,0x5a2808,-0.22,0.34,0.45);bx(g,0.36,0.40,0.055,0x5a2808,0.22,0.34,0.45);
      bx(g,0.04,0.07,0.04,0xc09030,-0.04,0.34,0.46);bx(g,0.04,0.07,0.04,0xc09030,0.04,0.34,0.46);
      // Dark gable roof
      gableRoof(g,0.96,0.96,0.34,0x5a2808,0.73);
      // Barrels
      cy(g,0.10,0.10,0.22,8,0x8a4820,-0.36,0.16,-0.32);cy(g,0.10,0.10,0.22,8,0x7a3818,0.32,0.16,-0.36);
      bx(g,0.20,0.04,0.20,0x5a2808,-0.36,0.26,-0.32);bx(g,0.20,0.04,0.20,0x5a2808,0.32,0.26,-0.36);
      break;}
    case'wall':{
      // Main stone body — blue-gray
      bx(g,0.96,0.64,0.96,0x9898b0,0,0.32,0);
      // Mortar lines
      bx(g,0.98,0.025,0.98,0x7878a0,0,0.22,0);bx(g,0.98,0.025,0.98,0x7878a0,0,0.44,0);
      // 4 chunky battlements (merlons)
      [[-0.28,0.28],[0.28,0.28],[0.28,-0.28],[-0.28,-0.28]].forEach(([px,pz])=>bx(g,0.26,0.24,0.26,0xa0a0b8,px,0.76,pz));
      break;}
    case'tower':{
      // Wide stone base
      bx(g,0.90,0.24,0.90,0x8890a8,0,0.12,0);
      // Cylindrical tower body
      const tbody=new THREE.Mesh(new THREE.CylinderGeometry(0.30,0.36,1.50,12),mat(0x8898a8));tbody.position.y=0.97;tbody.castShadow=true;g.add(tbody);
      // Arrow slits
      [0,Math.PI*0.5,Math.PI,Math.PI*1.5].forEach(a=>{
        const sl=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.20,0.065),mat(0x101828));
        sl.position.set(Math.sin(a)*0.31,0.90,Math.cos(a)*0.31);g.add(sl);
      });
      // Battlement ring — 8 merlons
      for(let i=0;i<8;i++){const a=i/8*Math.PI*2;bx(g,0.17,0.22,0.17,0x9898b0,Math.sin(a)*0.28,1.82,Math.cos(a)*0.28);}
      // Conical slate-green roof
      const tcone=new THREE.Mesh(new THREE.ConeGeometry(0.40,0.58,10),mat(0x2a4838));tcone.position.y=2.04;tcone.castShadow=true;g.add(tcone);
      break;}
    case'barracks':{
      // Stone foundation
      bx(g,0.92,0.14,0.92,0x706858,0,0.07,0);
      // Dark military walls
      bx(g,0.88,0.56,0.88,0x7a5030,0,0.44,0);
      // Stone corner reinforcements
      [[-0.43,0.43],[0.43,0.43],[0.43,-0.43],[-0.43,-0.43]].forEach(([px,pz])=>bx(g,0.09,0.60,0.09,0x606050,px,0.44,pz));
      // Reinforced door
      bx(g,0.24,0.34,0.055,0x2a1008,0,0.26,0.44);
      bx(g,0.26,0.035,0.056,0x707880,0,0.22,0.44);bx(g,0.26,0.035,0.056,0x707880,0,0.32,0.44);
      // Deep red gable roof
      gableRoof(g,0.94,0.94,0.40,0x8a1818,0.69);
      // Spear rack — two crossed spears
      const sp1=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.58,6),mat(0x7a4018));
      sp1.rotation.z=0.32;sp1.position.set(-0.33,0.42,-0.22);g.add(sp1);
      const sp2=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.58,6),mat(0x7a4018));
      sp2.rotation.z=-0.32;sp2.position.set(-0.24,0.42,-0.22);g.add(sp2);
      bx(g,0.035,0.11,0.035,0x9098a0,-0.42,0.65,-0.22);bx(g,0.035,0.11,0.035,0x9098a0,-0.15,0.65,-0.22);
      // Red banner
      bx(g,0.032,0.44,0.032,0x8a5020,0.38,0.56,-0.38);bx(g,0.24,0.16,0.032,0xc02020,0.50,0.70,-0.38);
      break;}
    case'market':{
      // Stone foundation
      bx(g,0.94,0.14,0.94,0x9a8870,0,0.07,0);
      // Cream/ochre walls with open-fronted stall look
      bx(g,0.88,0.52,0.88,0xe8d498,0,0.41,0);
      // Dark timber framing
      [[-0.43,0.43],[0.43,0.43],[0.43,-0.43],[-0.43,-0.43]].forEach(([px,pz])=>bx(g,0.055,0.56,0.055,0x3a1808,px,0.42,pz));
      bx(g,0.9,0.040,0.040,0x3a1808,0,0.36,0.44);bx(g,0.9,0.040,0.040,0x3a1808,0,0.36,-0.44);
      // Open front stall: counter top
      bx(g,0.72,0.06,0.20,0xc09040,0,0.68,0.36);
      // Goods on counter — colourful boxes
      bx(g,0.10,0.08,0.08,0xe06020,  0.20,0.74,0.34);
      bx(g,0.10,0.10,0.08,0x40b060, -0.10,0.75,0.34);
      bx(g,0.10,0.07,0.08,0x4070e0,  0.00,0.73,0.34);
      // Warm orange gabled roof (market stall canopy feel)
      gableRoof(g,0.96,0.96,0.38,0xd07820,0.65);
      // Hanging sign
      bx(g,0.032,0.14,0.032,0x5a3010,-0.02,0.82,0.46);
      bx(g,0.24,0.14,0.040,0xf0c840,-0.02,0.74,0.50);
      // Colourful pennant flags
      [[-0.38,0.46],[0.38,0.46]].forEach(([px,pz])=>{
        bx(g,0.032,0.44,0.032,0x5a3010,px,0.92,pz);
        bx(g,0.13,0.12,0.032,px<0?0xe04040:0x40a0e0,px+(px<0?0.065:-0.065),1.08,pz);
      });
      break;}
  }
  if(b.hp<=0){const ov=new THREE.Mesh(new THREE.BoxGeometry(sz*0.9,0.3,sz*0.9),mat(0x332211,{transparent:true,opacity:0.85}));ov.position.y=0.2;g.add(ov);}
}

// ── Unit meshes ──────────────────────────────────────────────────────────────
// Skin tones vary slightly per colonist
const SKIN_TONES=[0xf5c99a,0xedb87a,0xe8a060,0xc87a50,0x8a5030];
const HAIR_COLORS=[0x1a0e06,0x3d1f08,0x7a3d10,0x8a6030,0xb09060,0xc8b880,0x6a2818,0x484030];

function sMat(col,rough=0.85,metal=0){return new THREE.MeshToonMaterial({color:col,gradientMap:toonGrad});}

function createColonistMesh(c){
  const g=new THREE.Group();
  const hue=(c.id*137)%360;
  const skinTone=SKIN_TONES[c.id%SKIN_TONES.length];
  const hairColor=HAIR_COLORS[c.id%HAIR_COLORS.length];
  const hairStyle=c.id%4; // 0=spiky, 1=long side-swept, 2=topknot, 3=bob

  const skinM=sMat(skinTone);
  const shirtM=sMat(new THREE.Color(`hsl(${hue},78%,55%)`));
  const shirtDkM=sMat(new THREE.Color(`hsl(${hue},65%,38%)`));
  const pantsM=sMat(new THREE.Color(`hsl(${(hue+160)%360},52%,32%)`));
  const hairM=sMat(hairColor);
  const bootM=sMat(0x3a2010);
  const woodM=sMat(0x9a5820);
  const ironM=sMat(0x8090a8);

  // ── Legs — chibi: short, chunky ──
  const lLeg=new THREE.Group();lLeg.name='lLeg';lLeg.position.set(-0.065,0.26,0);
  const lLegM=new THREE.Mesh(new THREE.CylinderGeometry(0.052,0.058,0.24,8),pantsM);lLegM.position.y=-0.12;lLeg.add(lLegM);
  const lBoot=new THREE.Mesh(new THREE.BoxGeometry(0.10,0.08,0.14),bootM);lBoot.position.set(0,-0.26,0.015);lLeg.add(lBoot);
  g.add(lLeg);
  const rLeg=new THREE.Group();rLeg.name='rLeg';rLeg.position.set(0.065,0.26,0);
  const rLegM=new THREE.Mesh(new THREE.CylinderGeometry(0.052,0.058,0.24,8),pantsM);rLegM.position.y=-0.12;rLeg.add(rLegM);
  const rBoot=new THREE.Mesh(new THREE.BoxGeometry(0.10,0.08,0.14),bootM);rBoot.position.set(0,-0.26,0.015);rLeg.add(rBoot);
  g.add(rLeg);

  // ── Body ──
  const body=new THREE.Group();body.name='body';body.position.set(0,0.26,0);
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.30,0.26,0.18),shirtM);torso.position.y=0.13;torso.castShadow=true;body.add(torso);
  const waist=new THREE.Mesh(new THREE.BoxGeometry(0.32,0.052,0.20),shirtDkM);waist.position.y=0.015;body.add(waist);
  const collar=new THREE.Mesh(new THREE.CylinderGeometry(0.065,0.075,0.055,8),shirtM);collar.position.y=0.27;body.add(collar);
  [-0.175,0.175].forEach(x=>{const cap=new THREE.Mesh(new THREE.SphereGeometry(0.075,8,6),shirtM);cap.position.set(x,0.24,0);body.add(cap);});

  // ── Arms ──
  const lArm=new THREE.Group();lArm.name='lArm';lArm.position.set(-0.195,0.21,0);
  const lArmM=new THREE.Mesh(new THREE.CylinderGeometry(0.048,0.054,0.25,7),shirtM);lArmM.position.y=-0.125;lArm.add(lArmM);
  const lHand=new THREE.Mesh(new THREE.SphereGeometry(0.048,7,6),skinM);lHand.position.y=-0.265;lArm.add(lHand);
  body.add(lArm);
  const rArm=new THREE.Group();rArm.name='rArm';rArm.position.set(0.195,0.21,0);
  const rArmM=new THREE.Mesh(new THREE.CylinderGeometry(0.048,0.054,0.25,7),shirtM);rArmM.position.y=-0.125;rArm.add(rArmM);
  const rHand=new THREE.Mesh(new THREE.SphereGeometry(0.048,7,6),skinM);rHand.position.y=-0.265;rArm.add(rHand);
  const toolGroup=new THREE.Group();toolGroup.name='tool';toolGroup.visible=false;toolGroup.position.y=-0.265;
  const hndl=new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.018,0.36,6),woodM);hndl.position.y=-0.12;toolGroup.add(hndl);
  const tBlade=new THREE.Mesh(new THREE.BoxGeometry(0.028,0.13,0.07),ironM);tBlade.position.y=0.10;toolGroup.add(tBlade);
  const tShine=new THREE.Mesh(new THREE.BoxGeometry(0.010,0.12,0.03),sMat(0xd8e8f0));tShine.position.set(-0.01,0.10,0.05);toolGroup.add(tShine);
  rArm.add(toolGroup);body.add(rArm);

  // ── Head — big chibi anime ──
  const headG=new THREE.Group();headG.name='head';headG.position.y=0.28;
  // Large round skull
  const skull=new THREE.Mesh(new THREE.SphereGeometry(0.162,10,8),skinM);skull.scale.set(1.0,1.06,0.96);skull.position.y=0.162;headG.add(skull);
  const jaw=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.08,0.16),skinM);jaw.position.y=0.055;headG.add(jaw);
  // Ears
  [-0.163,0.163].forEach(x=>{const ear=new THREE.Mesh(new THREE.SphereGeometry(0.034,6,5),skinM);ear.scale.set(0.45,0.75,0.65);ear.position.set(x,0.145,0);headG.add(ear);});
  // Tiny anime nose
  const nose=new THREE.Mesh(new THREE.SphereGeometry(0.020,5,4),skinM);nose.scale.set(0.7,0.55,0.9);nose.position.set(0,0.105,0.152);headG.add(nose);
  // Soft smile
  const mouth=new THREE.Mesh(new THREE.BoxGeometry(0.062,0.015,0.018),sMat(0xb04040));mouth.position.set(0,0.065,0.148);headG.add(mouth);
  // Cheek blush
  [-0.105,0.105].forEach(x=>{const blush=new THREE.Mesh(new THREE.SphereGeometry(0.030,6,5),sMat(0xf09898));blush.scale.set(1.4,0.45,0.55);blush.position.set(x,0.100,0.130);headG.add(blush);});

  // ── BIG anime eyes ──
  [-0.062,0.062].forEach((x,i)=>{
    const eyeCol=new THREE.Color(`hsl(${(hue+i*70)%360},70%,42%)`);
    const sclera=new THREE.Mesh(new THREE.SphereGeometry(0.045,9,8),sMat(0xf8f8ff));
    sclera.scale.set(0.95,1.38,0.55);sclera.position.set(x,0.122,0.135);headG.add(sclera);
    const iris=new THREE.Mesh(new THREE.SphereGeometry(0.033,8,7),sMat(eyeCol));
    iris.scale.set(0.90,1.26,0.65);iris.position.set(x,0.122,0.149);headG.add(iris);
    const pupil=new THREE.Mesh(new THREE.SphereGeometry(0.021,7,6),sMat(0x080808));
    pupil.scale.set(0.85,1.22,0.70);pupil.position.set(x,0.122,0.155);headG.add(pupil);
    // Sparkle highlight (the anime dot)
    const shine=new THREE.Mesh(new THREE.SphereGeometry(0.010,5,4),sMat(0xffffff));
    shine.position.set(x-x*0.28,0.140,0.162);headG.add(shine);
    // Thick upper eyelid
    const lid=new THREE.Mesh(new THREE.BoxGeometry(0.092,0.018,0.022),sMat(hairColor));lid.position.set(x,0.154,0.135);headG.add(lid);
    // Lower lash
    const lash=new THREE.Mesh(new THREE.BoxGeometry(0.078,0.010,0.015),sMat(hairColor));lash.position.set(x,0.093,0.133);headG.add(lash);
  });
  // Eyebrows
  [-0.062,0.062].forEach((x,i)=>{
    const brow=new THREE.Mesh(new THREE.BoxGeometry(0.072,0.016,0.018),sMat(hairColor));brow.position.set(x,0.182,0.124);brow.rotation.z=i===0?0.16:-0.16;headG.add(brow);
  });

  // ── Hair styles ──
  if(hairStyle===0){ // spiky hero
    const base=new THREE.Mesh(new THREE.SphereGeometry(0.168,9,7,0,Math.PI*2,0,Math.PI*0.52),hairM);base.position.y=0.162;headG.add(base);
    [[-0.07,0.370,0.03,0.45],[-0.01,0.378,-0.02,-0.1],[0.08,0.355,0.03,-0.52],[-0.10,0.305,-0.04,0.62]].forEach(([sx,sy,sz,rz])=>{
      const spk=new THREE.Mesh(new THREE.ConeGeometry(0.034,0.145,5),hairM);spk.position.set(sx,sy,sz);spk.rotation.z=rz;headG.add(spk);
    });
  } else if(hairStyle===1){ // long side-swept
    const base=new THREE.Mesh(new THREE.SphereGeometry(0.172,9,7,0,Math.PI*2,0,Math.PI*0.60),hairM);base.position.y=0.155;headG.add(base);
    const side=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.25,0.09),hairM);side.position.set(0.09,0.138,-0.11);headG.add(side);
    const bangs=new THREE.Mesh(new THREE.BoxGeometry(0.26,0.09,0.042),hairM);bangs.position.set(0.04,0.290,0.13);bangs.rotation.x=0.15;headG.add(bangs);
  } else if(hairStyle===2){ // topknot + bun
    const base=new THREE.Mesh(new THREE.SphereGeometry(0.168,9,7,0,Math.PI*2,0,Math.PI*0.52),hairM);base.position.y=0.162;headG.add(base);
    const bun=new THREE.Mesh(new THREE.SphereGeometry(0.082,8,7),hairM);bun.scale.y=0.88;bun.position.set(0.02,0.366,0);headG.add(bun);
    const pin=new THREE.Mesh(new THREE.CylinderGeometry(0.009,0.009,0.24,5),sMat(0xd8c040));pin.rotation.z=0.75;pin.position.set(-0.06,0.356,0.02);headG.add(pin);
    const pinTip=new THREE.Mesh(new THREE.SphereGeometry(0.018,6,5),sMat(0xffd060));pinTip.position.set(-0.17,0.358,0.02);headG.add(pinTip);
  } else { // bob cut
    const base=new THREE.Mesh(new THREE.SphereGeometry(0.175,9,7,0,Math.PI*2,0,Math.PI*0.63),hairM);base.position.y=0.148;headG.add(base);
    [-0.155,0.155].forEach(x=>{const side=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.16,0.16),hairM);side.position.set(x,0.07,-0.01);headG.add(side);});
    const fringe=new THREE.Mesh(new THREE.BoxGeometry(0.30,0.082,0.044),hairM);fringe.position.set(0,0.280,0.14);headG.add(fringe);
  }
  body.add(headG);

  // ── Soldier gear ──
  const soldierG=new THREE.Group();soldierG.name='soldier';soldierG.visible=false;
  // Helmet sits on big head — sized to match
  const helm=new THREE.Mesh(new THREE.SphereGeometry(0.190,9,7,0,Math.PI*2,0,Math.PI*0.60),sMat(0x7080a0));helm.position.y=0.448;soldierG.add(helm);
  const helmBrim=new THREE.Mesh(new THREE.CylinderGeometry(0.208,0.198,0.03,10),sMat(0x6070a0));helmBrim.position.y=0.410;soldierG.add(helmBrim);
  const helmCrest=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.080,0.26),sMat(0xc82020));helmCrest.position.y=0.525;soldierG.add(helmCrest);
  const plate=new THREE.Mesh(new THREE.BoxGeometry(0.26,0.20,0.07),sMat(0x7080a0));plate.position.set(0,0.160,0.10);soldierG.add(plate);
  const blade2=new THREE.Mesh(new THREE.BoxGeometry(0.022,0.28,0.04),sMat(0xc8d0d8));blade2.position.set(-0.17,0.02,-0.02);blade2.rotation.z=0.18;soldierG.add(blade2);
  const guard=new THREE.Mesh(new THREE.BoxGeometry(0.082,0.020,0.030),sMat(0xb09840));guard.position.set(-0.185,0.135,-0.02);guard.rotation.z=0.18;soldierG.add(guard);
  body.add(soldierG);

  g.add(body);
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.26,0.35,20),new THREE.MeshBasicMaterial({color:0x40ff80,side:THREE.DoubleSide,transparent:true,opacity:0.85}));
  ring.rotation.x=-Math.PI/2;ring.position.y=0.01;ring.visible=false;ring.name='selring';
  g.add(ring);

  g.position.set(c.x/TILE,0,c.y/TILE);
  unitGroup.add(g);colonistMeshes.set(c.id,g);
  addOutlines(g,1.06);
}
function createRaiderMesh(r){
  const g=new THREE.Group();
  const rType=r.rType||'warrior';
  // Type-specific colour scheme
  const armorCol=rType==='scout'?0x3a3a1a:rType==='brute'?0x3a1a1a:0x4a2828;
  const metalCol=rType==='scout'?0x7a8830:rType==='brute'?0x904040:0x6068a0;
  const eyeCol  =rType==='scout'?0xffee20:rType==='brute'?0xff0000:0xff3020;
  const armorM=sMat(armorCol);const darkM=sMat(0x1a1010);
  const metalM=sMat(metalCol);const skinM2=sMat(0x7a4a38);
  const woodM2=sMat(0x5a3008);const redM=sMat(rType==='brute'?0x901010:0xc02020);
  // Scale: scouts are slimmer, brutes are wider/taller
  const sc=rType==='scout'?0.82:rType==='brute'?1.28:1.0;
  g.scale.setScalar(sc);
  // Boots
  [[-0.08,0.07],[0.08,0.07]].forEach(([x,y])=>{
    const boot=new THREE.Mesh(new THREE.BoxGeometry(0.10,0.09,0.14),darkM);boot.position.set(x,y,0.02);g.add(boot);
  });
  // Legs
  [[-0.08,0.2],[0.08,0.2]].forEach(([x,y])=>{
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,0.2,6),armorM);leg.position.set(x,y,0);g.add(leg);
  });
  // Armored torso
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.30,0.26,0.17),armorM);torso.position.y=0.43;g.add(torso);
  bx(g,0.32,0.28,0.04,0x383040,0,0.43,0.09);
  // Shoulder pads (brute has bigger spiky ones)
  const padR=rType==='brute'?0.10:0.07;
  [[-0.20,0.52],[0.20,0.52]].forEach(([x,y])=>{
    const pad=new THREE.Mesh(new THREE.SphereGeometry(padR,7,5),metalM);pad.position.set(x,y,0);g.add(pad);
    if(rType==='brute'){const sp=new THREE.Mesh(new THREE.ConeGeometry(0.03,0.10,5),metalM);sp.position.set(x,y+0.08,0);g.add(sp);}
  });
  // Arms
  [[-0.19,0.37],[0.19,0.37]].forEach(([x,y])=>{
    const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.044,0.050,0.23,6),armorM);arm.position.set(x,y,0);g.add(arm);
  });
  // Head
  const rhead=new THREE.Mesh(new THREE.SphereGeometry(0.145,9,7),skinM2);rhead.position.y=0.66;g.add(rhead);
  // Helmet — scout has a hood (flat cap), warrior has a spiked helm, brute has a horned helm
  if(rType==='scout'){
    const hood=new THREE.Mesh(new THREE.SphereGeometry(0.155,8,6,0,Math.PI*2,0,Math.PI*0.55),metalM);hood.position.y=0.70;g.add(hood);
    const brim=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.16,0.025,9),metalM);brim.position.y=0.64;g.add(brim);
  } else if(rType==='brute'){
    const helm=new THREE.Mesh(new THREE.SphereGeometry(0.168,9,7,0,Math.PI*2,0,Math.PI*0.68),metalM);helm.position.y=0.69;g.add(helm);
    const helmBrim=new THREE.Mesh(new THREE.CylinderGeometry(0.20,0.19,0.035,10),metalM);helmBrim.position.y=0.62;g.add(helmBrim);
    // Horns
    [[-0.10,0.86,0.0],[0.10,0.86,0.0]].forEach(([hx,hy,hz])=>{
      const horn=new THREE.Mesh(new THREE.ConeGeometry(0.028,0.14,6),metalM);horn.position.set(hx,hy,hz);horn.rotation.z=(hx<0?-1:1)*0.35;g.add(horn);
    });
  } else {
    const helm=new THREE.Mesh(new THREE.SphereGeometry(0.162,9,7,0,Math.PI*2,0,Math.PI*0.65),metalM);helm.position.y=0.69;g.add(helm);
    const helmBrim=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.17,0.03,10),metalM);helmBrim.position.y=0.63;g.add(helmBrim);
    const helmSpike=new THREE.Mesh(new THREE.ConeGeometry(0.032,0.17,6),metalM);helmSpike.position.y=0.85;g.add(helmSpike);
  }
  // Eye slits
  bx(g,0.10,0.04,0.02,eyeCol,0,0.72,0.15);
  // Type-specific weapon
  if(rType==='scout'){
    // Twin daggers — angled at hip
    [0.24,-0.22].forEach((x,i)=>{
      const dh=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.22,5),woodM2);
      dh.rotation.z=(i===0?0.6:-0.6);dh.position.set(x,0.43,0.06);g.add(dh);
      const db=new THREE.Mesh(new THREE.BoxGeometry(0.018,0.14,0.018),metalM);
      db.position.set(x+(i===0?0.07:-0.07),0.50,0.06);g.add(db);
    });
  } else if(rType==='brute'){
    // Two-handed maul: thick handle + big cube head
    const wh=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.46,6),woodM2);
    wh.rotation.z=0.45;wh.position.set(0.30,0.42,0);g.add(wh);
    const whead=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.12,0.12),metalM);
    whead.position.set(0.43,0.58,0);g.add(whead);
  } else {
    // Warrior — battle axe + shield
    const wHandle=new THREE.Mesh(new THREE.CylinderGeometry(0.019,0.019,0.38,5),woodM2);
    wHandle.rotation.z=0.52;wHandle.position.set(0.27,0.46,0);g.add(wHandle);
    const wHead=new THREE.Mesh(new THREE.DodecahedronGeometry(0.07,0),metalM);wHead.position.set(0.37,0.58,0);g.add(wHead);
    const shield=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.22,0.19),redM);shield.position.set(-0.23,0.40,0);g.add(shield);
    const shieldBoss=new THREE.Mesh(new THREE.SphereGeometry(0.04,6,4),metalM);shieldBoss.position.set(-0.26,0.40,0);g.add(shieldBoss);
  }
  // Tunic stripe
  bx(g,0.28,0.10,0.18,0x881818,0,0.30,0);

  g.position.set(r.x/TILE,0,r.y/TILE);
  unitGroup.add(g);raiderMeshes.set(r.id,g);
  addOutlines(g,1.055);
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
  tickWeatherParticles();
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
    if(bld.type==='market'&&bld.active&&bld.hp>0){
      if(state.tradeRoute)html+=`<br><span style="color:#ffd040">🏪 Caravan en route… ${state.tradeRoute.timer} ticks left</span>`;
      else html+=`<br><span style="color:#80d080">Press T to open trade</span>`;
    }
    if(bld.active!==undefined&&!bld.constructing)html+=`<br>Active: ${bld.active?'Yes':'No'}`;
  }
  ic.innerHTML=html;
}

// ── Trade ─────────────────────────────────────────────────────────────────────
// Trade rates: give 20 of one resource, receive 30 of another after 600 ticks (~2 min)
const TRADE_ROUTES=[
  {give:'wood',  receive:'food',  giveCost:20, receiveAmt:35, label:'20 wood → 35 food'},
  {give:'wood',  receive:'stone', giveCost:20, receiveAmt:25, label:'20 wood → 25 stone'},
  {give:'stone', receive:'wood',  giveCost:15, receiveAmt:25, label:'15 stone → 25 wood'},
  {give:'stone', receive:'food',  giveCost:15, receiveAmt:30, label:'15 stone → 30 food'},
  {give:'food',  receive:'wood',  giveCost:25, receiveAmt:30, label:'25 food → 30 wood'},
  {give:'food',  receive:'stone', giveCost:25, receiveAmt:20, label:'25 food → 20 stone'},
];
function openTradeModal(){
  const hasMarket=state.buildings.some(b=>b.type==='market'&&b.active&&b.hp>0);
  if(!hasMarket){log('Build a Market to trade resources.');return;}
  if(state.tradeRoute){log(`🏪 Caravan in transit… returns in ${state.tradeRoute.timer} ticks.`);return;}
  // Show trade modal in event-modal
  const choices=TRADE_ROUTES.map(tr=>({
    label:tr.label,
    fn:s=>{
      if((s.resources[tr.give]||0)<tr.giveCost)return `Not enough ${tr.give}! Need ${tr.giveCost}.`;
      s.resources[tr.give]-=tr.giveCost;
      s.tradeRoute={give:tr.give,receive:tr.receive,giveCost:tr.giveCost,receiveAmt:tr.receiveAmt,timer:600};
      updateResourceUI();
      return `Caravan sent! Returns with ${tr.receiveAmt} ${tr.receive} in ~2 min.`;
    }
  }));
  showEvent({title:'🏪 Market Trade',body:'Send a caravan with your surplus resources. Returns in ~2 minutes.',color:'#ffd040',choices});
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
    if(!state.techs)state.techs=[];
    rebuildTechBonuses();
    state.floats=[];
    // Rebuild all meshes
    buildingMeshes.forEach(g=>buildingGroup.remove(g));buildingMeshes.clear();
    colonistMeshes.forEach(g=>unitGroup.remove(g));colonistMeshes.clear();
    raiderMeshes.forEach(g=>unitGroup.remove(g));raiderMeshes.clear();
    terrainGroup.children.length=0;decorGroup.children.length=0;
    buildTerrainMeshes();
    state.buildings.forEach(b=>addBuildingMesh(b));
    updateSeasonVisuals();
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
    if(e.key==='t'||e.key==='T')openTradeModal();
    if(e.key==='Escape'){setPlacing(null);state.selectedColonist=null;}
    if(e.key==='r'||e.key==='R'){
      const m=document.getElementById('tech-modal');
      if(m.style.display==='none'||!m.style.display){openTechTree();}
      else m.style.display='none';
    }
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
  document.getElementById('btn-trade').addEventListener('click',openTradeModal);

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
// ── Tech Bonuses ─────────────────────────────────────────────────────────────
let techBonuses={woodMult:1,stoneMult:1,foodMult:1,wallHpBonus:0,towerRange:0,towerDmg:0,towerDouble:false,hpRegen:false,maxHpBonus:0,soldierDmg:0,veteranBonus:false,cropRotation:false,allSeasonFarm:false};
function rebuildTechBonuses(){
  const u=new Set(state.techs||[]);
  techBonuses={
    woodMult:(u.has('improved_tools')?1.3:1)*(u.has('advanced_tools')?1.2:1)*(u.has('sawmill')?2:1),
    stoneMult:(u.has('improved_tools')?1.3:1)*(u.has('advanced_tools')?1.2:1),
    foodMult:(u.has('agriculture')?1.35:1)*(u.has('advanced_tools')?1.2:1),
    wallHpBonus:u.has('masonry')?80:0,
    towerRange:u.has('fortification')?2:0,
    towerDmg:u.has('fortification')?8:0,
    towerDouble:u.has('ballista'),
    hpRegen:u.has('herbalism'),
    maxHpBonus:u.has('field_medicine')?20:0,
    soldierDmg:u.has('field_medicine')?4:0,
    veteranBonus:u.has('veteran_training'),
    cropRotation:u.has('crop_rotation'),
    allSeasonFarm:u.has('irrigation'),
  };
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

// ── Tech Tree ─────────────────────────────────────────────────────────────────
function unlockTech(id){
  const tech=TECHS[id];if(!tech)return;
  if((state.techs||[]).includes(id)){log('Already researched.');return;}
  for(const req of tech.requires){if(!(state.techs||[]).includes(req)){log(`Requires ${TECHS[req].name} first.`);return;}}
  const res=state.resources;
  for(const[k,v]of Object.entries(tech.cost)){if((res[k]||0)<v){log(`Not enough ${k}!`);return;}}
  for(const[k,v]of Object.entries(tech.cost))res[k]-=v;
  if(!state.techs)state.techs=[];
  state.techs.push(id);
  rebuildTechBonuses();
  log(`🔬 Researched: ${tech.name}!`);
  soundBuildComplete();
  // Immediate effects
  if(id==='masonry'){
    const newMax=BUILDINGS.wall.maxHp+techBonuses.wallHpBonus;
    state.buildings.filter(b=>b.type==='wall'&&b.hp>0).forEach(b=>{b.maxHp=newMax;b.hp=Math.min(b.hp+80,newMax);});
  }
  if(id==='field_medicine'||id==='veteran_training'){
    state.colonists.forEach(c=>{
      const bonus=techBonuses.maxHpBonus+(techBonuses.veteranBonus&&c.job!==null&&state.buildings[c.job]?.type==='barracks'?15:0);
      const newMax=30+bonus+(c.traits?.includes('brave')?Math.round((30+bonus)*0.4):0);
      if(newMax>c.maxHp){c.hp+=newMax-c.maxHp;c.maxHp=newMax;}
    });
  }
  updateResourceUI();
  renderTechTree();
}

function renderTechTree(){
  const container=document.getElementById('tech-tree-content');
  if(!container)return;
  const unlocked=new Set(state.techs||[]);
  let html='';
  [1,2,3].forEach(tier=>{
    const tlist=Object.entries(TECHS).filter(([,t])=>t.tier===tier);
    html+=`<div style="margin-bottom:18px">`;
    html+=`<div style="font-size:9px;text-transform:uppercase;letter-spacing:2.5px;color:#2a4a68;margin-bottom:8px;font-weight:500">── Tier ${tier} ──</div>`;
    html+=`<div style="display:flex;gap:10px;flex-wrap:wrap">`;
    tlist.forEach(([id,tech])=>{
      const isUnlocked=unlocked.has(id);
      const reqsMet=tech.requires.every(r=>unlocked.has(r));
      const canAfford=Object.entries(tech.cost).every(([k,v])=>(state.resources[k]||0)>=v);
      const available=reqsMet&&!isUnlocked;
      const costStr=Object.entries(tech.cost).map(([k,v])=>`${v}${k==='wood'?'🪵':k==='stone'?'🪨':'🌾'}`).join(' ');
      const reqStr=tech.requires.map(r=>TECHS[r].name).join(', ');
      const borderCol=isUnlocked?'#20a060':available&&canAfford?'#2a6a9a':'#1a2d45';
      const bgCol=isUnlocked?'rgba(20,80,50,0.25)':available?'rgba(20,50,80,0.2)':'rgba(8,14,25,0.6)';
      const nameCol=isUnlocked?'#60e0a0':available?'#90b8d8':'#304858';
      html+=`<div onclick="unlockTech('${id}')" style="width:162px;background:${bgCol};border:1px solid ${borderCol};border-radius:5px;padding:10px 11px;cursor:${available?'pointer':'default'};transition:border-color 0.15s" onmouseover="if(${available?1:0})this.style.borderColor='#3a8aca'" onmouseout="this.style.borderColor='${borderCol}'">`;
      html+=`<div style="font-size:20px;margin-bottom:5px">${tech.icon}</div>`;
      html+=`<div style="font-weight:600;font-size:12px;color:${nameCol};margin-bottom:4px">${tech.name}</div>`;
      html+=`<div style="font-size:10px;color:#3a5870;line-height:1.5;margin-bottom:7px">${tech.desc}</div>`;
      if(isUnlocked){html+=`<div style="font-size:10px;color:#40b060;font-weight:500">✓ Researched</div>`;}
      else if(!reqsMet){html+=`<div style="font-size:10px;color:#2a3848">🔒 ${reqStr}</div>`;}
      else{html+=`<div style="font-size:10px;color:${canAfford?'#c8a84a':'#884040'}">${costStr}</div>`;}
      html+=`</div>`;
    });
    html+=`</div></div>`;
  });
  container.innerHTML=html;
}

function openTechTree(){
  if(!state.techs)state.techs=[];
  renderTechTree();
  document.getElementById('tech-modal').style.display='flex';
}
function initTechModal(){
  const closeBtn=document.getElementById('tech-close');
  if(closeBtn)closeBtn.addEventListener('click',()=>{document.getElementById('tech-modal').style.display='none';});
  const resBtn=document.getElementById('btn-research');
  if(resBtn)resBtn.addEventListener('click',openTechTree);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
function init(){
  generateMap();
  initThree();
  initInput();
  initFloats();
  initAudio();
  rebuildTechBonuses();
  initTechModal();
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
