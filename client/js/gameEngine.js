/**
 * GameEngine — runs entirely in the browser.
 * Manages world physics, mob AI, crafting, eating, fishing, and LLM-driven player decisions.
 * Emits all events via plain callbacks (no Socket.io).
 */
import { BLOCKS, BLOCK_NAMES, CHUNK_HEIGHT } from './world.js';
import { callLLM } from './aiClient.js';

const TICK_RATE  = 10;                         // ticks/sec (lighter than server's 20)
const DAY_TICKS  = TICK_RATE * 60 * 20;        // 20-minute in-game days
const AI_INTERVAL_MS = 15000;                  // min ms between real LLM calls (saves credits)
const DEMO_INTERVAL_MS = 2000;                 // faster tick for demo (rule-based, free)

const HOSTILE = ['zombie', 'skeleton', 'creeper'];
const PASSIVE = ['cow', 'pig', 'sheep'];

const FOOD_VALUES = {
  apple: 4, bread: 5, cooked_fish: 5, raw_fish: 2,
  cooked_porkchop: 8, raw_porkchop: 3, rotten_flesh: 2,
};

const RECIPES = {
  planks:           { need: [{ item:'wood_log',    n:1 }],                                  out:{ item:'planks',         n:4 } },
  sticks:           { need: [{ item:'planks',      n:2 }],                                  out:{ item:'sticks',         n:4 } },
  crafting_table:   { need: [{ item:'planks',      n:4 }],                                  out:{ item:'crafting_table', n:1 } },
  torch:            { need: [{ item:'coal',n:1 },{ item:'sticks',n:1 }],                    out:{ item:'torch',          n:4 } },
  bread:            { need: [{ item:'wheat',       n:3 }],                                  out:{ item:'bread',          n:1 } },
  wooden_pickaxe:   { need: [{ item:'planks',n:3 },{ item:'sticks',n:2 }],                  out:{ item:'wooden_pickaxe', n:1 }, table:true },
  stone_pickaxe:    { need: [{ item:'cobblestone',n:3 },{ item:'sticks',n:2 }],             out:{ item:'stone_pickaxe',  n:1 }, table:true },
  iron_pickaxe:     { need: [{ item:'iron_ingot',n:3 },{ item:'sticks',n:2 }],             out:{ item:'iron_pickaxe',   n:1 }, table:true },
  wooden_sword:     { need: [{ item:'planks',n:2 },{ item:'sticks',n:1 }],                  out:{ item:'wooden_sword',   n:1 }, table:true },
  stone_sword:      { need: [{ item:'cobblestone',n:2 },{ item:'sticks',n:1 }],             out:{ item:'stone_sword',    n:1 }, table:true },
  iron_ingot:       { need: [{ item:'iron_ore',n:1 },{ item:'coal',n:1 }],                  out:{ item:'iron_ingot',     n:1 } },
};

const DROPS = {
  [BLOCKS.GRASS]:        () => [{ item:'dirt',        n:1 }],
  [BLOCKS.DIRT]:         () => [{ item:'dirt',        n:1 }],
  [BLOCKS.STONE]:        () => [{ item:'cobblestone', n:1 }],
  [BLOCKS.WOOD_LOG]:     () => [{ item:'wood_log',    n:1 }],
  [BLOCKS.LEAVES]:       () => Math.random() > 0.8 ? [{ item:'apple', n:1 }] : [],
  [BLOCKS.SAND]:         () => [{ item:'sand',        n:1 }],
  [BLOCKS.GRAVEL]:       () => Math.random() > 0.7 ? [{ item:'flint',n:1 }] : [{ item:'gravel',n:1 }],
  [BLOCKS.COAL_ORE]:     () => [{ item:'coal',        n:1 }],
  [BLOCKS.IRON_ORE]:     () => [{ item:'iron_ore',    n:1 }],
  [BLOCKS.GOLD_ORE]:     () => [{ item:'gold_ore',    n:1 }],
  [BLOCKS.DIAMOND_ORE]:  () => [{ item:'diamond',     n:1 }],
  [BLOCKS.COBBLESTONE]:  () => [{ item:'cobblestone', n:1 }],
};

