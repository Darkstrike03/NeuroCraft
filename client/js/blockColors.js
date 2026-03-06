// Block color definitions (used both for mesh building and UI labels)
export const BLOCK_NAMES = {
  0:  'AIR', 1:  'GRASS', 2:  'DIRT',  3:  'STONE',   4:  'WOOD_LOG',
  5:  'LEAVES', 6: 'SAND', 7:  'WATER', 8:  'IRON_ORE', 9:  'COAL_ORE',
  10: 'BEDROCK', 11: 'GRAVEL', 12: 'GOLD_ORE', 13: 'DIAMOND_ORE',
  14: 'COBBLESTONE', 15: 'PLANKS', 16: 'CRAFTING_TABLE',
  17: 'GLASS', 18: 'FLOWER_RED', 19: 'FLOWER_YELLOW',
};

export const TRANSPARENT = new Set([0, 5, 7, 17, 18, 19]);

// Per-face colors:  [topHex, sideHex, bottomHex]
const FC = {
  1:  [0x5db85d, 0x7a5230, 0x7a5230], // GRASS
  2:  [0x8b6040, 0x8b6040, 0x8b6040], // DIRT
  3:  [0xa0a0a0, 0x909090, 0x808080], // STONE
  4:  [0x7a5230, 0x6b3e1f, 0x7a5230], // WOOD_LOG
  5:  [0x2e8b2e, 0x2d7a2d, 0x2d7a2d], // LEAVES
  6:  [0xe8d050, 0xd4be44, 0xd4be44], // SAND
  7:  [0x1a6fc4, 0x1562b0, 0x1055a0], // WATER
  8:  [0x8c8c8c, 0x7c7c7c, 0x6c6c6c], // IRON_ORE  (stone-ish with metal feel)
  9:  [0x606060, 0x555555, 0x4a4a4a], // COAL_ORE
  10: [0x303030, 0x282828, 0x202020], // BEDROCK
  11: [0x8a8a8a, 0x7a7a7a, 0x6a6a6a], // GRAVEL
  12: [0xb0862a, 0xa07820, 0x906a18], // GOLD_ORE
  13: [0x20b0b8, 0x159698, 0x0e7c80], // DIAMOND_ORE
  14: [0x7a7a7a, 0x6c6c6c, 0x5e5e5e], // COBBLESTONE
  15: [0xc8956a, 0xb8855a, 0xa8754a], // PLANKS
  16: [0xb8855a, 0xa87848, 0x706040], // CRAFTING_TABLE
  17: [0xc0dcf0, 0xb0ccdc, 0xa0bcc8], // GLASS
  18: [0xe04040, 0xd03030, 0xc02020], // FLOWER_RED
  19: [0xf0e020, 0xe0cc10, 0xd0bc00], // FLOWER_YELLOW
};

// faceDir: 0=top(+y), 1=bottom(-y), 2=+x, 3=-x, 4=+z, 5=-z
export function getBlockColor(blockType, faceDir) {
  const c = FC[blockType];
  if (!c) return 0xff00ff; // magenta = unknown
  if (faceDir === 0) return c[0];
  if (faceDir === 1) return c[2];
  return c[1];
}

export function hexToRgb(hex) {
  return [(hex >> 16 & 0xff) / 255, (hex >> 8 & 0xff) / 255, (hex & 0xff) / 255];
}
