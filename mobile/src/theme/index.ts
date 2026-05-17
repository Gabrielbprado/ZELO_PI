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

export type ThemeMode = 'light' | 'dark';

export interface Theme {
  mode: ThemeMode;
  colors: Palette;
  radius: typeof radius;
  spacing: typeof spacing;
  fonts: typeof fontWeights;
}

export const darkTheme: Theme  = { mode: 'dark',  colors: darkPalette,  radius, spacing, fonts: fontWeights };
export const lightTheme: Theme = { mode: 'light', colors: lightPalette, radius, spacing, fonts: fontWeights };

// Compatibilidade — `theme` antigo. Cores estáticas no modo escuro (default).
// Telas novas devem usar useTheme() para serem theme-aware.
export const theme = darkTheme;
