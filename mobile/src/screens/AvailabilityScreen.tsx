import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Minus, Plus } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '../components/Button';
import * as availApi from '../api/availability';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface DayState {
  active: boolean;
  startHour: number;
  endHour: number;
}

const DEFAULT_DAY: DayState = { active: false, startHour: 8, endHour: 18 };

export default function AvailabilityScreen() {
  const nav = useNavigation();
  const { theme } = useTheme();
  const c = theme.colors;
  const [days, setDays] = useState<DayState[]>(() => WEEKDAYS.map(() => ({ ...DEFAULT_DAY })));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    availApi
      .getMyAvailability()
      .then((rules) => {
        setDays((prev) =>
          prev.map((d, weekday) => {
            const rule = rules.find((r) => r.weekday === weekday);
            return rule
              ? { active: true, startHour: Math.floor(rule.startMinute / 60), endHour: Math.floor(rule.endMinute / 60) }
              : d;
          }),
        );
      })
      .catch(() => { /* sem agenda ainda */ })
      .finally(() => setLoading(false));
  }, []);

  const patch = (i: number, next: Partial<DayState>) =>
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...next } : d)));

  const save = async () => {
    // Valida: em cada dia ativo, início < fim.
    const bad = days.some((d) => d.active && d.startHour >= d.endHour);
    if (bad) {
      Alert.alert('Horário inválido', 'Em cada dia ativo, o início deve ser antes do fim.');
      return;
    }
    setSaving(true);
    try {
      const rules = days
        .map((d, weekday) => ({ weekday, startMinute: d.startHour * 60, endMinute: d.endHour * 60, active: d.active }))
        .filter((r) => r.active)
        .map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute }));
      await availApi.setMyAvailability(rules);
      Alert.alert('Agenda salva', 'Sua disponibilidade foi atualizada.', [{ text: 'Ok', onPress: () => nav.goBack() }]);
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar a agenda.');
    } finally {
      setSaving(false);
    }
  };

  const Stepper = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Text style={{ color: c.textTer, fontSize: 11, fontWeight: '600' }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => onChange(Math.max(0, value - 1))} hitSlop={6}>
          <Minus size={18} color={c.primary} />
        </Pressable>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', minWidth: 44, textAlign: 'center' }}>
          {String(value).padStart(2, '0')}:00
        </Text>
        <Pressable onPress={() => onChange(Math.min(23, value + 1))} hitSlop={6}>
          <Plus size={18} color={c.primary} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voltar">
          <ArrowLeft size={24} color={c.text} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>Minha agenda</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}>
            <Text style={{ color: c.textSec, fontSize: 13, marginBottom: 4 }}>
              Ligue os dias que atende e defina o horário. Os clientes só verão horários livres dentro dessa grade.
            </Text>
            {days.map((d, i) => (
              <View
                key={i}
                style={{ backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.hairline, padding: 14, gap: 12 }}
              >
                <Pressable
                  onPress={() => patch(i, { active: !d.active })}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{WEEKDAYS[i]}</Text>
                  <View
                    style={{
                      width: 46, height: 28, borderRadius: 14, padding: 3,
                      backgroundColor: d.active ? c.primary : c.surface2,
                      alignItems: d.active ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.onPrimary }} />
                  </View>
                </Pressable>
                {d.active && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingTop: 4 }}>
                    <Stepper label="INÍCIO" value={d.startHour} onChange={(v) => patch(i, { startHour: v })} />
                    <Stepper label="FIM" value={d.endHour} onChange={(v) => patch(i, { endHour: v })} />
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.hairline }}>
            <Button loading={saving} onPress={save}>Salvar agenda</Button>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
