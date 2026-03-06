/**
 * localStorage helpers — all NeuroCraft data lives in the browser.
 * No server, no account sync — your AI plays on YOUR device.
 */
const P = 'nc_'; // key prefix

function _get(key)       { try { return JSON.parse(localStorage.getItem(P + key)); } catch { return null; } }
function _set(key, val)  { localStorage.setItem(P + key, JSON.stringify(val)); }
function _del(key)       { localStorage.removeItem(P + key); }

// ── Auth (just a display name — no passwords needed for a local game) ────────────
export function getUser()              { return _get('user'); }
export function setUser(u)             { _set('user', u); }
export function clearUser()            { _del('user'); }

// ── AI player configs ────────────────────────────────────────────────────────────
/** @returns {{ id, name, apiKey, model, providerBaseUrl, personality,
 *              x, y, z, health, hunger, inventory, blocksMined, distanceTraveled,
 *              lastThought, lastAction }[]} */
export function getPlayers()           { return _get('players') || []; }
export function savePlayers(players)   { _set('players', players); }

export function addPlayer(cfg) {
  const players = getPlayers();
  cfg.id = Date.now();   // simple unique id
  // Default runtime stats
  cfg.x = 0; cfg.y = 40; cfg.z = 0;
  cfg.health = 20; cfg.hunger = 20; cfg.inventory = [];
  cfg.blocksMined = 0; cfg.distanceTraveled = 0;
  cfg.lastThought = ''; cfg.lastAction = '';
  players.push(cfg);
  savePlayers(players);
  return cfg;
}

export function removePlayer(id) {
  savePlayers(getPlayers().filter(p => p.id !== id));
}

export function updatePlayerStats(id, patch) {
  const players = getPlayers().map(p => p.id === id ? { ...p, ...patch } : p);
  savePlayers(players);
}

// ── World seed ───────────────────────────────────────────────────────────────────
export function getWorldSeed()         { return _get('world_seed') ?? 42; }
export function setWorldSeed(s)        { _set('world_seed', s); }

// ── Hard logout (wipe everything) ───────────────────────────────────────────────
export function logout() {
  Object.keys(localStorage).filter(k => k.startsWith(P)).forEach(k => localStorage.removeItem(k));
}
