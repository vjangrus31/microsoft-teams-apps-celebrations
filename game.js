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
  house:       { name: 'House',       icon: '🏠', color: '#8B6914', cost: { wood: 5, stone: 3 }, housing: 3, size: 1 },
  farm:        { name: 'Farm',        icon: '🌾', color: '#5a8a20', cost: { wood: 4 },           produces: 'food',  rate: 0.05, size: 2 },
  woodcutter:  { name: 'Woodcutter',  icon: '🪓', color: '#6B4226', cost: { wood: 3 },           produces: 'wood',  rate: 0.04, size: 1 },
  quarry:      { name: 'Quarry',      icon: '⛏',  color: '#707070', cost: { wood: 5 },           produces: 'stone', rate: 0.03, size: 1 },
  storehouse:  { name: 'Storehouse',  icon: '📦', color: '#8B7355', cost: { wood: 6, stone: 4 }, storage: 200,      size: 1 },
};

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
  tick: 0,           // ticks per day = 200
  seasonTick: 0,     // season = 5 days
  season: 0,         // 0-3
  tiles: [],
  buildings: [],
  colonists: [],
  placing: null,     // building type being placed
  selectedTile: null,
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
function spawnColonist() {
  const cr = Math.floor(ROWS / 2), cc = Math.floor(COLS / 2);
  state.colonists.push({
    id: state.colonists.length,
    x: cc * TILE + TILE / 2 + (Math.random() - 0.5) * 40,
    y: cr * TILE + TILE / 2 + (Math.random() - 0.5) * 40,
    tx: null, ty: null,
    job: null,  // building id
    hunger: 100,
    state: 'idle',
    color: `hsl(${Math.floor(Math.random() * 360)},60%,70%)`,
    blinkTimer: 0,
  });
  state.population++;
  updateResourceUI();
}

function assignJobs() {
  // Assign unassigned colonists to un-staffed production buildings
  const unassigned = state.colonists.filter(c => c.job === null);
  const needsWorker = state.buildings.filter(b => b.type !== 'house' && b.type !== 'storehouse' && b.workers < 2);
  unassigned.forEach(c => {
    const b = needsWorker.find(b => b.workers < 2);
    if (b) { c.job = b.id; b.workers++; log(`Colonist assigned to ${BUILDINGS[b.type].name}`); }
  });
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
  const b = { id, type, r, c, workers: 0, progress: 0, active: true };
  state.buildings.push(b);

  // Mark tiles
  const sz = def.size;
  for (let dr = 0; dr < sz; dr++)
    for (let dc = 0; dc < sz; dc++)
      state.tiles[r + dr][c + dc].building = id;

  if (type === 'house') {
    state.housing += def.housing;
    // Spawn new colonists up to housing limit, if food allows
    const toSpawn = Math.min(def.housing, Math.floor(state.resources.food / 5));
    for (let i = 0; i < toSpawn; i++) {
      if (state.population < state.housing) spawnColonist();
    }
    assignJobs();
  }
  log(`Built ${def.name}`);
  updateResourceUI();
  return true;
}

// ============================================================
// Tick / simulation
// ============================================================
const TICKS_PER_DAY = 200;
const DAYS_PER_SEASON = 5;

function tick() {
  state.tick++;
  const t = state.tick;

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
  });

  // Hunger / food consumption
  if (t % 20 === 0) {
    state.colonists.forEach(c => {
      c.hunger -= 2;
      if (c.hunger <= 0) {
        c.hunger = 0;
        // Try to eat from storehouse
        if (state.resources.food >= 1) {
          state.resources.food -= 1;
          c.hunger = Math.min(100, c.hunger + 30);
        }
      }
    });
  }

  // Move colonists towards their job building
  state.colonists.forEach(c => {
    if (c.job === null) {
      // Wander
      if (!c.tx || Math.abs(c.x - c.tx) < 2 && Math.abs(c.y - c.ty) < 2) {
        const cr2 = Math.floor(ROWS / 2), cc2 = Math.floor(COLS / 2);
        c.tx = (cc2 + (Math.random() - 0.5) * 8) * TILE;
        c.ty = (cr2 + (Math.random() - 0.5) * 6) * TILE;
      }
    } else {
      const b = state.buildings[c.job];
      if (b) {
        c.tx = (b.c + 0.5) * TILE;
        c.ty = (b.r + 0.5) * TILE;
      }
    }
    if (c.tx !== null) {
      const dx = c.tx - c.x, dy = c.ty - c.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 2) {
        const speed = 0.8;
        c.x += (dx / dist) * speed;
        c.y += (dy / dist) * speed;
      }
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

function drawGrass(sx, sy) {
  const g = ctx.createLinearGradient(sx, sy, sx + TILE, sy + TILE);
  g.addColorStop(0, '#5aaa48');
  g.addColorStop(1, '#488838');
  ctx.fillStyle = g;
  ctx.fillRect(sx, sy, TILE, TILE);
  // subtle edge shadow
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
  g.addColorStop(0, '#2c561a');
  g.addColorStop(1, '#1e3e10');
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
  // hunger bar (if below 70)
  if (c.hunger < 70) {
    const bw = 14, bh = 2, bx = sx - bw / 2, by = sy - 17;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = c.hunger < 30 ? '#e03030' : '#e09020';
    ctx.fillRect(bx, by, bw * (c.hunger / 100), bh);
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
        case T.GRASS:  drawGrass(sx, sy); break;
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
    ctx.save();
    switch (b.type) {
      case 'house':      drawHouse(sx, sy); break;
      case 'farm':       drawFarm(sx, sy); break;
      case 'woodcutter': drawWoodcutter(sx, sy); break;
      case 'quarry':     drawQuarry(sx, sy); break;
      case 'storehouse': drawStorehouse(sx, sy); break;
    }
    ctx.restore();
  });

  // Colonists
  ctx.save();
  state.colonists.forEach(drawColonist);
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
    html += `Workers: ${b.workers}<br>`;
    if (def.produces) html += `Produces: ${def.produces}<br>`;
    if (def.housing)  html += `Housing: ${def.housing}<br>`;
  }
  document.getElementById('info-content').innerHTML = html;
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
      // If barely moved, treat as click for selection
      const dx = Math.abs(e.clientX + state.camera.x - state.dragStart.x);
      const dy = Math.abs(e.clientY + state.camera.y - state.dragStart.y);
      if (dx < 3 && dy < 3) {
        const { c, r } = screenToTile(e.offsetX, e.offsetY);
        state.selectedTile = { r, c };
        showTileInfo(r, c);
      }
    }
    state.dragging = false;
  });

  canvas.addEventListener('contextmenu', e => e.preventDefault());

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
