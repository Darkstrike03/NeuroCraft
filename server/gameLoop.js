'use strict';
const { BLOCKS, BLOCK_NAMES } = require('./world');

const TICK_RATE    = 20;             // ticks/second
const DAY_LENGTH   = TICK_RATE * 60 * 20; // 20-minute days
const HOSTILE_MOBS = ['zombie', 'skeleton', 'creeper'];
const PASSIVE_MOBS = ['cow', 'pig', 'sheep'];

const FOOD_VALUES = {
  apple: 4, bread: 5, cooked_fish: 5, raw_fish: 2,
  cooked_porkchop: 8, raw_porkchop: 3, rotten_flesh: 2,
};

const CRAFTING_RECIPES = {
  planks:           { ingredients: [{ item:'wood_log', count:1 }],                                      result:{ item:'planks',           count:4 } },
  sticks:           { ingredients: [{ item:'planks',   count:2 }],                                      result:{ item:'sticks',           count:4 } },
  crafting_table:   { ingredients: [{ item:'planks',   count:4 }],                                      result:{ item:'crafting_table',   count:1 } },
  torch:            { ingredients: [{ item:'coal',count:1 }, { item:'sticks',count:1 }],                result:{ item:'torch',            count:4 } },
  bread:            { ingredients: [{ item:'wheat',    count:3 }],                                      result:{ item:'bread',            count:1 } },
  wooden_pickaxe:   { ingredients: [{ item:'planks',count:3 }, { item:'sticks',count:2 }],              result:{ item:'wooden_pickaxe',   count:1 }, needsTable:true },
  stone_pickaxe:    { ingredients: [{ item:'cobblestone',count:3 }, { item:'sticks',count:2 }],         result:{ item:'stone_pickaxe',    count:1 }, needsTable:true },
  iron_pickaxe:     { ingredients: [{ item:'iron_ingot',count:3 }, { item:'sticks',count:2 }],          result:{ item:'iron_pickaxe',     count:1 }, needsTable:true },
  wooden_sword:     { ingredients: [{ item:'planks',count:2 }, { item:'sticks',count:1 }],              result:{ item:'wooden_sword',     count:1 }, needsTable:true },
  stone_sword:      { ingredients: [{ item:'cobblestone',count:2 }, { item:'sticks',count:1 }],         result:{ item:'stone_sword',      count:1 }, needsTable:true },
  iron_ingot:       { ingredients: [{ item:'iron_ore',count:1 }, { item:'coal',count:1 }],              result:{ item:'iron_ingot',       count:1 } },
};

function getBlockDrops(blockType) {
  switch (blockType) {
    case BLOCKS.GRASS:        return [{ item:'dirt',        count:1 }];
    case BLOCKS.DIRT:         return [{ item:'dirt',        count:1 }];
    case BLOCKS.STONE:        return [{ item:'cobblestone', count:1 }];
    case BLOCKS.WOOD_LOG:     return [{ item:'wood_log',    count:1 }];
    case BLOCKS.LEAVES:       return Math.random() > 0.8 ? [{ item:'apple', count:1 }] : [];
    case BLOCKS.SAND:         return [{ item:'sand',        count:1 }];
    case BLOCKS.GRAVEL:       return Math.random() > 0.7 ? [{ item:'flint',count:1 }] : [{ item:'gravel',count:1 }];
    case BLOCKS.COAL_ORE:     return [{ item:'coal',        count:1 }];
    case BLOCKS.IRON_ORE:     return [{ item:'iron_ore',    count:1 }];
    case BLOCKS.GOLD_ORE:     return [{ item:'gold_ore',    count:1 }];
    case BLOCKS.DIAMOND_ORE:  return [{ item:'diamond',     count:1 }];
    case BLOCKS.COBBLESTONE:  return [{ item:'cobblestone', count:1 }];
    case BLOCKS.PLANKS:       return [{ item:'planks',      count:1 }];
    default:                  return [];
  }
}

function getMobDrops(type) {
  switch (type) {
    case 'zombie':   return [{ item:'rotten_flesh', count:1 }];
    case 'skeleton': return [{ item:'bone', count:1 }, ...(Math.random()>0.5?[{ item:'arrow', count:Math.ceil(Math.random()*3) }]:[])];
    case 'creeper':  return [{ item:'gunpowder', count:1 }];
    case 'cow':      return [{ item:'raw_porkchop', count:1+Math.floor(Math.random()*2) }, { item:'leather', count:1 }];
    case 'pig':      return [{ item:'raw_porkchop', count:1+Math.floor(Math.random()*3) }];
    case 'sheep':    return [{ item:'wool', count:2+Math.floor(Math.random()*2) }];
    default:         return [];
  }
}

