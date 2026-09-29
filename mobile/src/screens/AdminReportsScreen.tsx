import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Bot, ChevronDown, ChevronRight, RefreshCw, ShieldAlert } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import * as reportsApi from '../api/reports';

/**
 * Fila de moderação. Vem ordenada pela prioridade da IA (as não triadas sobem junto,
 * porque veredito nulo é "não analisada", não "sem problema").
 *
 * O que a tela faz questão de mostrar antes de qualquer botão: o que a IA concluiu, com
 * que confiança e POR QUÊ (os sinais). Um admin que só vê "GRAVE 88" ou concorda no
 * automático ou ignora a máquina — nos dois casos a IA deixou de ajudar.
 */

const STATUS_FILTERS: { id: reportsApi.ReportStatus | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'Todas' },
  { id: 'OPEN', label: 'Abertas' },
  { id: 'REVIEWING', label: 'Em análise' },
  { id: 'AWAITING_INFO', label: 'Aguardando' },
  { id: 'RESOLVED', label: 'Resolvidas' },
  { id: 'DISMISSED', label: 'Rejeitadas' },
];

const CATEGORY_LABEL: Record<reportsApi.ModerationCategory, string> = {
  FRAUD: 'Fraude',
  SPAM: 'Spam',
  INAPPROPRIATE: 'Conteúdo impróprio',
  HARASSMENT: 'Assédio',
  SAFETY: 'Segurança',
  OFF_PLATFORM: 'Fora da plataforma',
  NONE: 'Sem categoria',
};

const REASON_LABEL: Record<reportsApi.ReportReason, string> = {
  INAPPROPRIATE: 'Conteúdo impróprio',
  FRAUD: 'Golpe / fraude',
  NO_SHOW: 'Não compareceu',
  SAFETY: 'Segurança',
  OTHER: 'Outro',
};

const TARGET_LABEL: Record<reportsApi.ReportTargetType, string> = {
  USER: 'Perfil',
  SERVICE: 'Serviço',
  CONVERSATION: 'Conversa',
};

const ACTION_LABEL: Record<reportsApi.ModerationActionType, string> = {
  AI_CLASSIFIED: 'Analisada pela IA',
  ACCEPT: 'Aceitar',
  REJECT: 'Rejeitar',
  REQUEST_INFO: 'Pedir info',
  WARN: 'Advertir',
  SUSPEND: 'Suspender 7d',
  BLOCK: 'Bloquear',
  UNBLOCK: 'Desbloquear',
};

/** As seis decisões do admin, mais o desfazer — que existe porque a IA também bloqueia. */
const DECISIONS: Exclude<reportsApi.ModerationActionType, 'AI_CLASSIFIED'>[] = [
  'ACCEPT', 'REJECT', 'REQUEST_INFO', 'WARN', 'SUSPEND', 'BLOCK', 'UNBLOCK',
];

