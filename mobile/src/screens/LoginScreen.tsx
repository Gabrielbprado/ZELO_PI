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
    <ScreenContainer scroll contentStyle={{ paddingHorizontal: 28 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable onPress={() => nav.goBack()} style={{ width: 44, height: 44, marginTop: 8, justifyContent: 'center' }}>
          <ArrowLeft color={theme.colors.text} size={24} />
        </Pressable>

        <View style={{ marginTop: 32 }}>
          <Text style={{ color: theme.colors.text, fontSize: 36, fontWeight: '700', letterSpacing: -1.2, lineHeight: 42 }}>
            Bom te ver{'\n'}de novo.
          </Text>
          <Text style={{ color: theme.colors.textSec, marginTop: 12, fontSize: 15, lineHeight: 22 }}>
            Entre para continuar.
          </Text>
        </View>

        <View style={{ gap: 24, marginTop: 40 }}>
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

          <Pressable onPress={() => nav.navigate('ForgotPassword')} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
            <Text style={{ color: theme.colors.textSec, fontSize: 13, fontWeight: '600' }}>
              Esqueci minha senha
            </Text>
          </Pressable>

          <Button loading={loading} onPress={onSubmit} style={{ marginTop: 8 }}>
            Entrar
          </Button>
        </View>

        <View style={{ marginTop: 40, alignItems: 'center' }}>
          <Text style={{ color: theme.colors.textSec, fontSize: 14 }}>
            Não tem conta?{' '}
            <Text
              style={{ color: theme.colors.primaryText, fontWeight: '700' }}
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