let _mobSeq = 0;

class GameLoop {
  constructor(world, io, db) {
    this.world    = world;
    this.io       = io;
    this.db       = db;
    this.players  = new Map();     // id → player state
    this.aiInstances = new Map();  // id → AIPlayer
    this.mobs     = [];
    this.tick     = 0;
    this.dayTick  = 0;
    this._tid     = null;
  }

  start() {
    this._tid = setInterval(() => this._tick(), 1000 / TICK_RATE);
    this._spawnInitialMobs();
    console.log(`[GameLoop] Started at ${TICK_RATE} TPS`);
  }

  stop() { if (this._tid) clearInterval(this._tid); }

  _tick() {
    this.tick++;
    this.dayTick = (this.dayTick + 1) % DAY_LENGTH;

    // Hunger / health regen every real-world 30 s
    if (this.tick % (TICK_RATE * 30) === 0) {
      for (const p of this.players.values()) {
        p.hunger = Math.max(0, p.hunger - 0.5);
        if (p.hunger === 0) p.health = Math.max(0, p.health - 0.5);
        if (p.hunger >= 18) p.health = Math.min(20, p.health + 0.5);
      }
    }

    // Mob movement every 10 ticks
    if (this.tick % 10 === 0) this._updateMobs();

    // Trigger AI decisions every 3 s
    if (this.tick % (TICK_RATE * 3) === 0) this._triggerAI();

    // Broadcast state every 5 ticks  (~4 Hz)
    if (this.tick % 5 === 0) this._broadcastState();

    // Persist stats every 60 s
    if (this.tick % (TICK_RATE * 60) === 0) {
      for (const p of this.players.values()) this.savePlayerStats(p);
    }
  }

