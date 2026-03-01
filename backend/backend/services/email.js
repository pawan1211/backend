// ── services/email.js ─────────────────────────────────────────
//  SendGrid transactional email service
//  All templates are defined inline (no external template IDs needed)
//  but can be swapped for SendGrid Dynamic Templates.
// ─────────────────────────────────────────────────────────────

import sgMail from '@sendgrid/mail';
import { query } from '../db/pool.js';
import dotenv from 'dotenv';

dotenv.config();
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const FROM = {
  email: process.env.SENDGRID_FROM_EMAIL || 'noreply@nexusit.com',
  name:  'NexusIT Consulting',
};

// ── Send helper with DB logging ───────────────────────────────
const send = async ({ to, subject, html, bookingId, templateName }) => {
  const msg = { to, from: FROM, subject, html };
  try {
    const [res] = await sgMail.send(msg);
    const msgId = res?.headers?.['x-message-id'] || null;

    if (bookingId) {
      await query(
        `INSERT INTO email_logs (booking_id, recipient, template_name, sendgrid_msg_id, status)
         VALUES ($1, $2, $3, $4, 'sent')`,
        [bookingId, to, templateName, msgId]
      );
    }
    return { success: true, messageId: msgId };
  } catch (err) {
    console.error('[SendGrid Error]', err.response?.body || err.message);
    if (bookingId) {
      await query(
        `INSERT INTO email_logs (booking_id, recipient, template_name, status)
         VALUES ($1, $2, $3, 'failed')`,
        [bookingId, to, templateName]
      );
    }
    throw err;
  }
};

// ── Email Templates ───────────────────────────────────────────

const baseStyle = `
  font-family: 'Georgia', serif;
  background: #0a0a0a;
  color: #e8e4dc;
  max-width: 600px;
  margin: 0 auto;
  padding: 40px 32px;
`;

const goldText = `color: #c9a84c;`;

// 1. Booking Confirmation (to client)
export const sendBookingConfirmation = async ({
  bookingId, clientEmail, clientName, consultantName,
  consultantRole, scheduledAt, zoomJoinUrl, referenceCode, topic,
}) => {
  const date = new Date(scheduledAt).toLocaleString('en-US', {
    dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC'
  });

  const html = `
  <div style="${baseStyle}">
    <div style="border-bottom: 1px solid #1e1e1e; padding-bottom: 24px; margin-bottom: 32px;">
      <span style="font-size:22px; font-weight:700; letter-spacing:3px;">NEXUS<span style="${goldText}">IT</span></span>
    </div>
    <h1 style="font-size:28px; font-weight:700; margin:0 0 8px;">Booking Confirmed ✅</h1>
    <p style="color:#888; font-family: system-ui; margin:0 0 32px;">Hi ${clientName}, your consultation has been scheduled.</p>

    <div style="background:#111; border:1px solid #1e1e1e; border-radius:10px; padding:24px; margin-bottom:24px;">
      <table style="width:100%; border-collapse:collapse; font-family:system-ui; font-size:14px;">
        <tr><td style="color:#666; padding:8px 0;">Reference</td><td style="${goldText} text-align:right;">${referenceCode}</td></tr>
        <tr><td style="color:#666; padding:8px 0;">Consultant</td><td style="color:#e8e4dc; text-align:right;">${consultantName}</td></tr>
        <tr><td style="color:#666; padding:8px 0;">Specialty</td><td style="color:#e8e4dc; text-align:right;">${consultantRole}</td></tr>
        <tr><td style="color:#666; padding:8px 0;">Date & Time</td><td style="color:#e8e4dc; text-align:right;">${date} UTC</td></tr>
        <tr><td style="color:#666; padding:8px 0;">Duration</td><td style="color:#e8e4dc; text-align:right;">60 minutes</td></tr>
        <tr><td style="color:#666; padding:8px 0;">Topic</td><td style="color:#e8e4dc; text-align:right;">${topic}</td></tr>
      </table>
    </div>

    ${zoomJoinUrl ? `
    <div style="text-align:center; margin: 32px 0;">
      <a href="${zoomJoinUrl}" style="background:#c9a84c; color:#000; padding:14px 32px; border-radius:4px; font-weight:700; text-decoration:none; font-family:system-ui; display:inline-block;">
        Join Video Call →
      </a>
      <p style="color:#555; font-size:12px; font-family:system-ui; margin-top:12px;">Link becomes active 10 minutes before your session.</p>
    </div>
    ` : ''}

    <p style="color:#555; font-family:system-ui; font-size:13px; margin-top:40px; border-top:1px solid #1e1e1e; padding-top:20px;">
      Need to reschedule? Reply to this email or visit your dashboard at least 24 hours in advance.<br/>
      © 2025 NexusIT Consulting · Serving 47 countries
    </p>
  </div>`;

  return send({ to: clientEmail, subject: `Confirmed: Your NexusIT Consultation – ${referenceCode}`, html, bookingId, templateName: 'booking_confirmation' });
};

