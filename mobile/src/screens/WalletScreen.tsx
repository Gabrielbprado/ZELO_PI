import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '../components/Button';
import * as walletApi from '../api/wallet';
import type { AppStackParamList } from '../navigation/types';

const CATEGORY_LABEL: Record<walletApi.LedgerCategory, string> = {
  ESCROW_HOLD: 'Pagamento retido',
  PLATFORM_FEE: 'Comissão da plataforma',
  PAYOUT: 'Saque',
  REFUND: 'Estorno',
};

export default function WalletScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { theme } = useTheme();
  const c = theme.colors;
  const [wallet, setWallet] = useState<walletApi.Wallet | null>(null);
  const [entries, setEntries] = useState<walletApi.LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [w, s] = await Promise.all([walletApi.getWallet(), walletApi.getStatement()]);
      setWallet(w);
      setEntries(s.items);
    } catch {
      setWallet({ balanceCents: 0, pendingCents: 0 });
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voltar">
          <ArrowLeft size={24} color={c.text} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>Carteira</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View style={{ backgroundColor: c.primaryDeep, borderRadius: 18, padding: 20 }}>
            <Text style={{ color: c.onPrimarySec, fontSize: 12, fontWeight: '600' }}>DISPONÍVEL PARA SAQUE</Text>
            <Text style={{ color: c.onPrimary, fontSize: 36, fontWeight: '800', marginTop: 4 }}>
              {walletApi.formatBRL(wallet?.balanceCents ?? 0)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <Text style={{ color: c.onPrimarySec, fontSize: 13 }}>
                Em garantia (escrow): {walletApi.formatBRL(wallet?.pendingCents ?? 0)}
              </Text>
            </View>
          </View>

          <Button
            onPress={() => nav.navigate('Payout', { balanceCents: wallet?.balanceCents ?? 0 })}
            disabled={(wallet?.balanceCents ?? 0) <= 0}
          >
            Sacar via PIX
          </Button>

          <View style={{ gap: 8 }}>
            <Text style={{ color: c.textSec, fontSize: 12, fontWeight: '700' }}>EXTRATO</Text>
            {entries.length === 0 ? (
              <Text style={{ color: c.textTer, fontSize: 12 }}>Sem lançamentos ainda. Conclua serviços para começar a receber.</Text>
            ) : (
              entries.map((e) => {
                const credit = e.type === 'CREDIT';
                return (
                  <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.hairline, padding: 12 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: credit ? c.successBg : c.surface2 }}>
                      {credit ? <ArrowDownLeft size={17} color={c.success} /> : <ArrowUpRight size={17} color={c.textSec} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>{CATEGORY_LABEL[e.category]}</Text>
                      <Text style={{ color: c.textTer, fontSize: 11 }}>{new Date(e.createdAt).toLocaleDateString('pt-BR')}</Text>
                    </View>
                    <Text style={{ color: credit ? c.success : c.text, fontWeight: '700' }}>
                      {credit ? '+' : '−'} {walletApi.formatBRL(e.amountCents)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
