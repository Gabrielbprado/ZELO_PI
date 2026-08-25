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
    primary:   { bg: theme.colors.text,     fg: theme.colors.bg,   borderColor: 'transparent' },
    secondary: { bg: 'transparent',         fg: theme.colors.text, borderColor: theme.colors.hairline2 },
    ghost:     { bg: 'transparent',         fg: theme.colors.text, borderColor: 'transparent' },
    danger:    { bg: theme.colors.dangerDeep, fg: theme.colors.onDanger, borderColor: 'transparent' },
  }[variant];

  return (
    <Pressable
      onPress={loading || disabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          height: 54,
          borderRadius: 14,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 10,
          opacity: disabled ? 0.45 : pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          paddingHorizontal: 24,
          borderWidth: variant === 'secondary' ? 1.5 : 0,
          borderColor: colors.borderColor,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.fg} />
      ) : (
        <>
          {icon && <View>{icon}</View>}
          <Text style={[{ color: colors.fg, fontSize: 15, fontWeight: '600', letterSpacing: -0.2 }, textStyle]}>
            {children}
          </Text>
        </>
      )}
    </Pressable>
  );
}
