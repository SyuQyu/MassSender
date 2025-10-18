const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const app = express();
const PORT = process.env.PORT || 5005;
const AUTH_PATH = process.env.WWEBJS_AUTH_PATH || './.wwebjs_auth';
const HEADLESS = process.env.WWEBJS_HEADLESS !== 'false';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';

let currentStatus = 'initializing';
let qrDataUrl = null;
let lastSeen = null;

async function listGroups() {
  const chats = await client.getChats();
  return chats
    .filter((chat) => chat.isGroup)
    .map((chat) => ({
      id: chat.id._serialized,
      name: chat.name || chat.contact?.pushname || chat.contact?.name || chat.id.user,
      participant_count: chat.participants ? chat.participants.length : 0,
    }));
}

async function sendGroupMessage({ groupId, body, mediaUrl, documentUrl }) {
  const tasks = [];

  if (body && body.trim()) {
    tasks.push(client.sendMessage(groupId, body.trim()));
  }

  if (mediaUrl) {
    tasks.push(sendMedia(groupId, mediaUrl));
  }

  if (documentUrl) {
    tasks.push(sendMedia(groupId, documentUrl, true));
  }

  if (tasks.length === 0) {
    throw new Error('Nothing to send');
  }

  await Promise.all(tasks);
  lastSeen = new Date().toISOString();
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
  puppeteer: {
    headless: HEADLESS,
    executablePath: CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  },
});

function scheduleReinitialize(delay = 1000) {
  setTimeout(() => {
    console.log('Reinitializing WhatsApp client');
    client.initialize().catch((err) => {
      console.error('Failed to reinitialize client', err);
    });
  }, delay);
}

client.on('loading_screen', (percent, message) => {
  console.log('Loading screen', percent, message);
});

client.on('qr', async (qr) => {
  console.log('QR received');
  currentStatus = 'waiting';
  lastSeen = null;
  try {
    qrDataUrl = await QRCode.toDataURL(qr);
  } catch (err) {
    console.error('Failed to encode QR', err);
    qrDataUrl = null;
  }
});

client.on('ready', () => {
  console.log('Client is ready');
  currentStatus = 'linked';
  qrDataUrl = null;
  lastSeen = new Date().toISOString();
});

client.on('authenticated', () => {
  console.log('Client authenticated');
  currentStatus = 'linked';
});

client.on('auth_failure', (msg) => {
  console.error('Auth failure', msg);
  currentStatus = 'auth_failure';
  qrDataUrl = null;
  scheduleReinitialize(2000);
});

client.on('disconnected', (reason) => {
  console.warn('Client disconnected', reason);
  currentStatus = 'disconnected';
  qrDataUrl = null;
  lastSeen = null;
  scheduleReinitialize(2000);
});

client.initialize();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/status', (_req, res) => {
  res.json({ status: currentStatus, qr: qrDataUrl, lastSeen });
});

app.post('/send', async (req, res) => {
  if (currentStatus !== 'linked') {
    return res.status(409).json({ error: 'WhatsApp session not linked' });
  }

  const { to, body, mediaUrl, documentUrl } = req.body || {};
  if (!to) {
    return res.status(400).json({ error: 'Recipient phone required' });
  }

  try {
    await sendMessage({ to, body, mediaUrl, documentUrl });
    res.json({ status: 'sent' });
  } catch (err) {
    console.error('Failed to send message', err);
    const statusCode = err.retryable ? 503 : 400;
    res.status(statusCode).json({ error: err.message || 'Failed to send message' });
  }
});

app.post('/group-members', async (req, res) => {
  if (currentStatus !== 'linked') {
    return res.status(409).json({ error: 'WhatsApp session not linked' });
  }
  const { groupName } = req.body || {};
  if (!groupName) {
    return res.status(400).json({ error: 'groupName is required' });
  }

  try {
    const members = await getGroupMembers(groupName);
    if (!members) {
      return res.status(404).json({ error: 'Group not found' });
    }
    res.json({ members });
  } catch (err) {
    console.error('Failed to fetch group members', err);
    res.status(500).json({ error: 'Failed to fetch group members' });
  }
});

app.get('/groups', async (_req, res) => {
  if (currentStatus !== 'linked') {
    return res.status(409).json({ error: 'WhatsApp session not linked' });
  }
  try {
    const groups = await listGroups();
    res.json({ groups });
  } catch (err) {
    console.error('Failed to list groups', err);
    res.status(500).json({ error: 'Failed to list groups' });
  }
});

app.post('/groups/send', async (req, res) => {
  if (currentStatus !== 'linked') {
    return res.status(409).json({ error: 'WhatsApp session not linked' });
  }

  const { groupId, body, mediaUrl, documentUrl } = req.body || {};
  if (!groupId) {
    return res.status(400).json({ error: 'groupId is required' });
  }

  try {
    await sendGroupMessage({ groupId, body, mediaUrl, documentUrl });
    res.json({ status: 'sent' });
  } catch (err) {
    console.error('Failed to send group message', err);
    const statusCode = err.retryable ? 503 : 400;
    res.status(statusCode).json({ error: err.message || 'Failed to send group message' });
  }
});

app.post('/logout', async (_req, res) => {
  try {
    await client.logout();
  } catch (err) {
    console.warn('Logout error', err);
  }

  currentStatus = 'disconnected';
  qrDataUrl = null;
  lastSeen = null;

  scheduleReinitialize(2000);
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`WhatsApp worker listening on ${PORT}`);
});

async function sendMessage({ to, body, mediaUrl, documentUrl }) {
  const chatId = formatPhone(to);

  const tasks = [];
  if (body && body.trim().length > 0) {
    tasks.push(client.sendMessage(chatId, body.trim()));
  }

  if (mediaUrl) {
    tasks.push(sendMedia(chatId, mediaUrl));
  }

  if (documentUrl) {
    tasks.push(sendMedia(chatId, documentUrl, true));
  }

  if (tasks.length === 0) {
    throw new Error('Nothing to send');
  }

  await Promise.all(tasks);
  lastSeen = new Date().toISOString();
}

async function sendMedia(chatId, url, forceDocument = false) {
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

async function getGroupMembers(groupName) {
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
        consent: true,
      };
    })
  );
  return members;
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
