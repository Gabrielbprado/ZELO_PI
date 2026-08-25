import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MapPin, Bell, Search, Zap, ChevronRight, Star, Sparkles, ArrowUpRight } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { categoryBg, categoryFg } from '../theme/colorFns';
import { Avatar } from '../components/Avatar';
import { ProCard } from '../components/ProCard';
import { CategoryIcon } from '../components/CategoryIcon';
import { SectionHeader } from '../components/SectionHeader';
import { ForYouCarousel } from '../components/ForYouCarousel';
import { HomeTutorial } from '../components/HomeTutorial';
import { useAuth } from '../contexts/AuthContext';
import { useHomeOnboarding } from '../hooks/useHomeOnboarding';
import * as providersApi from '../api/providers';
import type { Category, Provider } from '../types';
import type { AppStackParamList } from '../navigation/types';

export default function HomeScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { theme, mode } = useTheme();
  const { user } = useAuth();
  const { status: onboardingStatus, markSeen } = useHomeOnboarding();
  const [categories, setCategories] = useState<Category[]>([]);
  const [pros, setPros] = useState<Provider[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  // Incrementado no pull-to-refresh para o carrossel recarregar junto.
  const [recoRefreshKey, setRecoRefreshKey] = useState(0);

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
    setRecoRefreshKey((k) => k + 1);
    try { await load(); } finally { setRefreshing(false); }
  };

  const firstName = user?.name?.split(' ')[0] ?? null;
  const greeting = firstName ? `Olá, ${firstName}.` : 'Olá.';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl tintColor={theme.colors.primary} refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — editorial, breathable */}
        <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: 22,
                  fontWeight: '800',
                  letterSpacing: -1,
                }}
              >
                zelo
              </Text>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: theme.colors.primary,
                  marginTop: 6,
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable
                onPress={() => nav.navigate('Notifications')}
                hitSlop={8}
                style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
              >
                <Bell size={20} color={theme.colors.text} strokeWidth={2} />
                <View
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: theme.colors.primary,
                    borderWidth: 2,
                    borderColor: theme.colors.bg,
                  }}
                />
              </Pressable>
              <Avatar name={user?.name ?? '?'} size={36} hue={user?.avatarHue ?? 290} />
            </View>
          </View>
        </View>

        {/* Greeting */}
        <View style={{ paddingHorizontal: 24, marginTop: 16, marginBottom: 20 }}>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 32,
              fontWeight: '700',
              letterSpacing: -1.2,
              lineHeight: 38,
            }}
          >
            {greeting}
          </Text>
          <Text style={{ color: theme.colors.textSec, fontSize: 15, marginTop: 6 }}>
            O que precisa resolver hoje?
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14 }}>
            <MapPin size={13} color={theme.colors.textTer} strokeWidth={2} />
            <Text style={{ color: theme.colors.textSec, fontSize: 12, fontWeight: '500' }}>
              {user?.neighborhood ?? 'Vila Madalena'}, {user?.city ?? 'São Paulo'}
            </Text>
          </View>
        </View>

        {/* Search — minimal, ink underline rather than pill */}
        <View style={{ paddingHorizontal: 24, marginBottom: 28 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: theme.colors.surface,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 4,
            }}
          >
            <Search size={18} color={theme.colors.textSec} strokeWidth={2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => query.trim() && nav.navigate('ProviderList', { q: query.trim() })}
              placeholder="Encanador, eletricista, faxina…"
              placeholderTextColor={theme.colors.textTer}
              returnKeyType="search"
              style={{ flex: 1, color: theme.colors.text, fontSize: 15, paddingVertical: 14 }}
            />
          </View>
        </View>

        {/* Primary actions — Smart Budget + Emergency, equal weight, no emoji */}
        <View style={{ paddingHorizontal: 24, marginBottom: 32, flexDirection: 'row', gap: 12 }}>
          <Pressable
            onPress={() => nav.navigate('SmartBudget')}
            style={({ pressed }) => ({
              flex: 1,
              backgroundColor: theme.colors.primaryDeep,
              borderRadius: 18,
              padding: 18,
              minHeight: 132,
              justifyContent: 'space-between',
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Sparkles size={22} color={theme.colors.onPrimary} strokeWidth={2.2} />
              <ArrowUpRight size={18} color={theme.colors.onPrimarySec} strokeWidth={2.2} />
            </View>
            <View>
              <Text style={{ color: theme.colors.onPrimary, fontWeight: '700', fontSize: 16, letterSpacing: -0.4 }}>
                Orçamento
              </Text>
              <Text style={{ color: theme.colors.onPrimarySec, fontSize: 12, marginTop: 2 }}>
                Estime em 4 toques
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => nav.navigate('Emergency')}
            style={({ pressed }) => ({
              flex: 1,
              backgroundColor: theme.colors.surface,
              borderRadius: 18,
              padding: 18,
              minHeight: 132,
              justifyContent: 'space-between',
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: theme.colors.dangerBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Zap size={15} color={theme.colors.danger} fill={theme.colors.danger} strokeWidth={2} />
              </View>
              <View style={{ backgroundColor: theme.colors.dangerDeep, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6 }}>
                <Text style={{ color: theme.colors.onDanger, fontWeight: '800', fontSize: 10, letterSpacing: 0.8 }}>SOS</Text>
              </View>
            </View>
            <View>
              <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 16, letterSpacing: -0.4 }}>
                Emergência
              </Text>
              <Text style={{ color: theme.colors.textSec, fontSize: 12, marginTop: 2 }}>
                Resposta em até 30 min
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Categories */}
        <View style={{ paddingHorizontal: 24, marginBottom: 32 }}>
          <SectionHeader title="Categorias" cta="Ver todas" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, gap: 10 }}>
            {categories.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => nav.navigate('ProviderList', { category: c })}
                style={({ pressed }) => ({
                  width: '23.5%',
                  aspectRatio: 0.92,
                  borderRadius: 14,
                  backgroundColor: theme.colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingHorizontal: 6,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                })}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: categoryBg(c.hue, mode),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CategoryIcon
                    iconKey={c.iconKey}
                    size={20}
                    color={categoryFg(c.hue, mode)}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={{ color: theme.colors.text, fontSize: 11, fontWeight: '600', textAlign: 'center' }}
                >
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Recomendação personalizada — acima de "Em alta" de propósito:
            o que é seu vem antes do que é de todo mundo. */}
        <View style={{ marginBottom: 32, paddingLeft: 24 }}>
          <View style={{ paddingRight: 24 }}>
            <ForYouCarousel
              refreshKey={recoRefreshKey}
              onOpenProvider={(providerId) => nav.navigate('ProviderProfile', { providerId })}
              onSeeAll={() => nav.navigate('ProviderList', {})}
            />
          </View>
        </View>

        {/* Top providers */}
        <View style={{ marginBottom: 32 }}>
          <View style={{ paddingHorizontal: 24 }}>
            <SectionHeader title="Em alta" cta="Ver mais" />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, gap: 12 }}
          >
            {pros.slice(0, 5).map((p) => (
              <Pressable
                key={p.id}
                onPress={() => nav.navigate('ProviderProfile', { providerId: p.id })}
                style={{ width: 168, padding: 16, borderRadius: 16, backgroundColor: theme.colors.surface }}
              >
                <Avatar name={p.name} size={48} hue={p.avatarHue} />
                <Text
                  numberOfLines={1}
                  style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700', letterSpacing: -0.3, marginTop: 12 }}
                >
                  {p.name}
                </Text>
                <Text style={{ color: theme.colors.textSec, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                  {p.categories[0]?.name ?? '—'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }}>
                  <Star size={11} color={theme.colors.star} fill={theme.colors.star} />
                  <Text style={{ color: theme.colors.text, fontSize: 11, fontWeight: '700' }}>
                    {p.rating.toFixed(1)}
                  </Text>
                  <Text style={{ color: theme.colors.textTer, fontSize: 11 }}>
                    · {p.reviews} avaliações
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Nearby */}
        <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
          <SectionHeader title="Perto de você" cta="Ver mapa" />
          <View style={{ marginTop: 16, gap: 10 }}>
            {pros.slice(0, 3).map((p) => (
              <ProCard key={p.id} pro={p} onPress={() => nav.navigate('ProviderProfile', { providerId: p.id })} />
            ))}
          </View>
        </View>
      </ScrollView>

      <HomeTutorial visible={onboardingStatus === 'pending'} onClose={markSeen} />
    </SafeAreaView>
  );
}