const MOB_DROPS = {
  zombie:   () => [{ item:'rotten_flesh', n:1 }],
  skeleton: () => [{ item:'bone', n:1 }, ...(Math.random()>0.5?[{item:'arrow',n:Math.ceil(Math.random()*3)}]:[])],
  creeper:  () => [{ item:'gunpowder', n:1 }],
  cow:      () => [{ item:'raw_porkchop', n:1+Math.floor(Math.random()*2) }, { item:'leather', n:1 }],
  pig:      () => [{ item:'raw_porkchop', n:1+Math.floor(Math.random()*3) }],
  sheep:    () => [{ item:'wool', n:2+Math.floor(Math.random()*2) }],
};

// ── System prompt the LLM receives every decision ────────────────────────────
const SYSTEM_PROMPT = `You are an AI playing a voxel survival game called NeuroCraft (like Minecraft).

WORLD:
- 3D block grid. You stand at (x, y, z). +Y is up. Blocks surround you.
- Mine blocks to collect resources. Place blocks to build. Craft tools.
- Hunger decreases over time — eat food to stay alive.
- Hostile mobs (zombie/skeleton/creeper) appear at night and attack you.
- Passive mobs (cow/pig/sheep) drop food when killed.

PROGRESSION (do these in order):
1. Find/chop WOOD_LOG → craft PLANKS → craft CRAFTING_TABLE + STICKS
2. Craft WOODEN_PICKAXE → mine STONE → craft STONE_PICKAXE + STONE_SWORD
3. Find COAL_ORE → mine it → smelt IRON_ORE → craft IRON_PICKAXE
4. Hunt for DIAMOND_ORE (deep underground, y < 8)
5. Build a shelter before night!

CRAFTING RECIPES you must memorize:
- planks: wood_log×1 → 4 planks
- sticks: planks×2 → 4 sticks
- crafting_table: planks×4
- wooden_pickaxe: planks×3 + sticks×2  [needs crafting_table]
- stone_pickaxe: cobblestone×3 + sticks×2  [needs crafting_table]
- wooden_sword: planks×2 + sticks×1  [needs crafting_table]
- iron_ingot: iron_ore×1 + coal×1
- bread: wheat×3

RESPOND ONLY with a single JSON object — no markdown, no extra text:
{
  "thought": "1-2 sentence reasoning",
  "action":  "move|mine|place|craft|eat|fish|attack|chat|idle",
  "params":  { ...parameters }
}

PARAMETER SCHEMAS:
- move:   { "direction": "north|south|east|west|up|down", "steps": 1-4 }
- mine:   { "dx": -2..2, "dy": -2..2, "dz": -2..2 }
- place:  { "block": "block_name", "dx": -1..1, "dy": -1..1, "dz": -1..1 }
- craft:  { "recipe": "recipe_name" }
- eat:    { "item": "food_item_name" }
- fish:   {}
- attack: { "target": "mob_type" }
- chat:   { "message": "text up to 120 chars" }
- idle:   { "reason": "why" }`;

let _mobSeq = 0;

export class GameEngine {
  /**
   * @param {Object} callbacks
   *   onBlockChange(x, y, z, type)
   *   onPlayerAction({ playerId, playerName, action, thought, result })
   *   onGameState({ tick, dayTick, dayLength, isNight, players[] })
   *   onMobPositions(mobs[])
   *   onChat({ from, message })
   *   onSaveState(playerStates[])
   */
  constructor(callbacks = {}) {
    this.world   = null;
    this.players = new Map();        // id → player state
    this._aiCfg  = new Map();        // id → { apiKey, model, baseUrl, personality, history, isThinking, lastCall }
    this.mobs    = [];
    this.tick    = 0;
    this.dayTick = 0;
    this._tid    = null;

    this.onBlockChange  = callbacks.onBlockChange  || (() => {});
    this.onPlayerAction = callbacks.onPlayerAction || (() => {});
    this.onGameState    = callbacks.onGameState    || (() => {});
    this.onMobPositions = callbacks.onMobPositions || (() => {});
    this.onChat         = callbacks.onChat         || (() => {});
    this.onSaveState    = callbacks.onSaveState    || (() => {});
  }

