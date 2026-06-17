// bands.js — maps Brisk's smart priority output to ScaleMail's colored "bands".
// Every email card has a gradient band at the top; its color comes from the
// email's priority bucket + category, so the visuals are driven by the sorting.

export const BANDS = {
  urgent:  { grad: ['#D32F2F', '#8B0000'], tagBg: '#FEF0F0', tagColor: '#D32F2F' },
  clients: { grad: ['#1E6FD9', '#0055B3'], tagBg: '#EBF3FF', tagColor: '#0071E3' },
  work:    { grad: ['#7C3AED', '#5B21B6'], tagBg: '#F3EEFF', tagColor: '#7C3AED' },
  finance: { grad: ['#059669', '#065F46'], tagBg: '#E8F8F1', tagColor: '#059669' },
  teal:    { grad: ['#0891B2', '#164E63'], tagBg: '#E8F6FA', tagColor: '#0891B2' },
  amber:   { grad: ['#D97706', '#92400E'], tagBg: '#FFF8E1', tagColor: '#C77D00' },
  slate:   { grad: ['#475569', '#1E293B'], tagBg: '#F2F4F6', tagColor: '#475569' },
};

// Which band a category maps to.
const CATEGORY_BAND = {
  'To Respond': 'clients',
  Meeting: 'work',
  Notification: 'finance',
  Newsletter: 'teal',
  Promotions: 'amber',
  FYI: 'slate',
};

// Returns { key, grad, tagBg, tagColor, label } for an email's card band + tag.
export function bandFor(email) {
  const p = email.priority || {};
  if (p.bucket === 'urgent') {
    return { key: 'urgent', ...BANDS.urgent, label: 'Urgent' };
  }
  const key = CATEGORY_BAND[p.category] || 'slate';
  return { key, ...BANDS[key], label: p.category || 'FYI' };
}
