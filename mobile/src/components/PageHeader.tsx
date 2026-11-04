import { ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}

/**
 * Barra de navegação no padrão iOS: título centralizado 17 semibold,
 * voltar em chevron 44pt sem fundo, acessório à direita.
 * (Antes: três variações de seta em círculo com título à esquerda.)
 */
export function PageHeader({ title, subtitle, onBack, right }: Props) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.s1,
        paddingVertical: theme.spacing.s2,
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View style={{ width: theme.hit, alignItems: 'flex-start', justifyContent: 'center' }}>
        {onBack && (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            hitSlop={8}
            style={({ pressed }) => ({
              width: theme.hit,
              height: theme.hit,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.4 : 1,
            })}
          >
            <ChevronLeft color={theme.colors.primaryText} size={26} />
          </Pressable>
        )}
      </View>
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 4 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 17, fontWeight: '600', letterSpacing: -0.2 }}>
          {title}
        </Text>
        {subtitle && (
          <Text numberOfLines={1} style={{ color: theme.colors.textSec, fontSize: 12, marginTop: 1 }}>
            {subtitle}
          </Text>
        )}
      </View>
      <View style={{ minWidth: theme.hit, alignItems: 'flex-end', justifyContent: 'center' }}>
        {right}
      </View>
    </View>
  );
}
