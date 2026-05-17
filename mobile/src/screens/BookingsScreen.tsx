import { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import { Badge } from '../components/Badge';
import { useAuth } from '../contexts/AuthContext';
import * as bookingsApi from '../api/bookings';
import type { Booking, BookingStatus } from '../types';
import type { AppStackParamList } from '../navigation/types';

const statusTone: Record<BookingStatus, 'success' | 'warn' | 'danger' | 'neutral' | 'primary'> = {
  REQUESTED:   'warn',
  ACCEPTED:    'primary',
  IN_PROGRESS: 'primary',
  COMPLETED:   'success',
  CANCELLED:   'danger',
  DISPUTED:    'danger',
};

const statusLabel: Record<BookingStatus, string> = {
  REQUESTED:   'Solicitado',
  ACCEPTED:    'Confirmado',
  IN_PROGRESS: 'Em andamento',
  COMPLETED:   'Concluído',
  CANCELLED:   'Cancelado',
  DISPUTED:    'Disputado',
};

export default function BookingsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await bookingsApi.listMyBookings();
      setItems(result);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
        <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '800' }}>Minha agenda</Text>
        <Text style={{ color: theme.colors.textSec, fontSize: 13, marginTop: 4 }}>
          {user?.role === 'PROVIDER' ? 'Solicitações recebidas' : 'Seus serviços contratados'}
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.accentBlue} />
        </View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={{ color: theme.colors.textSec, textAlign: 'center' }}>
            Sem agendamentos por aqui ainda.{'\n'}Explore o início para contratar um profissional.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 10 }}
          refreshControl={<RefreshControl tintColor={theme.colors.accentBlue} refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const other =
              user?.role === 'PROVIDER'
                ? item.client
                : item.provider?.user;
            return (
              <Pressable
                onPress={() => nav.navigate('BookingDetail', { bookingId: item.id })}
                style={({ pressed }) => ({
                  backgroundColor: theme.colors.surface,
                  borderRadius: theme.radius.lg,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: theme.colors.hairline,
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'center',
                  transform: [{ scale: pressed ? 0.99 : 1 }],
                })}
              >
                <Avatar name={other?.name ?? '?'} size={44} hue={other?.avatarHue ?? 220} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>{item.title}</Text>
                  <Text numberOfLines={1} style={{ color: theme.colors.textSec, fontSize: 12, marginTop: 2 }}>
                    {other?.name ?? '—'} · {item.address}
                  </Text>
                  <Text style={{ color: theme.colors.textTer, fontSize: 11, marginTop: 4 }}>
                    {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                  </Text>
                </View>
                <Badge tone={statusTone[item.status]}>{statusLabel[item.status]}</Badge>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
