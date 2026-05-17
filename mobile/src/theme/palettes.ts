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

export const darkPalette: Palette = {
  bg:         '#0F172A',
  bgDeep:     '#0A1020',
  surface:    '#1E293B',
  surface2:   '#27334A',
  hairline:   'rgba(148,163,184,0.14)',
  hairline2:  'rgba(148,163,184,0.22)',
  primary:    '#1E3A8A',
  primaryHi:  '#2B4DB8',
  primaryGlow:'rgba(43,77,184,0.35)',
  accentBlue: '#93B4FF',
  text:       '#F8FAFC',
  textSec:    '#94A3B8',
  textTer:    '#64748B',
  success:    '#22C55E',
  successBg:  'rgba(34,197,94,0.14)',
  danger:     '#EF4444',
  dangerBg:   'rgba(239,68,68,0.12)',
  warn:       '#F59E0B',
  warnBg:     'rgba(245,158,11,0.14)',
  star:       '#FBBF24',
  headerGradient: '#182446',
  cardShadow: 'rgba(0,0,0,0.4)',
  overlay:    'rgba(15,23,42,0.6)',
};

export const lightPalette: Palette = {
  bg:         '#F5F6FA',
  bgDeep:     '#E8EBF2',
  surface:    '#FFFFFF',
  surface2:   '#F0F2F8',
  hairline:   'rgba(15,23,42,0.08)',
  hairline2:  'rgba(15,23,42,0.16)',
  primary:    '#1E3A8A',
  primaryHi:  '#2B4DB8',
  primaryGlow:'rgba(43,77,184,0.25)',
  accentBlue: '#1E3A8A',
  text:       '#0F172A',
  textSec:    '#475569',
  textTer:    '#94A3B8',
  success:    '#15803D',
  successBg:  'rgba(34,197,94,0.18)',
  danger:     '#DC2626',
  dangerBg:   'rgba(239,68,68,0.12)',
  warn:       '#B45309',
  warnBg:     'rgba(245,158,11,0.18)',
  star:       '#D97706',
  headerGradient: '#E8EBF6',
  cardShadow: 'rgba(15,23,42,0.08)',
  overlay:    'rgba(255,255,255,0.7)',
};