  async _triggerAI() {
    for (const [id, ai] of this.aiInstances) {
      const p = this.players.get(id);
      if (!p) continue;
      const ctx = this.world.getAIContext(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      p.nearbyMobs = this.mobs
        .filter(m => Math.hypot(m.x - p.x, m.z - p.z) < 20)
        .map(m => ({ type: m.type, dx: +(m.x - p.x).toFixed(1), dy: +(m.y - p.y).toFixed(1), dz: +(m.z - p.z).toFixed(1) }));
      try {
        const action = await ai.decideAction(p, ctx);
        if (action) this._execute(id, action);
      } catch (e) {
        console.error(`[AI:${p.name}]`, e.message);
      }
    }
  }

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

    this.io.emit('playerAction', {
      playerId, playerName: p.name, action, thought, result,
      position: { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) },
    });
  }

  // ── Action implementations ────────────────────────────────────────────
  _move(p, params) {
    const steps = Math.max(1, Math.min(5, params?.steps || 1));
    const dirs  = { north:[0,0,-1], south:[0,0,1], east:[1,0,0], west:[-1,0,0], up:[0,1,0], down:[0,-1,0] };
    const [ddx, ddy, ddz] = (dirs[params?.direction] || dirs.north).map(v => v * steps);
    const nx = p.x + ddx, nz = p.z + ddz, ny = p.y + ddy;

    const tgt = this.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
    if (tgt !== BLOCKS.AIR && tgt !== BLOCKS.WATER) {
      return `blocked by ${BLOCK_NAMES[tgt] || 'block'} going ${params?.direction}`;
    }
    p.x = nx;
    p.z = nz;
    p.y = this._groundY(nx, nz, ny);
    p.distanceTraveled = (p.distanceTraveled || 0) + Math.hypot(ddx, ddz);
    return `moved ${params?.direction} → (${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)})`;
  }

  _groundY(x, z, hint) {
    for (let y = Math.min(hint + 3, BLOCKS.length || 63); y >= 0; y--) {
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
    const drops = getBlockDrops(bt);
    drops.forEach(d => this._addItem(p, d.item, d.count));
    p.blocksMined = (p.blocksMined || 0) + 1;
    this.io.emit('blockChange', { x: bx, y: by, z: bz, type: 0 });
    return `mined ${BLOCK_NAMES[bt]} → ${drops.map(d=>`${d.item}×${d.count}`).join(', ') || 'nothing'}`;
  }

  _place(p, params) {
    const name = (params?.block || '').toLowerCase();
    const dx = Math.max(-1, Math.min(1, params?.dx || 0));
    const dy = Math.max(-1, Math.min(1, params?.dy || 0));
    const dz = Math.max(-1, Math.min(1, params?.dz || 0));
    const bx = Math.floor(p.x) + dx, by = Math.floor(p.y) + dy, bz = Math.floor(p.z) + dz;
    const inv = p.inventory.find(i => i.item.toLowerCase() === name);
    if (!inv || inv.count < 1) return `no ${name} in inventory`;
    if (this.world.getBlock(bx, by, bz) !== BLOCKS.AIR) return 'target space occupied';
    const id = BLOCKS[name.toUpperCase()];
    if (id === undefined) return `unknown block: ${name}`;
    this.world.setBlock(bx, by, bz, id);
    inv.count--;
    if (inv.count <= 0) p.inventory = p.inventory.filter(i => i !== inv);
    this.io.emit('blockChange', { x: bx, y: by, z: bz, type: id });
    return `placed ${name}`;
  }

  _craft(p, params) {
    const rec = CRAFTING_RECIPES[params?.recipe];
    if (!rec) return `unknown recipe: ${params?.recipe}`;
    if (rec.needsTable && !p.inventory.some(i => i.item === 'crafting_table'))
      return 'need crafting_table in inventory';
    for (const ing of rec.ingredients) {
      const slot = p.inventory.find(i => i.item === ing.item);
      if (!slot || slot.count < ing.count) return `need ${ing.count}× ${ing.item}`;
    }
    for (const ing of rec.ingredients) {
      const slot = p.inventory.find(i => i.item === ing.item);
      slot.count -= ing.count;
      if (slot.count <= 0) p.inventory = p.inventory.filter(i => i !== slot);
    }
    this._addItem(p, rec.result.item, rec.result.count);
    return `crafted ${rec.result.count}× ${rec.result.item}`;
  }

  _eat(p, params) {
    const slot = p.inventory.find(i => i.item === params?.item);
    if (!slot) return `no ${params?.item}`;
    const fv = FOOD_VALUES[slot.item];
    if (!fv) return `${slot.item} is not food`;
    p.hunger = Math.min(20, p.hunger + fv);
    slot.count--;
    if (slot.count <= 0) p.inventory = p.inventory.filter(i => i !== slot);
    return `ate ${slot.item} → hunger ${p.hunger.toFixed(1)}/20`;
  }

  _fish(p) {
    let waterNear = false;
    outer: for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        if (this.world.getBlock(Math.floor(p.x)+dx, Math.floor(p.y)-1, Math.floor(p.z)+dz) === BLOCKS.WATER) {
          waterNear = true; break outer;
        }
      }
    }
    if (!waterNear) return 'no water nearby';
    if (Math.random() > 0.55) {
      this._addItem(p, 'raw_fish', 1);
      return 'caught a raw_fish!';
    }
    return 'no bite this time';
  }

  _attack(p, params) {
    const mob = this.mobs.find(m => {
      if (params?.target && m.type !== params.target) return false;
      return Math.hypot(m.x - p.x, m.z - p.z) < 3;
    });
    if (!mob) return `no ${params?.target || 'mob'} in range`;
    const sword = p.inventory.find(i => i.item.includes('sword'));
    const dmg   = sword ? 6 : 2;
    mob.health -= dmg;
    if (mob.health <= 0) {
      const drops = getMobDrops(mob.type);
      drops.forEach(d => this._addItem(p, d.item, d.count));
      this.mobs = this.mobs.filter(m => m !== mob);
      this.io.emit('mobDeath', { mobId: mob.id });
      return `killed ${mob.type} → ${drops.map(d=>`${d.item}×${d.count}`).join(', ') || 'nothing'}`;
    }
    return `hit ${mob.type} for ${dmg} dmg (${mob.health.toFixed(0)} HP left)`;
  }

  _chat(p, params) {
    const msg = String(params?.message || '').slice(0, 200);
    this.io.emit('chat', { from: p.name, message: msg, isAI: true });
    return `said "${msg}"`;
  }

  _addItem(p, item, count) {
    const slot = p.inventory.find(i => i.item === item);
    if (slot) slot.count += count;
    else p.inventory.push({ item, count });
  }

  // ── Mob management ────────────────────────────────────────────────────
  _spawnInitialMobs() {
    for (let i = 0; i < 25; i++) this._spawnMob();
  }

  _spawnMob(x, z) {
    const sx    = x ?? (Math.random() - 0.5) * 200;
    const sz    = z ?? (Math.random() - 0.5) * 200;
    const sy    = this.world.getSurfaceY(Math.floor(sx), Math.floor(sz)) + 1;
    const night = this.dayTick > DAY_LENGTH * 0.5;
    const pool  = night ? HOSTILE_MOBS : PASSIVE_MOBS;
    const type  = pool[Math.floor(Math.random() * pool.length)];
    const mob   = {
      id: `mob_${++_mobSeq}`, type,
      x: sx, y: sy, z: sz,
      health: HOSTILE_MOBS.includes(type) ? 20 : 10,
      dir: Math.random() * Math.PI * 2,
      tick: 0,
    };
    this.mobs.push(mob);
    this.io.emit('mobSpawn', { id: mob.id, type: mob.type, x: mob.x, y: mob.y, z: mob.z });
    return mob;
  }

  _updateMobs() {
    for (const mob of this.mobs) {
      mob.tick++;
      if (mob.tick % 12 !== 0) continue;
      mob.dir += (Math.random() - 0.5) * 1.2;
      const nx = mob.x + Math.cos(mob.dir) * 0.6;
      const nz = mob.z + Math.sin(mob.dir) * 0.6;
      const ground = this.world.getBlock(Math.floor(nx), Math.floor(mob.y) - 1, Math.floor(nz));
      if (ground !== BLOCKS.AIR) {
        mob.x = nx; mob.z = nz;
        mob.y = this.world.getSurfaceY(Math.floor(nx), Math.floor(nz)) + 1;
      }
      if (HOSTILE_MOBS.includes(mob.type)) {
        for (const p of this.players.values()) {
          if (Math.hypot(mob.x - p.x, mob.z - p.z) < 2) {
            p.health = Math.max(0, p.health - (mob.type === 'creeper' ? 8 : 2));
            this.io.emit('playerDamaged', { playerId: p.id, health: p.health });
          }
        }
      }
    }

    if (this.tick % (TICK_RATE * 5) === 0) {
      this.io.emit('mobPositions', this.mobs.map(m => ({ id:m.id, type:m.type, x:m.x, y:m.y, z:m.z })));
    }

    // Keep mob count reasonble
    if (this.tick % (TICK_RATE * 60) === 0) {
      while (this.mobs.length > 60) this.mobs.shift();
      if (this.mobs.length < 20) this._spawnMob();
    }
  }

  _broadcastState() {
    this.io.emit('gameState', {
      tick:        this.tick,
      dayTick:     this.dayTick,
      dayLength:   DAY_LENGTH,
      isNight:     this.dayTick > DAY_LENGTH * 0.5,
      players:     Array.from(this.players.values()).map(p => ({
        id: p.id, name: p.name,
        x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
        health: p.health, hunger: p.hunger,
        lastThought: p.lastThought || '', lastAction: p.lastAction || '',
      })),
    });
  }

  // ── Player lifecycle ──────────────────────────────────────────────────
  addPlayer(data) {
    const spawnX = data.x ?? (Math.random() - 0.5) * 30;
    const spawnZ = data.z ?? (Math.random() - 0.5) * 30;
    const p = {
      id:               data.id,
      name:             data.name,
      x:                spawnX,
      y:                this.world.getSurfaceY(Math.floor(spawnX), Math.floor(spawnZ)) + 1,
      z:                spawnZ,
      health:           data.health  ?? 20,
      hunger:           data.hunger  ?? 20,
      inventory:        typeof data.inventory === 'string' ? JSON.parse(data.inventory) : (data.inventory || []),
      lastThought:      data.last_thought   || '',
      lastAction:       data.last_action    || '',
      lastActionResult: '',
      blocksMined:      data.blocks_mined   || 0,
      distanceTraveled: data.distance_traveled || 0,
      nearbyMobs:       [],
    };
    this.players.set(data.id, p);
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (p) this.savePlayerStats(p);
    this.players.delete(id);
    this.aiInstances.delete(id);
  }

  savePlayerStats(p) {
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO player_stats
          (player_id, x, y, z, health, hunger, inventory, last_action, last_thought, blocks_mined, distance_traveled)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        p.id, p.x, p.y, p.z, p.health, p.hunger,
        JSON.stringify(p.inventory),
        p.lastAction, p.lastThought,
        p.blocksMined, p.distanceTraveled,
      );
    } catch (e) {
      console.error('[GameLoop] savePlayerStats:', e.message);
    }
  }

  getPlayerCount() { return this.players.size; }
}

module.exports = { GameLoop, CRAFTING_RECIPES, FOOD_VALUES };
