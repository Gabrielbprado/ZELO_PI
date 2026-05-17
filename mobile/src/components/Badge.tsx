import { ReactNode } from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

type Tone = 'success' | 'danger' | 'warn' | 'primary' | 'neutral';

export function Badge({
  children,
  tone = 'success',
  icon,
  style,
}: { children: ReactNode; tone?: Tone; icon?: ReactNode; style?: ViewStyle }) {
  const { theme } = useTheme();
  const tones: Record<Tone, { bg: string; fg: string }> = {
    success: { bg: theme.colors.successBg, fg: theme.colors.success },
    danger:  { bg: theme.colors.dangerBg,  fg: theme.colors.danger  },
    warn:    { bg: theme.colors.warnBg,    fg: theme.colors.warn    },
    primary: { bg: theme.mode === 'dark' ? 'rgba(43,77,184,0.18)' : 'rgba(30,58,138,0.12)', fg: theme.colors.accentBlue },
    neutral: { bg: theme.colors.surface2, fg: theme.colors.textSec },
  };
  const c = tones[tone];
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 999,
          backgroundColor: c.bg,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      {icon}
      <Text style={{ color: c.fg, fontSize: 11, fontWeight: '700', letterSpacing: 0.1 }}>{children}</Text>
    </View>
  );
}
