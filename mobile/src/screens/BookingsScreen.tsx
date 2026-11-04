import { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarClock } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { EmptyState } from '../components/EmptyState';
import { SkeletonList } from '../components/Skeleton';
import { Avatar } from '../components/Avatar';
import { Badge } from '../components/Badge';
import { useAuth } from '../contexts/AuthContext';
import * as bookingsApi from '../api/bookings';
import { formatReais } from '../utils/money';
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
      <View style={{ paddingHorizontal: theme.spacing.s5, paddingTop: 8, paddingBottom: 12 }}>
        <Text style={{ color: theme.colors.text, ...theme.type.largeTitle }}>Agenda</Text>
        <Text style={{ color: theme.colors.textSec, fontSize: 13, marginTop: 2 }}>
          {user?.role === 'PROVIDER' ? 'Solicitações recebidas' : 'Seus serviços contratados'}
        </Text>
      </View>

      {loading ? (
        <SkeletonList />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={24} color={theme.colors.textSec} />}
          title="Nenhum agendamento por aqui"
          description={user?.role === 'PROVIDER'
            ? 'Assim que um cliente solicitar um serviço, ele aparece nesta lista.'
            : 'Explore o início para contratar um profissional.'}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 10 }}
          refreshControl={<RefreshControl tintColor={theme.colors.primary} refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const other =
              user?.role === 'PROVIDER'
                ? item.client
                : item.provider?.user;
            const isClient = user?.role === 'CLIENT';
            // Cliente com booking concluído e pagamento ainda não fechado precisa de um
            // empurrão visual — destaque o card e coloque um badge "Pagamento pendente".
            const owesPayment =
              isClient &&
              item.status === 'COMPLETED' &&
              (item.payment == null || item.payment.status !== 'PAID');
            return (
              <Pressable
                onPress={() => nav.navigate('BookingDetail', { bookingId: item.id })}
                style={({ pressed }) => ({
                  backgroundColor: owesPayment ? theme.colors.warnBg : theme.colors.surface,
                  borderRadius: theme.radius.md,
                  padding: 14,
                  borderWidth: owesPayment ? 1.5 : 1,
                  borderColor: owesPayment ? theme.colors.warnBorder : theme.colors.hairline,
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Avatar name={other?.name ?? '?'} size={44} hue={other?.avatarHue ?? 220} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 16, fontWeight: '600', letterSpacing: -0.2 }}>{item.title}</Text>
                  <Text numberOfLines={1} style={{ color: theme.colors.textSec, fontSize: 12, marginTop: 2 }}>
                    {other?.name ?? '—'} · {item.address}
                  </Text>
                  {owesPayment ? (
                    <Text style={{ color: theme.colors.warn, fontSize: 12, fontWeight: '800', marginTop: 4 }}>
                      Pagamento pendente{item.priceFinal != null ? ` · ${formatReais(item.priceFinal)}` : ''}
                    </Text>
                  ) : (
                    <Text style={{ color: theme.colors.textTer, fontSize: 11, marginTop: 4 }}>
                      {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                    </Text>
                  )}
                </View>
                <Badge tone={owesPayment ? 'warn' : statusTone[item.status]}>
                  {owesPayment ? 'Pagamento pendente' : statusLabel[item.status]}
                </Badge>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
