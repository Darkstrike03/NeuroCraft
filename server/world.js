'use strict';

// ─── Block type registry ───────────────────────────────────────────────────
const BLOCKS = {
  AIR:           0,
  GRASS:         1,
  DIRT:          2,
  STONE:         3,
  WOOD_LOG:      4,
  LEAVES:        5,
  SAND:          6,
  WATER:         7,
  IRON_ORE:      8,
  COAL_ORE:      9,
  BEDROCK:      10,
  GRAVEL:       11,
  GOLD_ORE:     12,
  DIAMOND_ORE:  13,
  COBBLESTONE:  14,
  PLANKS:       15,
  CRAFTING_TABLE: 16,
  GLASS:        17,
  FLOWER_RED:   18,
  FLOWER_YELLOW:19,
};

const BLOCK_NAMES = Object.fromEntries(
  Object.entries(BLOCKS).map(([k, v]) => [v, k])
);

const TRANSPARENT_BLOCKS = new Set([
  BLOCKS.AIR, BLOCKS.WATER, BLOCKS.LEAVES,
  BLOCKS.GLASS, BLOCKS.FLOWER_RED, BLOCKS.FLOWER_YELLOW,
]);

const CHUNK_SIZE   = 16;
const CHUNK_HEIGHT = 64;
const WATER_LEVEL  = 12;
const SURFACE_BASE = 20;

// ─── World ────────────────────────────────────────────────────────────────
class World {
  constructor(seed = 42) {
    this.seed   = seed;
    this.chunks = new Map(); // "cx,cz" → Uint8Array(16*16*64)
  }

  // Deterministic hash-based smooth noise (no dependencies)
  _hash(x, z) {
    let n = Math.sin(x * 1.2345 + z * 6.789 + this.seed * 0.0013) * 43758.5453;
    return n - Math.floor(n);
  }

  _smoothNoise(x, z, scale) {
    const x0 = Math.floor(x / scale), z0 = Math.floor(z / scale);
    const fx  = (x / scale) - x0,     fz  = (z / scale) - z0;
    const n00 = this._hash(x0,     z0);
    const n10 = this._hash(x0 + 1, z0);
    const n01 = this._hash(x0,     z0 + 1);
    const n11 = this._hash(x0 + 1, z0 + 1);
    const nx0 = n00 + fx * (n10 - n00);
    const nx1 = n01 + fx * (n11 - n01);
    return nx0 + fz * (nx1 - nx0);
  }

  getSurfaceY(worldX, worldZ) {
    return Math.floor(
      SURFACE_BASE +
      this._smoothNoise(worldX, worldZ, 80) * 22 +
      this._smoothNoise(worldX, worldZ, 40) * 10 +
      this._smoothNoise(worldX, worldZ, 20) * 4
    );
  }

  _idx(lx, y, lz) {
    return (y * CHUNK_SIZE * CHUNK_SIZE) + (lz * CHUNK_SIZE) + lx;
  }

  generateChunk(cx, cz) {
    const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        const surfY = this.getSurfaceY(wx, wz);

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const i = this._idx(lx, y, lz);

          if (y === 0) {
            blocks[i] = BLOCKS.BEDROCK;
          } else if (y < surfY - 4) {
            const oreNoise = this._hash(wx * 7 + y * 3, wz * 11 + y * 5);
            if      (y < 8  && oreNoise > 0.96) blocks[i] = BLOCKS.DIAMOND_ORE;
            else if (y < 16 && oreNoise > 0.93) blocks[i] = BLOCKS.GOLD_ORE;
            else if (             oreNoise > 0.88) blocks[i] = BLOCKS.IRON_ORE;
            else if (             oreNoise > 0.78) blocks[i] = BLOCKS.COAL_ORE;
            else                                   blocks[i] = BLOCKS.STONE;
          } else if (y < surfY - 1) {
            blocks[i] = BLOCKS.DIRT;
          } else if (y === surfY - 1) {
            blocks[i] = (y <= WATER_LEVEL) ? BLOCKS.SAND : BLOCKS.GRASS;
          } else if (y < surfY && y <= WATER_LEVEL) {
            blocks[i] = BLOCKS.WATER;
          } else if (y >= surfY && y <= WATER_LEVEL) {
            blocks[i] = BLOCKS.WATER;
          }
          // else: stays AIR
        }

