import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import * as walletApi from '../api/wallet';
import type { AppStackParamList } from '../navigation/types';

export default function PayoutScreen() {
  const nav = useNavigation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'Payout'>>();
  const { theme } = useTheme();
  const c = theme.colors;
  const [amount, setAmount] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [saving, setSaving] = useState(false);

  const amountCents = Math.round(parseFloat(amount.replace(',', '.')) * 100) || 0;
  const valid = amountCents > 0 && amountCents <= params.balanceCents && pixKey.trim().length >= 3;

  const submit = async () => {
    setSaving(true);
    try {
      const payout = await walletApi.requestPayout({ amountCents, pixKey: pixKey.trim() });
      const msg = payout.status === 'PAID' ? 'Saque concluído.' : 'Saque solicitado e em processamento.';
      Alert.alert('Pronto', msg, [{ text: 'Ok', onPress: () => nav.goBack() }]);
    } catch {
      Alert.alert('Erro', 'Não foi possível solicitar o saque.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voltar">
          <ArrowLeft size={24} color={c.text} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>Sacar via PIX</Text>
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        <Text style={{ color: c.textSec, fontSize: 13 }}>
          Disponível: {walletApi.formatBRL(params.balanceCents)}
        </Text>
        <Input label="Valor (R$)" placeholder="0,00" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <Input label="Chave PIX" placeholder="e-mail, CPF, telefone ou aleatória" value={pixKey} onChangeText={setPixKey} autoCapitalize="none" />
        {amountCents > params.balanceCents && (
          <Text style={{ color: c.danger, fontSize: 12 }}>O valor excede o saldo disponível.</Text>
        )}
        <Button disabled={!valid} loading={saving} onPress={submit}>Confirmar saque</Button>
      </View>
    </SafeAreaView>
  );
}