export default function AdminReportsScreen() {
  const nav = useNavigation();
  const { theme } = useTheme();
  const c = theme.colors;
  const [filter, setFilter] = useState<reportsApi.ReportStatus | 'ALL'>('ALL');
  const [reports, setReports] = useState<reportsApi.Report[]>([]);
  const [detail, setDetail] = useState<reportsApi.ReportDetail | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const severityColor = (s: reportsApi.ModerationSeverity | null) =>
    s === 'CRITICAL' || s === 'HIGH' ? c.danger : s === 'MEDIUM' ? c.star : c.textTer;

  const load = useCallback(async () => {
    try {
      setReports(await reportsApi.listReports(filter === 'ALL' ? undefined : filter));
    } catch {
      /* ignora — a tela mostra a lista que já tem */
    } finally {
      setLoading(false);
    }
  }, [filter]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = async (id: string) => {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    try {
      setDetail(await reportsApi.getReport(id));
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar a denúncia.');
    }
  };

  const decide = async (id: string, action: Exclude<reportsApi.ModerationActionType, 'AI_CLASSIFIED'>) => {
    setBusy(true);
    try {
      await reportsApi.moderate(id, { action, ...(action === 'SUSPEND' && { days: 7 }) });
      await load();
      setDetail(await reportsApi.getReport(id));
    } catch {
      Alert.alert('Erro', 'Não foi possível aplicar a decisão.');
    } finally {
      setBusy(false);
    }
  };

  const reanalyze = async (id: string) => {
    setBusy(true);
    try {
      await reportsApi.reanalyze(id);
      await load();
      setDetail(await reportsApi.getReport(id));
    } catch {
      Alert.alert('Erro', 'Não foi possível reanalisar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voltar">
          <ArrowLeft size={24} color={c.text} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>Moderação</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 12 }}>
        {STATUS_FILTERS.map((f) => {
          const active = f.id === filter;
          return (
            <Pressable
              key={f.id}
              onPress={() => { setFilter(f.id); setLoading(true); }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? c.primaryDeep : c.surface, borderWidth: 1, borderColor: active ? c.primaryDeep : c.hairline }}
            >
              <Text style={{ color: active ? c.onPrimary : c.textSec, fontSize: 12, fontWeight: '600' }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={c.primary} />}
        >
          {reports.length === 0 && (
            <Text style={{ color: c.textTer, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>Nenhuma denúncia por aqui.</Text>
          )}

          {reports.map((r) => {
            const open = openId === r.id;
            const triada = r.aiAnalyzedAt !== null;
            return (
              <View key={r.id} style={{ backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: open ? c.primary : c.hairline, overflow: 'hidden' }}>
                <Pressable onPress={() => toggle(r.id)} accessibilityRole="button" style={{ padding: 14, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ShieldAlert size={16} color={severityColor(r.aiSeverity)} />
                    <Text style={{ color: c.text, fontWeight: '700', fontSize: 14, flex: 1 }}>
                      {triada ? CATEGORY_LABEL[r.aiCategory ?? 'NONE'] : 'Não triada pela IA'}
                    </Text>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: c.surface2 }}>
                      <Text style={{ color: severityColor(r.aiSeverity), fontSize: 11, fontWeight: '800' }}>
                        {triada ? `${r.aiSeverity} · ${r.aiPriority}` : '—'}
                      </Text>
                    </View>
                    {open ? <ChevronDown size={16} color={c.textTer} /> : <ChevronRight size={16} color={c.textTer} />}
                  </View>
                  <Text style={{ color: c.textSec, fontSize: 12 }}>
                    {TARGET_LABEL[r.targetType]} · motivo: {REASON_LABEL[r.reason]} · {r.status}
                  </Text>
                  {r.description ? (
                    <Text style={{ color: c.textSec, fontSize: 12 }} numberOfLines={open ? undefined : 2}>{r.description}</Text>
                  ) : null}
                </Pressable>

                {open && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 12, borderTopWidth: 1, borderTopColor: c.hairline, paddingTop: 12 }}>
                    {!detail ? (
                      <ActivityIndicator color={c.primary} />
                    ) : (
                      <>
                        {/* Por que a IA concluiu o que concluiu */}
                        <View style={{ gap: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Bot size={14} color={c.primaryText} />
                            <Text style={{ color: c.text, fontWeight: '700', fontSize: 13, flex: 1 }}>Análise da IA</Text>
                            <Pressable onPress={() => reanalyze(r.id)} disabled={busy} hitSlop={8} accessibilityRole="button" accessibilityLabel="Reanalisar">
                              <RefreshCw size={14} color={c.textTer} />
                            </Pressable>
                          </View>
                          {triada ? (
                            <>
                              <Text style={{ color: c.textSec, fontSize: 12 }}>
                                Confiança {Math.round((detail.aiConfidence ?? 0) * 100)}% · sugestão:{' '}
                                {detail.aiAction ? ACTION_LABEL[detail.aiAction] : 'nenhuma'} · {detail.aiModelVersion}
                              </Text>
                              {(detail.aiSignals ?? []).map((s, i) => (
                                <Text key={`${s.code}-${i}`} style={{ color: c.textTer, fontSize: 11 }}>
                                  • {s.code} ({s.weight}){s.detail ? ` — ${s.detail}` : ''}
                                </Text>
                              ))}
                            </>
                          ) : (
                            <Text style={{ color: c.textTer, fontSize: 12 }}>
                              Sem veredito — o serviço de IA não respondeu. Julgue manualmente ou reanalise.
                            </Text>
                          )}
                        </View>

                        {detail.evidence.length > 0 && (
                          <View style={{ gap: 4 }}>
                            <Text style={{ color: c.text, fontWeight: '700', fontSize: 13 }}>Evidências</Text>
                            {detail.evidence.map((e, i) => (
                              <Text key={`${e}-${i}`} style={{ color: c.textSec, fontSize: 11 }} numberOfLines={1}>• {e}</Text>
                            ))}
                          </View>
                        )}

                        {/* Histórico: o que a IA e os admins já fizeram */}
                        <View style={{ gap: 4 }}>
                          <Text style={{ color: c.text, fontWeight: '700', fontSize: 13 }}>Histórico</Text>
                          {[...detail.actions, ...detail.targetHistory].length === 0 && (
                            <Text style={{ color: c.textTer, fontSize: 11 }}>Nada registrado ainda.</Text>
                          )}
                          {detail.actions.map((a) => (
                            <Text key={a.id} style={{ color: c.textSec, fontSize: 11 }}>
                              • {new Date(a.createdAt).toLocaleString('pt-BR')} — {ACTION_LABEL[a.type]}{' '}
                              {a.actorId === null ? '(IA)' : '(admin)'}{a.reason ? ` — ${a.reason}` : ''}
                            </Text>
                          ))}
                          {detail.targetHistory.length > 0 && (
                            <Text style={{ color: c.textTer, fontSize: 11, marginTop: 4 }}>
                              Este usuário já teve {detail.targetHistory.length} ação(ões) de moderação.
                            </Text>
                          )}
                        </View>

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {DECISIONS.map((a) => (
                            <Pressable
                              key={a}
                              onPress={() => decide(r.id, a)}
                              disabled={busy}
                              accessibilityRole="button"
                              style={{
                                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                                backgroundColor: a === 'BLOCK' ? c.danger : c.surface2,
                                borderWidth: 1, borderColor: a === 'BLOCK' ? c.danger : c.hairline,
                                opacity: busy ? 0.5 : 1,
                              }}
                            >
                              <Text style={{ color: a === 'BLOCK' ? c.onPrimary : c.text, fontSize: 12, fontWeight: '600' }}>
                                {ACTION_LABEL[a]}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
