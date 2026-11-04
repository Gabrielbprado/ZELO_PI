import { useMemo, useState } from 'react';
import { View, Text, Pressable, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Info } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import { formatCents, parseBRLToCents } from '../utils/money';
import * as walletApi from '../api/wallet';
import type { AppStackParamList } from '../navigation/types';

export default function PayoutScreen() {
  const nav = useNavigation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'Payout'>>();
  const { theme } = useTheme();
  const c = theme.colors;
  const [amount, setAmount] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const amountCents = useMemo(() => parseBRLToCents(amount), [amount]);
  const pixValid = pixKey.trim().length >= 3;
  const exceeds = amountCents > params.balanceCents;
  const valid = amountCents > 0 && !exceeds && pixValid;

  const amountError = !touched ? undefined : amountCents <= 0
    ? 'Informe um valor maior que zero.'
    : exceeds ? `O valor excede o saldo disponível de ${formatCents(params.balanceCents)}.` : undefined;
  const pixError = !touched || pixValid ? undefined : 'Informe uma chave PIX válida.';

  const quick = [
    { label: '25%', value: Math.floor(params.balanceCents * 0.25) },
    { label: '50%', value: Math.floor(params.balanceCents * 0.5) },
    { label: 'Tudo', value: params.balanceCents },
  ];

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setSaving(true);
    try {
      const payout = await walletApi.requestPayout({ amountCents, pixKey: pixKey.trim() });
      const msg = payout.status === 'PAID' ? 'Saque concluído e enviado para sua chave PIX.' : 'Saque solicitado e em processamento. Avisaremos quando cair.';
      Alert.alert('Pronto', msg, [{ text: 'Ok', onPress: () => nav.goBack() }]);
    } catch {
      Alert.alert('Erro', 'Não foi possível solicitar o saque. Confira o valor e a chave e tente de novo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <PageHeader title="Sacar via PIX" subtitle={`Disponível: ${formatCents(params.balanceCents)}`} onBack={() => nav.goBack()} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.s5, paddingBottom: 32, gap: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ backgroundColor: c.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: c.hairline, padding: 16, gap: 12 }}>
            <Input
              label="Valor (R$)"
              placeholder="0,00"
              value={amount}
              onChangeText={(t) => { setAmount(t); setTouched(true); }}
              keyboardType="decimal-pad"
              error={amountError}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {quick.map((q) => (
                <Pressable
                  key={q.label}
                  onPress={() => { setAmount((q.value / 100).toFixed(2).replace('.', ',')); setTouched(true); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Sacar ${q.label}`}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                    backgroundColor: c.surface2, borderWidth: 1, borderColor: c.hairline,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>{q.label} · {formatCents(q.value)}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={{ backgroundColor: c.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: c.hairline, padding: 16 }}>
            <Input
              label="Chave PIX"
              placeholder="e-mail, CPF, telefone ou aleatória"
              value={pixKey}
              onChangeText={(t) => { setPixKey(t); setTouched(true); }}
              autoCapitalize="none"
              autoCorrect={false}
              error={pixError}
            />
          </View>

          {valid && (
            <View style={{ backgroundColor: c.surface2, borderRadius: theme.radius.md, padding: 12, gap: 4 }}>
              <Text style={{ color: c.textSec, fontSize: 12 }}>Resumo</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: c.textSec, fontSize: 13 }}>Você recebe</Text>
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '800' }}>{formatCents(amountCents)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: c.textSec, fontSize: 13 }}>Restante na carteira</Text>
                <Text style={{ color: c.textSec, fontSize: 13 }}>{formatCents(params.balanceCents - amountCents)}</Text>
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: theme.radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline }}>
            <View style={{ marginTop: 1 }}><Info size={14} color={c.textSec} /></View>
            <Text style={{ color: c.textSec, fontSize: 12, flex: 1, lineHeight: 17 }}>
              Saques vão para a chave PIX informada. Confira a chave antes de confirmar — não é possível cancelar depois do envio.
            </Text>
          </View>

          <Button disabled={!valid} loading={saving} onPress={submit}>Confirmar saque de {amountCents > 0 ? formatCents(amountCents) : ''}</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
