import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AlertTriangle, MapPin, MessageSquare, Pencil, ShieldCheck, Star } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import { formatReais } from '../utils/money';
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
  const [payment, setPayment] = useState<paymentsApi.Payment | null>(null);
  const [priceModal, setPriceModal] = useState<{ nextStatus: 'COMPLETED' | null } | null>(null);
  const [priceInput, setPriceInput] = useState('');

  const reload = useCallback(async () => {
    const r = await api.get<Booking>(`/bookings/${params.bookingId}`);
    setBooking(r.data);
    try {
      const p = await paymentsApi.getPaymentByBooking(params.bookingId);
      setPayment(p);
    } catch { /* sem pagamento ainda */ }
  }, [params.bookingId]);

  useEffect(() => { reload(); }, [reload]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  if (!booking) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const isProvider = user?.role === 'PROVIDER';
  const other = isProvider ? booking.client : booking.provider?.user;
  const canAccept = isProvider && booking.status === 'REQUESTED';
  const canStart  = isProvider && booking.status === 'ACCEPTED';
  const canComplete = isProvider && booking.status === 'IN_PROGRESS';
  const canCancel = ['REQUESTED', 'ACCEPTED'].includes(booking.status);
  const isPaid = payment?.status === 'PAID';
  // Pagar só depois que o profissional definiu o valor final — o valor sugerido pelo
  // cliente nunca é cobrado.
  const hasFinalPrice = (booking.priceFinal ?? 0) > 0;
  const canPay = !isProvider && booking.status === 'COMPLETED' && !isPaid && hasFinalPrice;
  // Autoridade única do dinheiro: só o profissional confirma que recebeu.
  const canConfirmCash = isProvider && payment?.method === 'cash' && payment?.status === 'PENDING';
  // Avaliação bidirecional: o cliente avalia após pagar; o profissional avalia após
  // concluir. Cada um uma vez (o backend garante).
  const alreadyReviewed = (booking.reviews ?? []).some((r) => r.authorId === user?.id);
  const canReview = booking.status === 'COMPLETED' && !alreadyReviewed && (isProvider || isPaid);

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

  // Apenas o prestador pode abrir. O modal é o único caminho para definir/editar o
  // orçamento (priceFinal); o back rejeita valor <= 0 no pagamento, então travamos aqui.
  const openPriceModal = (nextStatus: 'COMPLETED' | null) => {
    const seed = booking.priceFinal ?? 0;
    setPriceInput(seed > 0 ? String(seed) : '');
    setPriceModal({ nextStatus });
  };

  // Provider confirma que recebeu o dinheiro em mãos. Sem calote: cliente não pode fazer
  // isso. Só habilitado quando existe payment cash em PENDING (checado em canConfirmCash).
  const confirmCash = async () => {
    if (!payment) return;
    setBusy(true);
    try {
      const paid = await paymentsApi.confirmPayment(booking.id);
      setPayment(paid);
      Alert.alert('Recebimento confirmado', `Você marcou R$ ${paid.amount} como recebido.`);
    } catch {
      Alert.alert('Erro', 'Não foi possível confirmar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const submitPrice = async () => {
    const parsed = parseInt(priceInput.replace(/\D/g, ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor maior que zero.');
      return;
    }
    const nextStatus = priceModal?.nextStatus;
    setPriceModal(null);
    if (nextStatus === 'COMPLETED') {
      await change('COMPLETED', parsed);
      return;
    }
    // Edição avulsa (sem trocar status): endpoint dedicado, sem re-emitir evento.
    setBusy(true);
    try {
      const updated = await bookingsApi.updateBookingPrice(booking.id, parsed);
      setBooking(updated);
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar o valor.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <PageHeader
        title="Detalhes do serviço"
        subtitle={`${statusLabel[booking.status]} · ${other?.name ?? '—'}`}
        onBack={() => nav.goBack()}
        right={<Badge>{statusLabel[booking.status]}</Badge>}
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, gap: 16 }}>
        {!isProvider && booking.status === 'COMPLETED' && !isPaid && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            padding: 14, borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.warnBg,
            borderWidth: 1.5, borderColor: theme.colors.warnBorder,
          }}>
            <AlertTriangle size={20} color={theme.colors.warn} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.warn, fontSize: 14, fontWeight: '800' }}>
                Falta fazer o pagamento
              </Text>
              <Text style={{ color: theme.colors.warn, fontSize: 12, marginTop: 2, opacity: 0.9 }}>
                {hasFinalPrice
                  ? `O profissional está aguardando o pagamento de ${formatReais(booking.priceFinal)}.`
                  : 'Assim que o profissional enviar o orçamento, você poderá pagar.'}
              </Text>
            </View>
          </View>
        )}

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
          {booking.description && (
            <View>
              <Text style={{ color: theme.colors.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>Observação</Text>
              <Text style={{ color: theme.colors.textSec, fontSize: 13, lineHeight: 19 }}>{booking.description}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <MapPin size={14} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.text, fontSize: 13 }}>{booking.address}</Text>
          </View>
          {booking.needsOnSiteQuote && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
              paddingHorizontal: 10, paddingVertical: 8,
              backgroundColor: theme.colors.surface2, borderRadius: theme.radius.md,
              alignSelf: 'flex-start',
            }}>
              <MapPin size={12} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.text, fontSize: 11, fontWeight: '700' }}>
                {isProvider ? 'Visita para orçar antes do preço final' : 'Aguardando visita para orçamento'}
              </Text>
            </View>
          )}
          <Text style={{ color: theme.colors.textTer, fontSize: 11, marginTop: 4 }}>
            Solicitado em {new Date(booking.createdAt).toLocaleString('pt-BR')}
          </Text>
        </View>

        <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 16, borderWidth: 1, borderColor: theme.colors.hairline, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: theme.colors.textSec, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>Orçamento final</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 18 }}>
                {booking.priceFinal != null ? formatReais(booking.priceFinal) : '—'}
              </Text>
              {isProvider && booking.status !== 'CANCELLED' && (
                <Pressable
                  onPress={() => openPriceModal(null)}
                  hitSlop={8}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.surface2, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Pencil size={14} color={theme.colors.text} />
                </Pressable>
              )}
            </View>
          </View>
          {isProvider && booking.priceFinal == null && (
            <Text style={{ color: theme.colors.textTer, fontSize: 11 }}>
              Toque no lápis para enviar o orçamento. O cliente só pode pagar depois.
            </Text>
          )}
          {!isProvider && booking.priceFinal == null && (
            <Text style={{ color: theme.colors.textTer, fontSize: 11 }}>
              Aguardando o profissional enviar o orçamento.
            </Text>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: theme.radius.md, backgroundColor: theme.colors.successBg, borderWidth: 1, borderColor: theme.colors.successBorder }}>
          <ShieldCheck size={14} color={theme.colors.success} />
          <Text style={{ color: theme.colors.success, fontSize: 12, fontWeight: '600' }}>Garantia de 90 dias em todos os serviços</Text>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 32, gap: 8, backgroundColor: theme.colors.bg, borderTopWidth: 1, borderTopColor: theme.colors.hairline }}>
        {canAccept    && <Button loading={busy} onPress={() => change('ACCEPTED')}>Aceitar serviço</Button>}
        {canStart     && <Button loading={busy} onPress={() => change('IN_PROGRESS')}>Iniciar serviço</Button>}
        {['ACCEPTED', 'IN_PROGRESS'].includes(booking.status) && (
          <Button variant="secondary" onPress={() => nav.navigate('Tracking', { bookingId: booking.id })}>
            {isProvider ? 'Compartilhar deslocamento' : 'Acompanhar deslocamento'}
          </Button>
        )}
        {canComplete  && <Button loading={busy} onPress={() => openPriceModal('COMPLETED')}>Marcar como concluído</Button>}
        {canConfirmCash && (
          <Button loading={busy} onPress={confirmCash}>
            Confirmar recebimento em dinheiro ({formatReais(payment?.amount)})
          </Button>
        )}
        {canPay && (
          <Button variant="primary" onPress={() => nav.navigate('Payment', { bookingId: booking.id, amount: booking.priceFinal! })}>
            Pagar {formatReais(booking.priceFinal)}
          </Button>
        )}
        {!isProvider && booking.status === 'COMPLETED' && !isPaid && !hasFinalPrice && (
          <View style={{ paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: theme.colors.textSec, fontSize: 12, textAlign: 'center' }}>
              Aguardando o profissional definir o valor final.
            </Text>
          </View>
        )}
        {!isProvider && payment?.status === 'PENDING' && payment.method === 'cash' && (
          <View style={{ paddingVertical: 8, alignItems: 'center' }}>
            <Text style={{ color: theme.colors.textSec, fontSize: 12, textAlign: 'center' }}>
              Combinado em dinheiro. Aguardando o profissional confirmar o recebimento.
            </Text>
          </View>
        )}
        {canReview && (
          <Pressable
            onPress={() => nav.navigate('Review', { bookingId: booking.id, providerName: other?.name ?? (isProvider ? 'cliente' : 'profissional') })}
            style={({ pressed }) => ({
              flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
              paddingVertical: 14, borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.surface,
              borderWidth: 1.5, borderColor: theme.colors.star,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Star size={16} color={theme.colors.star} fill={theme.colors.star} />
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
              {isProvider ? 'Avaliar cliente' : 'Avaliar profissional'}
            </Text>
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
        {other && (
          <Pressable
            onPress={() => nav.navigate('Report', { targetUserId: other.id, targetName: other.name, bookingId: booking.id })}
            style={{ alignSelf: 'center', paddingVertical: 8 }}
          >
            <Text style={{ color: theme.colors.textTer, fontSize: 12, fontWeight: '600' }}>Denunciar {other.name}</Text>
          </Pressable>
        )}
      </View>

      <Modal visible={priceModal !== null} transparent animationType="fade" onRequestClose={() => setPriceModal(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <View style={{ width: '100%', maxWidth: 380, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 20, gap: 12, borderWidth: 1, borderColor: theme.colors.hairline }}>
            <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '800' }}>
              {priceModal?.nextStatus === 'COMPLETED' ? 'Valor final do serviço' : 'Orçamento do serviço'}
            </Text>
            <Text style={{ color: theme.colors.textSec, fontSize: 13 }}>
              {priceModal?.nextStatus === 'COMPLETED'
                ? 'Confirme o valor final. Depois de concluído, ele não muda.'
                : 'Envie o orçamento ao cliente. Você pode ajustar até marcar como concluído.'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: theme.colors.hairline, borderRadius: theme.radius.md, paddingHorizontal: 12 }}>
              <Text style={{ color: theme.colors.textSec, fontWeight: '700' }}>R$</Text>
              <TextInput
                value={priceInput}
                onChangeText={(t) => setPriceInput(t.replace(/\D/g, ''))}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={theme.colors.textTer}
                autoFocus
                style={{ flex: 1, paddingVertical: 14, color: theme.colors.text, fontSize: 18, fontWeight: '700' }}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Button variant="ghost" onPress={() => setPriceModal(null)}>Cancelar</Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button loading={busy} onPress={submitPrice}>Confirmar</Button>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
