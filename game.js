// ============================================================
// Colony Builder — core engine
// ============================================================

const TILE = 40;
const COLS = 40;
const ROWS = 30;

// Terrain types
const T = { GRASS: 0, FOREST: 1, STONE: 2, WATER: 3, DIRT: 4 };

// Building definitions
const BUILDINGS = {
  house:       { name: 'House',       icon: '🏠', cost: { wood: 5, stone: 3 }, housing: 3,  size: 1, maxHp: 100 },
  farm:        { name: 'Farm',        icon: '🌾', cost: { wood: 4 },           produces: 'food',  rate: 0.05, size: 2, maxHp: 60  },
  woodcutter:  { name: 'Woodcutter',  icon: '🪓', cost: { wood: 3 },           produces: 'wood',  rate: 0.04, size: 1, maxHp: 60  },
  quarry:      { name: 'Quarry',      icon: '⛏',  cost: { wood: 5 },           produces: 'stone', rate: 0.03, size: 1, maxHp: 80  },
  storehouse:  { name: 'Storehouse',  icon: '📦', cost: { wood: 6, stone: 4 }, storage: 200,      size: 1, maxHp: 80  },
  wall:        { name: 'Wall',        icon: '🧱', cost: { stone: 2 },                              size: 1, maxHp: 300, isBarrier: true },
  tower:       { name: 'Tower',       icon: '🗼', cost: { wood: 4, stone: 8 },                    size: 1, maxHp: 150, attackRange: 5, attackDamage: 12, attackRate: 80 },
  barracks:    { name: 'Barracks',    icon: '⚔',  cost: { wood: 6, stone: 4 },                    size: 1, maxHp: 120 },
};

const COLONIST_NAMES = ['Aldric','Berta','Cormac','Dagmar','Edwyn','Freya','Godwin','Hilda','Ivar','Judith','Kelda','Leofric','Marta','Nolan','Oswin','Petra','Rowan','Sigrid','Tobias','Ulf','Vilda','Wulfric','Yrsa','Zora'];

const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];
const SEASON_COLORS = ['#4a9a4a', '#3a8a3a', '#b06020', '#b0c8d8'];
const FOOD_SEASON_MULT = [1.0, 1.2, 0.8, 0.4]; // farm output per season

// ============================================================
// State
// ============================================================
let state = {
  resources: { wood: 20, stone: 10, food: 15 },
  population: 0,
  housing: 0,
  day: 1,
  tick: 0,
  seasonTick: 0,
  season: 0,
  tiles: [],
  buildings: [],
  colonists: [],
  raiders: [],
  floats: [],       // floating damage/resource text
  particles: [],    // smoke
  nextRaidIn: 900,  // ticks until first raid
  usedNames: [],
  placing: null,
  selectedTile: null,
  selectedColonist: null,
  gameOver: false,
  wonShown: false,
  camera: { x: 0, y: 0 },
  dragging: false,
  dragStart: null,
  mouseWorld: { x: 0, y: 0 },
};

// ============================================================
// Map generation
// ============================================================
function generateMap() {
  // Simple noise-like generation using overlapping sine waves
  const tiles = [];
  for (let r = 0; r < ROWS; r++) {
    tiles[r] = [];
    for (let c = 0; c < COLS; c++) {
      const nx = c / COLS;
      const ny = r / ROWS;
      const v = Math.sin(nx * 7.3 + 1.2) * Math.cos(ny * 5.1 + 0.8)
              + Math.sin(nx * 13.7 - 0.5) * Math.sin(ny * 11.3 + 2.1) * 0.5
              + Math.cos(nx * 3.1 + ny * 4.7) * 0.3;
      let type;
      if (v > 0.7)       type = T.STONE;
      else if (v > 0.2)  type = T.FOREST;
      else if (v < -0.8) type = T.WATER;
      else               type = T.GRASS;
      tiles[r][c] = {
        type,
        resource: type === T.FOREST ? 8 + Math.floor(Math.random() * 5)
                : type === T.STONE  ? 6 + Math.floor(Math.random() * 4)
                : 0,
        building: null,
      };
    }
  }
  // Ensure spawn area (center) is grass
  const cr = Math.floor(ROWS / 2), cc = Math.floor(COLS / 2);
  for (let dr = -3; dr <= 3; dr++)
    for (let dc = -4; dc <= 4; dc++) {
      const t = tiles[cr + dr]?.[cc + dc];
      if (t && t.type !== T.WATER) { t.type = T.GRASS; t.resource = 0; }
    }
  state.tiles = tiles;
}

// ============================================================
// Colonist
// ============================================================
function pickName() {
  const unused = COLONIST_NAMES.filter(n => !state.usedNames.includes(n));
  const pool = unused.length > 0 ? unused : COLONIST_NAMES;
  const name = pool[Math.floor(Math.random() * pool.length)];
  state.usedNames.push(name);
  return name;
}

function spawnColonist() {
  const cr = Math.floor(ROWS / 2), cc = Math.floor(COLS / 2);
  state.colonists.push({
    id: state.colonists.length,
    name: pickName(),
    x: cc * TILE + TILE / 2 + (Math.random() - 0.5) * 40,
    y: cr * TILE + TILE / 2 + (Math.random() - 0.5) * 40,
    tx: null, ty: null,
    job: null,
    hunger: 100,
    hp: 30, maxHp: 30,
    starving: 0,
    color: `hsl(${Math.floor(Math.random() * 360)},60%,70%)`,
    blinkTimer: 0,
    fleeing: false,
    path: [], pathTarget: null, pathCooldown: 0,
    attackCooldown: 0,
  });
  state.population++;
  updateResourceUI();
}

function assignJobs() {
  const productionTypes = new Set(['farm','woodcutter','quarry','barracks']);
  const unassigned = state.colonists.filter(c => c.job === null);
  const needsWorker = state.buildings.filter(b => productionTypes.has(b.type) && b.workers < 2 && b.hp > 0);
  unassigned.forEach(c => {
    const b = needsWorker.find(b => b.workers < 2);
    if (b) { c.job = b.id; b.workers++; log(`${c.name} assigned to ${BUILDINGS[b.type].name}`); }
  });
}

// ============================================================
// Raiders
// ============================================================
function addFloat(x, y, text, color) {
  state.floats.push({ x, y, text, life: 70, maxLife: 70, color: color || '#fff' });
}

function spawnRaid() {
  const size = 1 + Math.floor(state.day / 15);
  log(`⚔ Raiders approaching! (${size} attackers)`);
  for (let i = 0; i < size; i++) {
    // Spawn from a random map edge
    const edge = Math.floor(Math.random() * 4);
    let r, c;
    if (edge === 0) { r = 0;        c = Math.floor(Math.random() * COLS); }
    else if (edge === 1) { r = ROWS-1; c = Math.floor(Math.random() * COLS); }
    else if (edge === 2) { r = Math.floor(Math.random() * ROWS); c = 0; }
    else                 { r = Math.floor(Math.random() * ROWS); c = COLS-1; }
    state.raiders.push({
      id: Date.now() + i,
      x: c * TILE + TILE / 2,
      y: r * TILE + TILE / 2,
      hp: 30 + Math.floor(state.day / 5) * 5,
      maxHp: 30 + Math.floor(state.day / 5) * 5,
      attackCooldown: 0,
      blinkTimer: Math.floor(Math.random() * 60),
    });
  }
}

