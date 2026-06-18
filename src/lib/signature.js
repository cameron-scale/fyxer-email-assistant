// signature.js — turns a structured signature (name, title, links, photo, template)
// into both plain text (for previews/templates) and HTML (for sending real email).
// No coding needed by the user — they fill fields, upload a photo, and pick a
// template. Each template is a *genuinely* different design, not a recolor.

export const ACCENTS = ['#0071E3', '#7C3AED', '#059669', '#D97706', '#D32F2F', '#0891B2', '#0B2447', '#1D1D1F'];

// Six distinct designs. `key` is stored on the signature; `blurb` shows in the picker.
export const TEMPLATES = [
  { key: 'classic',   label: 'Classic',   blurb: 'Clean & corporate' },
  { key: 'modern',    label: 'Modern',    blurb: 'Photo + accent bar' },
  { key: 'executive', label: 'Executive', blurb: 'Premium side panel' },
  { key: 'bold',      label: 'Bold',      blurb: 'Color banner, white text' },
  { key: 'card',      label: 'Card',      blurb: 'Bordered, accent header' },
  { key: 'minimal',   label: 'Minimal',   blurb: 'One tidy line' },
];
// Back-compat: some older code/saved prefs reference LAYOUTS / capitalized names.
export const LAYOUTS = TEMPLATES.map((t) => t.label);

export const EMPTY_SIG = {
  name: '', title: '', company: '', phone: '', email: '', website: '',
  photoUrl: '',           // a pasted image URL
  photoUri: '',           // an uploaded photo (data: URI), takes priority
  accent: '#0071E3', layout: 'classic', tagline: '',
};

export function hasSignature(sig) {
  if (!sig) return false;
  return Boolean(sig.name || sig.title || sig.company || sig.phone || sig.email || sig.website);
}

// Normalize old capitalized template names ("Classic") to keys ("classic").
export function templateKey(sig) {
  const raw = String(sig?.layout || 'classic').toLowerCase();
  return TEMPLATES.some((t) => t.key === raw) ? raw : 'classic';
}

