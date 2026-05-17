import { useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft } from 'lucide-react-native';
import { AxiosError } from 'axios';
import { ScreenContainer } from '../components/ScreenContainer';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { useTheme } from '../contexts/ThemeContext';
import * as bookingsApi from '../api/bookings';
import type { AppStackParamList } from '../navigation/types';

const urgencies: { id: 'EMERGENCY' | 'TODAY' | 'THIS_WEEK' | 'FLEXIBLE'; label: string }[] = [
  { id: 'EMERGENCY', label: 'Agora' },
  { id: 'TODAY',     label: 'Hoje'  },
  { id: 'THIS_WEEK', label: 'Esta semana' },
  { id: 'FLEXIBLE',  label: 'Sem pressa' },
];

export default function BookingScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'Booking'>>();
  const { theme } = useTheme();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [urgency, setUrgency] = useState<'EMERGENCY' | 'TODAY' | 'THIS_WEEK' | 'FLEXIBLE'>('THIS_WEEK');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = title.trim().length >= 3 && address.trim().length >= 3;

  const onSubmit = async () => {
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      const booking = await bookingsApi.createBooking({
        providerId: params.providerId,
        categoryId: params.categoryId,
        title: title.trim(),
        description: description.trim() || undefined,
        address: address.trim(),
        urgency,
      });
      nav.replace('BookingDetail', { bookingId: booking.id });
    } catch (e) {
      setError(e instanceof AxiosError ? (e.response?.data?.error?.message ?? 'Falha ao criar agendamento') : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer scroll contentStyle={{ paddingHorizontal: 20 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable onPress={() => nav.goBack()} style={{ width: 40, marginTop: 8 }}>
          <ArrowLeft color={theme.colors.text} size={22} />
        </Pressable>

        <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '800', marginTop: 24, marginBottom: 6 }}>
          Solicitar serviço
        </Text>
        <Text style={{ color: theme.colors.textSec, marginBottom: 24 }}>
          O profissional revisa e confirma — você só paga após o serviço.
        </Text>

        <View style={{ gap: 16 }}>
          <Input
            label="O que você precisa?"
            placeholder="Ex.: Reparo de torneira na cozinha"
            value={title}
            onChangeText={setTitle}
          />
          <Input
            label="Detalhes (opcional)"
            placeholder="Descreva o problema, materiais, fotos..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            style={{ minHeight: 100, textAlignVertical: 'top' }}
          />
          <Input
            label="Endereço"
            placeholder="Rua, número, bairro"
            value={address}
            onChangeText={setAddress}
          />

          <View>
            <Text style={{ color: theme.colors.textSec, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>Urgência</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {urgencies.map((u) => {
                const active = u.id === urgency;
                return (
                  <Pressable
                    key={u.id}
                    onPress={() => setUrgency(u.id)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
                      backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                      borderWidth: 1.5, borderColor: active ? theme.colors.primaryHi : theme.colors.hairline,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600' }}>{u.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {error && <Text style={{ color: theme.colors.danger, fontSize: 13 }}>{error}</Text>}

          <Button disabled={!valid} loading={loading} onPress={onSubmit} style={{ marginTop: 12 }}>
            Enviar solicitação
          </Button>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