function updateRaiders() {
  // Tick down next raid
  state.nextRaidIn--;
  if (state.nextRaidIn <= 0) {
    spawnRaid();
    // Raids get more frequent as days pass (min 500 ticks)
    state.nextRaidIn = Math.max(500, 1400 - state.day * 10);
  }

  state.raiders.forEach(raider => {
    raider.blinkTimer = (raider.blinkTimer + 1) % 60;
    if (raider.attackCooldown > 0) raider.attackCooldown--;

    // Find nearest target: colonist or non-wall building
    let nearestDist = Infinity, nearestX = null, nearestY = null, nearestColonist = null, nearestBuilding = null;

    state.colonists.forEach(c => {
      const dx = c.x - raider.x, dy = c.y - raider.y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < nearestDist) { nearestDist = d; nearestX = c.x; nearestY = c.y; nearestColonist = c; nearestBuilding = null; }
    });

    state.buildings.filter(b => b.type !== 'wall' && b.hp > 0).forEach(b => {
      const bx = (b.c + 0.5) * TILE, by = (b.r + 0.5) * TILE;
      const dx = bx - raider.x, dy = by - raider.y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < nearestDist) { nearestDist = d; nearestX = bx; nearestY = by; nearestColonist = null; nearestBuilding = b; }
    });

    if (nearestX === null) return; // nothing to attack

    const attackRange = TILE * 0.9;
    if (nearestDist > attackRange) {
      // Move toward target, avoid walls
      const dx = nearestX - raider.x, dy = nearestY - raider.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const speed = 0.7;
      const nx = raider.x + (dx/dist) * speed;
      const ny = raider.y + (dy/dist) * speed;
      // Check if new position is in a wall tile
      const tc = Math.floor(nx / TILE), tr = Math.floor(ny / TILE);
      const tile = state.tiles[tr]?.[tc];
      if (tile && tile.building !== null) {
        const b = state.buildings[tile.building];
        if (b && BUILDINGS[b.type].isBarrier) {
          // Slide along wall — try x or y separately
          const nx2 = raider.x + (dx/dist) * speed;
          const tc2 = Math.floor(nx2 / TILE), tr2 = Math.floor(raider.y / TILE);
          const tile2 = state.tiles[tr2]?.[tc2];
          if (!tile2 || tile2.building === null || !BUILDINGS[state.buildings[tile2.building]?.type]?.isBarrier) {
            raider.x = nx2;
          } else {
            raider.y = raider.y + (dy/dist) * speed;
          }
          return;
        }
      }
      raider.x = nx; raider.y = ny;
    } else if (raider.attackCooldown === 0) {
      // Attack
      raider.attackCooldown = 60;
      if (nearestColonist) {
        nearestColonist.hp -= 10;
        addFloat(nearestColonist.x, nearestColonist.y - 16, '-10', '#ff4444');
        if (nearestColonist.hp <= 0) killColonist(nearestColonist.id);
      } else if (nearestBuilding) {
        nearestBuilding.hp -= 15;
        addFloat(nearestX, nearestY - 20, '-15', '#ff6644');
        if (nearestBuilding.hp <= 0) {
          log(`⚠ ${BUILDINGS[nearestBuilding.type].name} destroyed!`);
          nearestBuilding.hp = 0;
        }
      }
    }
  });
}

function killColonist(id) {
  const idx = state.colonists.findIndex(c => c.id === id);
  if (idx === -1) return;
  const c = state.colonists[idx];
  // Free job slot
  if (c.job !== null) {
    const b = state.buildings[c.job];
    if (b) b.workers = Math.max(0, b.workers - 1);
  }
  log(`💀 ${c.name} has died`);
  state.colonists.splice(idx, 1);
  state.population--;
  updateResourceUI();
}

const ASSIGNABLE = new Set(['farm', 'woodcutter', 'quarry', 'barracks']);
const MAX_WORKERS = 2;

function assignColonistToBuilding(colonistId, buildingId) {
  const c = state.colonists.find(col => col.id === colonistId);
  if (!c) return;
  // Release from current job
  if (c.job !== null) {
    const old = state.buildings[c.job];
    if (old) old.workers = Math.max(0, old.workers - 1);
  }
  if (buildingId === null) {
    c.job = null;
    c.path = []; c.pathTarget = null;
    log(`${c.name} unassigned`);
  } else {
    const b = state.buildings[buildingId];
    if (!b || b.hp <= 0) { log('That building is destroyed'); return; }
    c.job = buildingId;
    b.workers++;
    c.path = []; c.pathTarget = null;
    log(`${c.name} → ${BUILDINGS[b.type].name}`);
  }
}

function showColonistInfo(c) {
  const b = c.job !== null ? state.buildings[c.job] : null;
  const jobName = b ? BUILDINGS[b.type].name : 'Unassigned';
  const isSoldier = b?.type === 'barracks';
  document.getElementById('info-content').innerHTML =
    `<b>${c.name}</b>${isSoldier ? ' ⚔' : ''}<br>` +
    `Job: ${jobName}<br>` +
    `Hunger: ${Math.floor(c.hunger)}/100<br>` +
    `HP: ${c.hp}/${c.maxHp}<br><br>` +
    `<span style="color:#7ec8e3">Click a work building<br>to assign, or open<br>ground to unassign.</span>`;
}

function updateTowers() {
  state.buildings.filter(b => b.type === 'tower' && b.hp > 0).forEach(b => {
    if (!b.attackTimer) b.attackTimer = 0;
    b.attackTimer++;
    const def = BUILDINGS.tower;
    if (b.attackTimer < def.attackRate) return;
    b.attackTimer = 0;
    const bx = (b.c + 0.5) * TILE, by = (b.r + 0.5) * TILE;
    const range = def.attackRange * TILE;
    // Find nearest raider in range
    let target = null, bestDist = range;
    state.raiders.forEach(r => {
      const dx = r.x - bx, dy = r.y - by;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < bestDist) { bestDist = d; target = r; }
    });
    if (target) {
      target.hp -= def.attackDamage;
      addFloat(target.x, target.y - 16, `-${def.attackDamage}`, '#ffdd44');
      if (target.hp <= 0) {
        state.raiders = state.raiders.filter(r => r.id !== target.id);
        log('⚔ Raider slain by tower');
      }
    }
  });
}

// ============================================================
// A* Pathfinding
// ============================================================
function astar(startR, startC, goalR, goalC) {
  if (startR === goalR && startC === goalC) return [];

  function passable(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    const tile = state.tiles[r][c];
    if (tile.type === T.WATER) return false;
    if (tile.building !== null) {
      const b = state.buildings[tile.building];
      if (b && BUILDINGS[b.type].isBarrier && b.hp > 0) return false;
    }
    return true;
  }

  const key = (r, c) => r * COLS + c;
  const h   = (r, c) => Math.abs(r - goalR) + Math.abs(c - goalC);

  // open: Map key -> node; closed: Set of keys
  const open   = new Map();
  const closed = new Set();
  open.set(key(startR, startC), { r: startR, c: startC, g: 0, f: h(startR, startC), parent: null });

  const DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
  let iters = 0;

  while (open.size > 0 && iters++ < 800) {
    // Pick node with smallest f
    let cur = null;
    for (const node of open.values()) {
      if (!cur || node.f < cur.f) cur = node;
    }

    if (cur.r === goalR && cur.c === goalC) {
      const path = [];
      let n = cur;
      while (n) { path.push({ r: n.r, c: n.c }); n = n.parent; }
      return path.reverse();
    }

    open.delete(key(cur.r, cur.c));
    closed.add(key(cur.r, cur.c));

    for (const [dr, dc] of DIRS) {
      const nr = cur.r + dr, nc = cur.c + dc;
      if (!passable(nr, nc)) continue;
      const k = key(nr, nc);
      if (closed.has(k)) continue;
      const g = cur.g + 1;
      const ex = open.get(k);
      if (!ex || g < ex.g) {
        open.set(k, { r: nr, c: nc, g, f: g + h(nr, nc), parent: cur });
      }
    }
  }

  return null; // no path or exceeded iteration cap
}

// ============================================================
// Building placement
// ============================================================
function canPlace(r, c, type) {
  const def = BUILDINGS[type];
  const sz = def.size;
  for (let dr = 0; dr < sz; dr++)
    for (let dc = 0; dc < sz; dc++) {
      const tile = state.tiles[r + dr]?.[c + dc];
      if (!tile || tile.type === T.WATER || tile.building) return false;
    }
  return true;
}

function placeBuilding(r, c, type) {
  const def = BUILDINGS[type];
  const res = state.resources;
  // Check cost
  for (const [k, v] of Object.entries(def.cost || {})) {
    if ((res[k] || 0) < v) { log(`Not enough ${k}!`); return false; }
  }
  if (!canPlace(r, c, type)) { log('Cannot build there!'); return false; }
  // Deduct cost
  for (const [k, v] of Object.entries(def.cost || {})) res[k] -= v;

  const id = state.buildings.length;
  const def2 = BUILDINGS[type];
  // walls/towers are instant; others require construction
  const instant = (type === 'wall' || type === 'tower');
  const b = { id, type, r, c, workers: 0, progress: 0, active: instant, constructing: !instant, hp: def2.maxHp, attackTimer: 0 };
  state.buildings.push(b);

  // Mark tiles
  const sz = def.size;
  for (let dr = 0; dr < sz; dr++)
    for (let dc = 0; dc < sz; dc++)
      state.tiles[r + dr][c + dc].building = id;

  const instant2 = (type === 'wall' || type === 'tower');
  if (instant2) {
    log(`Built ${def.name}`);
  } else {
    log(`🔨 Constructing ${def.name}…`);
  }
  if (type === 'house' && instant2) {
    state.housing += def.housing;
    const toSpawn = Math.min(def.housing, Math.floor(state.resources.food / 5));
    for (let i = 0; i < toSpawn; i++) {
      if (state.population < state.housing) spawnColonist();
    }
    assignJobs();
  }
  updateResourceUI();
  return true;
}