  init(world) { this.world = world; return this; }

  start() {
    if (this._tid) return;
    this._spawnInitialMobs();
    this._tid = setInterval(() => this._tick(), 1000 / TICK_RATE);
    return this;
  }

  stop() { clearInterval(this._tid); this._tid = null; }

  // ── Game tick ──────────────────────────────────────────────────────────────
  _tick() {
    this.tick++;
    this.dayTick = (this.dayTick + 1) % DAY_TICKS;

    // Hunger / health regen every 30 s
    if (this.tick % (TICK_RATE * 30) === 0) {
      for (const p of this.players.values()) {
        p.hunger = Math.max(0, p.hunger - 0.5);
        if (p.hunger === 0) p.health = Math.max(0, p.health - 0.5);
        if (p.hunger >= 18) p.health = Math.min(20, p.health + 0.5);
      }
    }

    // Mob movement every 15 ticks (1.5 s)
    if (this.tick % 15 === 0) this._updateMobs();

    // AI decisions — check every second, interval inside controls actual rate
    if (this.tick % TICK_RATE === 0) this._triggerAI();

    // Broadcast HUD state every 5 ticks
    if (this.tick % 5 === 0) this._broadcastState();

    // Emit mob positions every second
    if (this.tick % TICK_RATE === 0) {
      this.onMobPositions(this.mobs.map(m => ({ id:m.id, type:m.type, x:m.x, y:m.y, z:m.z })));
    }

    // Persist player stats every 60 s
    if (this.tick % (TICK_RATE * 60) === 0) {
      this.onSaveState(Array.from(this.players.values()));
    }
  }

  // ── AI decision loop ───────────────────────────────────────────────────────
  _triggerAI() {
    const now = Date.now();
    for (const [id, cfg] of this._aiCfg) {
      const p = this.players.get(id);
      if (!p || cfg.isThinking) continue;
      const interval = cfg.isDemo ? DEMO_INTERVAL_MS : AI_INTERVAL_MS;
      if (now - (cfg.lastCall || 0) < interval) continue;
      cfg.isThinking = true;
      this._runAI(id, p, cfg).finally(() => { cfg.isThinking = false; cfg.lastCall = Date.now(); });
    }
  }

  async _runAI(id, player, cfg) {
    try {
      const ctx = this.world.getAIContext(Math.floor(player.x), Math.floor(player.y), Math.floor(player.z));
      player.nearbyMobs = this.mobs
        .filter(m => Math.hypot(m.x - player.x, m.z - player.z) < 20)
        .map(m => ({ type:m.type, dx:+(m.x-player.x).toFixed(1), dy:+(m.y-player.y).toFixed(1), dz:+(m.z-player.z).toFixed(1) }));

      let action;
      if (cfg.isDemo) {
        // Rule-based bot — zero API calls, no credits used
        action = this._localAIDecide(player, ctx);
      } else {
        const stateText = this._buildStateText(player, ctx);
        const messages  = [
          { role:'system', content:`${SYSTEM_PROMPT}\n\nYour name: ${player.name}\nYour personality: ${cfg.personality}` },
          ...cfg.history,
          { role:'user', content: stateText },
        ];
        const raw = await callLLM({ apiKey:cfg.apiKey, baseUrl:cfg.baseUrl, model:cfg.model, messages });
        try {
          const clean = raw.replace(/^```(?:json)?\n?/,'').replace(/\n?```$/,'').trim();
          action = JSON.parse(clean);
        } catch {
          const m = raw.match(/\{[\s\S]*?\}/);
          try { action = m ? JSON.parse(m[0]) : null; } catch { action = null; }
        }
        if (!action) action = { thought:'Confused — resting', action:'idle', params:{ reason:'parse error' } };
        cfg.history.push({ role:'user', content:stateText });
        cfg.history.push({ role:'assistant', content:JSON.stringify(action) });
        if (cfg.history.length > 16) cfg.history = cfg.history.slice(-16);
      }

      this._execute(id, action);
    } catch (err) {
      console.warn(`[AI:${player.name}]`, err.message);
    }
  }

