import { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, ScrollView } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeft, ShieldCheck, CreditCard, Smartphone, Check, Copy } from 'lucide-react-native';
import { AxiosError } from 'axios';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '../components/Button';
import * as paymentsApi from '../api/payments';
import type { AppStackParamList } from '../navigation/types';

type PaymentMethod = 'pix' | 'card';

export default function PaymentScreen() {
  const nav = useNavigation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'Payment'>>();
  const { theme } = useTheme();
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [busy, setBusy] = useState(false);
  const [pix, setPix] = useState<paymentsApi.PixInfo | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const methods: { id: PaymentMethod; label: string; icon: React.ReactNode; sub: string }[] = [
    { id: 'pix',  label: 'PIX',    icon: <Smartphone size={20} color={theme.colors.success} />,   sub: 'Aprovação instantânea' },
    { id: 'card', label: 'Cartão', icon: <CreditCard size={20} color={theme.colors.accentBlue} />, sub: 'Crédito ou débito' },
  ];

  useEffect(() => {
    // Carrega pagamento existente se houver
    paymentsApi.getPaymentByBooking(params.bookingId).then((p) => {
      if (p?.status === 'PAID') {
        Alert.alert('Pagamento concluído', 'Este serviço já foi pago.', [{ text: 'Ok', onPress: () => nav.goBack() }]);
      }
    }).catch(() => { /* ignore */ });
  }, [params.bookingId, nav]);

  const createOrConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      // Para PIX: criamos um pagamento PENDING e mostramos código.
      // Para cartão: criamos e confirmamos em sequência (gateway mock).
      const { payment, pix: info } = await paymentsApi.createPayment({ bookingId: params.bookingId, method });
      setPaymentId(payment.id);

      if (method === 'pix') {
        setPix(info ?? null);
        return;
      }
      const paid = await paymentsApi.confirmPayment(params.bookingId);
      Alert.alert('Pagamento confirmado', `R$ ${paid.amount} pagos com sucesso.`, [
        { text: 'Ok', onPress: () => nav.goBack() },
      ]);
    } catch (e) {
      setError(e instanceof AxiosError ? (e.response?.data?.error?.message ?? 'Falha no pagamento') : 'Erro');
    } finally {
      setBusy(false);
    }
  };

  const confirmPix = async () => {
    setBusy(true);
    setError(null);
    try {
      // Em produção, isto viria de um webhook. Aqui o cliente "confirma" manualmente
      // para fechar o fluxo durante a integração.
      const paid = await paymentsApi.confirmPayment(params.bookingId);
      Alert.alert('Pagamento confirmado', `R$ ${paid.amount} pagos com sucesso.`, [
        { text: 'Ok', onPress: () => nav.goBack() },
      ]);
    } catch (e) {
      setError(e instanceof AxiosError ? (e.response?.data?.error?.message ?? 'Falha ao confirmar') : 'Erro');
    } finally {
      setBusy(false);
    }
  };

  const copyPix = async () => {
    if (!pix) return;
    await Clipboard.setStringAsync(pix.qrCopyPaste);
    Alert.alert('Código copiado', 'Cole no app do seu banco para pagar.');
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => nav.goBack()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft color={theme.colors.text} size={18} />
        </Pressable>
        <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>Pagamento</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 20 }}>
        <View style={{ alignItems: 'center', paddingVertical: 24, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.hairline }}>
          <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>Total a pagar</Text>
          <Text style={{ color: theme.colors.text, fontSize: 44, fontWeight: '800', letterSpacing: -1, marginTop: 4 }}>R$ {params.amount}</Text>
          <Text style={{ color: theme.colors.textTer, fontSize: 11 }}>BRL · Garantia 90 dias</Text>
        </View>

        {!pix && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.textSec, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Método</Text>
            {methods.map((m) => {
              const active = m.id === method;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setMethod(m.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    padding: 16, borderRadius: theme.radius.lg,
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1.5,
                    borderColor: active ? theme.colors.primaryHi : theme.colors.hairline,
                  }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                    {m.icon}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{m.label}</Text>
                    <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>{m.sub}</Text>
                  </View>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: active ? theme.colors.primaryHi : theme.colors.textTer, backgroundColor: active ? theme.colors.primaryHi : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {active && <Check size={12} color="#fff" strokeWidth={3.5} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {pix && (
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 16, borderWidth: 1, borderColor: theme.colors.hairline, gap: 12 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 15 }}>Pague com PIX</Text>
            <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>
              Copie o código abaixo e cole no app do seu banco. O código expira em {Math.round(pix.expiresInSec / 60)} minutos.
            </Text>
            <View style={{ backgroundColor: theme.colors.surface2, borderRadius: theme.radius.md, padding: 12 }}>
              <Text selectable style={{ color: theme.colors.text, fontSize: 11, lineHeight: 16 }} numberOfLines={4}>
                {pix.qrCopyPaste}
              </Text>
            </View>
            <Pressable
              onPress={copyPix}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                backgroundColor: theme.colors.surface2,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Copy size={14} color={theme.colors.text} />
              <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600' }}>Copiar código</Text>
            </Pressable>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: theme.radius.md, backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' }}>
          <ShieldCheck size={14} color={theme.colors.success} />
          <Text style={{ color: theme.colors.success, fontSize: 12, fontWeight: '600' }}>Pagamento criptografado · valor liberado após confirmação</Text>
        </View>

        {error && <Text style={{ color: theme.colors.danger, fontSize: 13 }}>{error}</Text>}

        {pix ? (
          <Button loading={busy} onPress={confirmPix}>Já paguei, confirmar</Button>
        ) : (
          <Button loading={busy} onPress={createOrConfirm}>
            {method === 'pix' ? `Gerar PIX de R$ ${params.amount}` : `Pagar R$ ${params.amount}`}
          </Button>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
