import { useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Check } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AxiosError } from 'axios';
import { useTheme } from '../contexts/ThemeContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import * as usersApi from '../api/users';
import type { AuthStackParamList } from '../navigation/types';

const requirements = [
  { id: 'len', test: (s: string) => s.length >= 8,   label: '8 caracteres' },
  { id: 'up',  test: (s: string) => /[A-Z]/.test(s), label: '1 letra maiúscula' },
  { id: 'low', test: (s: string) => /[a-z]/.test(s), label: '1 letra minúscula' },
  { id: 'num', test: (s: string) => /\d/.test(s),    label: '1 número' },
];

export default function ResetPasswordScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'ResetPassword'>>();
  const { theme } = useTheme();
  const [token, setToken] = useState(route.params?.devToken ?? '');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meets = requirements.every((r) => r.test(next));
  const valid = token.trim().length >= 32 && meets && next === confirm;

  const onSubmit = async () => {
    if (!valid) { setError('Verifique o token e os requisitos da nova senha.'); return; }
    setLoading(true);
    setError(null);
    try {
      await usersApi.resetPassword({ token: token.trim(), newPassword: next });
      Alert.alert('Senha redefinida', 'Use a nova senha para entrar.', [
        { text: 'Ok', onPress: () => nav.navigate('Login') },
      ]);
    } catch (e) {
      setError(e instanceof AxiosError ? (e.response?.data?.error?.message ?? 'Falha ao redefinir') : 'Erro');
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
        <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>Redefinir senha</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, paddingHorizontal: 20 }}>
        <View style={{ gap: 14, marginTop: 8 }}>
          <Input
            label="Token"
            placeholder="Cole o token recebido por e-mail"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
          />
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
          </View>

          {error && <Text style={{ color: theme.colors.danger, fontSize: 13 }}>{error}</Text>}

          <Button loading={loading} disabled={!valid} onPress={onSubmit} style={{ marginTop: 8 }}>Redefinir senha</Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