  _localAIDecide(player, ctx) {
    const inv  = player.inventory || [];
    const has  = (name, n = 1) => (inv.find(i => i.item === name)?.n || 0) >= n;
    const near = ctx.blocks.filter(b => Math.abs(b.dx) + Math.abs(b.dy) + Math.abs(b.dz) <= 3);
    const findBlock = (...types) => near.find(b => types.map(t=>t.toUpperCase()).includes((b.type||'').toUpperCase()));
    const hostile = (player.nearbyMobs || []).find(m => ['zombie','skeleton','creeper'].includes(m.type) && Math.hypot(m.dx, m.dz) < 5);
    const DIRS = ['north','south','east','west'];
    const rdir = () => DIRS[Math.floor(Math.random() * 4)];

    // 1. Fight or flee hostile
    if (hostile) {
      if (has('wooden_sword') || has('stone_sword') || has('iron_sword'))
        return { thought:`Fighting ${hostile.type}!`, action:'attack', params:{ target:hostile.type } };
      return { thought:`Fleeing ${hostile.type}!`, action:'move', params:{ direction:rdir(), steps:3 } };
    }

    // 2. Eat if hungry
    if (player.hunger < 14) {
      const food = ['bread','apple','cooked_fish','raw_fish','cooked_porkchop','raw_porkchop'].find(f => has(f));
      if (food) return { thought:`Hungry, eating ${food}`, action:'eat', params:{ item:food } };
    }

    // 3. Craft progression
    const wood   = inv.find(i=>i.item==='wood_log')?.n     || 0;
    const planks = inv.find(i=>i.item==='planks')?.n       || 0;
    const sticks = inv.find(i=>i.item==='sticks')?.n       || 0;
    const cobble = inv.find(i=>i.item==='cobblestone')?.n  || 0;

    if (wood   >= 1 && planks < 4)   return { thought:'Crafting planks', action:'craft', params:{ recipe:'planks' } };
    if (planks >= 2 && sticks < 4)   return { thought:'Crafting sticks', action:'craft', params:{ recipe:'sticks' } };
    if (!has('crafting_table') && planks >= 4) return { thought:'Making crafting table', action:'craft', params:{ recipe:'crafting_table' } };
    if (has('crafting_table') && planks >= 3 && sticks >= 2 && !has('wooden_pickaxe') && !has('stone_pickaxe'))
      return { thought:'Crafting wooden pickaxe', action:'craft', params:{ recipe:'wooden_pickaxe' } };
    if (has('crafting_table') && cobble >= 3 && sticks >= 2 && !has('stone_pickaxe'))
      return { thought:'Upgrading to stone pick', action:'craft', params:{ recipe:'stone_pickaxe' } };
    if (has('crafting_table') && planks >= 2 && sticks >= 1 && !has('wooden_sword') && !has('stone_sword'))
      return { thought:'Crafting a sword', action:'craft', params:{ recipe:'wooden_sword' } };

    // 4. Mine priority blocks nearby (not GRASS — too abundant, unhelpful)
    for (const type of ['DIAMOND_ORE','GOLD_ORE','IRON_ORE','COAL_ORE','WOOD_LOG','COBBLESTONE','STONE']) {
      const b = findBlock(type);
      if (b) return { thought:`Mining ${type}`, action:'mine', params:{ dx:b.dx, dy:b.dy, dz:b.dz } };
    }

    // 5. Explore
    return { thought:'Exploring the world', action:'move', params:{ direction:rdir(), steps:2 } };
  }

  _buildStateText(p, ctx) {
    const inv      = p.inventory?.length
      ? p.inventory.map(i => `${i.item}×${i.n}`).join(', ') : 'empty';
    const nearby   = ctx.blocks
      .filter(b => Math.abs(b.dx)+Math.abs(b.dz)+Math.abs(b.dy) <= 5)
      .slice(0, 50)
      .map(b => `${b.type}@[${b.dx},${b.dy},${b.dz}]`).join('; ');
    const mobs     = (p.nearbyMobs || [])
      .map(m => `${m.type}(${m.dx},${m.dy},${m.dz})`).join(', ') || 'none';
    return [
      `=== NeuroCraft State ===`,
      `Pos: (${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)})`,
      `Health: ${p.health.toFixed(1)}/20  Hunger: ${p.hunger.toFixed(1)}/20`,
      `Inventory: ${inv}`,
      `Nearby blocks: ${nearby || 'none'}`,
      `Nearby mobs: ${mobs}`,
      `Last result: ${p.lastActionResult || 'n/a'}`,
      `What do you do?`,
    ].join('\n');
  }