        // Trees on dry land above water
        if (surfY > WATER_LEVEL + 2) {
          const treeN = this._hash(wx * 13 + 7777, wz * 17 + 3333);
          if (treeN > 0.94) {
            const trunkH = 4 + Math.floor(treeN * 3);
            for (let ty = surfY; ty < Math.min(surfY + trunkH, CHUNK_HEIGHT - 2); ty++) {
              blocks[this._idx(lx, ty, lz)] = BLOCKS.WOOD_LOG;
            }
            const leafBase = surfY + trunkH - 2;
            for (let ly = leafBase; ly <= Math.min(leafBase + 3, CHUNK_HEIGHT - 2); ly++) {
              for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                  const nlx = lx + dx, nlz = lz + dz;
                  if (nlx >= 0 && nlx < CHUNK_SIZE && nlz >= 0 && nlz < CHUNK_SIZE) {
                    if (Math.abs(dx) + Math.abs(dz) <= 2 + (ly > leafBase ? -1 : 0)) {
                      const li = this._idx(nlx, ly, nlz);
                      if (blocks[li] === BLOCKS.AIR) blocks[li] = BLOCKS.LEAVES;
                    }
                  }
                }
              }
            }
          }

          // Flowers
          const flowerN = this._hash(wx * 31, wz * 37);
          if (flowerN > 0.97 && surfY < CHUNK_HEIGHT - 1) {
            blocks[this._idx(lx, surfY, lz)] =
              flowerN > 0.985 ? BLOCKS.FLOWER_YELLOW : BLOCKS.FLOWER_RED;
          }
        }
      }
    }

    this.chunks.set(`${cx},${cz}`, blocks);
    return blocks;
  }

  getChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (!this.chunks.has(key)) this.generateChunk(cx, cz);
    return this.chunks.get(key);
  }

  getBlock(worldX, y, worldZ) {
    if (y < 0 || y >= CHUNK_HEIGHT) return BLOCKS.AIR;
    const cx  = Math.floor(worldX / CHUNK_SIZE);
    const cz  = Math.floor(worldZ / CHUNK_SIZE);
    const lx  = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz  = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return this.getChunk(cx, cz)[this._idx(lx, y, lz)];
  }

  setBlock(worldX, y, worldZ, blockType) {
    if (y < 0 || y >= CHUNK_HEIGHT) return null;
    const cx = Math.floor(worldX / CHUNK_SIZE);
    const cz = Math.floor(worldZ / CHUNK_SIZE);
    const lx = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    this.getChunk(cx, cz)[this._idx(lx, y, lz)] = blockType;
    return { cx, cz, x: worldX, y, z: worldZ, type: blockType };
  }

  // Returns a compact description of surroundings for the AI prompt
  getAIContext(worldX, y, worldZ, radius = 4) {
    const blocks = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -2; dy <= 4; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const b = this.getBlock(worldX + dx, y + dy, worldZ + dz);
          if (b !== BLOCKS.AIR) {
            blocks.push({ dx, dy, dz, type: BLOCK_NAMES[b] || 'UNKNOWN' });
          }
        }
      }
    }
    return {
      position: { x: worldX, y, z: worldZ },
      surfaceY: this.getSurfaceY(worldX, worldZ),
      blocks,
    };
  }
}

module.exports = { World, BLOCKS, BLOCK_NAMES, TRANSPARENT_BLOCKS, CHUNK_SIZE, CHUNK_HEIGHT };
