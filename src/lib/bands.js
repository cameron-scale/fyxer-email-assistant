// bands.js — maps an email's CATEGORY (not its sender) to ScaleMail's colored
// "band" + tag pill. The band gradient and the tag pill always use the same
// color, so the color language is learnable in one session:
//   Urgent → red · Action Needed → blue · Meeting → indigo · Client → deep blue
//   Newsletter → slate · FYI → slate
// (Action Needed vs Client are two blues, Newsletter vs FYI two slates — bright
// vs deep keeps them distinguishable, per the design spec.)

export const BANDS = {
  Urgent:          { grad: ['#E5484D', '#B91C1C'], tagBg: '#FEECEC', tagColor: '#D32F2F' },
  'Action Needed': { grad: ['#0071E3', '#0055B3'], tagBg: '#EAF3FF', tagColor: '#0071E3' },
  Meeting:         { grad: ['#4338CA', '#312E81'], tagBg: '#EEF2FF', tagColor: '#4338CA' },
  Client:          { grad: ['#1D4ED8', '#1E3A8A'], tagBg: '#E7EFFE', tagColor: '#1D4ED8' },
  Newsletter:      { grad: ['#475569', '#1E293B'], tagBg: '#F1F3F6', tagColor: '#475569' },
  FYI:             { grad: ['#64748B', '#334155'], tagBg: '#F1F3F6', tagColor: '#475569' },
};

// Returns { key, grad, tagBg, tagColor, label } for an email's card band + tag,
// driven purely by its consolidated category.
export function bandFor(email) {
  const cat = email.priority?.category || 'FYI';
  const b = BANDS[cat] || BANDS.FYI;
  return { key: cat, ...b, label: cat };
}
