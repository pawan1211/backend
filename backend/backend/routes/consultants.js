// ── routes/consultants.js ─────────────────────────────────────
//  GET  /api/consultants              – list all active consultants
//  GET  /api/consultants/:id          – single consultant
//  GET  /api/consultants/:id/slots    – available time slots for a date
// ─────────────────────────────────────────────────────────────

import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const { specialty } = req.query;
  const params = [];
  const conditions = ['c.is_active = true'];

  if (specialty) {
    params.push(`%${specialty}%`);
    conditions.push(`c.specialty ILIKE $${params.length}`);
  }

  const { rows } = await query(`
    SELECT
      c.id, c.specialty, c.experience_yrs, c.rating, c.bio,
      c.timezone, c.tags, c.hourly_rate,
      u.full_name AS name, u.avatar_url
    FROM consultants c
    JOIN users u ON u.id = c.user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY c.rating DESC
  `, params);

  res.json({ consultants: rows });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows: [consultant] } = await query(`
    SELECT c.*, u.full_name AS name, u.avatar_url,
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT('day', a.day_of_week, 'start', a.start_time, 'end', a.end_time)
          ORDER BY a.day_of_week, a.start_time
        ) FILTER (WHERE a.id IS NOT NULL), '[]'
      ) AS availability
    FROM consultants c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN availability a ON a.consultant_id = c.id AND a.is_active = true
    WHERE c.id = $1 AND c.is_active = true
    GROUP BY c.id, u.full_name, u.avatar_url
  `, [req.params.id]);

  if (!consultant) return res.status(404).json({ error: 'Consultant not found.' });
  res.json({ consultant });
}));

// Returns available 1-hour slots for a consultant on a given date (YYYY-MM-DD)
router.get('/:id/slots', asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query parameter required (YYYY-MM-DD).' });

  const dayOfWeek = new Date(date).getDay();

  // Get consultant's availability for that day
  const { rows: avail } = await query(`
    SELECT start_time, end_time FROM availability
    WHERE consultant_id = $1 AND day_of_week = $2 AND is_active = true
  `, [req.params.id, dayOfWeek]);

  // Get already-booked slots for that day
  const { rows: booked } = await query(`
    SELECT scheduled_at FROM bookings
    WHERE consultant_id = $1
      AND scheduled_at::date = $2
      AND status NOT IN ('cancelled')
  `, [req.params.id, date]);

  const bookedTimes = new Set(booked.map(b => new Date(b.scheduled_at).toTimeString().slice(0,5)));

  // Generate 1-hour slots from availability windows
  const slots = [];
  for (const window of avail) {
    let [sh, sm] = window.start_time.split(':').map(Number);
    const [eh, em] = window.end_time.split(':').map(Number);
    const endMins = eh * 60 + em;

    while (sh * 60 + sm + 60 <= endMins) {
      const label = `${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`;
      slots.push({ time: label, available: !bookedTimes.has(label) });
      sm += 60;
      if (sm >= 60) { sh += 1; sm -= 60; }
    }
  }

  res.json({ date, slots });
}));

export default router;