  // ── Action execution ───────────────────────────────────────────────────────
  _execute(playerId, data) {
    const p = this.players.get(playerId);
    if (!p) return;
    const { thought, action, params } = data;
    p.lastThought = thought || '';
    let result = '';
    switch (action) {
      case 'move':    result = this._move(p, params);    break;
      case 'mine':    result = this._mine(p, params);    break;
      case 'place':   result = this._place(p, params);   break;
      case 'craft':   result = this._craft(p, params);   break;
      case 'eat':     result = this._eat(p, params);     break;
      case 'fish':    result = this._fish(p);             break;
      case 'attack':  result = this._attack(p, params);  break;
      case 'chat':    result = this._chat(p, params);    break;
      default:        result = `idle: ${params?.reason || '…'}`;
    }
    p.lastAction       = action;
    p.lastActionResult = result;
    this.onPlayerAction({ playerId, playerName:p.name, action, thought, result,
      position: { x:+p.x.toFixed(1), y:+p.y.toFixed(1), z:+p.z.toFixed(1) } });
  }

  _move(p, params) {
    const steps = Math.max(1, Math.min(4, params?.steps || 1));
    const DIRS  = { north:[0,0,-1], south:[0,0,1], east:[1,0,0], west:[-1,0,0], up:[0,1,0], down:[0,-1,0] };
    const [ddx, ddy, ddz] = (DIRS[params?.direction] || DIRS.north).map(v => v * steps);
    const nx = p.x + ddx, nz = p.z + ddz, ny = p.y + ddy;
    const tgt = this.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
    if (tgt !== BLOCKS.AIR && tgt !== BLOCKS.WATER) return `blocked by ${BLOCK_NAMES[tgt]} at ${params?.direction}`;
    p.x = nx; p.z = nz;
    p.y = this._groundY(nx, nz, ny);
    p.distanceTraveled = (p.distanceTraveled || 0) + Math.hypot(ddx, ddz);
    return `moved ${params?.direction} → (${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)})`;
  }

  _groundY(x, z, hint) {
    for (let y = Math.min(hint + 3, CHUNK_HEIGHT - 1); y >= 0; y--) {
      const b = this.world.getBlock(Math.floor(x), y, Math.floor(z));
      if (b !== BLOCKS.AIR && b !== BLOCKS.WATER) return y + 1;
    }
    return hint;
  }

  _mine(p, params) {
    const dx = Math.max(-2, Math.min(2, params?.dx || 0));
    const dy = Math.max(-2, Math.min(2, params?.dy || 0));
    const dz = Math.max(-2, Math.min(2, params?.dz || 0));
    const bx = Math.floor(p.x) + dx, by = Math.floor(p.y) + dy, bz = Math.floor(p.z) + dz;
    const bt = this.world.getBlock(bx, by, bz);
    if (bt === BLOCKS.AIR)     return 'tried to mine air';
    if (bt === BLOCKS.BEDROCK) return 'cannot mine bedrock';
    this.world.setBlock(bx, by, bz, BLOCKS.AIR);
    const drops = DROPS[bt] ? DROPS[bt]() : [];
    drops.forEach(d => this._addItem(p, d.item, d.n));
    p.blocksMined = (p.blocksMined || 0) + 1;
    this.onBlockChange(bx, by, bz, 0);
    return `mined ${BLOCK_NAMES[bt]} → ${drops.map(d=>`${d.item}×${d.n}`).join(', ') || 'nothing'}`;
  }

