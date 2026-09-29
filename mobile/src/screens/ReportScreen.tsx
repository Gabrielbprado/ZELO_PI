import { useState } from 'react';
import { View, Text, Pressable, Alert, ScrollView } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Paperclip, X } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import * as reportsApi from '../api/reports';
import type { AppStackParamList } from '../navigation/types';

const REASONS: { id: reportsApi.ReportReason; label: string }[] = [
  { id: 'INAPPROPRIATE', label: 'Conteúdo impróprio' },
  { id: 'FRAUD', label: 'Golpe / fraude' },
  { id: 'NO_SHOW', label: 'Não compareceu' },
  { id: 'SAFETY', label: 'Segurança' },
  { id: 'OTHER', label: 'Outro' },
];

const SUBJECT: Record<reportsApi.ReportTargetType, string> = {
  USER: 'este perfil',
  SERVICE: 'este serviço',
  CONVERSATION: 'esta conversa',
};

const MAX_EVIDENCE = 5;

export default function ReportScreen() {
  const nav = useNavigation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'Report'>>();
  const { theme } = useTheme();
  const c = theme.colors;
  const targetType = params.targetType ?? 'USER';
  const [reason, setReason] = useState<reportsApi.ReportReason>('INAPPROPRIATE');
  const [description, setDescription] = useState('');
  const [evidence, setEvidence] = useState<string[]>([]);
  const [evidenceDraft, setEvidenceDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const addEvidence = () => {
    const value = evidenceDraft.trim();
    if (!value || evidence.length >= MAX_EVIDENCE) return;
    setEvidence((prev) => [...prev, value]);
    setEvidenceDraft('');
  };

  const submit = async () => {
    setSaving(true);
    try {
      await reportsApi.createReport({
        targetType,
        targetUserId: targetType === 'SERVICE' ? undefined : params.targetUserId,
        serviceId: params.serviceId,
        reason,
        description: description.trim() || undefined,
        bookingId: params.bookingId,
        evidence: evidence.length ? evidence : undefined,
      });
      Alert.alert(
        'Denúncia enviada',
        'Ela já foi analisada automaticamente e entrou na fila da moderação. Obrigado por ajudar a manter o ZELO seguro.',
        [{ text: 'Ok', onPress: () => nav.goBack() }],
      );
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar a denúncia.');
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
        <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }} numberOfLines={1}>
          Denunciar {params.targetName ?? SUBJECT[targetType]}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: c.textSec, fontSize: 13 }}>
          Você está denunciando {SUBJECT[targetType]}. A análise é automática e revisada por uma pessoa.
        </Text>

        <View style={{ gap: 8 }}>
          {REASONS.map((r) => {
            const active = r.id === reason;
            return (
              <Pressable
                key={r.id}
                onPress={() => setReason(r.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1.5, borderColor: active ? c.danger : c.hairline }}
              >
                <Text style={{ color: c.text, fontWeight: '600' }}>{r.label}</Text>
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: active ? c.danger : c.textTer, backgroundColor: active ? c.danger : 'transparent' }} />
              </Pressable>
            );
          })}
        </View>

        <Input
          label="Detalhes (opcional)"
          placeholder="Conte o que aconteceu"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          style={{ minHeight: 90, textAlignVertical: 'top' }}
        />

        {/* Evidências: links/referências, mesmo padrão do envio de documentos do KYC. */}
        <View style={{ gap: 10 }}>
          <Input
            label={`Evidências (${evidence.length}/${MAX_EVIDENCE})`}
            placeholder="Cole o link de um print, áudio ou documento"
            value={evidenceDraft}
            onChangeText={setEvidenceDraft}
            onSubmitEditing={addEvidence}
            returnKeyType="done"
            autoCapitalize="none"
            editable={evidence.length < MAX_EVIDENCE}
          />
          <Pressable
            onPress={addEvidence}
            disabled={!evidenceDraft.trim() || evidence.length >= MAX_EVIDENCE}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: !evidenceDraft.trim() || evidence.length >= MAX_EVIDENCE ? 0.4 : 1 }}
          >
            <Paperclip size={16} color={c.primaryText} />
            <Text style={{ color: c.primaryText, fontWeight: '600', fontSize: 13 }}>Anexar evidência</Text>
          </Pressable>

          {evidence.map((item, i) => (
            <View key={`${item}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline }}>
              <Text style={{ flex: 1, color: c.textSec, fontSize: 12 }} numberOfLines={1}>{item}</Text>
              <Pressable
                onPress={() => setEvidence((prev) => prev.filter((_, idx) => idx !== i))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remover evidência ${i + 1}`}
              >
                <X size={16} color={c.textTer} />
              </Pressable>
            </View>
          ))}
        </View>

        <Button variant="danger" loading={saving} onPress={submit}>Enviar denúncia</Button>
      </ScrollView>
    </SafeAreaView>
  );
}
