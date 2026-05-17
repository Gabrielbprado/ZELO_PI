import { useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, MailCheck } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AxiosError } from 'axios';
import { useTheme } from '../contexts/ThemeContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import * as usersApi from '../api/users';
import type { AuthStackParamList } from '../navigation/types';

export default function ForgotPasswordScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ devToken?: string } | null>(null);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const onSubmit = async () => {
    if (!validEmail) { setError('Informe um e-mail válido'); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await usersApi.forgotPassword(email.trim().toLowerCase());
      setSent({ devToken: r.devToken });
    } catch (e) {
      setError(e instanceof AxiosError ? (e.response?.data?.error?.message ?? 'Falha ao solicitar') : 'Erro');
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
        <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>Esqueci minha senha</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, paddingHorizontal: 20 }}>
        {sent ? (
          <View style={{ flex: 1, paddingTop: 32, alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <MailCheck size={32} color={theme.colors.success} />
            </View>
            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '800', marginTop: 16, textAlign: 'center' }}>
              Verifique seu e-mail
            </Text>
            <Text style={{ color: theme.colors.textSec, marginTop: 8, textAlign: 'center', maxWidth: 320 }}>
              Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha. O link expira em 30 minutos.
            </Text>
            {sent.devToken && (
              <View style={{ marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.hairline }}>
                <Text style={{ color: theme.colors.textTer, fontSize: 11 }}>Token de desenvolvimento (somente em dev):</Text>
                <Text selectable style={{ color: theme.colors.text, fontSize: 11, marginTop: 4 }}>{sent.devToken}</Text>
              </View>
            )}
            <Button onPress={() => nav.navigate('ResetPassword', { devToken: sent.devToken })} style={{ marginTop: 24, alignSelf: 'stretch' }}>
              Tenho o token, redefinir agora
            </Button>
            <Pressable onPress={() => nav.navigate('Login')} style={{ marginTop: 12 }}>
              <Text style={{ color: theme.colors.accentBlue, fontWeight: '600' }}>Voltar para login</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 12, marginTop: 8 }}>
            <Text style={{ color: theme.colors.textSec, marginBottom: 8 }}>
              Informe o e-mail da sua conta. Enviaremos um link para redefinir sua senha.
            </Text>
            <Input
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="voce@email.com"
            />
            {error && <Text style={{ color: theme.colors.danger, fontSize: 13 }}>{error}</Text>}
            <Button loading={loading} onPress={onSubmit} style={{ marginTop: 8 }}>Enviar link</Button>
            <Pressable onPress={() => nav.navigate('ResetPassword')} style={{ alignSelf: 'center', marginTop: 8 }}>
              <Text style={{ color: theme.colors.accentBlue, fontWeight: '600' }}>Já tenho um token</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
