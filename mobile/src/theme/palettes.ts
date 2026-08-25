export interface Palette {
  bg:         string;
  bgDeep:     string;
  surface:    string;
  surface2:   string;
  hairline:   string;
  hairline2:  string;
  primary:    string;
  primaryHi:  string;
  primaryDeep:string;
  primaryText:string;
  primaryGlow:string;
  text:       string;
  textSec:    string;
  textTer:    string;
  onPrimary:  string;
  onPrimarySec: string;
  onDanger:   string;
  success:    string;
  successBg:  string;
  successBorder: string;
  danger:     string;
  dangerDeep: string;
  dangerBg:   string;
  dangerBorder: string;
  warn:       string;
  warnBg:     string;
  warnBorder: string;
  star:       string;
  headerGradient: string;
  cardShadow: string;
  overlay:    string;
  scrim:      string;
  ring:       string;
  heroFg:     string;
  heroFgSec:  string;
  heroRing:   string;
  chartBar:   string;
  chartTrack: string;
}

/**
 * ZELO palette — warm, editorial, intentionally NOT the generic "AI slate + tailwind blue".
 * Accent is a brazilian terracota/saffron that nods to the literal meaning of "zelo" (care).
 *
 * Três famílias de token merecem explicação, porque existem para resolver problemas que a
 * paleta original não conseguia expressar:
 *
 * - `primaryDeep` / `primaryText` / `onPrimary`: `primary` sozinho não dá conta dos dois
 *   papéis opostos. Como PREENCHIMENTO com rótulo branco ele precisa ser escuro; como
 *   TEXTO sobre card ou sobre `primaryGlow` ele precisa contrastar com um fundo claro —
 *   e no tema escuro a exigência inverte. Daí três tokens: `primaryDeep` é o fundo
 *   preenchido, `onPrimary` o rótulo que vai em cima dele, `primaryText` o primary usado
 *   como texto/ícone. O mesmo vale para `dangerDeep` vs `danger`.
 *   `scripts/contrast.mjs` verifica todos esses pares no CI — não altere um sem rodá-lo.
 * - `scrim`/`heroFg`: elementos que flutuam sobre imagem ou sobre um bloco colorido não
 *   podem usar `text`/`surface`, que invertem junto com o modo. Esses tokens são âncoras
 *   fixas ao contexto, não ao tema.
 * - `*Border`: as versões `*Bg` são fracas demais para servir de borda visível.
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
  primaryDeep:'#A35025',
  primaryText:'#F08454',
  primaryGlow:'rgba(232,112,60,0.26)',
  text:       '#F5F0E8',
  textSec:    '#A8A29E',
  textTer:    '#8A837B',
  onPrimary:  '#FFFFFF',
  onPrimarySec:'rgba(255,255,255,0.86)',
  onDanger:   '#FFFFFF',
  success:    '#5FA86A',
  successBg:  'rgba(95,168,106,0.16)',
  successBorder: 'rgba(95,168,106,0.34)',
  danger:     '#E4726E',
  dangerDeep: '#A82F2B',
  dangerBg:   'rgba(228,114,110,0.16)',
  dangerBorder: 'rgba(228,114,110,0.34)',
  warn:       '#D9A441',
  warnBg:     'rgba(217,164,65,0.16)',
  warnBorder: 'rgba(217,164,65,0.34)',
  star:       '#E8B544',
  headerGradient: '#121214',
  cardShadow: 'rgba(0,0,0,0.45)',
  overlay:    'rgba(11,11,13,0.72)',
  scrim:      'rgba(11,11,13,0.62)',
  ring:       'rgba(245,240,232,0.14)',
  heroFg:     '#F8F4EE',
  heroFgSec:  'rgba(248,244,238,0.72)',
  heroRing:   'rgba(248,244,238,0.22)',
  chartBar:   '#F8F4EE',
  chartTrack: 'rgba(255,255,255,0.28)',
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
  primaryDeep:'#AB4A1D',
  primaryText:'#AB4A1D',
  primaryGlow:'rgba(217,97,46,0.12)',
  text:       '#0E0E10',
  textSec:    '#5C5852',
  textTer:    '#726E67',
  onPrimary:  '#FFFFFF',
  onPrimarySec:'rgba(255,255,255,0.88)',
  onDanger:   '#FFFFFF',
  success:    '#3A7549',
  successBg:  'rgba(61,122,76,0.10)',
  successBorder: 'rgba(61,122,76,0.30)',
  danger:     '#B23E3B',
  dangerDeep: '#A8302D',
  dangerBg:   'rgba(184,64,61,0.12)',
  dangerBorder: 'rgba(184,64,61,0.30)',
  warn:       '#7D5C1B',
  warnBg:     'rgba(125,92,27,0.10)',
  warnBorder: 'rgba(125,92,27,0.30)',
  star:       '#B8861E',
  headerGradient: '#FAF7F2',
  cardShadow: 'rgba(14,14,16,0.06)',
  overlay:    'rgba(14,14,16,0.55)',
  scrim:      'rgba(14,14,16,0.55)',
  ring:       'rgba(14,14,16,0.14)',
  heroFg:     '#FFFFFF',
  heroFgSec:  'rgba(255,255,255,0.80)',
  heroRing:   'rgba(255,255,255,0.26)',
  chartBar:   '#FFFFFF',
  chartTrack: 'rgba(255,255,255,0.34)',
};
