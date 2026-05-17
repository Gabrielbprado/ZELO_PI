import { useCallback, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Star, MapPin, ChevronDown } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import { Badge } from '../components/Badge';
import { useAuth } from '../contexts/AuthContext';
import * as bookingsApi from '../api/bookings';
import type { Booking } from '../types';

export default function ProviderDashboardScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await bookingsApi.listMyBookings();
      setBookings(r);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const today = bookings.filter((b) => ['ACCEPTED', 'IN_PROGRESS', 'REQUESTED'].includes(b.status));
  const completed = bookings.filter((b) => b.status === 'COMPLETED');
  const earnings = completed.reduce((acc, b) => acc + (b.priceFinal ?? 0), 0);
  const earningsWeek = [320, 480, 0, 620, 410, 740, earnings || 590];
  const max = Math.max(...earningsWeek, 1);
  const days = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl tintColor={theme.colors.accentBlue} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
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
            <View style={{ borderRadius: theme.radius.lg, padding: 16, backgroundColor: theme.colors.primary }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Ganhos da semana</Text>
                  <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 4 }}>
                    R$ {earningsWeek.reduce((a, b) => a + b, 0).toLocaleString('pt-BR')}
                  </Text>
                  <View style={{ marginTop: 6, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(34,197,94,0.2)' }}>
                    <Text style={{ color: '#86EFAC', fontSize: 11, fontWeight: '700' }}>↑ 18%</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>vs semana passada</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, height: 28 }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>Esta semana</Text>
                  <ChevronDown size={11} color="#fff" />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end', height: 64, marginTop: 16 }}>
                {earningsWeek.map((v, i) => (
                  <View key={i} style={{ flex: 1, gap: 4, alignItems: 'center' }}>
                    <View style={{ width: '100%', height: (v / max) * 50 + 2, borderRadius: 2, backgroundColor: i === 5 ? '#86EFAC' : 'rgba(255,255,255,0.4)' }} />
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600' }}>{days[i]}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginTop: 16 }}>
          {[
            { v: '4.9', l: 'Avaliação', icon: <Star size={12} color={theme.colors.star} fill={theme.colors.star} /> },
            { v: String(completed.length), l: 'Trabalhos' },
            { v: '96%', l: 'Concluídos' },
          ].map((s, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.hairline }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {s.icon}
                <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '700' }}>{s.v}</Text>
              </View>
              <Text style={{ color: theme.colors.textSec, fontSize: 10, marginTop: 2 }}>{s.l}</Text>
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