// ============================================================
// Tick / simulation
// ============================================================
const TICKS_PER_DAY = 200;

function depleteTile(b) {
  const targetType = b.type === 'woodcutter' ? T.FOREST : T.STONE;
  const radius = 5;
  let nearest = null, bestDist = Infinity;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const tr = b.r + dr, tc = b.c + dc;
      const tile = state.tiles[tr]?.[tc];
      if (tile && tile.type === targetType && tile.resource > 0 && tile.building === null) {
        const d = Math.sqrt(dr * dr + dc * dc);
        if (d < bestDist) { bestDist = d; nearest = { r: tr, c: tc, tile }; }
      }
    }
  }
  if (!nearest) return;
  nearest.tile.resource--;
  if (nearest.tile.resource <= 0) {
    nearest.tile.type  = targetType === T.FOREST ? T.GRASS : T.DIRT;
    nearest.tile.resource = 0;
    log(targetType === T.FOREST ? '🌲 A forest patch cleared' : '⛏ Stone deposit exhausted');
  }
}

function regrowTiles() {
  const DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = state.tiles[r][c];
      if (tile.building !== null) continue;
      // Partially depleted tiles regrow their resource slowly
      if (tile.type === T.FOREST && tile.resource < 10 && Math.random() < 0.4)
        tile.resource++;
      if (tile.type === T.STONE && tile.resource < 8 && Math.random() < 0.15)
        tile.resource++;
      // Bare grass adjacent to forest can regrow into forest (slow)
      if (tile.type === T.GRASS && Math.random() < 0.08) {
        if (DIRS.some(([dr, dc]) => state.tiles[r+dr]?.[c+dc]?.type === T.FOREST)) {
          tile.type = T.FOREST; tile.resource = 3;
        }
      }
      // Dirt adjacent to stone can regrow (very slow)
      if (tile.type === T.DIRT && Math.random() < 0.03) {
        if (DIRS.some(([dr, dc]) => state.tiles[r+dr]?.[c+dc]?.type === T.STONE)) {
          tile.type = T.STONE; tile.resource = 2;
        }
      }
    }
  }
}

function checkWinLose() {
  if (state.gameOver) return;
  if (state.population === 0 && state.colonists.length === 0 && state.tick > 200) {
    state.gameOver = true;
    showOverlay(
      'Colony Lost',
      `Your colony survived <b>${state.day}</b> days<br>before the last colonist fell.`,
      'Try Again', () => location.reload()
    );
  }
  if (!state.wonShown && state.population >= 20) {
    state.wonShown = true;
    showOverlay(
      'Colony Thriving!',
      `Your settlement has grown to <b>${state.population}</b> souls.<br>The colony is established!`,
      'Keep Playing', () => { document.getElementById('game-overlay').style.display = 'none'; }
    );
  }
}

function showOverlay(title, body, btnLabel, btnAction) {
  document.getElementById('overlay-title').textContent = title;
  document.getElementById('overlay-body').innerHTML = body;
  const btn = document.getElementById('overlay-btn');
  btn.textContent = btnLabel;
  btn.onclick = btnAction;
  document.getElementById('game-overlay').style.display = 'flex';
}
const DAYS_PER_SEASON = 5;

function tick() {
  if (state.gameOver) return;
  state.tick++;
  const t = state.tick;

  // Construction progress (1 colonist = 1 pt/tick, done at 120)
  const BUILD_TIME = 120;
  state.buildings.forEach(b => {
    if (!b.constructing) return;
    b.progress += 1; // base progress; colonists nearby speed it up implicitly
    if (b.progress >= BUILD_TIME) {
      b.constructing = false;
      b.active = true;
      b.progress = BUILD_TIME;
      const def = BUILDINGS[b.type];
      log(`✅ ${def.name} complete`);
      if (b.type === 'house') {
        state.housing += def.housing;
        const toSpawn = Math.min(def.housing, Math.floor(state.resources.food / 5));
        for (let i = 0; i < toSpawn; i++) {
          if (state.population < state.housing) spawnColonist();
        }
        assignJobs();
      } else {
        assignJobs();
      }
    }
  });

  // Production every tick
  state.buildings.forEach(b => {
    if (!b.active) return;
    const def = BUILDINGS[b.type];
    if (!def.produces) return;
    const workers = b.workers;
    if (workers === 0) return;
    let rate = def.rate * workers;
    if (def.produces === 'food') rate *= FOOD_SEASON_MULT[state.season];
    state.resources[def.produces] = (state.resources[def.produces] || 0) + rate;
    // Deplete nearby resource tiles (not farms — food is renewable)
    if (b.type === 'woodcutter' || b.type === 'quarry') {
      if (!b.depletionAccum) b.depletionAccum = 0;
      b.depletionAccum += rate;
      if (b.depletionAccum >= 1) {
        b.depletionAccum -= 1;
        depleteTile(b);
      }
    }
  });

  // Tile regeneration — every 600 ticks
  if (t % 600 === 0) regrowTiles();

  // Smoke particles from active production buildings
  if (t % 8 === 0) {
    state.buildings.forEach(b => {
      if (!b.active || !BUILDINGS[b.type].produces) return;
      state.particles.push({
        x: (b.c + 0.4 + Math.random() * 0.2) * TILE,
        y: (b.r + 0.1) * TILE,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -(0.4 + Math.random() * 0.4),
        life: 50 + Math.random() * 30,
        maxLife: 80,
        size: 3 + Math.random() * 3,
      });
    });
  }

  // Update smoke particles
  state.particles = state.particles.filter(p => {
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.98;
    p.life--;
    return p.life > 0;
  });
  if (state.particles.length > 200) state.particles.splice(0, state.particles.length - 200);

  // Hunger / food consumption + starvation deaths
  if (t % 20 === 0) {
    const toKill = [];
    state.colonists.forEach(c => {
      c.hunger -= 2;
      if (c.hunger <= 0) {
        c.hunger = 0;
        if (state.resources.food >= 1) {
          state.resources.food -= 1;
          c.hunger = Math.min(100, c.hunger + 30);
        } else {
          c.starving = (c.starving || 0) + 1;
          if (c.starving >= 8) toKill.push(c.id); // ~8 hunger ticks with no food
        }
      } else {
        c.starving = 0;
      }
    });
    toKill.forEach(id => killColonist(id));
  }

  // Raiders & towers
  updateRaiders();
  updateTowers();

  // Update floats
  state.floats = state.floats.filter(f => {
    f.y -= 0.6;
    f.life--;
    return f.life > 0;
  });

  // Colonist combat (self-defence + soldiers)
  state.colonists.forEach(c => {
    if (c.attackCooldown > 0) { c.attackCooldown--; return; }
    const isSoldier = c.job !== null && state.buildings[c.job]?.type === 'barracks';
    const range    = isSoldier ? TILE * 2.5 : TILE * 1.2;
    const dmg      = isSoldier ? 8 : 4;
    const cooldown = isSoldier ? 70 : 110;

    let nearest = null, bestDist = range;
    state.raiders.forEach(r => {
      const dx = r.x - c.x, dy = r.y - c.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) { bestDist = d; nearest = r; }
    });

    if (nearest) {
      nearest.hp -= dmg;
      addFloat(nearest.x, nearest.y - 16, `-${dmg}`, '#88ddff');
      c.attackCooldown = cooldown;
      if (nearest.hp <= 0) {
        state.raiders = state.raiders.filter(r => r.id !== nearest.id);
        log(`⚔ ${c.name} slew a raider`);
      }
    }
  });

  // Move colonists using A* pathfinding
  state.colonists.forEach(c => {
    const cr2 = Math.floor(ROWS / 2), cc2 = Math.floor(COLS / 2);
    const curR = Math.max(0, Math.min(ROWS - 1, Math.floor(c.y / TILE)));
    const curC = Math.max(0, Math.min(COLS - 1, Math.floor(c.x / TILE)));

    // Soldiers chase nearby raiders
    const isSoldier = c.job !== null && state.buildings[c.job]?.type === 'barracks';
    let chasingRaider = false;
    if (isSoldier && state.raiders.length > 0) {
      let nearest = null, bestDist = 5 * TILE;
      state.raiders.forEach(r => {
        const dx = r.x - c.x, dy = r.y - c.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) { bestDist = d; nearest = r; }
      });
      if (nearest) {
        const gr = Math.max(0, Math.min(ROWS - 1, Math.floor(nearest.y / TILE)));
        const gc = Math.max(0, Math.min(COLS - 1, Math.floor(nearest.x / TILE)));
        if (!c.pathTarget || c.pathTarget.r !== gr || c.pathTarget.c !== gc) {
          c.pathTarget = { r: gr, c: gc };
          c.path = astar(curR, curC, gr, gc) || [];
        }
        chasingRaider = true;
      }
    }

    if (!chasingRaider) {
      if (c.job === null) {
        // Wander: pick a new random nearby goal when idle or arrived
        if (c.pathCooldown <= 0 && c.path.length === 0) {
          let gr = Math.round(cr2 + (Math.random() - 0.5) * 10);
          let gc = Math.round(cc2 + (Math.random() - 0.5) * 12);
          gr = Math.max(0, Math.min(ROWS - 1, gr));
          gc = Math.max(0, Math.min(COLS - 1, gc));
          c.pathTarget = { r: gr, c: gc };
          c.path = astar(curR, curC, gr, gc) || [];
          c.pathCooldown = 180 + Math.floor(Math.random() * 120);
        }
      } else {
        const b = state.buildings[c.job];
        if (b) {
          const gr = b.r, gc = b.c;
          if (!c.pathTarget || c.pathTarget.r !== gr || c.pathTarget.c !== gc) {
            c.pathTarget = { r: gr, c: gc };
            c.path = astar(curR, curC, gr, gc) || [];
          }
        }
      }
    }

    if (c.pathCooldown > 0) c.pathCooldown--;

    // Follow path waypoints
    if (c.path.length > 0) {
      const next = c.path[0];
      const tx = (next.c + 0.5) * TILE;
      const ty = (next.r + 0.5) * TILE;
      const dx = tx - c.x, dy = ty - c.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 3) {
        c.path.shift();
      } else {
        c.x += (dx / dist) * 0.8;
        c.y += (dy / dist) * 0.8;
      }
    } else if (c.pathTarget && c.job !== null) {
      // Fallback direct movement when A* found no path (e.g. fully walled off)
      const tx = (c.pathTarget.c + 0.5) * TILE;
      const ty = (c.pathTarget.r + 0.5) * TILE;
      const dx = tx - c.x, dy = ty - c.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 3) { c.x += (dx / dist) * 0.8; c.y += (dy / dist) * 0.8; }
    }

    c.blinkTimer = (c.blinkTimer + 1) % 60;
  });

  // Day change
  if (t % TICKS_PER_DAY === 0) {
    state.day++;
    state.seasonTick++;
    if (state.seasonTick >= DAYS_PER_SEASON) {
      state.seasonTick = 0;
      state.season = (state.season + 1) % 4;
      log(`Season changed: ${SEASON_NAMES[state.season]}`);
    }
    updateResourceUI();
    document.getElementById('day-label').textContent = `Day ${state.day}`;
    document.getElementById('season-label').textContent = SEASON_NAMES[state.season];
    document.getElementById('season-label').style.color = SEASON_COLORS[state.season];
  }

  // Win / lose check
  checkWinLose();

  // Cap resources
  state.resources.wood  = Math.max(0, Math.min(9999, state.resources.wood));
  state.resources.stone = Math.max(0, Math.min(9999, state.resources.stone));
  state.resources.food  = Math.max(0, Math.min(9999, state.resources.food));

  // Animate water
  waterOffset += 0.04;
}

