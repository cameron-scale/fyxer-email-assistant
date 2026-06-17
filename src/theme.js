// theme.js
// All the colors, spacing and font sizes the app uses live here in one place.
// If you ever want to recolor the whole app, this is the only file you touch.

export const colors = {
  // Backgrounds (dark, modern, a bit playful)
  bg: '#0B1020',
  bgElevated: '#151B2E',
  card: '#1B2237',
  cardPressed: '#222B45',
  border: 'rgba(255,255,255,0.08)',

  // Text
  text: '#F4F6FB',
  textDim: '#9AA3B8',
  textFaint: '#5C6680',

  // Brand
  brand: '#6C8CFF',
  brandSoft: 'rgba(108,140,255,0.16)',

  // Priority colors (used everywhere for the little pills)
  urgent: '#FF5C7A',
  urgentSoft: 'rgba(255,92,122,0.16)',
  important: '#FFB454',
  importantSoft: 'rgba(255,180,84,0.16)',
  fyi: '#46D6B6',
  fyiSoft: 'rgba(70,214,182,0.16)',
  noise: '#7A89B8',
  noiseSoft: 'rgba(122,137,184,0.14)',

  // Swipe action colors
  archive: '#46D6B6',
  snooze: '#FFB454',
  done: '#6C8CFF',
};

export const space = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
};

export const font = {
  h1: 30,
  h2: 22,
  title: 17,
  body: 15,
  small: 13,
  tiny: 11,
};

// Gradient pairs used for headers / buttons
export const gradients = {
  brand: ['#6C8CFF', '#9B6CFF'],
  urgent: ['#FF5C7A', '#FF8A5C'],
  calm: ['#151B2E', '#0B1020'],
};
