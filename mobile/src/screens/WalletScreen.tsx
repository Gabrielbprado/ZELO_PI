import { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowDownLeft, ArrowUpRight, Wallet as WalletIcon, Lock } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { formatCents } from '../utils/money';
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
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      setFailed(false);
      const [w, s] = await Promise.all([walletApi.getWallet(), walletApi.getStatement()]);
      setWallet(w);
      setEntries(s.items);
    } catch {
      setFailed(true);
      setWallet({ balanceCents: 0, pendingCents: 0 });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const balance = wallet?.balanceCents ?? 0;
  const pending = wallet?.pendingCents ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <PageHeader title="Carteira" subtitle="Seus recebimentos e saques" onBack={() => nav.goBack()} />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.primary} />
          <Text style={{ color: c.textSec, fontSize: 12, marginTop: 8 }}>Carregando carteira…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: theme.spacing.s5, paddingBottom: 32, gap: 16 }}
          refreshControl={<RefreshControl tintColor={c.primary} refreshing={refreshing} onRefresh={() => load(true)} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ backgroundColor: c.primaryDeep, borderRadius: 18, padding: 20 }}>
            <Text style={{ color: c.onPrimarySec, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Disponível para saque</Text>
            <Text style={{ color: c.onPrimary, fontSize: 36, fontWeight: '800', letterSpacing: -0.5, marginTop: 4 }}>
              {formatCents(balance)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)' }}>
              <Lock size={12} color={c.onPrimarySec} />
              <Text style={{ color: c.onPrimarySec, fontSize: 12 }}>
                Em garantia (escrow): {formatCents(pending)}
              </Text>
            </View>
            <Text style={{ color: c.onPrimarySec, fontSize: 11, marginTop: 6, opacity: 0.85, lineHeight: 15 }}>
              O valor em garantia é liberado quando o serviço é concluído.
            </Text>
          </View>

          <Button
            onPress={() => nav.navigate('Payout', { balanceCents: balance })}
            disabled={balance <= 0}
          >
            Sacar via PIX
          </Button>
          {balance <= 0 && !failed && (
            <Text style={{ color: c.textTer, fontSize: 12, textAlign: 'center', marginTop: -8 }}>
              Conclua serviços pagos para liberar saldo.
            </Text>
          )}

          <View style={{ gap: 8 }}>
            <Text style={{ color: c.textSec, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Extrato</Text>
            {entries.length === 0 ? (
              <EmptyState
                icon={<WalletIcon size={22} color={c.textSec} />}
                title="Sem lançamentos ainda"
                description="Conclua serviços para começar a receber. Pagamentos retidos aparecem aqui como garantia."
              />
            ) : (
              entries.map((e) => {
                const credit = e.type === 'CREDIT';
                return (
                  <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.hairline, padding: 12 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: credit ? c.successBg : c.surface2 }}>
                      {credit ? <ArrowDownLeft size={17} color={c.success} /> : <ArrowUpRight size={17} color={c.textSec} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>{CATEGORY_LABEL[e.category]}</Text>
                      <Text style={{ color: c.textTer, fontSize: 11, marginTop: 1 }}>
                        {new Date(e.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {e.description ? ` · ${e.description}` : ''}
                      </Text>
                    </View>
                    <Text style={{ color: credit ? c.success : c.text, fontWeight: '700', fontSize: 13 }}>
                      {credit ? '+' : '−'} {formatCents(e.amountCents)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

          {failed && (
            <Button variant="secondary" onPress={() => load(true)}>
              Tentar novamente
            </Button>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
