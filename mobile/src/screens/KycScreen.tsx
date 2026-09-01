import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Clock, Check, X } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import * as kycApi from '../api/kyc';

const DOC_TYPES: { id: kycApi.DocType; label: string }[] = [
  { id: 'CPF', label: 'CPF' },
  { id: 'RG', label: 'RG' },
  { id: 'CNH', label: 'CNH' },
  { id: 'ADDRESS_PROOF', label: 'Comprovante de endereço' },
  { id: 'CERTIFICATE', label: 'Certificado' },
];

export default function KycScreen() {
  const nav = useNavigation();
  const { theme } = useTheme();
  const c = theme.colors;
  const [docs, setDocs] = useState<kycApi.ProviderDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<kycApi.DocType>('CPF');
  const [ref, setRef] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => kycApi.listMyDocuments().then(setDocs).catch(() => setDocs([])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setSaving(true);
    try {
      await kycApi.submitDocument({ type, fileKey: ref.trim() || `doc/${type}-${Date.now()}` });
      setRef('');
      await load();
      Alert.alert('Enviado', 'Documento enviado para análise.');
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar o documento.');
    } finally {
      setSaving(false);
    }
  };

  const statusChip = (status: kycApi.ProviderDocument['status']) => {
    const map = {
      PENDING: { bg: c.warnBg, fg: c.warn, Icon: Clock, label: 'Em análise' },
      APPROVED: { bg: c.successBg, fg: c.success, Icon: Check, label: 'Aprovado' },
      REJECTED: { bg: c.dangerBg, fg: c.danger, Icon: X, label: 'Rejeitado' },
    }[status];
    const { Icon } = map;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: map.bg }}>
        <Icon size={13} color={map.fg} />
        <Text style={{ color: map.fg, fontSize: 11, fontWeight: '700' }}>{map.label}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voltar">
          <ArrowLeft size={24} color={c.text} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>Verificação (KYC)</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text style={{ color: c.textSec, fontSize: 13 }}>
          Envie documentos para ganhar o selo "Verificado" — ele aumenta a confiança e a conversão no seu perfil.
        </Text>

        <View style={{ gap: 8 }}>
          <Text style={{ color: c.textSec, fontSize: 12, fontWeight: '700' }}>Tipo de documento</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DOC_TYPES.map((t) => {
              const active = t.id === type;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setType(t.id)}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? c.primaryDeep : c.surface, borderWidth: 1.5, borderColor: active ? c.primaryHi : c.hairline }}
                >
                  <Text style={{ color: active ? c.onPrimary : c.text, fontSize: 12, fontWeight: '600' }}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Input label="Referência / link do documento" placeholder="Cole o link ou uma referência" value={ref} onChangeText={setRef} />
        <Button loading={saving} onPress={submit}>Enviar para análise</Button>

        <View style={{ gap: 8, marginTop: 8 }}>
          <Text style={{ color: c.textSec, fontSize: 12, fontWeight: '700' }}>Meus documentos</Text>
          {loading ? (
            <ActivityIndicator color={c.primary} />
          ) : docs.length === 0 ? (
            <Text style={{ color: c.textTer, fontSize: 12 }}>Nenhum documento enviado ainda.</Text>
          ) : (
            docs.map((d) => (
              <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.hairline, padding: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>{DOC_TYPES.find((t) => t.id === d.type)?.label ?? d.type}</Text>
                  {d.status === 'REJECTED' && d.rejectionReason ? (
                    <Text style={{ color: c.danger, fontSize: 11, marginTop: 2 }}>{d.rejectionReason}</Text>
                  ) : null}
                </View>
                {statusChip(d.status)}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
