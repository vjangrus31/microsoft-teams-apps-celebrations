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
}

// ============================================================
// Rendering
// ============================================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const TILE_COLORS = {
  [T.GRASS]:  '#4a7c3f',
  [T.FOREST]: '#2d5a1b',
  [T.STONE]:  '#787878',
  [T.WATER]:  '#2255aa',
  [T.DIRT]:   '#8B6914',
};

function resizeCanvas() {
  const area = document.getElementById('game-area');
  canvas.width  = area.clientWidth;
  canvas.height = area.clientHeight;
}

function worldToScreen(wx, wy) {
  return { x: wx - state.camera.x, y: wy - state.camera.y };
}

function screenToWorld(sx, sy) {
  return { x: sx + state.camera.x, y: sy + state.camera.y };
}

function screenToTile(sx, sy) {
  const { x, y } = screenToWorld(sx, sy);
  return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const startC = Math.max(0, Math.floor(state.camera.x / TILE));
  const startR = Math.max(0, Math.floor(state.camera.y / TILE));
  const endC   = Math.min(COLS - 1, Math.ceil((state.camera.x + canvas.width)  / TILE));
  const endR   = Math.min(ROWS - 1, Math.ceil((state.camera.y + canvas.height) / TILE));

  // Draw tiles
  for (let r = startR; r <= endR; r++) {
    for (let c = startC; c <= endC; c++) {
      const tile = state.tiles[r][c];
      const sx = c * TILE - state.camera.x;
      const sy = r * TILE - state.camera.y;
      ctx.fillStyle = TILE_COLORS[tile.type];
      ctx.fillRect(sx, sy, TILE, TILE);

      // Grid lines
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.strokeRect(sx, sy, TILE, TILE);

      // Tree/rock icons on tiles
      if (tile.type === T.FOREST && tile.resource > 0) {
        ctx.font = '20px serif';
        ctx.fillText('🌲', sx + 8, sy + 26);
      } else if (tile.type === T.STONE && tile.resource > 0) {
        ctx.font = '18px serif';
        ctx.fillText('🪨', sx + 10, sy + 26);
      }
    }
  }

  // Draw buildings
  state.buildings.forEach(b => {
    const def = BUILDINGS[b.type];
    const sx = b.c * TILE - state.camera.x;
    const sy = b.r * TILE - state.camera.y;
    const sz = def.size * TILE;

    ctx.fillStyle = def.color;
    ctx.fillRect(sx + 2, sy + 2, sz - 4, sz - 4);
    ctx.strokeStyle = '#fff4';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 2, sy + 2, sz - 4, sz - 4);

    ctx.font = `${def.size === 2 ? 28 : 20}px serif`;
    ctx.fillText(def.icon, sx + sz / 2 - (def.size === 2 ? 14 : 10), sy + sz / 2 + (def.size === 2 ? 10 : 7));
  });

  // Draw colonists
  state.colonists.forEach(c => {
    const { x: sx, y: sy } = worldToScreen(c.x, c.y);
    // Body
    ctx.fillStyle = c.hunger < 30 ? '#ff4444' : c.color;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Eyes blink
    if (c.blinkTimer < 55) {
      ctx.fillStyle = '#000';
      ctx.fillRect(sx - 2, sy - 2, 2, 2);
      ctx.fillRect(sx + 1, sy - 2, 2, 2);
    }
  });

  // Placement ghost
  if (state.placing) {
    const { c, r } = screenToTile(state.mouseWorld.x, state.mouseWorld.y);
    const def = BUILDINGS[state.placing];
    const sx = c * TILE - state.camera.x;
    const sy = r * TILE - state.camera.y;
    const sz = def.size * TILE;
    const ok = canPlace(r, c, state.placing);
    ctx.fillStyle = ok ? 'rgba(80,200,80,0.35)' : 'rgba(220,50,50,0.35)';
    ctx.fillRect(sx, sy, sz, sz);
    ctx.strokeStyle = ok ? '#80ff80' : '#ff8080';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sz, sz);
    ctx.font = `${def.size === 2 ? 28 : 20}px serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(def.icon, sx + sz / 2 - (def.size === 2 ? 14 : 10), sy + sz / 2 + (def.size === 2 ? 10 : 7));
  }

  // Selected tile highlight
  if (state.selectedTile) {
    const { r, c } = state.selectedTile;
    const sx = c * TILE - state.camera.x;
    const sy = r * TILE - state.camera.y;
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
  }
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
