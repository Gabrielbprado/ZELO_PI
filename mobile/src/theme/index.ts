import { darkPalette, lightPalette, type Palette } from './palettes';

export const radius  = { sm: 10, md: 12, lg: 16, xl: 20, pill: 9999 } as const;
export const spacing = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s7: 32, s8: 40 } as const;
export const fontWeights = {
  regular:  '400' as const,
  medium:   '500' as const,
  semibold: '600' as const,
  bold:     '700' as const,
  extra:    '800' as const,
};

/**
 * Escala tipográfica no espírito do Dynamic Type do iOS (San Francisco).
 * Telas de raiz (abas) usam `largeTitle`; telas empurradas usam `navTitle`
 * centralizado via PageHeader; corpo e listas usam `body` (17pt).
 */
export const type = {
  largeTitle: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  title1:     { fontSize: 28, fontWeight: '700', letterSpacing: -0.4 },
  title2:     { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  title3:     { fontSize: 20, fontWeight: '600', letterSpacing: -0.3 },
  navTitle:   { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  headline:   { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  body:       { fontSize: 17, fontWeight: '400', letterSpacing: 0 },
  callout:    { fontSize: 16, fontWeight: '400', letterSpacing: 0 },
  subhead:    { fontSize: 15, fontWeight: '400', letterSpacing: 0 },
  footnote:   { fontSize: 13, fontWeight: '400', letterSpacing: 0 },
  caption:    { fontSize: 12, fontWeight: '400', letterSpacing: 0 },
  section:    { fontSize: 13, fontWeight: '600', letterSpacing: 0.4 },
} as const;

/** Alvo mínimo de toque (44pt, HIG). */
export const hitTarget = 44;

/** O que o tema efetivamente renderiza. */
export type ThemeMode = 'light' | 'dark';

/**
 * O que o usuário escolheu. `'system'` acompanha a preferência do SO; os outros dois a
 * sobrescrevem. A distinção entre preferência e modo resolvido existe porque o app
 * precisa lembrar "siga o sistema" — e não o valor que o sistema tinha na hora da escolha.
 */
export type ThemePreference = ThemeMode | 'system';

export interface Theme {
  mode: ThemeMode;
  colors: Palette;
  radius: typeof radius;
  spacing: typeof spacing;
  fonts: typeof fontWeights;
  type: typeof type;
  hit: typeof hitTarget;
}

export const darkTheme: Theme  = { mode: 'dark',  colors: darkPalette,  radius, spacing, fonts: fontWeights, type, hit: hitTarget };
export const lightTheme: Theme = { mode: 'light', colors: lightPalette, radius, spacing, fonts: fontWeights, type, hit: hitTarget };

/** Tema padrão do produto. Telas devem usar `useTheme()` — este export é a âncora do default. */
export const defaultTheme = lightTheme;
