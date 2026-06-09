export interface Palette {
  bg:         string;
  bgDeep:     string;
  surface:    string;
  surface2:   string;
  hairline:   string;
  hairline2:  string;
  primary:    string;
  primaryHi:  string;
  primaryGlow:string;
  accentBlue: string;
  text:       string;
  textSec:    string;
  textTer:    string;
  success:    string;
  successBg:  string;
  danger:     string;
  dangerBg:   string;
  warn:       string;
  warnBg:     string;
  star:       string;
  headerGradient: string;
  cardShadow: string;
  overlay:    string;
}

// Quiet, neutral palette: graphite + paper, no halos or branded blues.
// `primaryGlow` and `headerGradient` are kept on the interface for
// compatibility but resolved to transparent / surface to flatten the UI.

export const darkPalette: Palette = {
  bg:         '#0A0A0A',
  bgDeep:     '#000000',
  surface:    '#161616',
  surface2:   '#1F1F1F',
  hairline:   'rgba(255,255,255,0.08)',
  hairline2:  'rgba(255,255,255,0.14)',
  primary:    '#27272A',
  primaryHi:  '#3F3F46',
  primaryGlow:'transparent',
  accentBlue: '#A1A1AA',
  text:       '#FAFAFA',
  textSec:    '#A1A1AA',
  textTer:    '#71717A',
  success:    '#22C55E',
  successBg:  'rgba(34,197,94,0.12)',
  danger:     '#EF4444',
  dangerBg:   'rgba(239,68,68,0.10)',
  warn:       '#F59E0B',
  warnBg:     'rgba(245,158,11,0.12)',
  star:       '#E5B14C',
  headerGradient: '#0A0A0A',
  cardShadow: 'rgba(0,0,0,0.35)',
  overlay:    'rgba(0,0,0,0.55)',
};

export const lightPalette: Palette = {
  bg:         '#FFFFFF',
  bgDeep:     '#FAFAFA',
  surface:    '#FAFAFA',
  surface2:   '#F4F4F5',
  hairline:   'rgba(0,0,0,0.06)',
  hairline2:  'rgba(0,0,0,0.10)',
  primary:    '#18181B',
  primaryHi:  '#27272A',
  primaryGlow:'transparent',
  accentBlue: '#52525B',
  text:       '#09090B',
  textSec:    '#52525B',
  textTer:    '#A1A1AA',
  success:    '#15803D',
  successBg:  'rgba(21,128,61,0.10)',
  danger:     '#DC2626',
  dangerBg:   'rgba(220,38,38,0.10)',
  warn:       '#B45309',
  warnBg:     'rgba(180,83,9,0.10)',
  star:       '#A16207',
  headerGradient: '#FFFFFF',
  cardShadow: 'rgba(0,0,0,0.04)',
  overlay:    'rgba(255,255,255,0.7)',
};
