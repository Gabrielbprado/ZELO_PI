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

/**
 * Botão padrão — métricas iOS: 50pt de altura, raio 12, rótulo 17 semibold.
 * O feedback é só opacidade (o iOS não "encolhe" o botão no toque).
 * Usa `disabled` prop nativo do Pressable (RN 0.71+) para bloquear interação durante loading.
 */
export function Button({ onPress, children, variant = 'primary', loading, disabled, icon, style, textStyle }: Props) {
  const { theme } = useTheme();
  const isDisabled = disabled || loading;
  const colors = {
    primary:   { bg: theme.colors.text,     fg: theme.colors.bg,   borderColor: 'transparent' },
    secondary: { bg: 'transparent',         fg: theme.colors.text, borderColor: theme.colors.hairline2 },
    ghost:     { bg: 'transparent',         fg: theme.colors.text, borderColor: 'transparent' },
    danger:    { bg: theme.colors.dangerDeep, fg: theme.colors.onDanger, borderColor: 'transparent' },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        {
          minHeight: 50,
          borderRadius: theme.radius.md,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: isDisabled ? 0.4 : pressed ? 0.75 : 1,
          paddingHorizontal: 20,
          paddingVertical: 13,
          borderWidth: variant === 'secondary' ? 1 : 0,
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
          <Text style={[{ color: colors.fg, fontSize: 17, fontWeight: '600', letterSpacing: -0.2, textAlign: 'center' }, textStyle]}>
            {children}
          </Text>
        </>
      )}
    </Pressable>
  );
}
