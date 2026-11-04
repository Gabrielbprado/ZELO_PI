import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, FlatList, ActivityIndicator } from 'react-native';
import { Search, ShieldCheck, ChevronDown } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { PageHeader } from '../components/PageHeader';
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
      <PageHeader
        title={category?.name ?? (q ? `"${q}"` : 'Profissionais')}
        subtitle={`${pros.length} profissionais encontrados`}
        onBack={() => nav.goBack()}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="Buscar" style={{ width: theme.hit, height: theme.hit, alignItems: 'center', justifyContent: 'center' }}>
            <Search color={theme.colors.text} size={20} />
          </Pressable>
        }
      />

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
                backgroundColor: isActive ? theme.colors.primaryDeep : theme.colors.surface,
                borderWidth: 1, borderColor: isActive ? theme.colors.primaryHi : theme.colors.hairline,
                flexDirection: 'row', alignItems: 'center', gap: 4,
              }}
            >
              {f.id === 'verified' && <ShieldCheck size={11} color={isActive ? theme.colors.onPrimary : theme.colors.success} />}
              <Text style={{ color: isActive ? theme.colors.onPrimary : theme.colors.text, fontSize: 12, fontWeight: '600' }}>{f.label}</Text>
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
          <ActivityIndicator color={theme.colors.primary} />
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
