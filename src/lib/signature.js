// signature.js — turns a structured signature into both plain text and rich,
// designer-grade HTML for real email. Built to look like premium signature
// templates: framed photos, two-tone names, icon contact rows, social badges,
// dividers and company blocks — not flat text. No coding needed by the user.

export const ACCENTS = ['#0071E3', '#7C3AED', '#059669', '#D97706', '#D32F2F', '#0891B2', '#0B2447', '#111111'];

// Six genuinely different designs. `key` is stored on the signature.
export const TEMPLATES = [
  { key: 'modern',    label: 'Modern',    blurb: 'Ring photo + icons' },
  { key: 'executive', label: 'Executive', blurb: 'Accent panel + logo' },
  { key: 'bold',      label: 'Bold',      blurb: 'Color banner, white' },
  { key: 'classic',   label: 'Classic',   blurb: 'Corporate + divider' },
  { key: 'card',      label: 'Card',      blurb: 'Bordered, accent strip' },
  { key: 'minimal',   label: 'Minimal',   blurb: 'Compact one-liner' },
];
export const LAYOUTS = TEMPLATES.map((t) => t.label); // back-compat

export const SOCIALS = [
  { key: 'linkedin',  color: '#0A66C2', label: 'in' },
  { key: 'twitter',   color: '#111111', label: 'X' },
  { key: 'instagram', color: '#E4405F', label: 'ig' },
  { key: 'facebook',  color: '#1877F2', label: 'f' },
];

export const EMPTY_SIG = {
  name: '', title: '', company: '', phone: '', email: '', website: '', location: '',
  linkedin: '', twitter: '', instagram: '', facebook: '',
  photoUrl: '', photoUri: '',
  accent: '#0071E3', layout: 'modern', tagline: '',
};

export function hasSignature(sig) {
  if (!sig) return false;
  return Boolean(sig.name || sig.title || sig.company || sig.phone || sig.email || sig.website);
}

export function templateKey(sig) {
  const raw = String(sig?.layout || 'modern').toLowerCase();
  return TEMPLATES.some((t) => t.key === raw) ? raw : 'modern';
}

