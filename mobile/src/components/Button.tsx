import { ReactNode } from 'react';
import { Pressable, Text, View, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
  onPress?: () => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({ onPress, children, variant = 'primary', loading, disabled, icon, style, textStyle }: Props) {
  const { theme } = useTheme();
  const colors = {
    primary:   { bg: theme.colors.primaryHi, fg: '#fff' },
    secondary: { bg: theme.colors.surface,   fg: theme.colors.text },
    ghost:     { bg: 'transparent',          fg: theme.colors.accentBlue },
    danger:    { bg: theme.colors.danger,    fg: '#fff' },
  }[variant];

  return (
    <Pressable
      onPress={loading || disabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          height: 50,
          borderRadius: 999,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
          paddingHorizontal: 20,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: theme.colors.hairline,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.fg} />
      ) : (
        <>
          {icon && <View>{icon}</View>}
          <Text style={[{ color: colors.fg, fontSize: 15, fontWeight: '700' }, textStyle]}>{children}</Text>
        </>
      )}
    </Pressable>
  );
}