// ============================================================
// Rendering
// ============================================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let waterOffset = 0;

// Deterministic per-tile variation (no randomness per frame)
function th(r, c, salt) {
  return (((r * 73856093) ^ (c * 19349663) ^ (salt * 83492791)) & 0xFFFF) / 0xFFFF;
}

function resizeCanvas() {
  const area = document.getElementById('game-area');
  canvas.width  = area.clientWidth  || (window.innerWidth - 220);
  canvas.height = area.clientHeight || window.innerHeight;
}

function worldToScreen(wx, wy) { return { x: wx - state.camera.x, y: wy - state.camera.y }; }
function screenToWorld(sx, sy) { return { x: sx + state.camera.x, y: sy + state.camera.y }; }
function screenToTile(sx, sy) {
  const { x, y } = screenToWorld(sx, sy);
  return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
}

// ---- Terrain drawing ----

function drawSnowOverlay(sx, sy, r, c) {
  ctx.fillStyle = 'rgba(220,235,255,0.45)';
  ctx.fillRect(sx, sy, TILE, TILE);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 4; i++) {
    const nx = sx + th(r, c, i * 2) * TILE;
    const ny = sy + th(r, c, i * 2 + 1) * TILE;
    ctx.beginPath(); ctx.arc(nx, ny, 1.5, 0, Math.PI * 2); ctx.fill();
  }
}

function drawGrass(sx, sy, r, c) {
  const g = ctx.createLinearGradient(sx, sy, sx + TILE, sy + TILE);
  if (state.season === 3) {
    g.addColorStop(0, '#c8d8d0'); g.addColorStop(1, '#a8b8b0');
  } else {
    g.addColorStop(0, '#5aaa48'); g.addColorStop(1, '#488838');
  }
  ctx.fillStyle = g;
  ctx.fillRect(sx, sy, TILE, TILE);
  if (state.season === 3) drawSnowOverlay(sx, sy, r, c);
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
}

