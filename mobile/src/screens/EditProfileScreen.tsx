import { useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AxiosError } from 'axios';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import * as usersApi from '../api/users';

const HUES = [10, 30, 60, 90, 130, 170, 200, 220, 260, 290, 320, 350];

export default function EditProfileScreen() {
  const nav = useNavigation();
  const { theme } = useTheme();
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [neighborhood, setNeighborhood] = useState(user?.neighborhood ?? '');
  const [avatarHue, setAvatarHue] = useState(user?.avatarHue ?? 220);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    setError(null);
    if (name.trim().length < 2) {
      setError('Informe seu nome completo');
      return;
    }
    setLoading(true);
    try {
      const updated = await usersApi.updateProfile({
        name: name.trim(),
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
        neighborhood: neighborhood.trim() || undefined,
        avatarHue,
      });
      setUser(updated);
      Alert.alert('Pronto', 'Perfil atualizado.', [{ text: 'Ok', onPress: () => nav.goBack() }]);
    } catch (e) {
      setError(e instanceof AxiosError ? (e.response?.data?.error?.message ?? 'Falha ao salvar') : 'Erro');
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
        <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>Editar perfil</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 16 }}>
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <Avatar name={name || '?'} size={80} hue={avatarHue} />
            <Text style={{ color: theme.colors.textSec, fontSize: 11, marginTop: 8 }}>Toque numa cor para mudar</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 10, paddingHorizontal: 20 }}>
              {HUES.map((h) => (
                <Pressable
                  key={h}
                  onPress={() => setAvatarHue(h)}
                  style={{
                    width: 28, height: 28, borderRadius: 14,
                    backgroundColor: `hsl(${h}, 70%, 55%)`,
                    borderWidth: 2,
                    borderColor: avatarHue === h ? theme.colors.text : 'transparent',
                  }}
                />
              ))}
            </View>
          </View>

          <Input label="Nome completo" value={name} onChangeText={setName} autoCapitalize="words" />
          <Input label="Telefone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+55 11 ..." />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Input label="Cidade" value={city} onChangeText={setCity} containerStyle={{ flex: 1 }} />
            <Input label="Bairro" value={neighborhood} onChangeText={setNeighborhood} containerStyle={{ flex: 1 }} />
          </View>

          {error && <Text style={{ color: theme.colors.danger, fontSize: 13 }}>{error}</Text>}

          <Button loading={loading} onPress={onSave} style={{ marginTop: 8 }}>Salvar alterações</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
