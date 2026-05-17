import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MapPin, ChevronDown, Bell, Search, Zap, ChevronRight, Star } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import { ProCard } from '../components/ProCard';
import { CategoryIcon } from '../components/CategoryIcon';
import { SectionHeader } from '../components/SectionHeader';
import { useAuth } from '../contexts/AuthContext';
import * as providersApi from '../api/providers';
import type { Category, Provider } from '../types';
import type { AppStackParamList } from '../navigation/types';

export default function HomeScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [pros, setPros] = useState<Provider[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const [cats, list] = await Promise.all([
      providersApi.getCategories(),
      providersApi.listProviders({ verified: true, perPage: 8 }),
    ]);
    setCategories(cats);
    setPros(list.items);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl tintColor={theme.colors.accentBlue} refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ paddingTop: 8, paddingBottom: 20, backgroundColor: theme.colors.headerGradient }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 }}>
            <View>
              <Text style={{ color: theme.colors.textSec, fontSize: 13 }}>Olá, {user?.name?.split(' ')[0] ?? '👋'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <MapPin size={14} color={theme.colors.accentBlue} />
                <Text style={{ color: theme.colors.text, fontWeight: '600', fontSize: 14 }}>
                  {user?.neighborhood ?? 'Vila Madalena'}, {user?.city ?? 'São Paulo'}
                </Text>
                <ChevronDown size={12} color={theme.colors.textSec} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={() => nav.navigate('Notifications')}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface2, alignItems: 'center', justifyContent: 'center' }}
              >
                <Bell size={18} color={theme.colors.text} />
                <View style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.danger, borderWidth: 2, borderColor: theme.colors.bg }} />
              </Pressable>
              <Avatar name={user?.name ?? '?'} size={36} hue={user?.avatarHue ?? 290} />
            </View>
          </View>

          {/* Search */}
          <View style={{ paddingHorizontal: 20 }}>
            <View
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: theme.colors.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 4,
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <Search size={18} color={theme.colors.textSec} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => query.trim() && nav.navigate('ProviderList', { q: query.trim() })}
                placeholder="Encontre encanador, eletricista..."
                placeholderTextColor={theme.colors.textSec}
                returnKeyType="search"
                style={{ flex: 1, color: theme.colors.text, fontSize: 14, paddingVertical: 8 }}
              />
              <Pressable
                onPress={() => query.trim() && nav.navigate('ProviderList', { q: query.trim() })}
                disabled={!query.trim()}
                style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', opacity: query.trim() ? 1 : 0.5 }}
              >
                <Search size={14} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Smart Budget banner */}
        <View style={{ paddingHorizontal: 20, marginTop: 20, marginBottom: 16 }}>
          <Pressable
            onPress={() => nav.navigate('SmartBudget')}
            style={({ pressed }) => ({
              borderRadius: theme.radius.lg, padding: 16, backgroundColor: theme.colors.primary,
              flexDirection: 'row', alignItems: 'center', gap: 12,
              transform: [{ scale: pressed ? 0.98 : 1 }],
              shadowColor: theme.colors.primaryHi, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
            })}
          >
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22 }}>✨</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Orçamento Inteligente</Text>
              <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 2 }}>Estime o preço em 4 toques</Text>
            </View>
            <ChevronRight size={18} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>

        {/* Emergency */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Pressable
            onPress={() => nav.navigate('Emergency')}
            style={({ pressed }) => ({
              backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 16,
              borderWidth: 1, borderColor: theme.colors.hairline,
              flexDirection: 'row', alignItems: 'center', gap: 12,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.dangerBg, alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={22} color={theme.colors.danger} fill={theme.colors.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '600', fontSize: 15 }}>Emergência 24h</Text>
              <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>Profissional verificado em até 30 min</Text>
            </View>
            <View style={{ backgroundColor: theme.colors.danger, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>SOS</Text>
            </View>
          </Pressable>
        </View>

        {/* Categories */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <SectionHeader title="Categorias" cta="Ver todas" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 12 }}>
            {categories.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => nav.navigate('ProviderList', { category: c })}
                style={({ pressed }) => ({
                  width: '22%',
                  aspectRatio: 1,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.hairline,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                })}
              >
                <View
                  style={{
                    width: 40, height: 40, borderRadius: 12,
                    backgroundColor: `hsl(${c.hue}, 40%, 22%)`,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <CategoryIcon iconKey={c.iconKey} size={22} color={`hsl(${c.hue}, 80%, 70%)`} />
                </View>
                <Text style={{ color: theme.colors.text, fontSize: 11, fontWeight: '600' }}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Top providers */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ paddingHorizontal: 20 }}>
            <SectionHeader title="Profissionais em alta" cta="Ver mais" />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, gap: 10 }}>
            {pros.slice(0, 5).map((p) => (
              <Pressable
                key={p.id}
                onPress={() => nav.navigate('ProviderProfile', { providerId: p.id })}
                style={{ width: 150, padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.hairline }}
              >
                <Avatar name={p.name} size={44} hue={p.avatarHue} />
                <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 13, fontWeight: '700', marginTop: 8 }}>{p.name}</Text>
                <Text style={{ color: theme.colors.textSec, fontSize: 11, marginTop: 2 }}>{p.categories[0]?.name ?? '—'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                  <Star size={11} color={theme.colors.star} fill={theme.colors.star} />
                  <Text style={{ color: theme.colors.text, fontSize: 11, fontWeight: '700' }}>{p.rating.toFixed(1)}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Nearby */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <SectionHeader title="Próximos a você" cta="Ver mapa" />
          <View style={{ marginTop: 12, gap: 8 }}>
            {pros.slice(0, 3).map((p) => (
              <ProCard key={p.id} pro={p} onPress={() => nav.navigate('ProviderProfile', { providerId: p.id })} />
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
