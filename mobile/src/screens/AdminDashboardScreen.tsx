import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, TrendingUp, Users, ShieldCheck, Receipt, Percent, Wallet } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import * as adminApi from '../api/admin';

const brl = (reais: number) => reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCents = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (r: number) => `${Math.round(r * 100)}%`;

export default function AdminDashboardScreen() {
  const nav = useNavigation();
  const { theme } = useTheme();
  const c = theme.colors;
  const [overview, setOverview] = useState<adminApi.AdminOverview | null>(null);
  const [funnel, setFunnel] = useState<adminApi.Funnel | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [o, f] = await Promise.all([adminApi.getOverview(), adminApi.getFunnel()]);
      setOverview(o);
      setFunnel(f);
    } catch {
      /* ignora */
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const Card = ({ Icon, label, value, hint }: { Icon: typeof Users; label: string; value: string; hint?: string }) => (
    <View style={{ flex: 1, minWidth: 150, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.hairline, padding: 14, gap: 6 }}>
      <Icon size={18} color={c.primary} />
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: c.textSec, fontSize: 12 }}>{label}</Text>
      {hint ? <Text style={{ color: c.textTer, fontSize: 11 }}>{hint}</Text> : null}
    </View>
  );

  const maxCount = funnel ? Math.max(...funnel.stages.map((s) => s.count), 1) : 1;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voltar">
          <ArrowLeft size={24} color={c.text} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>Painel administrativo</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Card Icon={TrendingUp} label="GMV (pago)" value={brl(overview?.gmv ?? 0)} hint={`${overview?.paidCount ?? 0} pagamentos`} />
            <Card Icon={Percent} label="Comissão retida" value={brlCents(overview?.commissionCents ?? 0)} />
            <Card Icon={Receipt} label="Ticket médio" value={brl(overview?.avgTicket ?? 0)} />
            <Card Icon={Wallet} label="Saques pagos" value={brlCents(overview?.payoutsPaidCents ?? 0)} />
            <Card Icon={Users} label="Usuários" value={String(overview?.users ?? 0)} hint={`${overview?.providers ?? 0} profissionais`} />
            <Card Icon={ShieldCheck} label="Verificados (KYC)" value={String(overview?.verifiedProviders ?? 0)} />
          </View>

          <View style={{ backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.hairline, padding: 16, gap: 14 }}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>Funil de conversão</Text>
            {funnel?.stages.map((s, i) => (
              <View key={s.key} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: c.textSec, fontSize: 13 }}>{s.label}</Text>
                  <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{s.count}</Text>
                </View>
                <View style={{ height: 10, borderRadius: 5, backgroundColor: c.chartTrack, overflow: 'hidden' }}>
                  <View style={{ height: 10, width: `${(s.count / maxCount) * 100}%`, backgroundColor: c.primary, borderRadius: 5 }} />
                </View>
                {i < (funnel?.stages.length ?? 0) - 1 && (
                  <Text style={{ color: c.textTer, fontSize: 11 }}>
                    ↓ {pct([funnel!.rates.acceptedFromRequested, funnel!.rates.completedFromAccepted, funnel!.rates.paidFromCompleted][i])} de conversão
                  </Text>
                )}
              </View>
            ))}
          </View>

          <Text style={{ color: c.textTer, fontSize: 11, textAlign: 'center' }}>
            Atualizado {overview ? new Date(overview.computedAt).toLocaleTimeString('pt-BR') : '—'}
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
