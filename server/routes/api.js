'use strict';
const express = require('express');
const jwt     = require('jsonwebtoken');
const { AIPlayer } = require('../aiPlayer');

module.exports = (db, JWT_SECRET, gameLoop) => {
  const router = express.Router();

  // ── Auth middleware ──────────────────────────────────────────────────
  const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token.' });
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid token.' });
    }
  };

  // ── GET /api/players ─────────────────────────────────────────────────
  router.get('/players', auth, (req, res) => {
    const rows = db.prepare(`
      SELECT ap.id, ap.name, ap.model, ap.provider_base_url,
             ap.is_active, ap.personality, ap.created_at,
             ps.x, ps.y, ps.z, ps.health, ps.hunger,
             ps.blocks_mined, ps.distance_traveled,
             ps.last_action, ps.last_thought
      FROM ai_players ap
      LEFT JOIN player_stats ps ON ap.id = ps.player_id
      WHERE ap.user_id = ?
    `).all(req.user.id);

    const enriched = rows.map(p => {
      const live = gameLoop.players.get(p.id);
      return live
        ? { ...p, x: live.x, y: live.y, z: live.z, health: live.health, hunger: live.hunger,
            lastThought: live.lastThought, lastAction: live.lastAction, isLive: true }
        : { ...p, isLive: false };
    });
    return res.json(enriched);
  });

  // ── POST /api/players ────────────────────────────────────────────────
  router.post('/players', auth, (req, res) => {
    const { name, apiKey, model, providerBaseUrl, personality } = req.body;
    if (!name || !apiKey)
      return res.status(400).json({ error: 'name and apiKey are required.' });
    if (typeof name !== 'string' || name.length < 1 || name.length > 32 || !/^[a-zA-Z0-9_ ]+$/.test(name))
      return res.status(400).json({ error: 'Invalid player name (max 32 chars, letters/numbers/spaces/underscores).' });

    const { c } = db.prepare('SELECT COUNT(*) as c FROM ai_players WHERE user_id = ?').get(req.user.id);
    if (c >= 5)
      return res.status(400).json({ error: 'Maximum of 5 AI players per account.' });

    const result = db.prepare(`
      INSERT INTO ai_players (user_id, name, api_key, model, provider_base_url, personality)
      VALUES (?,?,?,?,?,?)
    `).run(
      req.user.id, name.trim(), apiKey,
      (typeof model === 'string' && model.length > 0) ? model : 'openai/gpt-4o-mini',
      (typeof providerBaseUrl === 'string' && providerBaseUrl.startsWith('https://')) ? providerBaseUrl : 'https://openrouter.ai/api/v1',
      (typeof personality === 'string' && personality.length > 0) ? personality.slice(0, 500) : 'Curious and resourceful adventurer.',
    );

    const data = db.prepare('SELECT * FROM ai_players WHERE id = ?').get(Number(result.lastInsertRowid));
    const ai   = new AIPlayer(data);
    gameLoop.aiInstances.set(data.id, ai);
    gameLoop.addPlayer(data);

    return res.status(201).json({ id: data.id, name: data.name, message: 'AI player spawned!' });
  });

  // ── DELETE /api/players/:id ──────────────────────────────────────────
  router.delete('/players/:id', auth, (req, res) => {
    const playerId = parseInt(req.params.id, 10);
    if (!Number.isInteger(playerId))
      return res.status(400).json({ error: 'Invalid id.' });

    const row = db.prepare('SELECT id FROM ai_players WHERE id = ? AND user_id = ?').get(playerId, req.user.id);
    if (!row) return res.status(404).json({ error: 'Player not found.' });

    gameLoop.removePlayer(playerId);
    db.prepare('DELETE FROM ai_players WHERE id = ?').run(playerId);
    db.prepare('DELETE FROM player_stats WHERE player_id = ?').run(playerId);

    return res.json({ message: 'Player deleted.' });
  });

  // ── PATCH /api/players/:id/toggle ───────────────────────────────────
  router.patch('/players/:id/toggle', auth, (req, res) => {
    const playerId = parseInt(req.params.id, 10);
    if (!Number.isInteger(playerId))
      return res.status(400).json({ error: 'Invalid id.' });

    const row = db.prepare('SELECT * FROM ai_players WHERE id = ? AND user_id = ?').get(playerId, req.user.id);
    if (!row) return res.status(404).json({ error: 'Player not found.' });

    const newState = row.is_active ? 0 : 1;
    db.prepare('UPDATE ai_players SET is_active = ? WHERE id = ?').run(newState, playerId);

    if (newState === 0) {
      gameLoop.removePlayer(playerId);
    } else {
      const data = db.prepare('SELECT * FROM ai_players WHERE id = ?').get(playerId);
      const ps   = db.prepare('SELECT * FROM player_stats WHERE player_id = ?').get(playerId);
      gameLoop.aiInstances.set(playerId, new AIPlayer(data));
      gameLoop.addPlayer({ ...data, ...(ps || {}) });
    }

    return res.json({ is_active: newState });
  });

  // ── GET /api/world ───────────────────────────────────────────────────
  router.get('/world', (req, res) => {
    return res.json({
      seed:        gameLoop.world.seed,
      playerCount: gameLoop.getPlayerCount(),
      tick:        gameLoop.tick,
      mobCount:    gameLoop.mobs.length,
    });
  });

  // ── GET /api/leaderboard ─────────────────────────────────────────────
  router.get('/leaderboard', (req, res) => {
    const rows = db.prepare(`
      SELECT ap.name, ps.blocks_mined, ps.distance_traveled, ps.health, u.username as owner
      FROM ai_players ap
      JOIN player_stats ps ON ap.id = ps.player_id
      JOIN users u          ON ap.user_id = u.id
      ORDER BY ps.blocks_mined DESC
      LIMIT 20
    `).all();
    return res.json(rows);
  });

  return router;
};
