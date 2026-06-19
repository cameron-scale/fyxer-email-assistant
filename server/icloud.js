// icloud.js — iCloud Mail over IMAP (read) + SMTP (send). Apple has no OAuth for
// mail, so the user signs in with their iCloud email + an app-specific password
// (generated at appleid.apple.com). We carry those creds in the account's
// "refreshToken" slot as a JSON string so the rest of the app's plumbing is
// unchanged. Everything here is best-effort and connection-scoped.

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { createDAVClient } from 'tsdav';

const IMAP = { host: 'imap.mail.me.com', port: 993, secure: true };
const SMTP = { host: 'smtp.mail.me.com', port: 587, secure: false };

// App folder kind -> iCloud IMAP mailbox name.
const FOLDER = { inbox: 'INBOX', sent: 'Sent Messages', drafts: 'Drafts', archive: 'Archive', junk: 'Junk', deleted: 'Deleted Messages' };

function creds(refreshToken) {
  let c = null;
  try { c = JSON.parse(refreshToken); } catch (e) { c = null; }
  if (!c || !c.email || !c.password) throw new Error('Missing iCloud credentials');
  return c;
}

async function withClient(refreshToken, fn) {
  const { email, password } = creds(refreshToken);
  const client = new ImapFlow({ ...IMAP, auth: { user: email, pass: password }, logger: false });
  await client.connect();
  try { return await fn(client, email); }
  finally { try { await client.logout(); } catch (e) { try { client.close(); } catch (e2) {} } }
}

function detectMeeting(s = '') {
  const m = String(s).match(/https?:\/\/[^\s"'<>]*(zoom\.us\/j\/|teams\.microsoft\.com\/l\/meetup|meet\.google\.com\/)[^\s"'<>]*/i);
  if (!m) return null;
  const url = m[0];
  const provider = /zoom/i.test(url) ? 'Zoom' : /teams/i.test(url) ? 'Teams' : 'Meet';
  return { provider, url };
}

// Validate the credentials by opening (and closing) an IMAP connection.
export async function icloudVerify(refreshToken) {
  await withClient(refreshToken, async () => {});
  return { ok: true };
}

// Recent messages from a folder. Envelope-only (fast) — bodies load on open.
export async function icloudInbox(refreshToken, { limit = 50, folder = 'inbox', skip = 0 } = {}) {
  return withClient(refreshToken, async (client) => {
    const mbox = FOLDER[folder] || 'INBOX';
    const lock = await client.getMailboxLock(mbox);
    try {
      const status = await client.status(mbox, { messages: true, unseen: true });
      const total = status.messages || 0;
      const emails = [];
      if (total > 0) {
        const end = Math.max(1, total - skip);
        const start = Math.max(1, end - limit + 1);
        for await (const msg of client.fetch(`${start}:${end}`, { uid: true, envelope: true, flags: true, internalDate: true })) {
          const env = msg.envelope || {};
          const from = (env.from && env.from[0]) || null;
          const when = env.date || msg.internalDate || new Date();
          emails.push({
            id: String(msg.uid),
            account: 'icloud',
            from: from ? `${from.name || ''} <${from.address || ''}>`.trim() : '',
            subject: env.subject || '(no subject)',
            preview: '',
            body: '',
            date: (when instanceof Date ? when : new Date(when)).toISOString(),
            read: !!(msg.flags && msg.flags.has('\\Seen')),
            flagged: !!(msg.flags && msg.flags.has('\\Flagged')),
            threadKey: null,
          });
        }
      }
      emails.reverse(); // newest first
      const end = Math.max(1, total - skip);
      const start = Math.max(1, end - limit + 1);
      return { emails, unreadCount: status.unseen || 0, totalCount: total, hasMore: start > 1 };
    } finally { lock.release(); }
  });
}

// Full body (html + text) + attachment list for one message (by UID).
export async function icloudMessage(refreshToken, uid, folder = 'inbox') {
  return withClient(refreshToken, async (client) => {
    const mbox = FOLDER[folder] || 'INBOX';
    const lock = await client.getMailboxLock(mbox);
    try {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) throw new Error('message not found');
      const parsed = await simpleParser(msg.source);
      const html = parsed.html || (parsed.textAsHtml || '');
      const text = parsed.text || '';
      const attachments = (parsed.attachments || [])
        .filter((a) => a.filename && (a.contentDisposition || 'attachment') !== 'inline')
        .map((a, i) => ({ id: String(i), name: a.filename, size: a.size || 0, contentType: a.contentType || '' }));
      return { body: text, bodyHtml: html || '', meeting: detectMeeting(html || text), invite: null, attachments };
    } finally { lock.release(); }
  });
}

// Download the Nth attachment's bytes (base64) from a message.
export async function icloudAttachment(refreshToken, uid, attachmentId, folder = 'inbox') {
  return withClient(refreshToken, async (client) => {
    const mbox = FOLDER[folder] || 'INBOX';
    const lock = await client.getMailboxLock(mbox);
    try {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) throw new Error('message not found');
      const parsed = await simpleParser(msg.source);
      const list = (parsed.attachments || []).filter((a) => a.filename);
      const att = list[Number(attachmentId)] || list[0];
      if (!att) throw new Error('attachment not found');
      return { base64: att.content.toString('base64'), contentType: att.contentType || 'application/octet-stream' };
    } finally { lock.release(); }
  });
}

