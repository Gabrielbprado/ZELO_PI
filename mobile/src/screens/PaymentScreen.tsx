import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Alert, ScrollView, Image, ActivityIndicator, TextInput } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { ShieldCheck, Smartphone, Check, Copy, Banknote, Timer, AlertTriangle, CreditCard } from 'lucide-react-native';
import { AxiosError } from 'axios';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { formatCountdown, formatReais } from '../utils/money';
import * as paymentsApi from '../api/payments';
import type { AppStackParamList } from '../navigation/types';

type PaymentMethod = paymentsApi.PaymentMethod;

const CARD_METHODS: readonly PaymentMethod[] = ['credit_card', 'debit_card'];
function isCardMethod(m: PaymentMethod | null): boolean {
  return m != null && (CARD_METHODS as readonly string[]).includes(m);
}

/**
 * Três fluxos, três autoridades diferentes para dizer "recebi":
 *
 *   PIX      → o BANCO (Asaas) avisa a API pelo webhook; a API marca PAID; o polling
 *              desta tela detecta e fecha. Cliente escaneia/copia e paga.
 *   CARTÃO   → o adquirente aprova na hora; a API marca PAID na resposta e o webhook
 *              confirma depois. Parcelamento até 12x com taxa comercial.
 *   DINHEIRO → só o PROFISSIONAL confirma no app dele. O cliente aqui só vê "aguardando
 *              o profissional confirmar" — evita que ele feche o serviço sem o dinheiro
 *              ter mesmo trocado de mão.
 */
