const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const path = require('path');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const fetchFn = typeof fetch === 'function'
  ? fetch.bind(globalThis)
  : (...args) => import('node-fetch').then(({ default: fetchModule }) => fetchModule(...args));

const app = express();
const PORT = process.env.PORT || 5005;
const AUTH_ROOT = process.env.WWEBJS_AUTH_PATH || './.wwebjs_auth';
const HEADLESS = process.env.WWEBJS_HEADLESS !== 'false';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';
const MAX_SESSIONS = parseInt(process.env.MAX_WORKER_SESSIONS || '5', 10);
const API_BASE_URL = process.env.API_BASE_URL || process.env.MASSENDER_API_URL || null;
const WORKER_API_KEY = process.env.WORKER_API_KEY || process.env.SESSION_KEY || null;

const sessions = new Map();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

function buildAuthPath(sessionId) {
  return path.join(AUTH_ROOT, sessionId);
}

function buildLinkedDevices(client) {
  const devices = new Set();
  if (client?.info?.pushname) {
    devices.add(client.info.pushname);
  }
  if (client?.info?.wid?.user) {
    devices.add(client.info.wid.user);
  }
  return Array.from(devices);
}

function serializeState(state) {
  return {
    status: state.status,
    qr: state.qrDataUrl,
    lastSeen: state.lastSeen,
    lastQrAt: state.lastQrAt,
    lastError: state.lastError,
    linkedDevices: state.linkedDevices,
    deviceName: state.deviceName,
  };
}

function formatInboundPhone(raw) {
  if (!raw || typeof raw !== 'string' || !raw.endsWith('@c.us')) {
    return null;
  }
  const digits = raw.replace('@c.us', '').replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
}

