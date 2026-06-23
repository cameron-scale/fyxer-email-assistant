// labels.js — the sender classifications offered by the "Classify" action (in the
// multi-select bar and a single email's More menu). Keys are stored in
// prefs.senderLabels and read by the priority engine (src/lib/priority.js).
export const CLASSIFY_LABELS = [
  { key: 'important', name: 'Important', icon: 'star', color: '#FFB454' },
  { key: 'client', name: 'Client', icon: 'briefcase', color: '#1D4ED8' },
  { key: 'vendor', name: 'Vendor', icon: 'cube', color: '#0891B2' },
  { key: 'coworker', name: 'Coworker', icon: 'people', color: '#4338CA' },
  { key: 'employee', name: 'Employee', icon: 'person', color: '#059669' },
  { key: 'newsletter', name: 'Newsletter', icon: 'newspaper', color: '#475569' },
  { key: 'junk', name: 'Junk', icon: 'ban', color: '#FF453A' },
];

export const labelName = (key) => (CLASSIFY_LABELS.find((l) => l.key === key) || {}).name || key;
