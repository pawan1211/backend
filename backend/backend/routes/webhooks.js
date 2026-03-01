// ── routes/webhooks.js ────────────────────────────────────────
//  POST /webhooks/zoom   – handles Zoom event webhooks
//  Verifies signature using ZOOM_WEBHOOK_SECRET_TOKEN
// ─────────────────────────────────────────────────────────────

import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db/pool.js';

const router = Router();

// Zoom webhook signature verification
const verifyZoomSignature = (req) => {
  const signature = req.headers['x-zm-signature'];
  const timestamp  = req.headers['x-zm-request-timestamp'];
  const message    = `v0:${timestamp}:${req.body}`;
  const hash       = crypto.createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN).update(message).digest('hex');
  return signature === `v0=${hash}`;
};

router.post('/zoom', async (req, res) => {
  // Always respond 200 quickly to prevent Zoom retries
  res.status(200).json({ received: true });

  if (!verifyZoomSignature(req)) {
    console.warn('[Zoom Webhook] Invalid signature — ignoring.');
    return;
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return;
  }

  const { event: eventType, payload } = event;

  switch (eventType) {
    case 'meeting.started': {
      const meetingId = String(payload?.object?.id);
      await query(
        `UPDATE bookings SET status = 'confirmed' WHERE zoom_meeting_id = $1 AND status = 'confirmed'`,
        [meetingId]
      ).catch(console.error);
      break;
    }

    case 'meeting.ended': {
      const meetingId = String(payload?.object?.id);
      await query(
        `UPDATE bookings SET status = 'completed' WHERE zoom_meeting_id = $1`,
        [meetingId]
      ).catch(console.error);
      console.log(`[Zoom] Meeting ${meetingId} ended → booking marked completed.`);
      break;
    }

    case 'meeting.participant_joined':
      console.log(`[Zoom] Participant joined meeting ${payload?.object?.id}`);
      break;

    default:
      console.log(`[Zoom] Unhandled event: ${eventType}`);
  }
});

export default router;
