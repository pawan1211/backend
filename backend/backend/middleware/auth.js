// ── middleware/auth.js ────────────────────────────────────────
//  Validates Supabase JWT on every protected route
// ─────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // Service role key — server-side only!
);

// ── requireAuth ───────────────────────────────────────────────
//  Extracts and verifies the Supabase JWT from Authorization header.
//  Attaches req.user = { id, email, role } on success.
export const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header.' });
    }

    const token = header.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    // Attach decoded user to request
    req.user = {
      supabaseId: user.id,
      email: user.email,
      role: user.user_metadata?.role || 'client',
    };

    next();
  } catch (err) {
    console.error('[Auth Middleware]', err.message);
    res.status(500).json({ error: 'Authentication service error.' });
  }
};

// ── requireRole ───────────────────────────────────────────────
//  Usage: requireRole('admin') or requireRole(['admin','consultant'])
export const requireRole = (roles) => (req, res, next) => {
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!req.user || !allowed.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions.' });
  }
  next();
};

export { supabase };