export function photoSource(sig) {
  if (sig?.photoUri) return sig.photoUri;
  if (sig?.photoUrl) return cleanUrl(sig.photoUrl);
  return '';
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function splitName(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: name || '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

export const CONTACT_ICON = { phone: '📞', email: '✉️', website: '🌐', location: '📍' };

// Pretty-print a phone number:
//   10 digits        → "(123) 456-7890"
//   11+ (country code)→ "+1 (123) 456-7890"
//   trailing ext     → "… EXT. 4"
// Anything we can't confidently parse is returned tidied but unchanged.
export function formatPhone(raw = '') {
  const s = String(raw).trim();
  if (!s) return '';
  const extMatch = s.match(/(?:ext\.?|extension|x)\s*[:.]?\s*(\d+)\s*$/i);
  const ext = extMatch ? extMatch[1] : '';
  const rest = ext ? s.slice(0, extMatch.index) : s;
  const digits = rest.replace(/\D/g, '');
  let out;
  if (digits.length === 10) {
    out = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length > 10) {
    const cc = digits.slice(0, digits.length - 10);
    const local = digits.slice(digits.length - 10);
    out = `+${cc} (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  } else {
    out = rest.trim(); // too short to reformat — leave as typed
  }
  return ext ? `${out} EXT. ${ext}` : out;
}

// The contact lines a signature shows, in order, each with an emoji + link.
export function contactItems(sig) {
  const items = [];
  if (sig.phone) items.push({ icon: CONTACT_ICON.phone, text: formatPhone(sig.phone), href: `tel:${String(sig.phone).replace(/[^+\d]/g, '')}` });
  if (sig.email) items.push({ icon: CONTACT_ICON.email, text: sig.email, href: `mailto:${sig.email}` });
  if (sig.website) items.push({ icon: CONTACT_ICON.website, text: prettyUrl(sig.website), href: cleanUrl(sig.website) });
  if (sig.location) items.push({ icon: CONTACT_ICON.location, text: sig.location, href: '' });
  return items;
}

export function socialUrl(kind, val) {
  const v = String(val || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  const h = v.replace(/^@/, '');
  return {
    linkedin: `https://www.linkedin.com/in/${h}`,
    twitter: `https://x.com/${h}`,
    instagram: `https://www.instagram.com/${h}`,
    facebook: `https://www.facebook.com/${h}`,
  }[kind] || '';
}

export function socialItems(sig) {
  return SOCIALS.map((s) => ({ ...s, url: socialUrl(s.key, sig[s.key]) })).filter((s) => s.url);
}

function cleanUrl(u = '') {
  const t = u.trim();
  if (!t) return '';
  if (/^data:/i.test(t)) return t;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
function prettyUrl(u = '') {
  return u.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
}
function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Scale Mail footer on every email ──────────────────────────────────────────
export const SCALEMAIL_FOOTER_TEXT = 'Sent using ScaleMail, The Best Email Software in Existence';
export const SCALEMAIL_FOOTER_HTML =
  `<div style="margin-top:22px;font-size:11px;line-height:1.4;color:#9aa0a6;font-family:Arial,Helvetica,sans-serif">` +
  `Sent using <span style="color:#0B2447;font-weight:700">Scale</span>` +
  `<span style="color:#0071E3;font-weight:700">Mail</span>, The Best Email Software in Existence` +
  `</div>`;

export function signatureText(sig) {
  if (!hasSignature(sig)) return '';
  const role = [sig.title, sig.company].filter(Boolean).join(', ');
  const lines = [sig.name, role, sig.tagline, formatPhone(sig.phone), sig.email, prettyUrl(sig.website), sig.location]
    .map((s) => (s || '').trim()).filter(Boolean);
  return lines.join('\n');
}

export function composeText(bodyText, sig) {
  const parts = [String(bodyText || '').trim()];
  const s = signatureText(sig);
  if (s) parts.push(s);
  parts.push(SCALEMAIL_FOOTER_TEXT);
  return parts.filter(Boolean).join('\n\n');
}
export function composeHtml(bodyText, sig) {
  const bodyHtml = esc(String(bodyText || '').trim()).replace(/\n/g, '<br>');
  const sigHtml = signatureHtml(sig);
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1d1d1f">${bodyHtml}</div>` +
    (sigHtml ? `<br>${sigHtml}` : '') +
    SCALEMAIL_FOOTER_HTML
  );
}

// ── HTML building blocks ──────────────────────────────────────────────────────
const FAM = 'font-family:Arial,Helvetica,sans-serif';

function photoCircle(src, size, ring) {
  if (!src) return '';
  return `<img src="${esc(src)}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:50%;border:3px solid ${ring};display:block;object-fit:cover" alt="">`;
}
function photoSquare(src, size, ring) {
  if (!src) return '';
  return `<img src="${esc(src)}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:10px;border:3px solid ${ring};display:block;object-fit:cover" alt="">`;
}
function monogramCircle(name, size, bg, fg) {
  const fs = Math.round(size * 0.4);
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:${fg};${FAM};font-weight:700;font-size:${fs}px;text-align:center;line-height:${size}px">${esc(initials(name))}</div>`;
}

function nameHtml(sig, { dark = '#111111', accent = '#0071E3', size = 18 } = {}) {
  const { first, last } = splitName(sig.name);
  return `<span style="font-size:${size}px;font-weight:800;letter-spacing:0.3px;${FAM}">` +
    `<span style="color:${dark}">${esc(first)}</span>` +
    (last ? ` <span style="color:${accent}">${esc(last)}</span>` : '') + `</span>`;
}
function titleLine(sig, color) {
  if (!sig.title) return '';
  return `<div style="font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${color};margin-top:3px">${esc(sig.title)}</div>`;
}
function companyLine(sig, color = '#555') {
  if (!sig.company) return '';
  return `<div style="font-size:13px;color:${color};margin-top:2px">${esc(sig.company)}</div>`;
}
function taglineLine(sig) {
  if (!sig.tagline) return '';
  return `<div style="font-size:12px;color:#888;font-style:italic;margin-top:6px">${esc(sig.tagline)}</div>`;
}
function rule(accent, w = 42) {
  return `<div style="border-top:2px solid ${accent};width:${w}px;margin:8px 0"></div>`;
}

function contactsTable(sig, linkColor) {
  const rows = contactItems(sig).map((c) => {
    const txt = c.href
      ? `<a href="${esc(c.href)}" style="color:${linkColor};text-decoration:none">${esc(c.text)}</a>`
      : `<span style="color:#555">${esc(c.text)}</span>`;
    return `<tr><td style="padding:2px 0;font-size:13px;line-height:1.6;color:#555;${FAM}">` +
      `<span style="display:inline-block;width:22px">${c.icon}</span>${txt}</td></tr>`;
  }).join('');
  return rows ? `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>` : '';
}

function socialBadges(sig, { onDark = false } = {}) {
  const items = socialItems(sig);
  if (!items.length) return '';
  const badges = items.map((s) => {
    const bg = onDark ? '#ffffff' : s.color;
    const fg = onDark ? s.color : '#ffffff';
    return `<a href="${esc(s.url)}" style="display:inline-block;width:26px;height:26px;border-radius:50%;background:${bg};color:${fg};text-align:center;line-height:26px;font-size:12px;font-weight:700;text-decoration:none;margin-right:6px;${FAM}">${s.label}</a>`;
  }).join('');
  return `<div style="margin-top:10px">${badges}</div>`;
}

// AI styles: each one is *generated by Claude* from a reference image, not a
// fixed template. The user picks one and we call the backend to design it.
export const AI_STYLES = [
  { key: 'luxury', label: 'Luxury', blurb: 'Warm, upscale, architectural' },
  { key: 'bold', label: 'Bold', blurb: 'Blue, angular, brand-forward' },
  { key: 'card', label: 'Card', blurb: 'Centered photo + call-to-action' },
  { key: 'executive', label: 'Executive', blurb: 'Script sign-off + banner' },
];

// The fields the AI generator needs. Sent to the backend on each generation.
export function signatureDetails(sig) {
  const out = {};
  ['name', 'title', 'company', 'tagline', 'email', 'website', 'location',
    'linkedin', 'twitter', 'instagram', 'facebook', 'accent'].forEach((k) => {
    if (sig[k]) out[k] = sig[k];
  });
  if (sig.phone) out.phone = formatPhone(sig.phone);
  const photo = photoSource(sig);
  if (photo && /^https?:\/\//i.test(photo)) out.photoUrl = photo; // only hosted URLs embed reliably
  return out;
}

// ── Rendering ─────────────────────────────────────────────────────────────────
export function signatureHtml(sig) {
  if (!hasSignature(sig)) return '';
  // An AI-designed signature wins: use its HTML verbatim.
  if (sig.html) return sig.html;
  const accent = sig.accent || '#0071E3';
  const src = photoSource(sig);
  const t = templateKey(sig);

  if (t === 'minimal') {
    return `<div style="${FAM}">` +
      `<div style="border-top:2px solid ${accent};padding-top:8px;display:inline-block">` +
      nameHtml(sig, { accent, size: 15 }) +
      (sig.title ? `<span style="color:#888;font-size:13px"> · ${esc(sig.title)}${sig.company ? `, ${esc(sig.company)}` : ''}</span>` : '') +
      `<div style="margin-top:4px">${contactsTable(sig, accent)}</div>` +
      socialBadges(sig) + `</div></div>`;
  }

  if (t === 'modern') {
    const photo = src ? photoCircle(src, 84, accent) : monogramCircle(sig.name, 84, accent, '#fff');
    return `<table cellpadding="0" cellspacing="0" style="${FAM};border-collapse:collapse"><tr>` +
      `<td style="padding-right:18px;vertical-align:middle">${photo}</td>` +
      `<td style="vertical-align:middle;border-left:2px solid #ededf2;padding-left:18px">` +
        nameHtml(sig, { accent, size: 19 }) + titleLine(sig, accent) + companyLine(sig) + taglineLine(sig) +
        `<div style="margin-top:8px">${contactsTable(sig, accent)}</div>` + socialBadges(sig) +
      `</td></tr></table>`;
  }

  if (t === 'executive') {
    const photo = src ? photoCircle(src, 72, 'rgba(255,255,255,0.6)') : monogramCircle(sig.name, 72, 'rgba(255,255,255,0.18)', '#fff');
    return `<table cellpadding="0" cellspacing="0" style="${FAM};border-collapse:collapse"><tr>` +
      `<td style="background:${accent};padding:20px 22px;text-align:center;vertical-align:middle;border-radius:12px 0 0 12px">` +
        photo +
        (sig.company ? `<div style="color:#fff;font-weight:800;font-size:14px;margin-top:10px;letter-spacing:0.5px">${esc(sig.company)}</div>` : '') +
        (sig.tagline ? `<div style="color:rgba(255,255,255,0.8);font-size:10px;letter-spacing:1px;text-transform:uppercase;margin-top:2px">${esc(sig.tagline)}</div>` : '') +
        socialBadges(sig, { onDark: true }) +
      `</td>` +
      `<td style="background:#f6f8fb;padding:20px 24px;vertical-align:middle;border-radius:0 12px 12px 0">` +
        nameHtml(sig, { dark: '#0b2447', accent, size: 20 }) + titleLine(sig, accent) +
        `<div style="margin-top:10px">${contactsTable(sig, accent)}</div>` +
      `</td></tr></table>`;
  }

  if (t === 'bold') {
    const photo = src ? photoCircle(src, 60, 'rgba(255,255,255,0.85)') : monogramCircle(sig.name, 60, 'rgba(255,255,255,0.2)', '#fff');
    const { first, last } = splitName(sig.name);
    return `<table cellpadding="0" cellspacing="0" style="${FAM};border-collapse:collapse">` +
      `<tr><td style="background:${accent};padding:18px 22px;border-radius:12px 12px 0 0">` +
        `<table cellpadding="0" cellspacing="0"><tr>` +
          `<td style="padding-right:14px;vertical-align:middle">${photo}</td>` +
          `<td style="vertical-align:middle">` +
            `<div style="font-size:20px;font-weight:800;letter-spacing:0.3px;color:#fff">${esc(first)}${last ? ` <span style="color:rgba(255,255,255,0.75)">${esc(last)}</span>` : ''}</div>` +
            (sig.title ? `<div style="font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:rgba(255,255,255,0.85);margin-top:3px">${esc(sig.title)}${sig.company ? ` · ${esc(sig.company)}` : ''}</div>` : '') +
            socialBadges(sig, { onDark: true }) +
          `</td>` +
        `</tr></table>` +
      `</td></tr>` +
      `<tr><td style="padding:14px 22px;border:1px solid #ececf1;border-top:none;border-radius:0 0 12px 12px">` +
        taglineLine(sig) + contactsTable(sig, accent) +
      `</td></tr></table>`;
  }

  if (t === 'card') {
    const photo = src ? photoSquare(src, 70, '#fff') : monogramCircle(sig.name, 70, accent, '#fff');
    return `<table cellpadding="0" cellspacing="0" style="${FAM};border-collapse:separate;border:1px solid #e8e8ee;border-radius:14px;overflow:hidden;max-width:440px">` +
      `<tr><td style="height:7px;background:${accent};line-height:7px;font-size:0">&nbsp;</td></tr>` +
      `<tr><td style="padding:18px">` +
        `<table cellpadding="0" cellspacing="0"><tr>` +
          `<td style="padding-right:16px;vertical-align:top">${photo}</td>` +
          `<td style="vertical-align:top">` +
            nameHtml(sig, { accent, size: 18 }) + titleLine(sig, accent) + companyLine(sig) + taglineLine(sig) +
            `<div style="margin-top:8px">${contactsTable(sig, accent)}</div>` + socialBadges(sig) +
          `</td>` +
        `</tr></table>` +
      `</td></tr></table>`;
  }

  // classic — corporate, name + rule, contacts, divider, company/social block
  return `<table cellpadding="0" cellspacing="0" style="${FAM};border-collapse:collapse"><tr>` +
    (src ? `<td style="padding-right:16px;vertical-align:top">${photoCircle(src, 64, accent)}</td>` : '') +
    `<td style="vertical-align:top">` +
      nameHtml(sig, { accent, size: 18 }) + titleLine(sig, accent) + companyLine(sig) + rule(accent) +
      taglineLine(sig) + contactsTable(sig, accent) +
    `</td>` +
    `<td style="vertical-align:top;border-left:2px solid #ededf2;padding-left:16px;padding-top:2px">` +
      (sig.company ? `<div style="font-size:14px;font-weight:800;color:#111">${esc(sig.company)}</div>` : '') +
      (sig.website ? `<div style="font-size:12px;color:${accent};margin-top:2px">${esc(prettyUrl(sig.website))}</div>` : '') +
      socialBadges(sig) +
    `</td>` +
    `</tr></table>`;
}
