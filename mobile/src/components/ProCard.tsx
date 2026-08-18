import { View, Text, Pressable } from 'react-native';
import { ShieldCheck, Star, Check } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from './Avatar';
import type { Provider } from '../types';

interface ProCardProps {
  pro: Provider;
  onPress?: () => void;
  /** Chip de justificativa ("Você já contratou", "a 1,2 km"). Só o carrossel usa. */
  reason?: string;
  /** Variante estreita para lista horizontal: avatar menor e sem coluna de preço. */
  compact?: boolean;
}

/**
 * `reason` e `compact` são ADITIVOS e opcionais — as telas que já usam o card
 * (ProviderList, "Perto de você") continuam idênticas. Preferido a criar um
 * `RecoCard` quase duplicado que sairia de sincronia na primeira mudança visual.
 */
export function ProCard({ pro, onPress, reason, compact = false }: ProCardProps) {
  const { theme } = useTheme();
  const avatarSize = compact ? 44 : 52;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${pro.name}, ${pro.categories[0]?.name ?? 'profissional'}, nota ${pro.rating.toFixed(1)}${reason ? `. ${reason}` : ''}`}
      style={({ pressed }) => ({
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: compact ? 14 : 18,
        flexDirection: 'row',
        gap: 14,
        alignItems: 'center',
        transform: [{ scale: pressed ? 0.995 : 1 }],
        ...(compact ? { width: 260 } : null),
      })}
    >
      <View>
        <Avatar name={pro.name} size={avatarSize} hue={pro.avatarHue} />
        {pro.verified && (
          <View
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: theme.colors.success,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2.5,
              borderColor: theme.colors.surface,
            }}
          >
            <Check size={10} color="#fff" strokeWidth={3.5} />
          </View>
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700', letterSpacing: -0.3 }}>
            {pro.name}
          </Text>
          {pro.verified && (
            <ShieldCheck size={13} color={theme.colors.success} />
          )}
        </View>
        <Text style={{ color: theme.colors.textSec, fontSize: 13, marginBottom: reason ? 6 : 8 }}>
          {pro.categories[0]?.name ?? '—'} · {pro.neighborhood ?? 'próximo'}
        </Text>
        {reason && (
          <View
            style={{
              alignSelf: 'flex-start',
              // `primaryGlow` é o tom translúcido do acento na paleta — evita
              // inventar um token novo só para este chip.
              backgroundColor: theme.colors.primaryGlow,
              borderRadius: 999,
              paddingHorizontal: 9,
              paddingVertical: 3,
              marginBottom: 8,
            }}
          >
            <Text numberOfLines={1} style={{ color: theme.colors.primary, fontSize: 11, fontWeight: '700' }}>
              {reason}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Star size={12} color={theme.colors.star} fill={theme.colors.star} />
            <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '700' }}>
              {pro.rating.toFixed(1)} <Text style={{ color: theme.colors.textTer, fontWeight: '500' }}>({pro.reviews})</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: pro.available ? theme.colors.success : theme.colors.textTer }} />
            <Text style={{ color: pro.available ? theme.colors.success : theme.colors.textSec, fontSize: 12, fontWeight: '500' }}>
              {pro.available ? 'Disponível' : 'Ocupado'}
            </Text>
          </View>
        </View>
      </View>

      {!compact && (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: theme.colors.textTer, fontSize: 10, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' }}>
            a partir de
          </Text>
          <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 17, letterSpacing: -0.4, marginTop: 2 }}>
            R$ {pro.priceFrom}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
