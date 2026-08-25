import { useCallback, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Star, MapPin, TrendingUp, TrendingDown } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import { Badge } from '../components/Badge';
import { useAuth } from '../contexts/AuthContext';
import * as bookingsApi from '../api/bookings';
import * as providerSelfApi from '../api/providerSelf';
import type { Booking } from '../types';
import type { ProviderMe } from '../api/providerSelf';

/** Domingo-primeiro, para casar com `Date.getDay()`. */
const WEEKDAY_INITIAL = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};

/** Valor efetivamente recebido: o preço final quando existe, senão o estimado. */
const bookingValue = (b: Booking) => b.priceFinal ?? b.priceEstimate ?? 0;

const sumBetween = (bookings: Booking[], from: Date, to: Date) =>
  bookings.reduce((acc, b) => {
    if (!b.completedAt) return acc;
    const at = new Date(b.completedAt);
    return at >= from && at < to ? acc + bookingValue(b) : acc;
  }, 0);

export default function ProviderDashboardScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [profile, setProfile] = useState<ProviderMe | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      // O perfil traz a nota real; sem ele o card de métricas mostra "—" em vez de inventar.
      const [list, me] = await Promise.all([
        bookingsApi.listMyBookings(),
        providerSelfApi.getMyProvider().catch(() => null),
      ]);
      setBookings(list);
      setProfile(me);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const today = bookings.filter((b) => ['ACCEPTED', 'IN_PROGRESS', 'REQUESTED'].includes(b.status));
  const completed = bookings.filter((b) => b.status === 'COMPLETED');
  const cancelled = bookings.filter((b) => b.status === 'CANCELLED');

  // Janela de 7 dias terminando hoje — os rótulos acompanham as datas reais, então a
  // barra da direita é sempre hoje, qualquer que seja o dia da semana.
  const windowDays = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i - 6));
  const earningsWeek = windowDays.map((d) => sumBetween(completed, d, addDays(d, 1)));
  const weekTotal = earningsWeek.reduce((a, b) => a + b, 0);
  const previousTotal = sumBetween(completed, addDays(windowDays[0], -7), windowDays[0]);
  const delta = previousTotal > 0 ? Math.round(((weekTotal - previousTotal) / previousTotal) * 100) : null;
  const maxEarning = Math.max(...earningsWeek, 1);

  const terminal = completed.length + cancelled.length;
  const completionRate = terminal > 0 ? Math.round((completed.length / terminal) * 100) : null;
  const hasRating = (profile?.ratingCount ?? 0) > 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl tintColor={theme.colors.primary} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={{ backgroundColor: theme.colors.headerGradient, paddingBottom: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 }}>
            <View>
              <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>Bem-vindo</Text>
              <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '800' }}>{user?.name}</Text>
            </View>
            <Avatar name={user?.name ?? '?'} size={42} hue={user?.avatarHue ?? 210} />
          </View>

          <View style={{ paddingHorizontal: 20 }}>
            <View style={{ borderRadius: theme.radius.lg, padding: 16, backgroundColor: theme.colors.primaryDeep }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: theme.colors.onPrimarySec, fontSize: 12 }}>Ganhos dos últimos 7 dias</Text>
                  <Text style={{ color: theme.colors.onPrimary, fontSize: 32, fontWeight: '800', marginTop: 4 }}>
                    R$ {weekTotal.toLocaleString('pt-BR')}
                  </Text>
                  {delta !== null && (
                    <View style={{ marginTop: 6, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.pill, backgroundColor: theme.colors.chartTrack }}>
                      {delta >= 0
                        ? <TrendingUp size={11} color={theme.colors.onPrimary} />
                        : <TrendingDown size={11} color={theme.colors.onPrimary} />}
                      <Text style={{ color: theme.colors.onPrimary, fontSize: 11, fontWeight: '700' }}>
                        {delta >= 0 ? '+' : ''}{delta}%
                      </Text>
                      <Text style={{ color: theme.colors.onPrimarySec, fontSize: 11 }}>vs. 7 dias antes</Text>
                    </View>
                  )}
                </View>
                <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.colors.chartTrack, borderRadius: theme.radius.pill }}>
                  <Text style={{ color: theme.colors.onPrimary, fontSize: 11, fontWeight: '600' }}>Semana</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end', height: 64, marginTop: 16 }}>
                {earningsWeek.map((v, i) => (
                  <View key={windowDays[i].toISOString()} style={{ flex: 1, gap: 4, alignItems: 'center' }}>
                    <View
                      style={{
                        width: '100%',
                        height: (v / maxEarning) * 50 + 2,
                        borderRadius: 2,
                        backgroundColor: i === earningsWeek.length - 1 ? theme.colors.chartBar : theme.colors.chartTrack,
                      }}
                    />
                    <Text style={{ color: theme.colors.onPrimarySec, fontSize: 10, fontWeight: '600' }}>
                      {WEEKDAY_INITIAL[windowDays[i].getDay()]}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginTop: 16 }}>
          {[
            {
              v: hasRating ? (profile?.ratingAvg ?? 0).toFixed(1) : '—',
              l: hasRating ? `Avaliação · ${profile?.ratingCount}` : 'Sem avaliações',
              icon: <Star size={12} color={theme.colors.star} fill={hasRating ? theme.colors.star : 'transparent'} />,
            },
            { v: String(profile?.jobsDone ?? completed.length), l: 'Trabalhos' },
            { v: completionRate !== null ? `${completionRate}%` : '—', l: 'Concluídos' },
          ].map((s, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.hairline }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {s.icon}
                <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '700' }}>{s.v}</Text>
              </View>
              <Text numberOfLines={1} style={{ color: theme.colors.textSec, fontSize: 10, marginTop: 2 }}>{s.l}</Text>
            </View>
          ))}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700', marginBottom: 8 }}>Hoje</Text>
          <View style={{ gap: 8 }}>
            {today.length === 0 ? (
              <Text style={{ color: theme.colors.textTer, fontSize: 12 }}>Sem agendamentos para hoje.</Text>
            ) : (
              today.map((b) => (
                <View key={b.id} style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: theme.colors.hairline, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ alignItems: 'center', minWidth: 44 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>
                      {b.scheduledAt ? new Date(b.scheduledAt).toLocaleTimeString('pt-BR', { hour: '2-digit' }) : '—'}
                    </Text>
                    <Text style={{ color: theme.colors.textTer, fontSize: 10 }}>
                      {b.scheduledAt ? new Date(b.scheduledAt).toLocaleTimeString('pt-BR', { minute: '2-digit' }) : ''}
                    </Text>
                  </View>
                  <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: theme.colors.hairline }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600' }}>{b.client?.name ?? '—'}</Text>
                    <Text numberOfLines={1} style={{ color: theme.colors.textSec, fontSize: 12 }}>{b.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <MapPin size={11} color={theme.colors.textTer} />
                      <Text style={{ color: theme.colors.textTer, fontSize: 11 }} numberOfLines={1}>{b.address}</Text>
                    </View>
                  </View>
                  <Badge tone={b.status === 'REQUESTED' ? 'warn' : 'success'}>
                    {b.status === 'REQUESTED' ? 'Pendente' : 'Confirmado'}
                  </Badge>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
