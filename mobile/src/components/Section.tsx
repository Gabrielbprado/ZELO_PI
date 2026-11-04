import { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
  title?: string;
  footer?: string;
  children: ReactNode;
}

/**
 * Seção agrupada estilo Ajustes do iOS: cabeçalho 13 semibold,
 * cartão arredondado único e rodapé explicativo 12.
 */
export function Section({ title, footer, children }: Props) {
  const { theme } = useTheme();
  return (
    <View>
      {title && (
        <Text style={{
          color: theme.colors.textSec, fontSize: 13, fontWeight: '600',
          marginBottom: 6, paddingHorizontal: 16,
        }}>
          {title.toUpperCase()}
        </Text>
      )}
      <View style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        borderWidth: 1, borderColor: theme.colors.hairline,
        overflow: 'hidden',
      }}>
        {children}
      </View>
      {footer && (
        <Text style={{ color: theme.colors.textTer, fontSize: 12, lineHeight: 16, marginTop: 6, paddingHorizontal: 16 }}>
          {footer}
        </Text>
      )}
    </View>
  );
}
