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
}

export const darkTheme: Theme  = { mode: 'dark',  colors: darkPalette,  radius, spacing, fonts: fontWeights };
export const lightTheme: Theme = { mode: 'light', colors: lightPalette, radius, spacing, fonts: fontWeights };

/** Tema padrão do produto. Telas devem usar `useTheme()` — este export é a âncora do default. */
export const defaultTheme = lightTheme;