// 2. Consultant Notification
export const sendConsultantNotification = async ({
  bookingId, consultantEmail, consultantName, clientName,
  clientCompany, scheduledAt, zoomStartUrl, topic,
}) => {
  const date = new Date(scheduledAt).toLocaleString('en-US', {
    dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC'
  });

  const html = `
  <div style="${baseStyle}">
    <div style="border-bottom: 1px solid #1e1e1e; padding-bottom: 24px; margin-bottom: 32px;">
      <span style="font-size:22px; font-weight:700; letter-spacing:3px;">NEXUS<span style="${goldText}">IT</span></span>
    </div>
    <h1 style="font-size:24px; margin:0 0 8px;">New Booking Assigned 📅</h1>
    <p style="color:#888; font-family:system-ui; margin:0 0 24px;">Hi ${consultantName}, a client has booked a session with you.</p>

    <div style="background:#111; border:1px solid #1e1e1e; border-radius:10px; padding:24px; margin-bottom:24px;">
      <table style="width:100%; border-collapse:collapse; font-family:system-ui; font-size:14px;">
        <tr><td style="color:#666; padding:8px 0;">Client</td><td style="color:#e8e4dc; text-align:right;">${clientName}</td></tr>
        <tr><td style="color:#666; padding:8px 0;">Company</td><td style="color:#e8e4dc; text-align:right;">${clientCompany || 'Individual'}</td></tr>
        <tr><td style="color:#666; padding:8px 0;">Date & Time</td><td style="color:#e8e4dc; text-align:right;">${date} UTC</td></tr>
        <tr><td style="color:#666; padding:8px 0;">Topic</td><td style="${goldText} text-align:right;">${topic}</td></tr>
      </table>
    </div>

    ${zoomStartUrl ? `
    <div style="text-align:center; margin:32px 0;">
      <a href="${zoomStartUrl}" style="background:#c9a84c; color:#000; padding:14px 32px; border-radius:4px; font-weight:700; text-decoration:none; font-family:system-ui;">
        Start Meeting (Host Link)
      </a>
    </div>
    ` : ''}
  </div>`;

  return send({ to: consultantEmail, subject: `New Booking: ${clientName} – ${date}`, html, bookingId, templateName: 'consultant_notification' });
};

// 3. Booking Reminder (send 24h before)
export const sendReminder = async ({ bookingId, clientEmail, clientName, consultantName, scheduledAt, zoomJoinUrl }) => {
  const date = new Date(scheduledAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' });

  const html = `
  <div style="${baseStyle}">
    <div style="border-bottom: 1px solid #1e1e1e; padding-bottom: 24px; margin-bottom: 32px;">
      <span style="font-size:22px; letter-spacing:3px;">NEXUS<span style="${goldText}">IT</span></span>
    </div>
    <h1 style="font-size:24px; margin:0 0 8px;">⏰ Reminder: Tomorrow's Consultation</h1>
    <p style="color:#888; font-family:system-ui; margin: 0 0 24px;">Hi ${clientName}, your session with <strong style="${goldText}">${consultantName}</strong> is in 24 hours.</p>
    <div style="background:#111; border:1px solid rgba(201,168,76,0.3); border-radius:10px; padding:20px; margin-bottom:24px; font-family:system-ui;">
      <p style="color:#888; margin:0 0 4px; font-size:13px;">Scheduled for</p>
      <p style="color:#e8e4dc; font-size:18px; margin:0;">${date} UTC</p>
    </div>
    ${zoomJoinUrl ? `<div style="text-align:center;"><a href="${zoomJoinUrl}" style="background:#c9a84c; color:#000; padding:14px 32px; border-radius:4px; font-weight:700; text-decoration:none; font-family:system-ui;">Join Meeting →</a></div>` : ''}
  </div>`;

  return send({ to: clientEmail, subject: `Reminder: Your NexusIT consultation tomorrow with ${consultantName}`, html, bookingId, templateName: 'reminder_24h' });
};

// 4. Cancellation notice
export const sendCancellationEmail = async ({ bookingId, clientEmail, clientName, referenceCode, reason }) => {
  const html = `
  <div style="${baseStyle}">
    <h1 style="font-size:24px; margin:0 0 8px;">Booking Cancelled</h1>
    <p style="color:#888; font-family:system-ui; margin:0 0 24px;">Hi ${clientName}, booking <strong style="${goldText}">${referenceCode}</strong> has been cancelled.</p>
    ${reason ? `<p style="color:#666; font-family:system-ui;">Reason: ${reason}</p>` : ''}
    <p style="color:#888; font-family:system-ui; margin-top:24px;">You can book a new session at any time from your dashboard.</p>
  </div>`;

  return send({ to: clientEmail, subject: `Booking Cancelled – ${referenceCode}`, html, bookingId, templateName: 'booking_cancelled' });
};
