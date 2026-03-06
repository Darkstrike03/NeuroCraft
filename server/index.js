'use strict';
require('dotenv').config();

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');

const db         = require('./database');
const { World }  = require('./world');
const { GameLoop } = require('./gameLoop');
const { AIPlayer } = require('./aiPlayer');
const authRoutes = require('./routes/auth');
const apiRoutes  = require('./routes/api');

const PORT       = process.env.PORT       || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'neurocraft-secret-CHANGE-IN-PRODUCTION';
const WORLD_SEED = parseInt(process.env.WORLD_SEED, 10) || 42;

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ── Game state ──────────────────────────────────────────────────────────
const world    = new World(WORLD_SEED);
const gameLoop = new GameLoop(world, io, db);

// ── Middleware ──────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// ── HTTP routes ─────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes(db, JWT_SECRET));
app.use('/api',       apiRoutes(db, JWT_SECRET, gameLoop));

app.get('/',          (_req, res) => res.sendFile(path.join(__dirname, '../client/index.html')));
app.get('/game',      (_req, res) => res.sendFile(path.join(__dirname, '../client/game.html')));
app.get('/dashboard', (_req, res) => res.sendFile(path.join(__dirname, '../client/dashboard.html')));

// ── Socket.io ───────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id);

  // Client sends their JWT to identify
  socket.on('authenticate', (token) => {
    try {
      const user = jwt.verify(token, JWT_SECRET);
      socket.userId = user.id;
      socket.emit('authenticated', { ok: true });

      // Send initial world chunks around spawn (7x7 = 49 chunks)
      const initial = [];
      for (let cx = -3; cx <= 3; cx++) {
        for (let cz = -3; cz <= 3; cz++) {
          const data = world.getChunk(cx, cz);
          initial.push({ cx, cz, data: Array.from(data) });
        }
      }
      socket.emit('initialChunks', initial);

      // Send current game state
      socket.emit('gameState', {
        tick:      gameLoop.tick,
        isNight:   gameLoop.dayTick > 12000,
        dayTick:   gameLoop.dayTick,
        dayLength: 24000,
        players:   Array.from(gameLoop.players.values()),
      });
      socket.emit('mobPositions', gameLoop.mobs.map(m => ({ id:m.id, type:m.type, x:m.x, y:m.y, z:m.z })));
    } catch {
      socket.emit('authenticated', { ok: false, error: 'Invalid token' });
    }
  });

  // Client requests a specific chunk (as camera pans)
  socket.on('requestChunk', ({ cx, cz }) => {
    if (typeof cx !== 'number' || typeof cz !== 'number') return;
    if (Math.abs(cx) > 64 || Math.abs(cz) > 64) return; // Sanity limit
    const data = world.getChunk(cx, cz);
    socket.emit('chunkData', { cx, cz, data: Array.from(data) });
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Client disconnected:', socket.id);
  });
});

// ── Boot: load persisted AI players ────────────────────────────────────
function loadAIPlayers() {
  const rows = db.prepare(`
    SELECT ap.*, ps.x, ps.y, ps.z, ps.health, ps.hunger,
           ps.inventory, ps.blocks_mined, ps.distance_traveled,
           ps.last_action, ps.last_thought
    FROM ai_players ap
    LEFT JOIN player_stats ps ON ap.id = ps.player_id
    WHERE ap.is_active = 1
  `).all();

  for (const row of rows) {
    const ai = new AIPlayer(row);
    gameLoop.aiInstances.set(row.id, ai);
    gameLoop.addPlayer(row);
    console.log(`[Boot] AI player loaded: ${row.name} (${row.model})`);
  }
  console.log(`[Boot] ${rows.length} AI player(s) active.`);
}

server.listen(PORT, () => {
  console.log(`\n🌍  NeuroCraft running → http://localhost:${PORT}\n`);
  loadAIPlayers();
  gameLoop.start();
});

// ── Graceful shutdown ───────────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\nSaving state and shutting down…');
  gameLoop.stop();
  for (const p of gameLoop.players.values()) gameLoop.savePlayerStats(p);
  process.exit(0);
});
