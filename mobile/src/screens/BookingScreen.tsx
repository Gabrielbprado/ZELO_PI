import { useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft } from 'lucide-react-native';
import { AxiosError } from 'axios';
import { ScreenContainer } from '../components/ScreenContainer';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { useTheme } from '../contexts/ThemeContext';
import * as bookingsApi from '../api/bookings';
import * as availApi from '../api/availability';
import type { AppStackParamList } from '../navigation/types';

const nextDays = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(Date.now() + i * 86_400_000);
  return { date: d.toISOString().slice(0, 10), label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }) };
});
const slotTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

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
  const [needsOnSiteQuote, setNeedsOnSiteQuote] = useState(false);
  const [urgency, setUrgency] = useState<'EMERGENCY' | 'TODAY' | 'THIS_WEEK' | 'FLEXIBLE'>('THIS_WEEK');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<availApi.Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const pickDate = async (date: string) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    setSlotsLoading(true);
    try {
      setSlots(await availApi.getSlots(params.providerId, date));
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

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
        scheduledAt: selectedSlot ?? undefined,
        needsOnSiteQuote,
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
        <Pressable
          onPress={() => nav.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          hitSlop={8}
          style={({ pressed }) => ({ width: 44, height: 44, marginTop: 8, marginLeft: -12, justifyContent: 'center', alignItems: 'center', opacity: pressed ? 0.4 : 1 })}
        >
          <ChevronLeft color={theme.colors.primaryText} size={28} />
        </Pressable>

        <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '800', marginTop: 24, marginBottom: 6 }}>
          Solicitar serviço
        </Text>
        <Text style={{ color: theme.colors.textSec, marginBottom: 24 }}>
          O profissional recebe sua solicitação e envia o orçamento pelo app.
        </Text>

        <View style={{ gap: 16 }}>
          <Input
            label="O que você precisa?"
            placeholder="Ex.: Reparo de torneira na cozinha"
            value={title}
            onChangeText={setTitle}
          />
          <Input
            label="Observação (opcional)"
            placeholder="Descreva o problema, materiais, urgência, fotos..."
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

          <View
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              padding: 14, borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surface,
              borderWidth: 1, borderColor: theme.colors.hairline,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '700' }}>
                Precisa de visita para orçar?
              </Text>
              <Text style={{ color: theme.colors.textSec, fontSize: 11, marginTop: 2 }}>
                O profissional vai ao local antes de enviar o preço final.
              </Text>
            </View>
            <Switch
              value={needsOnSiteQuote}
              onValueChange={setNeedsOnSiteQuote}
              trackColor={{ true: theme.colors.primary, false: theme.colors.hairline2 }}
              thumbColor={theme.colors.onPrimary}
            />
          </View>

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
                      backgroundColor: active ? theme.colors.primaryDeep : theme.colors.surface,
                      borderWidth: 1.5, borderColor: active ? theme.colors.primaryHi : theme.colors.hairline,
                    }}
                  >
                    <Text style={{ color: active ? theme.colors.onPrimary : theme.colors.text, fontSize: 12, fontWeight: '600' }}>{u.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <Text style={{ color: theme.colors.textSec, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
              Horário (opcional)
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {nextDays.map((d) => {
                const active = d.date === selectedDate;
                return (
                  <Pressable
                    key={d.date}
                    onPress={() => pickDate(d.date)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                      backgroundColor: active ? theme.colors.primaryDeep : theme.colors.surface,
                      borderWidth: 1.5, borderColor: active ? theme.colors.primaryHi : theme.colors.hairline,
                    }}
                  >
                    <Text style={{ color: active ? theme.colors.onPrimary : theme.colors.text, fontSize: 12, fontWeight: '600' }}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {selectedDate && (
              slotsLoading ? (
                <Text style={{ color: theme.colors.textTer, fontSize: 12 }}>Carregando horários…</Text>
              ) : slots.length === 0 ? (
                <Text style={{ color: theme.colors.textTer, fontSize: 12 }}>Sem horários livres neste dia.</Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {slots.map((s) => {
                    const active = s.startsAt === selectedSlot;
                    return (
                      <Pressable
                        key={s.startsAt}
                        onPress={() => setSelectedSlot(active ? null : s.startsAt)}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                          backgroundColor: active ? theme.colors.success : theme.colors.surface,
                          borderWidth: 1.5, borderColor: active ? theme.colors.success : theme.colors.hairline,
                        }}
                      >
                        <Text style={{ color: active ? theme.colors.onPrimary : theme.colors.text, fontSize: 12, fontWeight: '700' }}>{slotTime(s.startsAt)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )
            )}
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
