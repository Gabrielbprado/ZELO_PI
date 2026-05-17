import { useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { ArrowLeft, Check } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AxiosError } from 'axios';
import { ScreenContainer } from '../components/ScreenContainer';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import type { AuthStackParamList } from '../navigation/types';

const requirements = [
  { id: 'len', test: (s: string) => s.length >= 8,   label: '8 caracteres' },
  { id: 'up',  test: (s: string) => /[A-Z]/.test(s), label: '1 letra maiúscula' },
  { id: 'low', test: (s: string) => /[a-z]/.test(s), label: '1 letra minúscula' },
  { id: 'num', test: (s: string) => /\d/.test(s),    label: '1 número' },
];

export default function RegisterScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'Register'>>();
  const initialRole = route.params?.role ?? 'CLIENT';

  const { theme } = useTheme();
  const { register } = useAuth();
  const [role, setRole] = useState<'CLIENT' | 'PROVIDER'>(initialRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('São Paulo');
  const [neighborhood, setNeighborhood] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    requirements.every((r) => r.test(password));

  const onSubmit = async () => {
    if (!valid) { setError('Verifique os requisitos da senha e seus dados.'); return; }
    setLoading(true);
    setError(null);
    try {
      await register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim() || undefined,
        role,
        city: city.trim() || undefined,
        neighborhood: neighborhood.trim() || undefined,
      });
    } catch (e) {
      const msg =
        e instanceof AxiosError
          ? (e.response?.data?.error?.message ?? 'Falha ao registrar')
          : 'Falha ao registrar';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer scroll contentStyle={{ paddingHorizontal: 20, paddingBottom: 48 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable onPress={() => nav.goBack()} style={{ width: 40, height: 40, marginTop: 8 }}>
          <ArrowLeft color={theme.colors.text} size={22} />
        </Pressable>

        <Text style={{ color: theme.colors.text, fontSize: 28, fontWeight: '800', marginTop: 24 }}>
          Criar conta
        </Text>
        <Text style={{ color: theme.colors.textSec, marginTop: 6, marginBottom: 24 }}>
          {role === 'PROVIDER' ? 'Comece a receber serviços hoje' : 'É rápido — leva 1 minuto'}
        </Text>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
          {(['CLIENT', 'PROVIDER'] as const).map((r) => {
            const active = role === r;
            return (
              <Pressable
                key={r}
                onPress={() => setRole(r)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: active ? theme.colors.primaryHi : theme.colors.hairline,
                  backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
                  {r === 'CLIENT' ? 'Sou cliente' : 'Sou profissional'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ gap: 14 }}>
          <Input label="Nome completo" value={name} onChangeText={setName} autoCapitalize="words" />
          <Input
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Input label="Telefone (opcional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Input label="Cidade" value={city} onChangeText={setCity} containerStyle={{ flex: 1 }} />
            <Input label="Bairro" value={neighborhood} onChangeText={setNeighborhood} containerStyle={{ flex: 1 }} />
          </View>
          <Input label="Senha" value={password} onChangeText={setPassword} secureTextEntry />

          <View style={{ gap: 6, marginTop: 4 }}>
            {requirements.map((r) => {
              const ok = r.test(password);
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
                  <Text style={{ color: ok ? theme.colors.success : theme.colors.textSec, fontSize: 12 }}>
                    {r.label}
                  </Text>
                </View>
              );
            })}
          </View>

          {error && <Text style={{ color: theme.colors.danger, fontSize: 13 }}>{error}</Text>}

          <Button loading={loading} disabled={!valid} onPress={onSubmit} style={{ marginTop: 8 }}>
            Criar conta
          </Button>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
