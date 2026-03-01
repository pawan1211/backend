// ── services/zoom.js ──────────────────────────────────────────
//  Zoom API v2 integration using Server-to-Server OAuth
//  Docs: https://developers.zoom.us/docs/api/
// ─────────────────────────────────────────────────────────────

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const ZOOM_API = 'https://api.zoom.us/v2';
const TOKEN_URL = 'https://zoom.us/oauth/token';

// ── OAuth token cache ──────────────────────────────────────
let tokenCache = { token: null, expiresAt: 0 };

const getAccessToken = async () => {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const credentials = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');

  const { data } = await axios.post(
    `${TOKEN_URL}?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    null,
    { headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,  // refresh 60s early
  };

  return tokenCache.token;
};

// ── Zoom API client ────────────────────────────────────────
const zoomApi = async (method, path, body = null) => {
  const token = await getAccessToken();
  const { data } = await axios({
    method,
    url: `${ZOOM_API}${path}`,
    data: body,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return data;
};

// ── createMeeting ──────────────────────────────────────────
//  Creates a Zoom meeting and returns join/start URLs + password.
export const createZoomMeeting = async ({
  topic,
  scheduledAt,        // ISO string in UTC
  durationMins = 60,
  hostEmail,          // consultant's email (must be a Zoom user in your account)
  clientName,
}) => {
  const startTime = new Date(scheduledAt).toISOString().replace('.000', '');

  const meeting = await zoomApi('POST', `/users/${hostEmail}/meetings`, {
    topic: `NexusIT: ${topic.slice(0, 80)}`,
    type: 2,  // Scheduled
    start_time: startTime,
    duration: durationMins,
    timezone: 'UTC',
    password: generatePassword(),
    agenda: `Consultation with ${clientName}`,
    settings: {
      host_video: true,
      participant_video: true,
      join_before_host: false,
      waiting_room: true,
      auto_recording: 'none',
      mute_upon_entry: true,
    },
  });

  return {
    meetingId:   String(meeting.id),
    joinUrl:     meeting.join_url,
    startUrl:    meeting.start_url,
    password:    meeting.password,
  };
};

// ── deleteMeeting ──────────────────────────────────────────
export const deleteZoomMeeting = async (meetingId) => {
  try {
    await zoomApi('DELETE', `/meetings/${meetingId}`);
    return { success: true };
  } catch (err) {
    // Zoom returns 404 if meeting already ended — treat as success
    if (err.response?.status === 404) return { success: true };
    throw err;
  }
};

// ── updateMeeting ──────────────────────────────────────────
export const updateZoomMeeting = async (meetingId, { scheduledAt, durationMins }) => {
  const startTime = new Date(scheduledAt).toISOString().replace('.000', '');
  await zoomApi('PATCH', `/meetings/${meetingId}`, {
    start_time: startTime,
    duration: durationMins,
    timezone: 'UTC',
  });
  return { success: true };
};

// ── Password helper ────────────────────────────────────────
const generatePassword = () =>
  Math.random().toString(36).slice(2, 8).toUpperCase();