// read | unread | archive | trash | junk — flags or moves between mailboxes.
export async function icloudAction(refreshToken, uid, action, folder = 'inbox') {
  return withClient(refreshToken, async (client) => {
    const mbox = FOLDER[folder] || 'INBOX';
    const lock = await client.getMailboxLock(mbox);
    try {
      const u = { uid: String(uid) };
      if (action === 'read') await client.messageFlagsAdd(u, ['\\Seen'], { uid: true });
      else if (action === 'unread') await client.messageFlagsRemove(u, ['\\Seen'], { uid: true });
      else if (action === 'trash') await client.messageMove(u, FOLDER.deleted, { uid: true });
      else if (action === 'archive') await client.messageMove(u, FOLDER.archive, { uid: true });
      else if (action === 'junk') await client.messageMove(u, FOLDER.junk, { uid: true });
      else throw new Error(`unknown action ${action}`);
      return { ok: true };
    } finally { lock.release(); }
  });
}

// The user's IMAP folders, normalized for the drawer.
export async function icloudFolders(refreshToken) {
  return withClient(refreshToken, async (client, email) => {
    const list = await client.list();
    const kindByPath = { INBOX: 'inbox', 'Sent Messages': 'sent', Drafts: 'drafts', Archive: 'archive', Junk: 'junk', 'Deleted Messages': 'deleted' };
    const folders = [];
    for (const f of list) {
      if (f.flags && (f.flags.has('\\Noselect') || f.flags.has('\\NonExistent'))) continue;
      const name = f.path === 'INBOX' ? 'Inbox' : (f.name || f.path);
      let unread = 0;
      try { const s = await client.status(f.path, { unseen: true }); unread = s.unseen || 0; } catch (e) {}
      folders.push({ id: f.path, name, kind: kindByPath[f.path] || null, unread });
    }
    return { email, displayName: email, folders };
  });
}

// ── iCloud Calendar (CalDAV) ────────────────────────────────────────────────
function icsDate(params, val) {
  const m = String(val || '').match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return { iso: null, allDay: false };
  const [, y, mo, d, hh, mm, ss] = m;
  const allDay = /VALUE=DATE/i.test(params || '') || !hh;
  if (allDay) return { iso: `${y}-${mo}-${d}T00:00:00Z`, allDay: true };
  // No tz database here — treat as UTC (Z) or assume UTC for floating/TZID times.
  return { iso: `${y}-${mo}-${d}T${hh}:${mm}:${ss || '00'}Z`, allDay: false };
}

function parseVEvents(data) {
  // Unfold continued lines (RFC5545: a leading space/tab continues the previous line).
  const text = String(data || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const out = [];
  const blocks = text.split('BEGIN:VEVENT').slice(1);
  for (const b of blocks) {
    const body = b.split('END:VEVENT')[0];
    const line = (name) => { const m = body.match(new RegExp(`^${name}([^:\\r\\n]*):(.*)$`, 'mi')); return m ? { params: m[1], val: m[2].trim() } : null; };
    const summary = (line('SUMMARY') || {}).val || '(no title)';
    const ds = line('DTSTART'); const de = line('DTEND');
    if (!ds) continue;
    const start = icsDate(ds.params, ds.val);
    const end = de ? icsDate(de.params, de.val) : { iso: null };
    const loc = (line('LOCATION') || {}).val || '';
    const org = line('ORGANIZER');
    const orgName = org ? ((org.params.match(/CN=([^;:]+)/i) || [])[1] || org.val.replace(/^mailto:/i, '')) : '';
    const status = (line('STATUS') || {}).val || '';
    const join = (body.match(/https?:\/\/[^\s"'<>]*(zoom\.us\/j\/|teams\.microsoft\.com\/l\/meetup|meet\.google\.com\/)[^\s"'<>]*/i) || [])[0] || null;
    out.push({
      id: (line('UID') || {}).val || `${start.iso}-${summary}`,
      subject: summary,
      start: start.iso,
      end: end.iso,
      allDay: !!start.allDay,
      location: loc.replace(/\\,/g, ',').replace(/\\n/g, ' '),
      organizer: orgName,
      isOrganizer: false,
      joinUrl: join,
      response: /CANCELLED/i.test(status) ? 'declined' : 'none',
      attendeeCount: (body.match(/^ATTENDEE/gmi) || []).length,
    });
  }
  return out;
}

export async function icloudCalendar(refreshToken, { start, end }) {
  const { email, password } = creds(refreshToken);
  const client = await createDAVClient({
    serverUrl: 'https://caldav.icloud.com',
    credentials: { username: email, password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
  const calendars = await client.fetchCalendars();
  const events = [];
  for (const calendar of calendars) {
    if (calendar.components && !calendar.components.includes('VEVENT')) continue;
    try {
      const objects = await client.fetchCalendarObjects({ calendar, timeRange: { start: start.toISOString(), end: end.toISOString() } });
      for (const obj of objects) parseVEvents(obj.data).forEach((e) => { if (e.start) events.push(e); });
    } catch (e) { /* skip a calendar that errors */ }
  }
  // Keep only events within the window (CalDAV recurrence can over-return).
  return events.filter((e) => { const t = new Date(e.start).getTime(); return t >= start.getTime() - 86400000 && t <= end.getTime(); });
}

// Send (or reply to) a message via iCloud SMTP.
export async function icloudSend(refreshToken, { toEmail, subject, html, text, inReplyTo }) {
  const { email, password } = creds(refreshToken);
  const transport = nodemailer.createTransport({ ...SMTP, auth: { user: email, pass: password } });
  await transport.sendMail({
    from: email,
    to: toEmail,
    subject: subject || '',
    text: text || undefined,
    html: html || undefined,
    inReplyTo: inReplyTo || undefined,
  });
  return { ok: true };
}
