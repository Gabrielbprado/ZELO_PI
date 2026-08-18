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

/**
 * ZELO palette — warm, editorial, intentionally NOT the generic "AI slate + tailwind blue".
 * Accent is a brazilian terracota/saffron that nods to the literal meaning of "zelo" (care).
 *
 * `accentBlue` is kept as a field name for backwards compatibility, but it now holds the
 * saffron accent value across both modes. New code should prefer `primary`/`primaryHi`.
 */
export const darkPalette: Palette = {
  bg:         '#121214',
  bgDeep:     '#0B0B0D',
  surface:    '#1A1A1D',
  surface2:   '#222226',
  hairline:   'rgba(245,240,232,0.08)',
  hairline2:  'rgba(245,240,232,0.14)',
  primary:    '#E8703C',
  primaryHi:  '#F08454',
  primaryGlow:'rgba(232,112,60,0.28)',
  accentBlue: '#F08454',
  text:       '#F5F0E8',
  textSec:    '#A8A29E',
  textTer:    '#6B6660',
  success:    '#5FA86A',
  successBg:  'rgba(95,168,106,0.16)',
  danger:     '#D9534F',
  dangerBg:   'rgba(217,83,79,0.16)',
  warn:       '#D9A441',
  warnBg:     'rgba(217,164,65,0.16)',
  star:       '#E8B544',
  headerGradient: '#121214',
  cardShadow: 'rgba(0,0,0,0.45)',
  overlay:    'rgba(11,11,13,0.72)',
};

export const lightPalette: Palette = {
  bg:         '#FAF7F2',
  bgDeep:     '#F3EFE7',
  surface:    '#FFFFFF',
  surface2:   '#F3EFE7',
  hairline:   'rgba(14,14,16,0.08)',
  hairline2:  'rgba(14,14,16,0.16)',
  primary:    '#D9612E',
  primaryHi:  '#E8703C',
  primaryGlow:'rgba(217,97,46,0.18)',
  accentBlue: '#D9612E',
  text:       '#0E0E10',
  textSec:    '#5C5852',
  textTer:    '#8F8B85',
  success:    '#3D7A4C',
  successBg:  'rgba(61,122,76,0.14)',
  danger:     '#B8403D',
  dangerBg:   'rgba(184,64,61,0.12)',
  warn:       '#9C7424',
  warnBg:     'rgba(156,116,36,0.14)',
  star:       '#B8861E',
  headerGradient: '#FAF7F2',
  cardShadow: 'rgba(14,14,16,0.06)',
  overlay:    'rgba(14,14,16,0.55)',
};