function drawTree(cx, cy, size) {
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx + 1, cy + 3, size * 0.45, size * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  // trunk
  ctx.fillStyle = '#7a4a20';
  ctx.fillRect(cx - 2, cy - size * 0.15, 4, size * 0.4);
  // foliage layers (bottom to top, drawn top-to-bottom for overlap)
  const layers = [
    { y: -0.05, w: 1.15, col: '#2d7a18' },
    { y: -0.35, w: 0.90, col: '#38962a' },
    { y: -0.62, w: 0.65, col: '#44b035' },
  ];
  layers.forEach(l => {
    const ly = cy - size * (-l.y + 0.05);
    ctx.fillStyle = l.col;
    ctx.beginPath();
    ctx.moveTo(cx - size * l.w, ly);
    ctx.lineTo(cx + size * l.w, ly);
    ctx.lineTo(cx, ly - size * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  });
}

function drawForest(sx, sy, r, c, resources) {
  const g = ctx.createLinearGradient(sx, sy, sx + TILE, sy + TILE);
  if (state.season === 3) {
    g.addColorStop(0, '#384830'); g.addColorStop(1, '#283820');
  } else {
    g.addColorStop(0, '#2c561a'); g.addColorStop(1, '#1e3e10');
  }
  ctx.fillStyle = g;
  ctx.fillRect(sx, sy, TILE, TILE);
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
  if (resources > 0) {
    const h1 = th(r, c, 0), h2 = th(r, c, 1);
    drawTree(sx + TILE * (0.28 + h1 * 0.22), sy + TILE * (0.55 + h1 * 0.2), 13 + h1 * 5);
    if (resources > 5)
      drawTree(sx + TILE * (0.58 + h2 * 0.18), sy + TILE * (0.48 + h2 * 0.22), 10 + h2 * 4);
  }
  if (state.season === 3) drawSnowOverlay(sx, sy, r, c);
}

function drawRock(cx, cy, size) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 4, size * 0.85, size * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(cx - size * 0.2, cy - size * 0.25, 0, cx, cy, size);
  g.addColorStop(0, '#c0bdb8');
  g.addColorStop(1, '#606060');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size, size * 0.7, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx - size * 0.25, cy - size * 0.22, size * 0.28, size * 0.18, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawStone(sx, sy, r, c, resources) {
  const g = ctx.createLinearGradient(sx, sy, sx, sy + TILE);
  g.addColorStop(0, '#909090');
  g.addColorStop(1, '#606060');
  ctx.fillStyle = g;
  ctx.fillRect(sx, sy, TILE, TILE);
  // crack lines
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  const h1 = th(r, c, 2), h2 = th(r, c, 3);
  ctx.beginPath();
  ctx.moveTo(sx + TILE * 0.15, sy + TILE * 0.25);
  ctx.lineTo(sx + TILE * (0.45 + h1 * 0.25), sy + TILE * (0.55 + h2 * 0.2));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.beginPath();
  ctx.moveTo(sx + TILE * 0.6, sy + TILE * 0.2);
  ctx.lineTo(sx + TILE * (0.7 + h2 * 0.15), sy + TILE * 0.6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
  if (resources > 0) {
    drawRock(sx + TILE * (0.25 + h1 * 0.1), sy + TILE * (0.55 + h2 * 0.1), 7 + h1 * 4);
    if (resources > 4)
      drawRock(sx + TILE * (0.58 + h2 * 0.1), sy + TILE * (0.5 + h1 * 0.1), 5 + h2 * 3);
  }
}

function drawWater(sx, sy) {
  const g = ctx.createLinearGradient(sx, sy, sx, sy + TILE);
  g.addColorStop(0, '#2060cc');
  g.addColorStop(1, '#1040a0');
  ctx.fillStyle = g;
  ctx.fillRect(sx, sy, TILE, TILE);
  // clip waves to tile
  ctx.save();
  ctx.beginPath(); ctx.rect(sx, sy, TILE, TILE); ctx.clip();
  ctx.strokeStyle = 'rgba(140,200,255,0.4)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const wy = sy + TILE * (0.28 + i * 0.24) + Math.sin(waterOffset + sx * 0.018 + i * 1.3) * 3;
    ctx.beginPath();
    ctx.moveTo(sx + 4, wy);
    ctx.bezierCurveTo(sx + TILE * 0.3, wy - 3, sx + TILE * 0.7, wy + 3, sx + TILE - 4, wy);
    ctx.stroke();
  }
  // sheen
  ctx.fillStyle = 'rgba(120,180,255,0.07)';
  ctx.fillRect(sx, sy, TILE, TILE * 0.45);
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
}

// ---- Building drawing ----

function drawHouse(sx, sy) {
  const w = TILE, h = TILE;
  const wallY = sy + h * 0.44, wallH = h * 0.5;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(sx + w * 0.5 + 3, sy + h - 2, w * 0.38, h * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  // walls
  ctx.fillStyle = '#d6b87a';
  ctx.fillRect(sx + 5, wallY, w - 10, wallH);
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(sx + w - 12, wallY, 7, wallH);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(sx + 5, wallY, 6, wallH);
  // roof
  ctx.fillStyle = '#a03a28';
  ctx.beginPath();
  ctx.moveTo(sx + 3, wallY + 2);
  ctx.lineTo(sx + w / 2, sy + 5);
  ctx.lineTo(sx + w - 3, wallY + 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(sx + 4, wallY + 2);
  ctx.lineTo(sx + w / 2, sy + 5);
  ctx.lineTo(sx + w / 2 - 3, sy + 5);
  ctx.lineTo(sx + 6, wallY + 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#6a2218';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx + 3, wallY + 2);
  ctx.lineTo(sx + w / 2, sy + 5);
  ctx.lineTo(sx + w - 3, wallY + 2);
  ctx.stroke();
  // chimney
  ctx.fillStyle = '#a06840';
  ctx.fillRect(sx + w * 0.64, sy + 7, 6, 13);
  ctx.fillStyle = '#7a4828';
  ctx.fillRect(sx + w * 0.625, sy + 5, 9, 4);
  // door (arched)
  ctx.fillStyle = '#6a3818';
  const dw = 7, dh = 11, dx = sx + w / 2 - 3.5, dy = sy + h - dh - 2;
  ctx.beginPath();
  ctx.moveTo(dx, dy + dh); ctx.lineTo(dx, dy + 4);
  ctx.quadraticCurveTo(dx, dy, dx + dw / 2, dy);
  ctx.quadraticCurveTo(dx + dw, dy, dx + dw, dy + 4);
  ctx.lineTo(dx + dw, dy + dh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,200,100,0.3)'; // door knob
  ctx.beginPath(); ctx.arc(dx + dw - 2, dy + dh * 0.6, 1, 0, Math.PI * 2); ctx.fill();
  // windows
  [[sx + 7, wallY + 5], [sx + w - 16, wallY + 5]].forEach(([wx, wy2]) => {
    ctx.fillStyle = '#c8e8ff';
    ctx.fillRect(wx, wy2, 8, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(wx + 1, wy2 + 1, 3, 2);
    ctx.strokeStyle = '#6a3818'; ctx.lineWidth = 1;
    ctx.strokeRect(wx, wy2, 8, 7);
    ctx.beginPath(); ctx.moveTo(wx + 4, wy2); ctx.lineTo(wx + 4, wy2 + 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wx, wy2 + 3.5); ctx.lineTo(wx + 8, wy2 + 3.5); ctx.stroke();
  });
}

function drawFarm(sx, sy) {
  const w = TILE * 2, h = TILE * 2;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(sx + 4, sy + 5, w, h);
  // field rows
  const rowColors = ['#7abe32', '#68a828', '#5c9420', '#7abe32', '#68a828'];
  rowColors.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(sx + 2, sy + 2 + i * ((h - 4) / 5), w - 4, (h - 4) / 5 + 1);
  });
  // crop tufts
  ctx.fillStyle = '#3a6c10';
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 7; col++) {
      const cx2 = sx + 7 + col * ((w - 14) / 6);
      const cy2 = sy + 7 + row * ((h - 14) / 4);
      ctx.beginPath(); ctx.arc(cx2, cy2, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#50901a';
      ctx.fillRect(cx2 - 1, cy2 - 4, 2, 4);
      ctx.fillStyle = '#3a6c10';
    }
  }
  // border
  ctx.strokeStyle = '#3a6010'; ctx.lineWidth = 2;
  ctx.strokeRect(sx + 2, sy + 2, w - 4, h - 4);
  // label badge
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.roundRect(sx + w / 2 - 12, sy + h / 2 - 12, 24, 24, 4); ctx.fill();
  ctx.font = '18px serif';
  ctx.fillText('🌾', sx + w / 2 - 9, sy + h / 2 + 7);
}

function drawWoodcutter(sx, sy) {
  const w = TILE, h = TILE;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(sx + w * 0.5 + 3, sy + h - 2, w * 0.38, h * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  // log walls
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#9a6838' : '#7a4e28';
    ctx.fillRect(sx + 4, sy + h * 0.5 + i * (h * 0.44 / 5), w - 8, h * 0.44 / 5 + 1);
    // log end knots
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.arc(sx + 5, sy + h * 0.5 + i * (h * 0.44 / 5) + 3, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // roof
  ctx.fillStyle = '#6a4020';
  ctx.beginPath();
  ctx.moveTo(sx + 2, sy + h * 0.52);
  ctx.lineTo(sx + w / 2, sy + h * 0.22);
  ctx.lineTo(sx + w - 2, sy + h * 0.52);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3c2010'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx + 2, sy + h * 0.52);
  ctx.lineTo(sx + w / 2, sy + h * 0.22);
  ctx.lineTo(sx + w - 2, sy + h * 0.52);
  ctx.stroke();
  // door
  ctx.fillStyle = '#3c2010';
  ctx.fillRect(sx + w / 2 - 4, sy + h - 11, 8, 11);
  // axe badge
  ctx.font = '13px serif';
  ctx.fillText('🪓', sx + 3, sy + h * 0.46);
}

function drawQuarry(sx, sy) {
  const w = TILE, h = TILE;
  // pit
  const g = ctx.createRadialGradient(sx + w / 2, sy + h / 2, 2, sx + w / 2, sy + h / 2, w * 0.7);
  g.addColorStop(0, '#7a7068'); g.addColorStop(1, '#4a4038');
  ctx.fillStyle = g;
  ctx.fillRect(sx + 2, sy + 2, w - 4, h - 4);
  // excavation marks
  ctx.strokeStyle = '#9a9088'; ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(sx + 5 + i * 8, sy + h * 0.25);
    ctx.lineTo(sx + 8 + i * 8, sy + h * 0.72);
    ctx.stroke();
  }
  // rocks
  drawRock(sx + w * 0.22, sy + h * 0.62, 6);
  drawRock(sx + w * 0.55, sy + h * 0.56, 5);
  drawRock(sx + w * 0.75, sy + h * 0.68, 4);
  // border + icon
  ctx.strokeStyle = '#3a2e20'; ctx.lineWidth = 2;
  ctx.strokeRect(sx + 2, sy + 2, w - 4, h - 4);
  ctx.font = '13px serif'; ctx.fillText('⛏', sx + 3, sy + 17);
}

function drawStorehouse(sx, sy) {
  const w = TILE, h = TILE;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(sx + w * 0.5 + 3, sy + h - 2, w * 0.4, h * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  // walls
  ctx.fillStyle = '#c8a868';
  ctx.fillRect(sx + 3, sy + h * 0.38, w - 6, h * 0.58);
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(sx + w - 10, sy + h * 0.38, 7, h * 0.58);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(sx + 3, sy + h * 0.38, 6, h * 0.58);
  // barn roof (rounded)
  ctx.fillStyle = '#7a5030';
  ctx.beginPath();
  ctx.moveTo(sx + 3, sy + h * 0.4);
  ctx.bezierCurveTo(sx + 3, sy + h * 0.06, sx + w - 3, sy + h * 0.06, sx + w - 3, sy + h * 0.4);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#4a2808'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(sx + 5, sy + h * 0.38);
  ctx.bezierCurveTo(sx + 5, sy + h * 0.1, sx + w / 2, sy + h * 0.06, sx + w / 2, sy + h * 0.06);
  ctx.lineTo(sx + w / 2 - 3, sy + h * 0.06);
  ctx.bezierCurveTo(sx + w / 2 - 3, sy + h * 0.1, sx + 7, sy + h * 0.12, sx + 7, sy + h * 0.38);
  ctx.closePath(); ctx.fill();
  // big doors
  ctx.fillStyle = '#8a5828';
  ctx.fillRect(sx + w * 0.22, sy + h * 0.6, w * 0.56, h * 0.36);
  ctx.strokeStyle = '#5a3010'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(sx + w / 2, sy + h * 0.6); ctx.lineTo(sx + w / 2, sy + h - 2); ctx.stroke();
  ctx.strokeRect(sx + w * 0.22, sy + h * 0.6, w * 0.56, h * 0.36);
  ctx.font = '11px serif'; ctx.fillText('📦', sx + w * 0.32, sy + h * 0.52);
}

// ---- Wall & Tower drawing ----

function drawWall(sx, sy, hp, maxHp) {
  const dmg = hp / maxHp;
  ctx.fillStyle = dmg > 0.5 ? '#8a8278' : '#6a6258';
  ctx.fillRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
  // battlements
  ctx.fillStyle = dmg > 0.5 ? '#9a9288' : '#7a7268';
  for (let i = 0; i < 3; i++) ctx.fillRect(sx + 4 + i * 12, sy + 2, 8, 7);
  // arrow slot
  ctx.fillStyle = '#2a2218';
  ctx.fillRect(sx + TILE/2 - 2, sy + 14, 4, 10);
  ctx.strokeStyle = '#4a4038'; ctx.lineWidth = 1;
  ctx.strokeRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
  // damage cracks
  if (dmg < 0.6) {
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx+8,sy+10); ctx.lineTo(sx+15,sy+25); ctx.stroke();
  }
}

function drawTower(sx, sy, hp, maxHp) {
  const w = TILE, h = TILE;
  const dmg = hp / maxHp;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(sx+w/2+3, sy+h, w*0.38, h*0.09, 0, 0, Math.PI*2); ctx.fill();
  // body
  ctx.fillStyle = dmg > 0.5 ? '#8a8078' : '#6a6058';
  ctx.fillRect(sx + 5, sy + h*0.28, w - 10, h*0.68);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(sx + w - 12, sy + h*0.28, 7, h*0.68);
  // battlements
  ctx.fillStyle = dmg > 0.5 ? '#9a9088' : '#7a7068';
  for (let i = 0; i < 3; i++) ctx.fillRect(sx + 6 + i * 11, sy + h*0.26, 7, 8);
  // arrow slit
  ctx.fillStyle = '#1a1410';
  ctx.fillRect(sx + w/2 - 2, sy + h*0.48, 4, 10);
  // door
  ctx.fillStyle = '#3a2810';
  ctx.fillRect(sx + w/2 - 4, sy + h - 10, 8, 10);
  ctx.strokeStyle = '#4a3828'; ctx.lineWidth = 1;
  ctx.strokeRect(sx + 5, sy + h*0.28, w - 10, h*0.68);
}

function drawBarracks(sx, sy) {
  const w = TILE, h = TILE;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(sx + w / 2 + 2, sy + h, w * 0.42, h * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  // stone floor
  ctx.fillStyle = '#5a5048';
  ctx.fillRect(sx + 2, sy + 2, w - 4, h - 4);
  // walls
  ctx.fillStyle = '#7a6a58';
  ctx.fillRect(sx + 3, sy + h * 0.3, w - 6, h * 0.66);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(sx + w - 11, sy + h * 0.3, 8, h * 0.66);
  // roof
  ctx.fillStyle = '#8a3020';
  ctx.beginPath();
  ctx.moveTo(sx + 1, sy + h * 0.32);
  ctx.lineTo(sx + w / 2, sy + h * 0.06);
  ctx.lineTo(sx + w - 1, sy + h * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#6a2010'; ctx.lineWidth = 1; ctx.stroke();
  // door
  ctx.fillStyle = '#2a180a';
  ctx.fillRect(sx + w / 2 - 5, sy + h * 0.66, 10, h * 0.3);
  // crossed swords emblem
  ctx.strokeStyle = '#d0b840'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx + w * 0.32, sy + h * 0.38); ctx.lineTo(sx + w * 0.48, sy + h * 0.6);
  ctx.moveTo(sx + w * 0.68, sy + h * 0.38); ctx.lineTo(sx + w * 0.52, sy + h * 0.6);
  ctx.stroke();
  ctx.strokeStyle = '#d0b840'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx + w * 0.32, sy + h * 0.6);  ctx.lineTo(sx + w * 0.48, sy + h * 0.38);
  ctx.moveTo(sx + w * 0.68, sy + h * 0.6);  ctx.lineTo(sx + w * 0.52, sy + h * 0.38);
  ctx.stroke();
  ctx.strokeStyle = '#4a3828'; ctx.lineWidth = 1;
  ctx.strokeRect(sx + 3, sy + h * 0.3, w - 6, h * 0.66);
}

// ---- Raider drawing ----

function drawRaider(raider) {
  const { x: sx, y: sy } = worldToScreen(raider.x, raider.y);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(sx, sy+8, 6, 2.5, 0, 0, Math.PI*2); ctx.fill();
  // legs
  ctx.strokeStyle = '#6a1818'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx-2, sy+2); ctx.lineTo(sx-3, sy+8);
  ctx.moveTo(sx+2, sy+2); ctx.lineTo(sx+3, sy+8);
  ctx.stroke();
  // body (dark armour)
  ctx.fillStyle = '#4a1a1a';
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(sx-4, sy-5, 8, 8, 1) : ctx.rect(sx-4, sy-5, 8, 8);
  ctx.fill();
  // head
  ctx.fillStyle = '#c06040';
  ctx.beginPath(); ctx.arc(sx, sy-9, 4.5, 0, Math.PI*2); ctx.fill();
  // helmet
  ctx.fillStyle = '#333';
  ctx.beginPath(); ctx.arc(sx, sy-11, 4, Math.PI, Math.PI*2); ctx.fill();
  ctx.fillRect(sx-5, sy-12, 10, 3);
  // red eyes
  if (raider.blinkTimer < 52) {
    ctx.fillStyle = '#ff3333';
    ctx.beginPath(); ctx.arc(sx-1.5, sy-9.5, 1, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx+1.5, sy-9.5, 1, 0, Math.PI*2); ctx.fill();
  }
  // HP bar
  const bw = 14, bh = 2, bx = sx-bw/2, by = sy-18;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx-1, by-1, bw+2, bh+2);
  ctx.fillStyle = '#dd2222'; ctx.fillRect(bx, by, bw*(raider.hp/raider.maxHp), bh);
}

// ---- Colonist drawing ----

function drawColonist(c) {
  const { x: sx, y: sy } = worldToScreen(c.x, c.y);
  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 8, 6, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs
  ctx.strokeStyle = c.hunger < 30 ? '#cc3333' : c.color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx - 2, sy + 2); ctx.lineTo(sx - 3, sy + 8);
  ctx.moveTo(sx + 2, sy + 2); ctx.lineTo(sx + 3, sy + 8);
  ctx.stroke();
  // body
  ctx.fillStyle = c.hunger < 30 ? '#cc3333' : c.color;
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(sx - 4, sy - 5, 8, 8, 2)
    : ctx.rect(sx - 4, sy - 5, 8, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.5; ctx.stroke();
  // head
  ctx.fillStyle = '#f5c885';
  ctx.beginPath(); ctx.arc(sx, sy - 9, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.5; ctx.stroke();
  // hair
  ctx.fillStyle = c.color;
  ctx.beginPath(); ctx.arc(sx, sy - 11.5, 3, Math.PI, Math.PI * 2); ctx.fill();
  // eyes
  if (c.blinkTimer < 52) {
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(sx - 1.5, sy - 9.5, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 1.5, sy - 9.5, 0.9, 0, Math.PI * 2); ctx.fill();
  }
  // Selection ring
  if (state.selectedColonist === c.id) {
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy - 2, 11, 0, Math.PI * 2);
    ctx.stroke();
  }
  // hunger bar (if below 70)
  if (c.hunger < 70) {
    const bw = 14, bh = 2, bx = sx - bw / 2, by = sy - 17;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = c.hunger < 30 ? '#e03030' : '#e09020';
    ctx.fillRect(bx, by, bw * (c.hunger / 100), bh);
  }
  // Soldier badge
  if (c.job !== null && state.buildings[c.job]?.type === 'barracks') {
    ctx.font = '8px serif';
    ctx.fillText('⚔', sx + 3, sy - 13);
  }
}

// ---- Main draw ----

function draw() {
  // Season sky
  const skies = ['#87ceeb', '#9ad8f5', '#c8804a', '#c0d8e8'];
  ctx.fillStyle = skies[state.season];
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const startC = Math.max(0, Math.floor(state.camera.x / TILE));
  const startR = Math.max(0, Math.floor(state.camera.y / TILE));
  const endC   = Math.min(COLS - 1, Math.ceil((state.camera.x + canvas.width)  / TILE));
  const endR   = Math.min(ROWS - 1, Math.ceil((state.camera.y + canvas.height) / TILE));

  // Tiles
  for (let r = startR; r <= endR; r++) {
    for (let c = startC; c <= endC; c++) {
      const tile = state.tiles[r][c];
      const sx = c * TILE - state.camera.x;
      const sy = r * TILE - state.camera.y;
      switch (tile.type) {
        case T.GRASS:  drawGrass(sx, sy, r, c); break;
        case T.FOREST: drawForest(sx, sy, r, c, tile.resource); break;
        case T.STONE:  drawStone(sx, sy, r, c, tile.resource); break;
        case T.WATER:  drawWater(sx, sy); break;
        default:
          ctx.fillStyle = '#9a7840'; ctx.fillRect(sx, sy, TILE, TILE);
      }
    }
  }

  // Buildings
  state.buildings.forEach(b => {
    const sx = b.c * TILE - state.camera.x;
    const sy = b.r * TILE - state.camera.y;
    const def = BUILDINGS[b.type];
    ctx.save();
    switch (b.type) {
      case 'house':      drawHouse(sx, sy); break;
      case 'farm':       drawFarm(sx, sy); break;
      case 'woodcutter': drawWoodcutter(sx, sy); break;
      case 'quarry':     drawQuarry(sx, sy); break;
      case 'storehouse': drawStorehouse(sx, sy); break;
      case 'wall':       drawWall(sx, sy, b.hp, def.maxHp); break;
      case 'tower':      drawTower(sx, sy, b.hp, def.maxHp); break;
      case 'barracks':   drawBarracks(sx, sy); break;
    }
    // HP bar on damaged buildings (not wall/tower — they show via colour)
    if (b.hp < def.maxHp && b.hp > 0 && b.type !== 'wall' && b.type !== 'tower') {
      const bw = def.size * TILE - 4;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(sx+2, sy+2, bw, 3);
      ctx.fillStyle = b.hp/def.maxHp > 0.5 ? '#88dd44' : b.hp/def.maxHp > 0.25 ? '#ddaa22' : '#dd3322';
      ctx.fillRect(sx+2, sy+2, bw * (b.hp/def.maxHp), 3);
    }
    // Destroyed overlay
    if (b.hp <= 0) {
      ctx.fillStyle = 'rgba(60,20,10,0.55)';
      ctx.fillRect(sx, sy, def.size*TILE, def.size*TILE);
      ctx.font = '18px serif'; ctx.fillText('🔥', sx+4, sy+22);
    }
    ctx.restore();
  });

  // Colonists
  ctx.save();
  state.colonists.forEach(drawColonist);
  ctx.restore();

  // Raiders
  ctx.save();
  state.raiders.forEach(drawRaider);
  ctx.restore();

  // Smoke particles
  ctx.save();
  state.particles.forEach(p => {
    const alpha = (p.life / p.maxLife) * 0.55;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#c0b8b0';
    const { x: sx, y: sy } = worldToScreen(p.x, p.y);
    ctx.beginPath();
    ctx.arc(sx, sy, p.size * (1 + (1 - p.life / p.maxLife) * 0.8), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.restore();

  // Construction progress bars
  state.buildings.forEach(b => {
    if (!b.constructing) return;
    const def = BUILDINGS[b.type];
    const sx = b.c * TILE - state.camera.x;
    const sy = b.r * TILE - state.camera.y;
    const bw = def.size * TILE - 4;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx + 2, sy + 2, bw, 5);
    ctx.fillStyle = '#f0c040';
    ctx.fillRect(sx + 2, sy + 2, bw * (b.progress / 120), 5);
    ctx.font = 'bold 9px Inter,sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('🔨', sx + 2, sy + def.size * TILE - 4);
  });

  // Floating text
  ctx.save();
  state.floats.forEach(f => {
    const alpha = f.life / f.maxLife;
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = f.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
    const { x: sx, y: sy } = worldToScreen(f.x, f.y);
    ctx.strokeText(f.text, sx - ctx.measureText(f.text).width/2, sy);
    ctx.fillText(f.text,   sx - ctx.measureText(f.text).width/2, sy);
  });
  ctx.globalAlpha = 1;
  ctx.restore();

  // Placement ghost
  if (state.placing) {
    const { c, r } = screenToTile(state.mouseWorld.x, state.mouseWorld.y);
    const def = BUILDINGS[state.placing];
    const sx = c * TILE - state.camera.x;
    const sy = r * TILE - state.camera.y;
    const sz = def.size * TILE;
    const ok = canPlace(r, c, state.placing);
    ctx.fillStyle = ok ? 'rgba(80,200,80,0.28)' : 'rgba(220,50,50,0.28)';
    ctx.fillRect(sx, sy, sz, sz);
    ctx.strokeStyle = ok ? '#80ff80' : '#ff8080';
    ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    ctx.strokeRect(sx, sy, sz, sz);
    ctx.setLineDash([]);
  }

  // Selected tile highlight
  if (state.selectedTile) {
    const { r, c } = state.selectedTile;
    const sx = c * TILE - state.camera.x;
    const sy = r * TILE - state.camera.y;
    ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
  }

  // Vignette
  const vg = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, canvas.height * 0.35,
    canvas.width / 2, canvas.height / 2, canvas.height * 0.85
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Minimap
  drawMinimap();
}

function drawMinimap() {
  const MM_W = 160, MM_H = 120;
  const MM_X = canvas.width  - MM_W - 10;
  const MM_Y = canvas.height - MM_H - 10;
  const tW = MM_W / COLS, tH = MM_H / ROWS;

  ctx.save();

  // Panel background
  ctx.fillStyle = 'rgba(8,16,28,0.88)';
  ctx.fillRect(MM_X - 2, MM_Y - 2, MM_W + 4, MM_H + 4);

  // Terrain
  const terrainCol = ['#3a7a2a', '#1e4010', '#606060', '#1848a8', '#9a7840'];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = state.tiles[r][c];
      ctx.fillStyle = terrainCol[tile.type] || terrainCol[0];
      ctx.fillRect(MM_X + c * tW, MM_Y + r * tH, Math.ceil(tW), Math.ceil(tH));
    }
  }

  // Buildings
  state.buildings.forEach(b => {
    if (b.hp <= 0) return;
    const def = BUILDINGS[b.type];
    ctx.fillStyle = def.isBarrier ? '#8090b8' : '#d4a030';
    ctx.fillRect(MM_X + b.c * tW, MM_Y + b.r * tH,
                 Math.ceil(tW * def.size) + 1, Math.ceil(tH * def.size) + 1);
  });

  // Colonists (green)
  ctx.fillStyle = '#44ee44';
  state.colonists.forEach(c => {
    ctx.beginPath();
    ctx.arc(MM_X + (c.x / TILE) * tW, MM_Y + (c.y / TILE) * tH, 1.8, 0, Math.PI * 2);
    ctx.fill();
  });

  // Raiders (red)
  ctx.fillStyle = '#ee3333';
  state.raiders.forEach(r => {
    ctx.beginPath();
    ctx.arc(MM_X + (r.x / TILE) * tW, MM_Y + (r.y / TILE) * tH, 1.8, 0, Math.PI * 2);
    ctx.fill();
  });

  // Camera viewport rectangle
  const vpX = MM_X + (state.camera.x / (COLS * TILE)) * MM_W;
  const vpY = MM_Y + (state.camera.y / (ROWS * TILE)) * MM_H;
  const vpW = (canvas.width  / (COLS * TILE)) * MM_W;
  const vpH = (canvas.height / (ROWS * TILE)) * MM_H;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1;
  ctx.strokeRect(vpX, vpY, vpW, vpH);

  // Border
  ctx.strokeStyle = '#2a4a6a';
  ctx.lineWidth = 2;
  ctx.strokeRect(MM_X - 2, MM_Y - 2, MM_W + 4, MM_H + 4);

  ctx.restore();
}

// ============================================================
// UI helpers
// ============================================================
function updateResourceUI() {
  document.getElementById('res-wood').textContent  = Math.floor(state.resources.wood);
  document.getElementById('res-stone').textContent = Math.floor(state.resources.stone);
  document.getElementById('res-food').textContent  = Math.floor(state.resources.food);
  document.getElementById('res-pop').textContent   = state.population;
  document.getElementById('res-housing').textContent = state.housing;
  const raidEl = document.getElementById('raid-alert');
  if (raidEl) raidEl.classList.toggle('active', state.raiders.length > 0);
}

const logLines = [];
function log(msg) {
  logLines.unshift(`Day ${state.day}: ${msg}`);
  if (logLines.length > 40) logLines.pop();
  const el = document.getElementById('log-content');
  el.innerHTML = logLines.map(l => `<div>${l}</div>`).join('');
}

function showTileInfo(r, c) {
  const tile = state.tiles[r]?.[c];
  if (!tile) return;
  let html = `Tile (${c}, ${r})<br>`;
  html += `Terrain: ${['Grass','Forest','Stone','Water','Dirt'][tile.type]}<br>`;
  if (tile.resource > 0) html += `Resources: ${tile.resource}<br>`;
  if (tile.building !== null) {
    const b = state.buildings[tile.building];
    const def = BUILDINGS[b.type];
    html += `<br><b>${def.name}</b><br>`;
    html += `HP: ${b.hp}/${def.maxHp}<br>`;
    if (b.workers !== undefined && b.type !== 'wall' && b.type !== 'tower') html += `Workers: ${b.workers}<br>`;
    if (def.produces) html += `Produces: ${def.produces}<br>`;
    if (def.housing)  html += `Housing: ${def.housing}<br>`;
  }
  document.getElementById('info-content').innerHTML = html;
}

// ============================================================
// Save / Load
// ============================================================
const SAVE_KEY = 'colony_builder_save';

function saveGame() {
  const save = {
    resources: state.resources,
    population: state.population,
    housing: state.housing,
    day: state.day,
    tick: state.tick,
    seasonTick: state.seasonTick,
    season: state.season,
    tiles: state.tiles,
    buildings: state.buildings,
    colonists: state.colonists,
    nextRaidIn: state.nextRaidIn,
    usedNames: state.usedNames,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  log('💾 Game saved');
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { log('No save found'); return; }
  try {
    const save = JSON.parse(raw);
    Object.assign(state, save);
    state.raiders = [];
    state.floats = [];
    state.particles = [];
    state.placing = null;
    state.selectedTile = null;
    state.dragging = false;
    // Re-center camera
    const cr = Math.floor(ROWS / 2), cc = Math.floor(COLS / 2);
    state.camera.x = cc * TILE - canvas.width / 2;
    state.camera.y = cr * TILE - canvas.height / 2;
    clampCamera();
    updateResourceUI();
    document.getElementById('day-label').textContent = `Day ${state.day}`;
    document.getElementById('season-label').textContent = SEASON_NAMES[state.season];
    document.getElementById('season-label').style.color = SEASON_COLORS[state.season];
    log('📂 Game loaded');
  } catch (e) {
    log('Failed to load save');
  }
}

// ============================================================
// Input
// ============================================================
function initInput() {
  canvas.addEventListener('mousedown', e => {
    if (e.button === 2) { // right click = cancel placement
      setPlacing(null);
      return;
    }

    // Minimap click — jump camera
    const MM_W = 160, MM_H = 120;
    const MM_X = canvas.width  - MM_W - 10;
    const MM_Y = canvas.height - MM_H - 10;
    if (e.offsetX >= MM_X && e.offsetX <= MM_X + MM_W &&
        e.offsetY >= MM_Y && e.offsetY <= MM_Y + MM_H) {
      const wx = ((e.offsetX - MM_X) / MM_W) * COLS * TILE;
      const wy = ((e.offsetY - MM_Y) / MM_H) * ROWS * TILE;
      state.camera.x = wx - canvas.width  / 2;
      state.camera.y = wy - canvas.height / 2;
      clampCamera();
      return;
    }

    if (state.placing) {
      const { c, r } = screenToTile(e.offsetX, e.offsetY);
      placeBuilding(r, c, state.placing);
      // Keep placing mode for repeated builds unless right-click
      return;
    }
    state.dragging = true;
    state.dragStart = { x: e.clientX + state.camera.x, y: e.clientY + state.camera.y };
  });

  canvas.addEventListener('mousemove', e => {
    state.mouseWorld.x = e.offsetX;
    state.mouseWorld.y = e.offsetY;
    if (state.dragging && !state.placing) {
      state.camera.x = state.dragStart.x - e.clientX;
      state.camera.y = state.dragStart.y - e.clientY;
      clampCamera();
    }
  });

  canvas.addEventListener('mouseup', e => {
    if (state.dragging && !state.placing) {
      const dx = Math.abs(e.clientX + state.camera.x - state.dragStart.x);
      const dy = Math.abs(e.clientY + state.camera.y - state.dragStart.y);
      if (dx < 3 && dy < 3) {
        const wx = e.offsetX + state.camera.x;
        const wy = e.offsetY + state.camera.y;

        // 1. Did we click on a colonist?
        const hitColonist = state.colonists.find(c => {
          const cdx = c.x - wx, cdy = c.y - wy;
          return Math.sqrt(cdx * cdx + cdy * cdy) < 12;
        });
        if (hitColonist) {
          state.selectedColonist = hitColonist.id;
          state.selectedTile = null;
          showColonistInfo(hitColonist);
          state.dragging = false;
          return;
        }

        // 2. Colonist selected — use click as assignment target
        if (state.selectedColonist !== null) {
          const { c, r } = screenToTile(e.offsetX, e.offsetY);
          const tile = state.tiles[r]?.[c];
          if (tile && tile.building !== null) {
            const b = state.buildings[tile.building];
            if (ASSIGNABLE.has(b.type) && b.hp > 0) {
              if (b.workers >= MAX_WORKERS) {
                log(`${BUILDINGS[b.type].name} already has max workers`);
              } else {
                assignColonistToBuilding(state.selectedColonist, b.id);
              }
            } else {
              // Clicked non-assignable building — just select the tile
              state.selectedTile = { r, c };
              showTileInfo(r, c);
            }
          } else {
            // Clicked open ground — unassign
            assignColonistToBuilding(state.selectedColonist, null);
            state.selectedTile = { r, c };
            showTileInfo(r, c);
          }
          state.selectedColonist = null;
          state.dragging = false;
          return;
        }

        // 3. Default: tile selection
        const { c, r } = screenToTile(e.offsetX, e.offsetY);
        state.selectedTile = { r, c };
        showTileInfo(r, c);
      }
    }
    state.dragging = false;
  });

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Keyboard shortcuts
  window.addEventListener('keydown', e => {
    if (e.key === 's' || e.key === 'S') saveGame();
    if (e.key === 'l' || e.key === 'L') loadGame();
    if (e.key === 'Escape') { setPlacing(null); state.selectedColonist = null; }
  });

  // Save/load buttons
  document.getElementById('btn-save')?.addEventListener('click', saveGame);
  document.getElementById('btn-load')?.addEventListener('click', loadGame);

  canvas.addEventListener('wheel', e => {
    // Scroll camera
    state.camera.x += e.deltaX * 0.5;
    state.camera.y += e.deltaY * 0.5;
    clampCamera();
  });

  // Build buttons
  document.querySelectorAll('.build-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      setPlacing(type === 'none' ? null : type);
    });
  });
}

