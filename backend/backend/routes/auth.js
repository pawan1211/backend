// ── routes/auth.js ────────────────────────────────────────────
//  POST /api/auth/sync   – syncs Supabase user into our DB after signup
//  GET  /api/auth/me     – returns current user profile
//  PUT  /api/auth/me     – updates profile
// ─────────────────────────────────────────────────────────────

import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Called by the frontend after Supabase signup to create the DB profile
router.post('/sync', requireAuth, asyncHandler(async (req, res) => {
  const { fullName, company, country, phone } = req.body;

  const { rows: [existing] } = await query(
    `SELECT id FROM users WHERE supabase_id = $1`,
    [req.user.supabaseId]
  );

  if (existing) {
    return res.json({ message: 'Profile already synced.', userId: existing.id });
  }

  const { rows: [user] } = await query(`
    INSERT INTO users (supabase_id, email, full_name, company, country, phone, role)
    VALUES ($1, $2, $3, $4, $5, $6, 'client')
    RETURNING id
  `, [req.user.supabaseId, req.user.email, fullName, company, country, phone]);

  res.status(201).json({ message: 'Profile created.', userId: user.id });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows: [user] } = await query(
    `SELECT id, email, full_name, company, country, phone, avatar_url, role, created_at
     FROM users WHERE supabase_id = $1`,
    [req.user.supabaseId]
  );
  if (!user) return res.status(404).json({ error: 'Profile not found. Please sync.' });
  res.json({ user });
}));

router.put('/me', requireAuth, asyncHandler(async (req, res) => {
  const { fullName, company, country, phone } = req.body;
  const { rows: [user] } = await query(`
    UPDATE users SET full_name = COALESCE($1, full_name), company = COALESCE($2, company),
      country = COALESCE($3, country), phone = COALESCE($4, phone)
    WHERE supabase_id = $5 RETURNING id, email, full_name, company
  `, [fullName, company, country, phone, req.user.supabaseId]);

  res.json({ user });
}));

export default router;
