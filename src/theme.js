// theme.js
// All the colors, spacing and font sizes the app uses live here in one place.
// The palette follows the "ScaleMail" design: a deep navy app background with
// clean white email cards and colored category bands.

export const colors = {
  // App backgrounds (deep navy)
  bg: '#0C0F1E',
  bgElevated: '#151B2E',
  headerGlow: '#1A2140',

  // Light surfaces (cards, sheets, detail view)
  surface: '#FFFFFF',
  surface2: '#F5F5F7',
  surface3: '#EAEAEF',
  hairline: '#E5E5EA',

  // Accent
  blue: '#0071E3',
  blueLight: '#E8F1FE',

  // Ink (text on light surfaces)
  ink: '#1D1D1F',
  ink2: '#48484A',
  ink3: '#8E8E93',
  ink4: '#AEAEB2',

  // Text on the dark app background
  onDark: '#FFFFFF',
  onDarkDim: 'rgba(255,255,255,0.45)',
  onDarkFaint: 'rgba(255,255,255,0.3)',
  onDarkBorder: 'rgba(255,255,255,0.1)',
  onDarkFill: 'rgba(255,255,255,0.06)',

  tabBar: 'rgba(10,12,24,0.985)',
  star: '#FFD60A',

  // ── Legacy tokens kept so the triage deck + older bits still render ──
  card: '#1B2237',
  cardPressed: '#222B45',
  border: 'rgba(255,255,255,0.08)',
  text: '#F4F6FB',
  textDim: '#9AA3B8',
  textFaint: '#5C6680',
  brand: '#0071E3',
  brandSoft: 'rgba(0,113,227,0.16)',
  urgent: '#FF5C7A',
  urgentSoft: 'rgba(255,92,122,0.16)',
  important: '#FFB454',
  importantSoft: 'rgba(255,180,84,0.16)',
  fyi: '#46D6B6',
  fyiSoft: 'rgba(70,214,182,0.16)',
  noise: '#7A89B8',
  noiseSoft: 'rgba(122,137,184,0.14)',
  archive: '#46D6B6',
  snooze: '#FFB454',
  done: '#0071E3',
};

export const space = { xs: 4, sm: 8, md: 14, lg: 20, xl: 28 };

export const radius = { sm: 10, md: 16, lg: 20, xl: 24, pill: 999 };

export const font = {
  h1: 30, h2: 22, title: 17, body: 15, small: 13, tiny: 11,
  // A serif stack for the email letter body (matches the mockup).
  serif: undefined, // use default serif via fontFamily where needed
};

export const gradients = {
  brand: ['#0071E3', '#34AADC'],
  urgent: ['#FF5C7A', '#FF8A5C'],
  calm: ['#151B2E', '#0B1020'],
  header: ['#1A2140', 'rgba(26,33,64,0)'],
  avatar: ['#3A82F6', '#0055CC'],
};
