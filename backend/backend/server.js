// ============================================================
//  NexusIT Backend · server.js
//  Node.js + Express + PostgreSQL
// ============================================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import dotenv from 'dotenv';

import authRoutes      from './routes/auth.js';
import bookingRoutes   from './routes/bookings.js';
import consultantRoutes from './routes/consultants.js';
import webhookRoutes   from './routes/webhooks.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ── SECURITY ─────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// ── RATE LIMITING ────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  standardHeaders: true,
});
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { error: 'Too many booking attempts. Please try again later.' },
});

app.use(limiter);
app.use(morgan('combined'));

// ── BODY PARSING ──────────────────────────────────────────────
// Raw body needed for Zoom webhook signature verification
app.use('/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ── HEALTH CHECK ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'NexusIT API' });
});

// ── ROUTES ────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/bookings',    strictLimiter, bookingRoutes);
app.use('/api/consultants', consultantRoutes);
app.use('/webhooks',        webhookRoutes);

// ── ERROR HANDLER ─────────────────────────────────────────────
app.use(errorHandler);

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 NexusIT API running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