async function notifyAutomation(state, message) {
  if (!API_BASE_URL || !WORKER_API_KEY) {
    return;
  }
  if (message.fromMe || !message.from) {
    return;
  }
  const phone = formatInboundPhone(message.from);
  if (!phone) {
    return;
  }
  const timestampSeconds = typeof message.timestamp === 'number' ? message.timestamp : Date.now() / 1000;
  const payload = {
    session_id: state.id,
    contact_phone: phone,
    message: typeof message.body === 'string' ? message.body : '',
    timestamp: new Date(timestampSeconds * 1000).toISOString(),
  };
  console.log(`[${state.id}] forwarding inbound from ${phone}: "${payload.message}"`);

  try {
    const response = await fetchFn(`${API_BASE_URL}/wa/inbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Key': WORKER_API_KEY,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.warn(`[${state.id}] Automation webhook responded with status ${response.status}`);
    }
  } catch (err) {
    console.error(`[${state.id}] Failed to deliver inbound message`, err);
  }
}

function scheduleReinitialize(state, delay = 1000) {
  if (state.restarting) {
    return;
  }
  state.restarting = true;
  setTimeout(() => {
    console.log(`[${state.id}] Reinitializing WhatsApp client`);
    state.status = 'initializing';
    state.qrDataUrl = null;
    state.lastError = null;
    state.initPromise = state.client.initialize()
      .catch((err) => {
        console.error(`[${state.id}] Failed to reinitialize client`, err);
        state.status = 'error';
        state.lastError = String(err);
      })
      .finally(() => {
        state.restarting = false;
      });
  }, delay);
}

function attachEventHandlers(state) {
  const { client, id } = state;

  client.on('loading_screen', (percent, message) => {
    console.log(`[${id}] Loading screen`, percent, message);
  });

  client.on('qr', async (qr) => {
    console.log(`[${id}] QR received`);
    state.status = 'waiting';
    state.lastSeen = null;
    state.lastError = null;
    state.lastQrAt = new Date().toISOString();
    try {
      state.qrDataUrl = await QRCode.toDataURL(qr);
    } catch (err) {
      console.error(`[${id}] Failed to encode QR`, err);
      state.qrDataUrl = null;
    }
  });

  client.on('authenticated', () => {
    console.log(`[${id}] Client authenticated`);
    state.status = 'linked';
    state.lastError = null;
  });

  client.on('ready', () => {
    console.log(`[${id}] Client ready`);
    state.status = 'linked';
    state.qrDataUrl = null;
    state.lastSeen = new Date().toISOString();
    state.lastError = null;
    state.deviceName = client.info?.pushname || client.info?.wid?.user || null;
    state.linkedDevices = buildLinkedDevices(client);
    state.restarting = false;
  });

  client.on('auth_failure', (msg) => {
    console.error(`[${id}] Authentication failure`, msg);
    state.status = 'auth_failure';
    state.qrDataUrl = null;
    state.lastError = typeof msg === 'string' ? msg : 'Authentication failure';
    scheduleReinitialize(state, 2000);
  });

  client.on('disconnected', (reason) => {
    console.warn(`[${id}] Client disconnected`, reason);
    state.status = 'disconnected';
    state.qrDataUrl = null;
    state.lastSeen = null;
    state.lastError = typeof reason === 'string' ? reason : String(reason);
    scheduleReinitialize(state, 2000);
  });

  client.on('message', (message) => {
    void notifyAutomation(state, message);
  });
}

function createSession(sessionId) {
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error('session_cap_reached');
  }

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: buildAuthPath(sessionId), clientId: sessionId }),
    puppeteer: {
      headless: HEADLESS,
      executablePath: CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    },
  });

  const state = {
    id: sessionId,
    client,
    status: 'initializing',
    qrDataUrl: null,
    lastSeen: null,
    lastQrAt: null,
    lastError: null,
    linkedDevices: [],
    deviceName: null,
    initPromise: null,
    restarting: false,
  };

  attachEventHandlers(state);

  state.initPromise = client.initialize().catch((err) => {
    console.error(`[${sessionId}] Failed to initialize client`, err);
    state.status = 'error';
    state.lastError = String(err);
    throw err;
  });

  sessions.set(sessionId, state);
  return state;
}

async function destroySession(sessionId) {
  const state = sessions.get(sessionId);
  if (!state) {
    return;
  }
  sessions.delete(sessionId);
  try {
    await state.client.logout();
  } catch (err) {
    console.warn(`[${sessionId}] Logout error`, err);
  }
  try {
    await state.client.destroy();
  } catch (err) {
    console.warn(`[${sessionId}] Destroy error`, err);
  }
}

function ensureSession(sessionId, res) {
  const state = sessions.get(sessionId);
  if (!state) {
    res.status(404).json({ error: 'Session not initialized' });
    return null;
  }
  return state;
}

async function listGroups(client) {
  const chats = await client.getChats();
  return chats
    .filter((chat) => chat.isGroup)
    .map((chat) => ({
      id: chat.id._serialized,
      name: chat.name || chat.contact?.pushname || chat.contact?.name || chat.id.user,
      participant_count: chat.participants ? chat.participants.length : 0,
    }));
}

async function getGroupMembers(client, groupName) {
  const chats = await client.getChats();
  const match = chats.find(
    (chat) => chat.isGroup && (chat.name === groupName || chat.id._serialized === groupName)
  );
  if (!match) {
    return null;
  }

  const participants = match.participants || [];
  const members = await Promise.all(
    participants.map(async (participant) => {
      const contact = await client.getContactById(participant.id._serialized);
      const phone = `+${participant.id.user}`;
      return {
        name: contact.pushname || contact.name || contact.shortName || null,
        phone_e164: phone,
      };
    })
  );
  return members;
}

async function sendMessage(client, state, { to, body, mediaUrl, documentUrl }) {
  const chatId = formatPhone(to);

  const tasks = [];
  if (body && body.trim().length > 0) {
    tasks.push(client.sendMessage(chatId, body.trim()));
  }

  if (mediaUrl) {
    tasks.push(sendMedia(client, chatId, mediaUrl));
  }

  if (documentUrl) {
    tasks.push(sendMedia(client, chatId, documentUrl, true));
  }

  if (tasks.length === 0) {
    throw new Error('Nothing to send');
  }

  await Promise.all(tasks);
  state.lastSeen = new Date().toISOString();
}

async function sendGroupMessage(client, state, { groupId, body, mediaUrl, documentUrl }) {
  const tasks = [];

  if (body && body.trim()) {
    tasks.push(client.sendMessage(groupId, body.trim()));
  }

  if (mediaUrl) {
    tasks.push(sendMedia(client, groupId, mediaUrl));
  }

  if (documentUrl) {
    tasks.push(sendMedia(client, groupId, documentUrl, true));
  }

  if (tasks.length === 0) {
    throw new Error('Nothing to send');
  }

  await Promise.all(tasks);
  state.lastSeen = new Date().toISOString();
}

async function sendMedia(client, chatId, url, forceDocument = false) {
  let media;
  try {
    media = await MessageMedia.fromUrl(url, { unsafeMime: true });
  } catch (err) {
    err.retryable = true;
    throw err;
  }

  if (forceDocument && media.mimetype !== 'application/pdf') {
    media.mimetype = media.mimetype || 'application/octet-stream';
  }
  return client.sendMessage(chatId, media, { sendMediaAsDocument: forceDocument });
}

function formatPhone(to) {
  const trimmed = String(to).trim();
  if (!trimmed) {
    throw new Error('Empty phone');
  }
  let digits = trimmed;
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  }
  digits = digits.replace(/\D/g, '');
  if (digits.length < 8) {
    throw new Error('Invalid phone number');
  }
  return `${digits}@c.us`;
}

app.post('/sessions/:id/init', (req, res) => {
  const sessionId = req.params.id;
  if (sessions.has(sessionId)) {
    return res.json(serializeState(sessions.get(sessionId)));
  }

  try {
    const state = createSession(sessionId);
    if (req.body?.label) {
      console.log(`[${sessionId}] Initializing session for ${req.body.label}`);
    } else {
      console.log(`[${sessionId}] Initializing session`);
    }
    return res.json(serializeState(state));
  } catch (err) {
    if (err.message === 'session_cap_reached') {
      return res.status(409).json({ error: 'Worker session cap reached' });
    }
    console.error(`[${sessionId}] Failed to create session`, err);
    return res.status(500).json({ error: 'Failed to start session' });
  }
});

app.get('/sessions/:id/status', (req, res) => {
  const sessionId = req.params.id;
  const state = sessions.get(sessionId);
  if (!state) {
    return res.status(404).json({ error: 'Session not initialized' });
  }
  return res.json(serializeState(state));
});

app.post('/sessions/:id/logout', async (req, res) => {
  const sessionId = req.params.id;
  await destroySession(sessionId);
  res.json({ status: 'ok' });
});

app.post('/sessions/:id/send', async (req, res) => {
  const sessionId = req.params.id;
  const state = ensureSession(sessionId, res);
  if (!state) {
    return;
  }

  if (state.status !== 'linked') {
    return res.status(409).json({ error: 'WhatsApp session not linked' });
  }

  const { to, body, mediaUrl, documentUrl } = req.body || {};
  if (!to) {
    return res.status(400).json({ error: 'Recipient phone required' });
  }

  try {
    await sendMessage(state.client, state, { to, body, mediaUrl, documentUrl });
    res.json({ status: 'sent' });
  } catch (err) {
    console.error(`[${sessionId}] Failed to send message`, err);
    const statusCode = err.retryable ? 503 : 400;
    res.status(statusCode).json({ error: err.message || 'Failed to send message' });
  }
});

app.get('/sessions/:id/groups', async (req, res) => {
  const sessionId = req.params.id;
  const state = ensureSession(sessionId, res);
  if (!state) {
    return;
  }
  if (state.status !== 'linked') {
    return res.status(409).json({ error: 'WhatsApp session not linked' });
  }
  try {
    const groups = await listGroups(state.client);
    res.json({ groups });
  } catch (err) {
    console.error(`[${sessionId}] Failed to list groups`, err);
    res.status(500).json({ error: 'Failed to list groups' });
  }
});

app.post('/sessions/:id/groups/members', async (req, res) => {
  const sessionId = req.params.id;
  const state = ensureSession(sessionId, res);
  if (!state) {
    return;
  }
  if (state.status !== 'linked') {
    return res.status(409).json({ error: 'WhatsApp session not linked' });
  }
  const { groupName } = req.body || {};
  if (!groupName) {
    return res.status(400).json({ error: 'groupName is required' });
  }

  try {
    const members = await getGroupMembers(state.client, groupName);
    if (!members) {
      return res.status(404).json({ error: 'Group not found' });
    }
    res.json({ members });
  } catch (err) {
    console.error(`[${sessionId}] Failed to fetch group members`, err);
    res.status(500).json({ error: 'Failed to fetch group members' });
  }
});

app.post('/sessions/:id/groups/send', async (req, res) => {
  const sessionId = req.params.id;
  const state = ensureSession(sessionId, res);
  if (!state) {
    return;
  }
  if (state.status !== 'linked') {
    return res.status(409).json({ error: 'WhatsApp session not linked' });
  }

  const { groupId, body, mediaUrl, documentUrl } = req.body || {};
  if (!groupId) {
    return res.status(400).json({ error: 'groupId is required' });
  }

  try {
    await sendGroupMessage(state.client, state, { groupId, body, mediaUrl, documentUrl });
    res.json({ status: 'sent' });
  } catch (err) {
    console.error(`[${sessionId}] Failed to send group message`, err);
    const statusCode = err.retryable ? 503 : 400;
    res.status(statusCode).json({ error: err.message || 'Failed to send group message' });
  }
});

app.post('/sessions/:id/groups/:groupId/members/send', async (req, res) => {
  const sessionId = req.params.id;
  const state = ensureSession(sessionId, res);
  if (!state) {
    return;
  }
  if (state.status !== 'linked') {
    return res.status(409).json({ error: 'WhatsApp session not linked' });
  }

  const { phone_e164: phone, body, mediaUrl, documentUrl } = req.body || {};
  if (!phone) {
    return res.status(400).json({ error: 'phone_e164 is required' });
  }

  try {
    await sendMessage(state.client, state, { to: phone, body, mediaUrl, documentUrl });
    res.json({ status: 'sent' });
  } catch (err) {
    console.error(`[${sessionId}] Failed to send member message`, err);
    const statusCode = err.retryable ? 503 : 400;
    res.status(statusCode).json({ error: err.message || 'Failed to send member message' });
  }
});

app.listen(PORT, () => {
  console.log(`WhatsApp worker listening on ${PORT}`);
});