export function photoSource(sig) {
  if (sig?.photoUri) return sig.photoUri;           // uploaded (data: URI)
  if (sig?.photoUrl) return cleanUrl(sig.photoUrl); // pasted URL
  return '';
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
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

// ── The footer that rides on every email Scale Mail sends ─────────────────────
// "ScaleMail" keeps the app's two-tone wordmark. On an email's white background
// we use navy for "Scale" (white would be invisible) and the app blue for "Mail".
export const SCALEMAIL_FOOTER_TEXT = 'Sent using ScaleMail, The Best Email Software in Existence';
export const SCALEMAIL_FOOTER_HTML =
  `<div style="margin-top:22px;font-size:11px;line-height:1.4;color:#9aa0a6;font-family:Arial,Helvetica,sans-serif">` +
  `Sent using <span style="color:#0B2447;font-weight:700">Scale</span>` +
  `<span style="color:#0071E3;font-weight:700">Mail</span>, The Best Email Software in Existence` +
  `</div>`;

// Plain-text version of the signature (used in previews & templated replies).
export function signatureText(sig) {
  if (!hasSignature(sig)) return '';
  const role = [sig.title, sig.company].filter(Boolean).join(', ');
  const lines = [sig.name, role, sig.tagline, sig.phone, sig.email, prettyUrl(sig.website)]
    .map((s) => (s || '').trim())
    .filter(Boolean);
  return lines.join('\n');
}

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Combine a typed message + signature + Scale Mail footer, for sending.
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

// ── Shared HTML building blocks ───────────────────────────────────────────────
function photoImg(src, size, ring) {
  if (!src) return '';
  const border = ring ? `;border:2px solid ${ring}` : '';
  return `<img src="${esc(src)}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:50%;display:block;object-fit:cover${border}" alt="">`;
}
function monogram(name, size, bg, fg) {
  const fs = Math.round(size * 0.4);
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:${fg};font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:${fs}px;text-align:center;line-height:${size}px">${esc(initials(name))}</div>`;
}
function contactsHtml(sig, accent, opts = {}) {
  const muted = opts.muted || '#555';
  const linkC = opts.link || accent;
  const items = [];
  if (sig.phone) items.push(`<a href="tel:${esc(sig.phone.replace(/[^+\d]/g, ''))}" style="color:${muted};text-decoration:none">${esc(sig.phone)}</a>`);
  if (sig.email) items.push(`<a href="mailto:${esc(sig.email)}" style="color:${linkC};text-decoration:none">${esc(sig.email)}</a>`);
  if (sig.website) items.push(`<a href="${esc(cleanUrl(sig.website))}" style="color:${linkC};text-decoration:none">${esc(prettyUrl(sig.website))}</a>`);
  if (!items.length) return '';
  return `<div style="font-size:13px;color:${muted};margin-top:6px">${items.join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</div>`;
}

// HTML version — used when actually sending. Six distinct templates.
export function signatureHtml(sig) {
  if (!hasSignature(sig)) return '';
  const accent = sig.accent || '#0071E3';
  const name = esc(sig.name);
  const title = esc(sig.title || '');
  const company = esc(sig.company || '');
  const role = [title, company].filter(Boolean).join(', ');
  const tagline = sig.tagline ? `<div style="font-size:12px;color:#888;font-style:italic;margin-top:4px">${esc(sig.tagline)}</div>` : '';
  const src = photoSource(sig);
  const fam = 'font-family:Arial,Helvetica,sans-serif';
  const t = templateKey(sig);

  if (t === 'minimal') {
    return `<div style="${fam};display:inline-block;border-top:2px solid ${accent};padding-top:8px">` +
      `<span style="font-weight:700;color:#111;font-size:14px">${name}</span>` +
      (role ? `<span style="color:#999;font-size:13px"> — ${role}</span>` : '') +
      contactsHtml(sig, accent) + `</div>`;
  }

  if (t === 'modern') {
    return `<table cellpadding="0" cellspacing="0" style="${fam}"><tr>` +
      `<td style="width:4px;background:${accent};border-radius:3px">&nbsp;</td>` +
      `<td style="padding-left:14px;vertical-align:top">` +
        (src ? `<div style="margin-bottom:8px">${photoImg(src, 56)}</div>` : '') +
        `<div style="font-size:16px;font-weight:700;color:#111">${name}</div>` +
        (role ? `<div style="font-size:13px;color:#555;margin-top:1px">${role}</div>` : '') +
        tagline + contactsHtml(sig, accent) +
      `</td></tr></table>`;
  }

  if (t === 'executive') {
    const badge = src ? photoImg(src, 66, 'rgba(255,255,255,0.5)') : monogram(sig.name, 66, 'rgba(255,255,255,0.18)', '#fff');
    return `<table cellpadding="0" cellspacing="0" style="${fam};border-collapse:collapse"><tr>` +
      `<td style="background:${accent};padding:18px 18px;text-align:center;vertical-align:middle;border-radius:10px 0 0 10px">${badge}</td>` +
      `<td style="background:#f6f8fb;padding:16px 20px;vertical-align:top;border-radius:0 10px 10px 0">` +
        `<div style="font-size:18px;font-weight:700;color:#0b2447">${name}</div>` +
        (title ? `<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${accent};font-weight:700;margin-top:4px">${title}</div>` : '') +
        (company ? `<div style="font-size:13px;color:#555;margin-top:3px">${company}</div>` : '') +
        tagline +
        `<div>${contactsHtml(sig, accent)}</div>` +
      `</td></tr></table>`;
  }

  if (t === 'bold') {
    const headPhoto = src ? `<td style="padding-right:12px;vertical-align:middle">${photoImg(src, 50, '#fff')}</td>` : '';
    return `<table cellpadding="0" cellspacing="0" style="${fam};border-collapse:collapse">` +
      `<tr><td style="background:${accent};padding:16px 20px;border-radius:10px 10px 0 0">` +
        `<table cellpadding="0" cellspacing="0"><tr>${headPhoto}<td style="vertical-align:middle">` +
          `<div style="font-size:19px;font-weight:800;color:#fff">${name}</div>` +
          (role ? `<div style="font-size:12px;color:rgba(255,255,255,0.85);margin-top:2px">${role}</div>` : '') +
        `</td></tr></table>` +
      `</td></tr>` +
      `<tr><td style="padding:12px 20px;border:1px solid #ececf1;border-top:none;border-radius:0 0 10px 10px">` +
        (sig.tagline ? `<div style="font-size:12px;color:#888;font-style:italic;margin-bottom:6px">${esc(sig.tagline)}</div>` : '') +
        (contactsHtml(sig, accent) || '<div style="font-size:12px;color:#bbb">&nbsp;</div>') +
      `</td></tr></table>`;
  }

  if (t === 'card') {
    const photoCell = src ? `<td style="padding-right:14px;vertical-align:top">${photoImg(src, 52)}</td>` : '';
    return `<table cellpadding="0" cellspacing="0" style="${fam};border-collapse:separate;border:1px solid #e8e8ee;border-radius:12px;overflow:hidden">` +
      `<tr><td style="height:6px;background:${accent};line-height:6px;font-size:0">&nbsp;</td></tr>` +
      `<tr><td style="padding:16px">` +
        `<table cellpadding="0" cellspacing="0"><tr>${photoCell}<td style="vertical-align:top">` +
          `<div style="font-size:16px;font-weight:700;color:#111">${name}</div>` +
          (role ? `<div style="font-size:13px;color:#555;margin-top:1px">${role}</div>` : '') +
          tagline + contactsHtml(sig, accent) +
        `</td></tr></table>` +
      `</td></tr></table>`;
  }

  // classic (default) — photo or accent rule, name, thin divider, contacts
  const photoCell = src ? `<td style="padding-right:14px;vertical-align:top">${photoImg(src, 60)}</td>` : '';
  return `<table cellpadding="0" cellspacing="0" style="${fam}"><tr>${photoCell}` +
    `<td style="vertical-align:top">` +
      `<div style="font-size:16px;font-weight:700;color:#111">${name}</div>` +
      (role ? `<div style="font-size:13px;color:#555;margin-top:1px">${role}</div>` : '') +
      `<div style="border-top:2px solid ${accent};width:44px;margin:8px 0"></div>` +
      (sig.tagline ? `<div style="font-size:12px;color:#888;font-style:italic;margin-bottom:6px">${esc(sig.tagline)}</div>` : '') +
      contactsHtml(sig, accent) +
    `</td></tr></table>`;
}