function setPlacing(type) {
  state.placing = type;
  canvas.className = type ? 'placing' : '';
  document.querySelectorAll('.build-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
}

function clampCamera() {
  const maxX = COLS * TILE - canvas.width;
  const maxY = ROWS * TILE - canvas.height;
  state.camera.x = Math.max(0, Math.min(maxX, state.camera.x));
  state.camera.y = Math.max(0, Math.min(maxY, state.camera.y));
}

// ============================================================
// Boot
// ============================================================
function init() {
  resizeCanvas();
  window.addEventListener('resize', () => { resizeCanvas(); clampCamera(); });

  generateMap();

  // Center camera on spawn
  const cr = Math.floor(ROWS / 2), cc = Math.floor(COLS / 2);
  state.camera.x = cc * TILE - canvas.width  / 2;
  state.camera.y = cr * TILE - canvas.height / 2;
  clampCamera();

  // Spawn initial colonists
  for (let i = 0; i < 3; i++) spawnColonist();
  state.housing = 0; // houses not built yet; colonists are pioneers
  state.population = 3;
  updateResourceUI();
  log('Your colony begins. Build houses to grow your population.');
  log('Tip: Right-click or Cancel to exit build mode.');

  initInput();

  // Game loop
  let last = 0;
  function loop(ts) {
    const dt = ts - last;
    last = ts;
    tick();
    draw();
    if (ts % 3000 < dt + 16) updateResourceUI(); // UI update ~every 3s
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

init();
