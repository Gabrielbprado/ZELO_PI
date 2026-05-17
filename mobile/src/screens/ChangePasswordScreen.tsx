import { useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Check } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AxiosError } from 'axios';
import { useTheme } from '../contexts/ThemeContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import * as usersApi from '../api/users';

const requirements = [
  { id: 'len', test: (s: string) => s.length >= 8,   label: '8 caracteres' },
  { id: 'up',  test: (s: string) => /[A-Z]/.test(s), label: '1 letra maiúscula' },
  { id: 'low', test: (s: string) => /[a-z]/.test(s), label: '1 letra minúscula' },
  { id: 'num', test: (s: string) => /\d/.test(s),    label: '1 número' },
];

export default function ChangePasswordScreen() {
  const nav = useNavigation();
  const { theme } = useTheme();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meetsAll = requirements.every((r) => r.test(next));
  const valid = current.length >= 1 && meetsAll && next === confirm;

  const onSave = async () => {
    if (!valid) {
      setError('Verifique os requisitos e a confirmação da nova senha.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await usersApi.changePassword({ currentPassword: current, newPassword: next });
      Alert.alert('Pronto', 'Senha alterada. Use a nova senha no próximo login.', [
        { text: 'Ok', onPress: () => nav.goBack() },
      ]);
    } catch (e) {
      setError(e instanceof AxiosError ? (e.response?.data?.error?.message ?? 'Falha ao alterar senha') : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => nav.goBack()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft color={theme.colors.text} size={18} />
        </Pressable>
        <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>Alterar senha</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, paddingHorizontal: 20 }}>
        <View style={{ gap: 14, marginTop: 8 }}>
          <Input label="Senha atual" value={current} onChangeText={setCurrent} secureTextEntry />
          <Input label="Nova senha" value={next} onChangeText={setNext} secureTextEntry />
          <Input label="Confirme a nova senha" value={confirm} onChangeText={setConfirm} secureTextEntry />

          <View style={{ gap: 6, marginTop: 2 }}>
            {requirements.map((r) => {
              const ok = r.test(next);
              return (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View
                    style={{
                      width: 16, height: 16, borderRadius: 8,
                      backgroundColor: ok ? theme.colors.success : 'transparent',
                      borderWidth: 1, borderColor: ok ? theme.colors.success : theme.colors.textTer,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {ok && <Check size={11} color="#fff" strokeWidth={3.5} />}
                  </View>
                  <Text style={{ color: ok ? theme.colors.success : theme.colors.textSec, fontSize: 12 }}>{r.label}</Text>
                </View>
              );
            })}
            {confirm.length > 0 && (
              <Text style={{ color: next === confirm ? theme.colors.success : theme.colors.danger, fontSize: 12, marginTop: 2 }}>
                {next === confirm ? 'Senhas conferem' : 'A confirmação não bate com a nova senha'}
              </Text>
            )}
          </View>

          {error && <Text style={{ color: theme.colors.danger, fontSize: 13 }}>{error}</Text>}

          <Button loading={loading} disabled={!valid} onPress={onSave} style={{ marginTop: 12 }}>Salvar nova senha</Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
