import { ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Ação opcional — use para o caminho de saída óbvio ("explorar", "tentar de novo"). */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Estado vazio padrão. Antes cada tela improvisava o seu, o que produzia margens,
 * tamanhos e tons diferentes para a mesma situação — e multiplicava o risco de alguém
 * escrever uma cor fora do tema.
 */
export function EmptyState({ title, description, icon, actionLabel, onAction }: Props) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 }}>
      {icon && (
        <View
          style={{
            width: 56, height: 56, borderRadius: 18,
            backgroundColor: theme.colors.surface2,
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 2,
          }}
        >
          {icon}
        </View>
      )}
      <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>
        {title}
      </Text>
      {description && (
        <Text style={{ color: theme.colors.textSec, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
          {description}
        </Text>
      )}
      {actionLabel && onAction && (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => ({
            marginTop: 6,
            paddingHorizontal: 18, paddingVertical: 10,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.surface2,
            borderWidth: 1, borderColor: theme.colors.hairline,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <Text style={{ color: theme.colors.primaryText, fontSize: 13, fontWeight: '700' }}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