  _place(p, params) {
    const name = (params?.block || '').toLowerCase();
    const dx = Math.max(-1, Math.min(1, params?.dx || 0));
    const dy = Math.max(-1, Math.min(1, params?.dy || 0));
    const dz = Math.max(-1, Math.min(1, params?.dz || 0));
    const bx = Math.floor(p.x) + dx, by = Math.floor(p.y) + dy, bz = Math.floor(p.z) + dz;
    const inv = p.inventory.find(i => i.item.toLowerCase() === name);
    if (!inv || inv.n < 1) return `no ${name} in inventory`;
    if (this.world.getBlock(bx, by, bz) !== BLOCKS.AIR) return 'target space occupied';
    const id = BLOCKS[name.toUpperCase()];
    if (id === undefined) return `unknown block: ${name}`;
    this.world.setBlock(bx, by, bz, id);
    inv.n--;
    if (inv.n <= 0) p.inventory = p.inventory.filter(i => i !== inv);
    this.onBlockChange(bx, by, bz, id);
    return `placed ${name}`;
  }

  _craft(p, params) {
    const rec = RECIPES[params?.recipe];
    if (!rec) return `unknown recipe: ${params?.recipe}`;
    if (rec.table && !p.inventory.some(i => i.item === 'crafting_table')) return 'need crafting_table in inventory';
    for (const { item, n } of rec.need) {
      const slot = p.inventory.find(i => i.item === item);
      if (!slot || slot.n < n) return `need ${n}× ${item}`;
    }
    for (const { item, n } of rec.need) {
      const slot = p.inventory.find(i => i.item === item);
      slot.n -= n;
      if (slot.n <= 0) p.inventory = p.inventory.filter(i => i !== slot);
    }
    this._addItem(p, rec.out.item, rec.out.n);
    return `crafted ${rec.out.n}× ${rec.out.item}`;
  }

  _eat(p, params) {
    const slot = p.inventory.find(i => i.item === params?.item);
    if (!slot) return `no ${params?.item} in inventory`;
    const fv = FOOD_VALUES[slot.item];
    if (!fv) return `${slot.item} is not food`;
    p.hunger = Math.min(20, p.hunger + fv);
    slot.n--;
    if (slot.n <= 0) p.inventory = p.inventory.filter(i => i !== slot);
    return `ate ${params.item} → hunger ${p.hunger.toFixed(1)}/20`;
  }