export default function PaymentScreen() {
  const nav = useNavigation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'Payment'>>();
  const { theme } = useTheme();
  const c = theme.colors;
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [installments, setInstallments] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [pix, setPix] = useState<paymentsApi.PixInfo | null>(null);
  const [awaiting, setAwaiting] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);

  // Dados de cartão coletados por pagamento. Fora do perfil de propósito: PCI
  // escopo mínimo — nada disso persiste no app.
  const [cardHolderName, setCardHolderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCcv, setCardCcv] = useState('');
  const [holderPostalCode, setHolderPostalCode] = useState('');
  const [holderAddressNumber, setHolderAddressNumber] = useState('');
  const [holderPhone, setHolderPhone] = useState('');
  const [installmentOptions, setInstallmentOptions] = useState<paymentsApi.InstallmentOption[]>([]);

  const methods: { id: PaymentMethod; label: string; icon: React.ReactNode; sub: string }[] = [
    { id: 'pix',         label: 'PIX',           icon: <Smartphone size={20} color={c.success} />, sub: 'Aprovação automática pelo banco' },
    { id: 'credit_card', label: 'Cartão crédito', icon: <CreditCard size={20} color={c.primary} />, sub: 'Até 12x — taxas aplicadas' },
    { id: 'debit_card',  label: 'Cartão débito',  icon: <CreditCard size={20} color={c.primary} />, sub: 'À vista, aprovação na hora' },
    { id: 'cash',        label: 'Dinheiro',       icon: <Banknote size={20} color={c.text} />,     sub: 'Confirmado pelo profissional' },
  ];

  // Se já existe pagamento, cai direto no modo de espera — o cliente não precisa recriar
  // se sair da tela e voltar. Se for PIX pendente, re-hidrata o QR: sem isso o cliente
  // que volta pra tela ficaria sem forma de pagar.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p = await paymentsApi.getPaymentByBooking(params.bookingId);
        if (!p || !mounted) return;
        if (p.status === 'PAID') {
          Alert.alert('Pagamento confirmado', 'Este serviço já foi pago.', [
            { text: 'Ok', onPress: () => nav.goBack() },
          ]);
          return;
        }
        if (p.status === 'FAILED' || p.status === 'REFUNDED') {
          setError(p.status === 'FAILED'
            ? 'A cobrança anterior expirou ou falhou. Gere uma nova.'
            : 'Este pagamento foi estornado. Contate o suporte.');
          return;
        }
        const m = (p.method as PaymentMethod) ?? 'pix';
        setMethod(m);
        setAwaiting(m);
        if (m === 'pix') {
          const info = await paymentsApi.getPixForBooking(params.bookingId);
          if (mounted && info) {
            setPix(info);
            setExpiresIn(info.expiresInSec ?? null);
          }
        }
      } catch { /* sem pagamento ainda */ }
    })();
    return () => { mounted = false; };
  }, [params.bookingId, nav]);

  // Carrega opções de parcelamento quando entra num método de cartão.
  useEffect(() => {
    if (!isCardMethod(method)) return;
    let mounted = true;
    (async () => {
      try {
        const opts = await paymentsApi.getInstallmentOptions(params.amount);
        if (mounted) setInstallmentOptions(opts);
      } catch { /* usa só à vista */ }
    })();
    return () => { mounted = false; };
  }, [method, params.amount]);

  const onPaid = useCallback((amount: number) => {
    Alert.alert(
      'Pagamento confirmado',
      `${formatReais(amount)} recebidos com sucesso. O profissional foi avisado que o serviço está liberado.`,
      [{ text: 'Ok', onPress: () => nav.goBack() }],
    );
  }, [nav]);

  // Polling: enquanto estamos aguardando, pergunta ao back se já virou PAID.
  //   PIX    → PAID vem do webhook do Asaas (ou FAILED se expirou/foi recusado)
  //   CARTÃO → PAID já veio na resposta; polling cobre o caso de assíncrono
  //   CASH   → PAID vem do botão do prestador
  useEffect(() => {
    if (!awaiting) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const p = await paymentsApi.getPaymentByBooking(params.bookingId);
        if (!active || !p) return;
        if (p.status === 'PAID') {
          clearInterval(timer);
          onPaid(p.amount);
          return;
        }
        // Estados terminais negativos: sai do polling e mostra por que travou. Sem isso a
        // tela ficava girando pra sempre depois de PAYMENT_OVERDUE / DELETED / REFUNDED.
        if (p.status === 'FAILED' || p.status === 'REFUNDED') {
          clearInterval(timer);
          setAwaiting(null);
          setPix(null);
          setExpiresIn(null);
          setError(p.status === 'FAILED'
            ? 'A cobrança expirou ou foi recusada pelo banco. Gere uma nova.'
            : 'Este pagamento foi estornado. Contate o suporte.');
        }
      } catch { /* ignora; tenta de novo */ }
    }, 4000);
    return () => { active = false; clearInterval(timer); };
  }, [awaiting, params.bookingId, onPaid]);

  // Contagem regressiva do QR — antes o `expiresInSec` vinha da API e era ignorado,
  // então o cliente descobria que o PIX expirou só depois de tentar pagar.
  useEffect(() => {
    if (!awaiting || awaiting !== 'pix') return;
    const t = setInterval(() => setExpiresIn((s) => (s != null && s > 0 ? s - 1 : s)), 1000);
    return () => clearInterval(t);
  }, [awaiting]);

  const selectedInstallment = useMemo(
    () => installmentOptions.find((o) => o.installments === installments),
    [installmentOptions, installments],
  );

  const canSubmit = useMemo(() => {
    if (!isCardMethod(method)) return true;
    const expiryOk = /^(0[1-9]|1[0-2])\/\d{2}$/.test(cardExpiry);
    const numberOk = /^\d{13,19}$/.test(cardNumber.replace(/\s+/g, ''));
    const ccvOk = /^\d{3,4}$/.test(cardCcv);
    const cepOk = /^\d{5}-?\d{3}$/.test(holderPostalCode);
    const phoneOk = /^\d{10,11}$/.test(holderPhone.replace(/\D/g, ''));
    return (
      cardHolderName.trim().length >= 2 &&
      numberOk &&
      expiryOk &&
      ccvOk &&
      cepOk &&
      holderAddressNumber.trim().length >= 1 &&
      phoneOk
    );
  }, [method, cardHolderName, cardNumber, cardExpiry, cardCcv, holderPostalCode, holderAddressNumber, holderPhone]);

  const startPayment = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const payload: paymentsApi.CreatePaymentInput = { bookingId: params.bookingId, method };
      if (isCardMethod(method)) {
        const [mm, yy] = cardExpiry.split('/');
        payload.installments = installments;
        payload.card = {
          holderName: cardHolderName.trim(),
          number: cardNumber.replace(/\s+/g, ''),
          expiryMonth: mm,
          expiryYear: `20${yy}`,
          ccv: cardCcv,
        };
        payload.cardHolderInfo = {
          postalCode: holderPostalCode.replace(/\D/g, ''),
          addressNumber: holderAddressNumber.trim(),
          phone: holderPhone.replace(/\D/g, ''),
        };
      }
      const { payment, pix: info } = await paymentsApi.createPayment(payload);
      if (info) {
        setPix(info);
        setExpiresIn(info.expiresInSec ?? null);
      }
      setAwaiting(payment.method as PaymentMethod);
      if (payment.status === 'PAID') onPaid(payment.amount);
    } catch (e) {
      setError(e instanceof AxiosError ? (e.response?.data?.error?.message ?? 'Falha no pagamento') : 'Erro');
    } finally {
      setBusy(false);
    }
  };

  const copyPix = async () => {
    if (!pix) return;
    await Clipboard.setStringAsync(pix.qrCopyPaste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const instructionByMethod: Record<PaymentMethod, string> = {
    pix:         'Escaneie o QR Code ou copie o código PIX no app do seu banco. Quando ele confirmar o pagamento, esta tela fecha automaticamente — você não precisa clicar em nada.',
    cash:        'Combine o pagamento em dinheiro com o profissional. Quando ele receber, ele mesmo confirma pelo app — e você vê aqui.',
    credit_card: 'Preencha os dados do cartão. A aprovação é imediata — se o banco recusar, você pode tentar outro cartão ou escolher PIX.',
    debit_card:  'Preencha os dados do cartão. A aprovação é imediata — se o banco recusar, você pode tentar outro cartão ou escolher PIX.',
  };

  const badgeByMethod: Record<PaymentMethod, { label: string; tone: 'primary' | 'warn' }> = {
    pix:         { label: 'PIX',      tone: 'primary' },
    cash:        { label: 'Dinheiro', tone: 'warn' },
    credit_card: { label: 'Crédito',  tone: 'primary' },
    debit_card:  { label: 'Débito',   tone: 'primary' },
  };

  const step = !awaiting ? 1 : 2;
  const expired = expiresIn != null && expiresIn <= 0;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <PageHeader
        title="Pagamento"
        subtitle={`Etapa ${step} de 2 · ${!awaiting ? 'Escolha o método' : awaiting === 'pix' ? 'Aguardando o banco' : awaiting === 'cash' ? 'Aguardando o profissional' : 'Processando cartão'}`}
        onBack={() => nav.goBack()}
        right={awaiting ? <Badge tone={badgeByMethod[awaiting].tone}>{badgeByMethod[awaiting].label}</Badge> : undefined}
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.s5, paddingTop: theme.spacing.s3, paddingBottom: 32, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* Etapas */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {['Método', 'Pagar'].map((label, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <View key={label} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{
                  width: 24, height: 24, borderRadius: 12,
                  backgroundColor: done || active ? c.text : c.surface2,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {done ? <Check size={12} color={c.bg} strokeWidth={3.5} /> : (
                    <Text style={{ color: active ? c.bg : c.textSec, fontSize: 11, fontWeight: '800' }}>{n}</Text>
                  )}
                </View>
                <Text style={{ color: active ? c.text : c.textSec, fontSize: 12, fontWeight: active ? '700' : '500' }}>{label}</Text>
                {n === 1 && <View style={{ flex: 1, height: 1, backgroundColor: c.hairline }} />}
              </View>
            );
          })}
        </View>

        <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16, backgroundColor: c.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: c.hairline }}>
          <Text style={{ color: c.textSec, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>Total a pagar</Text>
          <Text style={{ color: c.text, fontSize: 40, fontWeight: '800', letterSpacing: -1, marginTop: 4 }}>
            {formatReais(isCardMethod(method) && selectedInstallment ? selectedInstallment.totalAmount : params.amount)}
          </Text>
          {isCardMethod(method) && selectedInstallment && selectedInstallment.hasInterest && (
            <Text style={{ color: c.textTer, fontSize: 11, marginTop: 2 }}>
              {installments}x de {formatReais(selectedInstallment.installmentAmount)} com juros
            </Text>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <ShieldCheck size={12} color={c.success} />
            <Text style={{ color: c.textTer, fontSize: 11 }}>Garantia de 90 dias inclusa</Text>
          </View>
        </View>

        {!awaiting && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: c.textSec, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Método de pagamento</Text>
            {methods.map((m) => {
              const active = m.id === method;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setMethod(m.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={`${m.label} — ${m.sub}`}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    padding: 16, borderRadius: theme.radius.lg,
                    backgroundColor: c.surface,
                    borderWidth: 1.5,
                    borderColor: active ? c.primaryHi : c.hairline,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
                    {m.icon}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: '700' }}>{m.label}</Text>
                    <Text style={{ color: c.textSec, fontSize: 12 }}>{m.sub}</Text>
                  </View>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: active ? c.primaryHi : c.textTer, backgroundColor: active ? c.primaryHi : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {active && <Check size={12} color={c.onPrimary} strokeWidth={3.5} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {!awaiting && isCardMethod(method) && (
          <View style={{ gap: 10, backgroundColor: c.surface, borderRadius: theme.radius.lg, padding: 16, borderWidth: 1, borderColor: c.hairline }}>
            <Text style={{ color: c.textSec, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Dados do cartão</Text>
            <CardTextField label="Nome como impresso" value={cardHolderName} onChangeText={setCardHolderName} autoCapitalize="characters" />
            <CardTextField label="Número do cartão" value={cardNumber} onChangeText={(t) => setCardNumber(t.replace(/\D/g, '').slice(0, 19))} keyboardType="number-pad" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <CardTextField
                  label="Validade (MM/AA)"
                  value={cardExpiry}
                  onChangeText={(t) => {
                    const digits = t.replace(/\D/g, '').slice(0, 4);
                    setCardExpiry(digits.length >= 3 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
                  }}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ width: 110 }}>
                <CardTextField label="CVV" value={cardCcv} onChangeText={(t) => setCardCcv(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry />
              </View>
            </View>

            <Text style={{ color: c.textSec, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 }}>Endereço de cobrança</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <CardTextField
                  label="CEP"
                  value={holderPostalCode}
                  onChangeText={(t) => {
                    const digits = t.replace(/\D/g, '').slice(0, 8);
                    setHolderPostalCode(digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits);
                  }}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ width: 110 }}>
                <CardTextField label="Número" value={holderAddressNumber} onChangeText={setHolderAddressNumber} keyboardType="default" />
              </View>
            </View>
            <CardTextField
              label="Telefone (com DDD)"
              value={holderPhone}
              onChangeText={(t) => setHolderPhone(t.replace(/\D/g, '').slice(0, 11))}
              keyboardType="phone-pad"
            />

            {method === 'credit_card' && installmentOptions.length > 0 && (
              <View style={{ gap: 6, marginTop: 8 }}>
                <Text style={{ color: c.textSec, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Parcelamento</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {installmentOptions.map((opt) => {
                    const active = opt.installments === installments;
                    return (
                      <Pressable
                        key={opt.installments}
                        onPress={() => setInstallments(opt.installments)}
                        style={({ pressed }) => ({
                          paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.radius.md,
                          backgroundColor: active ? c.primaryHi : c.surface2,
                          borderWidth: 1, borderColor: active ? c.primaryHi : c.hairline,
                          opacity: pressed ? 0.8 : 1,
                        })}
                      >
                        <Text style={{ color: active ? c.onPrimary : c.text, fontSize: 12, fontWeight: '700' }}>
                          {opt.installments}x {formatReais(opt.installmentAmount)}
                        </Text>
                        <Text style={{ color: active ? c.onPrimary : c.textTer, fontSize: 10 }}>
                          {opt.hasInterest ? `Total ${formatReais(opt.totalAmount)}` : 'sem juros'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {awaiting && (
          <View style={{ backgroundColor: c.surface, borderRadius: theme.radius.lg, padding: 16, borderWidth: 1, borderColor: c.hairline, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>
                {awaiting === 'pix' ? 'Pague com PIX' : awaiting === 'cash' ? 'Pagamento em dinheiro' : 'Pagamento com cartão'}
              </Text>
              {awaiting === 'pix' && expiresIn != null && !expired && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: c.surface2 }}>
                  <Timer size={12} color={expiresIn < 60 ? c.danger : c.textSec} />
                  <Text style={{ color: expiresIn < 60 ? c.danger : c.textSec, fontSize: 11, fontWeight: '700' }}>{formatCountdown(expiresIn)}</Text>
                </View>
              )}
            </View>
            <Text style={{ color: c.textSec, fontSize: 12, lineHeight: 18 }}>
              {instructionByMethod[awaiting]}
            </Text>

            {awaiting === 'pix' && expired && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: theme.radius.md, backgroundColor: c.dangerBg, borderWidth: 1, borderColor: c.dangerBorder }}>
                <AlertTriangle size={14} color={c.danger} />
                <Text style={{ color: c.danger, fontSize: 12, fontWeight: '600', flex: 1 }}>Este QR expirou. Gere uma nova cobrança abaixo.</Text>
              </View>
            )}

            {awaiting === 'pix' && pix?.qrCode?.startsWith('data:image') && !expired && (
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <View style={{ padding: 12, backgroundColor: '#FFFFFF', borderRadius: theme.radius.md }}>
                  <Image source={{ uri: pix.qrCode }} style={{ width: 208, height: 208 }} resizeMode="contain" accessibilityLabel="QR Code do PIX" />
                </View>
                <Text style={{ color: c.textTer, fontSize: 11, marginTop: 8 }}>Abra a câmera do app do banco e aponte</Text>
              </View>
            )}

            {awaiting === 'pix' && pix?.qrCopyPaste && !expired && (
              <View style={{ gap: 8 }}>
                <View style={{ backgroundColor: c.surface2, borderRadius: theme.radius.md, padding: 12 }}>
                  <Text selectable style={{ color: c.text, fontSize: 11, lineHeight: 16 }} numberOfLines={4}>
                    {pix.qrCopyPaste}
                  </Text>
                </View>
                <Pressable
                  onPress={copyPix}
                  accessibilityRole="button"
                  accessibilityLabel="Copiar código PIX"
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
                    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                    backgroundColor: copied ? c.successBg : c.surface2,
                    borderWidth: 1, borderColor: copied ? c.successBorder : c.hairline,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  {copied ? <Check size={14} color={c.success} /> : <Copy size={14} color={c.text} />}
                  <Text style={{ color: copied ? c.success : c.text, fontSize: 12, fontWeight: '700' }}>{copied ? 'Copiado!' : 'Copiar código'}</Text>
                </Pressable>
              </View>
            )}

            {awaiting === 'pix' && !pix?.qrCopyPaste && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color={c.primary} />
                <Text style={{ color: c.textSec, fontSize: 12 }}>Gerando QR Code…</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: theme.radius.md, backgroundColor: c.successBg, borderWidth: 1, borderColor: c.successBorder }}>
          <ShieldCheck size={14} color={c.success} />
          <Text style={{ color: c.success, fontSize: 12, fontWeight: '600', flex: 1 }}>
            {awaiting === 'cash'
              ? 'Sem calote: só o profissional confirma o recebimento'
              : 'Confirmação automática pelo banco quando o valor cair'}
          </Text>
        </View>

        {error && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: theme.radius.md, backgroundColor: c.dangerBg, borderWidth: 1, borderColor: c.dangerBorder }}>
            <View style={{ marginTop: 1 }}><AlertTriangle size={14} color={c.danger} /></View>
            <Text style={{ color: c.danger, fontSize: 13, flex: 1, lineHeight: 18 }}>{error}</Text>
          </View>
        )}

        {awaiting ? (
          <View style={{ gap: 8 }}>
            {!expired && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6 }}>
                <ActivityIndicator size="small" color={c.primary} />
                <Text style={{ color: c.textSec, fontSize: 12, textAlign: 'center' }}>
                  {awaiting === 'cash'
                    ? 'Aguardando o profissional confirmar o recebimento…'
                    : awaiting === 'pix'
                      ? 'Aguardando o banco confirmar o pagamento…'
                      : 'Processando pagamento no cartão…'}
                </Text>
              </View>
            )}
            {(expired || error) && (
              <Button loading={busy} onPress={startPayment}>
                Gerar nova cobrança PIX
              </Button>
            )}
          </View>
        ) : (
          <Button loading={busy} disabled={!canSubmit} onPress={startPayment}>
            {method === 'pix'
              ? `Gerar PIX de ${formatReais(params.amount)}`
              : method === 'cash'
                ? 'Combinar pagamento em dinheiro'
                : `Pagar ${formatReais(selectedInstallment?.totalAmount ?? params.amount)}`}
          </Button>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CardTextField(props: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad';
  autoCapitalize?: 'none' | 'characters';
  secureTextEntry?: boolean;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: c.textSec, fontSize: 11, fontWeight: '600' }}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize ?? 'none'}
        secureTextEntry={props.secureTextEntry}
        placeholderTextColor={c.textTer}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: theme.radius.md,
          backgroundColor: c.surface2,
          borderWidth: 1,
          borderColor: c.hairline,
          color: c.text,
          fontSize: 14,
        }}
      />
    </View>
  );
}
