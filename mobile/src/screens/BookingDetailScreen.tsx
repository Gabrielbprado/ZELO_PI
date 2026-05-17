import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, MapPin, MessageSquare, ShieldCheck, Star } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import * as bookingsApi from '../api/bookings';
import * as paymentsApi from '../api/payments';
import type { Booking, BookingStatus } from '../types';
import type { AppStackParamList } from '../navigation/types';

const statusLabel: Record<BookingStatus, string> = {
  REQUESTED:   'Solicitado',
  ACCEPTED:    'Confirmado',
  IN_PROGRESS: 'Em andamento',
  COMPLETED:   'Concluído',
  CANCELLED:   'Cancelado',
  DISPUTED:    'Em disputa',
};

export default function BookingDetailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'BookingDetail'>>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await api.get<Booking>(`/bookings/${params.bookingId}`);
    setBooking(r.data);
    try {
      const p = await paymentsApi.getPaymentByBooking(params.bookingId);
      setPaymentStatus(p?.status ?? null);
    } catch { /* sem pagamento ainda */ }
  }, [params.bookingId]);

  useEffect(() => { reload(); }, [reload]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  if (!booking) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.accentBlue} />
      </View>
    );
  }

  const isProvider = user?.role === 'PROVIDER';
  const other = isProvider ? booking.client : booking.provider?.user;
  const canAccept = isProvider && booking.status === 'REQUESTED';
  const canStart  = isProvider && booking.status === 'ACCEPTED';
  const canComplete = isProvider && booking.status === 'IN_PROGRESS';
  const canCancel = ['REQUESTED', 'ACCEPTED'].includes(booking.status);
  const isPaid = paymentStatus === 'PAID';
  const canPay = !isProvider && booking.status === 'COMPLETED' && !isPaid;
  const canReview = !isProvider && booking.status === 'COMPLETED' && isPaid && !(booking as Booking & { review?: unknown }).review;

  const change = async (status: 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED', priceFinal?: number) => {
    setBusy(true);
    try {
      const updated = await bookingsApi.updateBookingStatus(booking.id, status, priceFinal);
      setBooking(updated);
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar este agendamento.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => nav.goBack()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft color={theme.colors.text} size={18} />
        </Pressable>
        <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700', flex: 1 }}>Detalhes</Text>
        <Badge>{statusLabel[booking.status]}</Badge>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 16 }}>
        <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 16, borderWidth: 1, borderColor: theme.colors.hairline, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Avatar name={other?.name ?? '?'} size={52} hue={other?.avatarHue ?? 220} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>{other?.name ?? '—'}</Text>
            <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>{booking.category?.name ?? '—'}</Text>
          </View>
          {other && (
            <Pressable
              onPress={() => nav.navigate('Chat', { otherUserId: other.id, otherName: other.name, otherHue: other.avatarHue })}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface2, alignItems: 'center', justifyContent: 'center' }}
            >
              <MessageSquare size={18} color={theme.colors.text} />
            </Pressable>
          )}
        </View>

        <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 16, borderWidth: 1, borderColor: theme.colors.hairline, gap: 8 }}>
          <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>{booking.title}</Text>
          {booking.description && <Text style={{ color: theme.colors.textSec, fontSize: 13, lineHeight: 19 }}>{booking.description}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <MapPin size={14} color={theme.colors.accentBlue} />
            <Text style={{ color: theme.colors.text, fontSize: 13 }}>{booking.address}</Text>
          </View>
          <Text style={{ color: theme.colors.textTer, fontSize: 11, marginTop: 4 }}>
            Solicitado em {new Date(booking.createdAt).toLocaleString('pt-BR')}
          </Text>
        </View>

        {booking.priceFinal !== null && booking.priceFinal !== undefined && (
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 16, borderWidth: 1, borderColor: theme.colors.hairline, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: theme.colors.textSec }}>Valor final</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 18 }}>R$ {booking.priceFinal}</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: theme.radius.md, backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' }}>
          <ShieldCheck size={14} color={theme.colors.success} />
          <Text style={{ color: theme.colors.success, fontSize: 12, fontWeight: '600' }}>Garantia de 90 dias em todos os serviços</Text>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 32, gap: 8, backgroundColor: theme.colors.bg, borderTopWidth: 1, borderTopColor: theme.colors.hairline }}>
        {canAccept    && <Button loading={busy} onPress={() => change('ACCEPTED')}>Aceitar serviço</Button>}
        {canStart     && <Button loading={busy} onPress={() => change('IN_PROGRESS')}>Iniciar serviço</Button>}
        {canComplete  && <Button loading={busy} onPress={() => change('COMPLETED', booking.priceEstimate ?? undefined)}>Marcar como concluído</Button>}
        {canPay       && (
          <Button variant="primary" onPress={() => nav.navigate('Payment', { bookingId: booking.id, amount: booking.priceFinal ?? booking.priceEstimate ?? 0 })}>
            Pagar agora
          </Button>
        )}
        {canReview && (
          <Pressable
            onPress={() => nav.navigate('Review', { bookingId: booking.id, providerName: booking.provider?.user.name ?? 'profissional' })}
            style={({ pressed }) => ({
              flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
              paddingVertical: 14, borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.surface,
              borderWidth: 1.5, borderColor: theme.colors.star,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Star size={16} color={theme.colors.star} fill={theme.colors.star} />
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Avaliar este serviço</Text>
          </Pressable>
        )}
        {isPaid && booking.status === 'COMPLETED' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 8 }}>
            <ShieldCheck size={14} color={theme.colors.success} />
            <Text style={{ color: theme.colors.success, fontSize: 12, fontWeight: '600' }}>Pagamento confirmado</Text>
          </View>
        )}
        {canCancel && (
          <Button variant="ghost" loading={busy} onPress={() => change('CANCELLED')}>Cancelar</Button>
        )}
      </View>
    </SafeAreaView>
  );
}
