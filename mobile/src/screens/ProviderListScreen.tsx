import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, FlatList, ActivityIndicator } from 'react-native';
import { ArrowLeft, Search, ShieldCheck, ChevronDown } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { ProCard } from '../components/ProCard';
import * as providersApi from '../api/providers';
import type { Provider } from '../types';
import type { AppStackParamList } from '../navigation/types';

const filters: { id: 'rating' | 'price' | 'distance' | 'verified'; label: string }[] = [
  { id: 'distance', label: 'Mais próximos' },
  { id: 'price',    label: 'Menor preço' },
  { id: 'rating',   label: 'Melhor avaliados' },
  { id: 'verified', label: 'Verificados' },
];

export default function ProviderListScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, 'ProviderList'>>();
  const category = route.params?.category;
  const initialQ = route.params?.q ?? '';
  const { theme } = useTheme();

  const [active, setActive] = useState<'rating' | 'price' | 'distance' | 'verified'>('rating');
  const [pros, setPros] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [q] = useState(initialQ);

  useEffect(() => {
    setLoading(true);
    providersApi
      .listProviders({
        category: category?.id,
        q: q || undefined,
        sort: active === 'verified' ? 'rating' : active,
        verified: active === 'verified' ? true : undefined,
        perPage: 30,
      })
      .then((r) => setPros(r.items))
      .finally(() => setLoading(false));
  }, [category?.id, active, q]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => nav.goBack()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft color={theme.colors.text} size={18} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>
            {category?.name ?? (q ? `"${q}"` : 'Profissionais')}
          </Text>
          <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>{pros.length} profissionais encontrados</Text>
        </View>
        <Pressable style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Search color={theme.colors.text} size={18} />
        </Pressable>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingVertical: 8 }}>
        {filters.map((f) => {
          const isActive = f.id === active;
          return (
            <Pressable
              key={f.id}
              onPress={() => setActive(f.id)}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                backgroundColor: isActive ? theme.colors.primary : theme.colors.surface,
                borderWidth: 1, borderColor: isActive ? theme.colors.primaryHi : theme.colors.hairline,
                flexDirection: 'row', alignItems: 'center', gap: 4,
              }}
            >
              {f.id === 'verified' && <ShieldCheck size={11} color={isActive ? '#fff' : theme.colors.success} />}
              <Text style={{ color: isActive ? '#fff' : theme.colors.text, fontSize: 12, fontWeight: '600' }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }}>
        <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>Ordenar por</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.hairline }}>
          <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600' }}>Avaliação</Text>
          <ChevronDown size={12} color={theme.colors.textSec} />
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.accentBlue} />
        </View>
      ) : (
        <FlatList
          data={pros}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 8 }}
          renderItem={({ item }) => (
            <ProCard pro={item} onPress={() => nav.navigate('ProviderProfile', { providerId: item.id })} />
          )}
        />
      )}
    </SafeAreaView>
  );
}
