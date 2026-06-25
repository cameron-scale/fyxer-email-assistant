// tabs.js — the registry of everything that can live in the customizable tab bar,
// plus the picker sections and the default layout. The compose button is NOT in
// here — it's hardcoded in the center of the bar and can't be moved or removed.

export const TAB_DEFS = {
  // ── Mailboxes ──────────────────────────────────────────────────────────────
  Inbox:    { key: 'Inbox',    label: 'Inbox',     icon: 'mail',              color: '#0071E3', desc: 'Your prioritized inbox',     nav: { tab: 'Inbox' } },
  Starred:  { key: 'Starred',  label: 'Starred',   icon: 'star',              color: '#F5A623', desc: 'Flagged & VIP mail',         nav: { tab: 'Starred' } },
  Sent:     { key: 'Sent',     label: 'Sent',      icon: 'paper-plane',       color: '#64748B', desc: "Messages you've sent",       nav: { tab: 'Sent' } },
  Drafts:   { key: 'Drafts',   label: 'Drafts',    icon: 'document-text',     color: '#64748B', desc: 'Unfinished messages',        nav: { tab: 'Drafts' } },
  Triage:   { key: 'Triage',   label: 'Triage',    icon: 'play-forward',      color: '#4338CA', desc: 'Swipe through one by one',    nav: { push: 'Triage' } },
  Archive:  { key: 'Archive',  label: 'Archive',   icon: 'archive',           color: '#2E7D32', desc: 'Archived mail',              nav: { folder: 'archive', name: 'Archive' } },
  Junk:     { key: 'Junk',     label: 'Junk',      icon: 'alert-circle',      color: '#C62828', desc: 'Spam & junk',                nav: { folder: 'junk', name: 'Junk' } },
  // ── Smart Folders (inbox filters) ────────────────────────────────────────────
  Urgent:   { key: 'Urgent',   label: 'Urgent',    icon: 'alert',             color: '#D32F2F', desc: 'Needs attention now',        nav: { filter: 'urgent' } },
  Action:   { key: 'Action',   label: 'Action',    icon: 'checkmark-circle',  color: '#0071E3', desc: 'Needs a reply or action',    nav: { filter: 'Action Needed' } },
  Meetings: { key: 'Meetings', label: 'Meetings',  icon: 'calendar',          color: '#4338CA', desc: 'Invites & scheduling',       nav: { filter: 'Meeting' } },
  Clients:  { key: 'Clients',  label: 'Clients',   icon: 'briefcase',         color: '#1D4ED8', desc: 'Mail from your clients',     nav: { filter: 'Client' } },
  BeAware:  { key: 'BeAware',  label: 'Be Aware',  icon: 'information-circle', color: '#475569', desc: 'FYI — good to know',        nav: { filter: 'FYI' } },
  Irrelevant: { key: 'Irrelevant', label: 'Irrelevant', icon: 'trash-bin',    color: '#64748B', desc: 'Newsletters & promotions',   nav: { filter: 'Newsletter' } },
  // ── VIP ──────────────────────────────────────────────────────────────────────
  VIPSenders: { key: 'VIPSenders', label: 'VIP',   icon: 'ribbon',            color: '#C77D00', desc: 'Mail from your VIP people',  nav: { filter: 'starred' } },
  Digest:   { key: 'Digest',   label: 'Digest',    icon: 'sunny',             color: '#B45309', desc: 'Your daily summary',         nav: { push: 'Digest' } },
  Pinned:   { key: 'Pinned',   label: 'Pinned',    icon: 'bookmark',          color: '#F59E0B', desc: 'Emails you pinned',          nav: { push: 'Pinned' } },
};

export const PICKER_SECTIONS = [
  { title: 'Mailboxes', keys: ['Inbox', 'Starred', 'Sent', 'Drafts', 'Triage', 'Archive', 'Junk', 'Pinned'] },
  { title: 'Smart Folders', keys: ['Urgent', 'Action', 'Meetings', 'Clients', 'BeAware', 'Irrelevant'] },
  { title: 'VIP', keys: ['VIPSenders', 'Digest'] },
];

// 6 slots: 3 left of compose, 3 right. null = empty (invisible in normal mode).
export const DEFAULT_TABS = ['Inbox', 'Starred', 'Triage', 'Sent', 'Drafts', null];

export function normalizeTabs(tabs) {
  const arr = Array.isArray(tabs) ? tabs.slice(0, 6) : [];
  while (arr.length < 6) arr.push(null);
  return arr.map((k) => (k && TAB_DEFS[k] ? k : null));
}
