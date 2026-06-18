// signature.js — turns a structured signature (name, title, links, photo, layout)
// into both plain text (for previews/templates) and HTML (for sending real email).
// No coding needed by the user — they fill fields and pick a layout.

export const ACCENTS = ['#0071E3', '#7C3AED', '#059669', '#D97706', '#D32F2F', '#0891B2', '#1D1D1F'];
export const LAYOUTS = ['Classic', 'Modern', 'Minimal'];

export const EMPTY_SIG = {
  name: '', title: '', company: '', phone: '', email: '', website: '',
  photoUrl: '', accent: '#0071E3', layout: 'Classic', tagline: '',
};

export function hasSignature(sig) {
  if (!sig) return false;
  return Boolean(sig.name || sig.title || sig.company || sig.phone || sig.email || sig.website);
}

function cleanUrl(u = '') {
  const t = u.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
function prettyUrl(u = '') {
  return u.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

// Plain-text version (used in previews and as a fallback in templated replies).
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

// Combine a typed message with the signature, for sending.
export function composeText(bodyText, sig) {
  const s = signatureText(sig);
  return s ? `${bodyText.trim()}\n\n${s}` : bodyText;
}
export function composeHtml(bodyText, sig) {
  const bodyHtml = esc(bodyText.trim()).replace(/\n/g, '<br>');
  const sigHtml = signatureHtml(sig);
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1d1d1f">${bodyHtml}</div>${sigHtml ? `<br>${sigHtml}` : ''}`;
}

// HTML version (used when actually sending — supports the photo + clickable links).
export function signatureHtml(sig) {
  if (!hasSignature(sig)) return '';
  const accent = sig.accent || '#0071E3';
  const name = esc(sig.name);
  const role = [esc(sig.title), esc(sig.company)].filter(Boolean).join(', ');
  const contacts = [];
  if (sig.phone) contacts.push(`<a href="tel:${esc(sig.phone.replace(/[^+\d]/g, ''))}" style="color:#555;text-decoration:none">${esc(sig.phone)}</a>`);
  if (sig.email) contacts.push(`<a href="mailto:${esc(sig.email)}" style="color:${accent};text-decoration:none">${esc(sig.email)}</a>`);
  if (sig.website) contacts.push(`<a href="${esc(cleanUrl(sig.website))}" style="color:${accent};text-decoration:none">${esc(prettyUrl(sig.website))}</a>`);
  const photo = sig.photoUrl
    ? `<img src="${esc(cleanUrl(sig.photoUrl))}" width="56" height="56" style="border-radius:50%;display:block" alt="">`
    : '';

  const nameBlock =
    `<div style="font-weight:700;font-size:15px;color:#1d1d1f">${name}</div>` +
    (role ? `<div style="font-size:13px;color:#555">${role}</div>` : '') +
    (sig.tagline ? `<div style="font-size:12px;color:#888;font-style:italic;margin-top:2px">${esc(sig.tagline)}</div>` : '') +
    (contacts.length ? `<div style="font-size:13px;margin-top:6px">${contacts.join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</div>` : '');

  if (sig.layout === 'Minimal') {
    return `<div style="font-family:Arial,sans-serif;border-top:2px solid ${accent};padding-top:8px;margin-top:6px">${nameBlock}</div>`;
  }
  if (sig.layout === 'Modern') {
    return `<table style="font-family:Arial,sans-serif;margin-top:6px"><tr>
      <td style="background:${accent};width:4px;border-radius:2px">&nbsp;</td>
      <td style="padding-left:12px">${photo ? `<div style="margin-bottom:6px">${photo}</div>` : ''}${nameBlock}</td></tr></table>`;
  }
  // Classic — photo left, details right
  return `<table style="font-family:Arial,sans-serif;margin-top:6px"><tr>
    ${photo ? `<td style="padding-right:12px;vertical-align:top">${photo}</td>` : ''}
    <td style="vertical-align:top;border-left:${photo ? 'none' : `3px solid ${accent}`};padding-left:${photo ? '0' : '10px'}">${nameBlock}</td>
    </tr></table>`;
}
