import { View, Text, Pressable } from 'react-native';
import { Heart, ShieldCheck, Star, Check } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import type { Provider } from '../types';

export function ProCard({ pro, onPress }: { pro: Provider; onPress?: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.lg,
        padding: 16,
        flexDirection: 'row',
        gap: 12,
        borderWidth: 1,
        borderColor: theme.colors.hairline,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      <View>
        <Avatar name={pro.name} size={56} hue={pro.avatarHue} />
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
              borderWidth: 2,
              borderColor: theme.colors.surface,
            }}
          >
            <Check size={10} color="#fff" strokeWidth={3.5} />
          </View>
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 15, fontWeight: '700' }}>{pro.name}</Text>
          {pro.verified && (
            <Badge tone="success" icon={<ShieldCheck size={10} color={theme.colors.success} />}>KYC</Badge>
          )}
        </View>
        <Text style={{ color: theme.colors.textSec, fontSize: 13, marginBottom: 6 }}>
          {pro.categories[0]?.name ?? '—'} · {pro.neighborhood ?? 'próximo'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Star size={12} color={theme.colors.star} fill={theme.colors.star} />
            <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '700' }}>
              {pro.rating.toFixed(1)} <Text style={{ color: theme.colors.textTer, fontWeight: '400' }}>({pro.reviews})</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: pro.available ? theme.colors.success : theme.colors.textTer }} />
            <Text style={{ color: pro.available ? theme.colors.success : theme.colors.textSec, fontSize: 12 }}>
              {pro.available ? 'Disponível' : 'Ocupado'}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <Heart size={16} color={theme.colors.textTer} />
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: theme.colors.textTer, fontSize: 10 }}>a partir de</Text>
          <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 15 }}>R$ {pro.priceFrom}</Text>
        </View>
      </View>
    </Pressable>
  );
}
