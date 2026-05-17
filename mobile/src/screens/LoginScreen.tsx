import { useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import type { AuthStackParamList } from '../navigation/types';
import { AxiosError } from 'axios';

export default function LoginScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { theme } = useTheme();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Informe e-mail e senha');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e) {
      const msg =
        e instanceof AxiosError
          ? (e.response?.data?.error?.message ?? 'Falha ao entrar')
          : 'Falha ao entrar';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer scroll contentStyle={{ paddingHorizontal: 20 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable onPress={() => nav.goBack()} style={{ width: 40, height: 40, marginTop: 8 }}>
          <ArrowLeft color={theme.colors.text} size={22} />
        </Pressable>
        <Text style={{ color: theme.colors.text, fontSize: 28, fontWeight: '800', marginTop: 24 }}>
          Bem-vindo de volta
        </Text>
        <Text style={{ color: theme.colors.textSec, marginTop: 6, marginBottom: 32 }}>
          Entre para continuar contratando serviços
        </Text>

        <View style={{ gap: 16 }}>
          <Input
            label="E-mail"
            placeholder="voce@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
          />
          <Input
            label="Senha"
            placeholder="••••••••"
            secureTextEntry
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            error={error ?? undefined}
          />
          <Button loading={loading} onPress={onSubmit}>Entrar</Button>
          <Pressable onPress={() => nav.navigate('ForgotPassword')}>
            <Text style={{ color: theme.colors.accentBlue, textAlign: 'center', marginTop: 8 }}>Esqueci minha senha</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 36, alignItems: 'center' }}>
          <Text style={{ color: theme.colors.textSec }}>
            Não tem conta?{' '}
            <Text
              style={{ color: theme.colors.accentBlue, fontWeight: '600' }}
              onPress={() => nav.navigate('Register', { role: 'CLIENT' })}
            >
              Cadastre-se
            </Text>
          </Text>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
