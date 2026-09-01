import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
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

export default function ReportScreen() {
  const nav = useNavigation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'Report'>>();
  const { theme } = useTheme();
  const c = theme.colors;
  const [reason, setReason] = useState<reportsApi.ReportReason>('INAPPROPRIATE');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await reportsApi.createReport({
        targetUserId: params.targetUserId,
        reason,
        description: description.trim() || undefined,
        bookingId: params.bookingId,
      });
      Alert.alert('Denúncia enviada', 'Nossa equipe vai analisar. Obrigado por ajudar a manter o ZELO seguro.', [
        { text: 'Ok', onPress: () => nav.goBack() },
      ]);
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
        <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>Denunciar {params.targetName ?? 'usuário'}</Text>
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        <Text style={{ color: c.textSec, fontSize: 13 }}>Escolha o motivo. Denúncias são analisadas pela nossa equipe de moderação.</Text>

        <View style={{ gap: 8 }}>
          {REASONS.map((r) => {
            const active = r.id === reason;
            return (
              <Pressable
                key={r.id}
                onPress={() => setReason(r.id)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1.5, borderColor: active ? c.danger : c.hairline }}
              >
                <Text style={{ color: c.text, fontWeight: '600' }}>{r.label}</Text>
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: active ? c.danger : c.textTer, backgroundColor: active ? c.danger : 'transparent' }} />
              </Pressable>
            );
          })}
        </View>

        <Input label="Detalhes (opcional)" placeholder="Conte o que aconteceu" value={description} onChangeText={setDescription} multiline numberOfLines={4} style={{ minHeight: 90, textAlignVertical: 'top' }} />

        <Button variant="danger" loading={saving} onPress={submit}>Enviar denúncia</Button>
      </View>
    </SafeAreaView>
  );
}
