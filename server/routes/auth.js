'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

module.exports = (db, JWT_SECRET) => {
  const router = express.Router();

  // ── POST /api/auth/register ──────────────────────────────────────────
  router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: 'Username and password are required.' });
    if (typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,20}$/.test(username))
      return res.status(400).json({ error: 'Username must be 3–20 chars, letters/numbers/underscore only.' });
    if (typeof password !== 'string' || password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    try {
      const hash   = await bcrypt.hash(password, 12);
      const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?,?)').run(username, hash);
      const token  = jwt.sign({ id: Number(result.lastInsertRowid), username }, JWT_SECRET, { expiresIn: '7d' });
      return res.status(201).json({ token, username });
    } catch (e) {
      if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already taken.' });
      console.error('[auth/register]', e.message);
      return res.status(500).json({ error: 'Registration failed.' });
    }
  });

  // ── POST /api/auth/login ─────────────────────────────────────────────
  router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password are required.' });

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, username: user.username });
  });

  return router;
};