  _fish(p) {
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        if (this.world.getBlock(Math.floor(p.x)+dx, Math.floor(p.y)-1, Math.floor(p.z)+dz) === BLOCKS.WATER) {
          if (Math.random() > 0.5) { this._addItem(p, 'raw_fish', 1); return 'caught raw_fish!'; }
          return 'no bite this time';
        }
      }
    }
    return 'no water nearby to fish';
  }

  _attack(p, params) {
    const mob = this.mobs.find(m => {
      if (params?.target && m.type !== params.target) return false;
      return Math.hypot(m.x - p.x, m.z - p.z) < 3.5;
    });
    if (!mob) return `no ${params?.target || 'mob'} in range`;
    const sword = p.inventory.find(i => i.item.includes('sword'));
    const dmg   = sword ? 6 : 2;
    mob.health -= dmg;
    if (mob.health <= 0) {
      const drops = MOB_DROPS[mob.type]?.() || [];
      drops.forEach(d => this._addItem(p, d.item, d.n));
      this.mobs = this.mobs.filter(m => m !== mob);
      return `killed ${mob.type} → ${drops.map(d=>`${d.item}×${d.n}`).join(', ') || 'nothing'}`;
    }
    return `hit ${mob.type} for ${dmg} dmg (${mob.health.toFixed(0)} HP left)`;
  }

  _chat(p, params) {
    const msg = String(params?.message || '').slice(0, 120);
    this.onChat({ from: p.name, message: msg, isAI: true });
    return `said "${msg}"`;
  }

  _addItem(p, item, n) {
    const slot = p.inventory.find(i => i.item === item);
    if (slot) slot.n += n;
    else p.inventory.push({ item, n });
  }

  // ── Mobs ───────────────────────────────────────────────────────────────────
  _spawnInitialMobs() {
    for (let i = 0; i < 20; i++) this._spawnMob();
  }

  _spawnMob(x, z) {
    const sx  = x ?? (Math.random() - 0.5) * 200;
    const sz  = z ?? (Math.random() - 0.5) * 200;
    const sy  = this.world.getSurfaceY(Math.floor(sx), Math.floor(sz)) + 1;
    const night  = this.dayTick > DAY_TICKS * 0.5;
    const pool   = night ? HOSTILE : PASSIVE;
    const type   = pool[Math.floor(Math.random() * pool.length)];
    this.mobs.push({
      id: `mob_${++_mobSeq}`, type,
      x: sx, y: sy, z: sz,
      health: HOSTILE.includes(type) ? 20 : 10,
      dir: Math.random() * Math.PI * 2,
      age: 0,
    });
  }

  _updateMobs() {
    for (const mob of this.mobs) {
      mob.age++;
      if (mob.age % 8 !== 0) continue;            // only move every 8th call
      mob.dir += (Math.random() - 0.5) * 1.0;
      const nx = mob.x + Math.cos(mob.dir) * 0.5;
      const nz = mob.z + Math.sin(mob.dir) * 0.5;
      const ground = this.world.getBlock(Math.floor(nx), Math.floor(mob.y)-1, Math.floor(nz));
      if (ground !== BLOCKS.AIR) {
        mob.x = nx; mob.z = nz;
        mob.y = this.world.getSurfaceY(Math.floor(nx), Math.floor(nz)) + 1;
      }
      // Hostile mobs damage nearby AI players
      if (HOSTILE.includes(mob.type)) {
        for (const p of this.players.values()) {
          if (Math.hypot(mob.x - p.x, mob.z - p.z) < 1.5) {
            p.health = Math.max(0, p.health - (mob.type === 'creeper' ? 8 : 1));
          }
        }
      }
    }
    // Cull + respawn
    if (this.tick % (TICK_RATE * 60) === 0) {
      while (this.mobs.length > 50) this.mobs.shift();
      if (this.mobs.length < 15) this._spawnMob();
    }
  }

  _broadcastState() {
    this.onGameState({
      tick:      this.tick,
      dayTick:   this.dayTick,
      dayLength: DAY_TICKS,
      isNight:   this.dayTick > DAY_TICKS * 0.5,
      players:   Array.from(this.players.values()).map(p => ({
        id: p.id, name: p.name,
        x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
        health: p.health, hunger: p.hunger,
        lastThought: p.lastThought || '',
        lastAction:  p.lastAction  || '',
      })),
    });
  }

  // ── Player management ──────────────────────────────────────────────────────
  addPlayer(cfg) {
    const spawnX = cfg.x ?? (Math.random() - 0.5) * 20;
    const spawnZ = cfg.z ?? (Math.random() - 0.5) * 20;
    // Always recalculate Y from terrain — saved y values may be stale or default (40)
    const spawnY = this.world.getSurfaceY(Math.floor(spawnX), Math.floor(spawnZ)) + 1;

    const p = {
      id:               cfg.id,
      name:             cfg.name,
      x:                cfg.x ?? spawnX,
      y:                spawnY,
      z:                cfg.z ?? spawnZ,
      health:           cfg.health  ?? 20,
      hunger:           cfg.hunger  ?? 20,
      inventory:        cfg.inventory || [],
      lastThought:      cfg.lastThought || '',
      lastAction:       cfg.lastAction  || '',
      lastActionResult: '',
      blocksMined:      cfg.blocksMined  || 0,
      distanceTraveled: cfg.distanceTraveled || 0,
      nearbyMobs:       [],
    };
    this.players.set(cfg.id, p);

    this._aiCfg.set(cfg.id, {
      apiKey:      cfg.apiKey,
      baseUrl:     cfg.providerBaseUrl || 'https://openrouter.ai/api/v1',
      model:       cfg.model || 'openai/gpt-4o-mini',
      personality: cfg.personality    || 'Curious, resourceful adventurer.',
      history:     [],
      isThinking:  false,
      lastCall:    0,
      isDemo:      !cfg.apiKey || cfg.apiKey === 'demo',
    });

    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (p) this.onSaveState([p]);
    this.players.delete(id);
    this._aiCfg.delete(id);
  }

  getPlayerState(id) { return this.players.get(id); }
  getPlayerCount()   { return this.players.size; }

  getChunkData(cx, cz) {
    return this.world.getChunk(cx, cz);
  }
}
