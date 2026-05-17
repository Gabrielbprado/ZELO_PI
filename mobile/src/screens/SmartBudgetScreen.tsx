import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Check, ShieldCheck } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '../components/Button';
import * as budgetApi from '../api/budget';
import * as providersApi from '../api/providers';
import type { Category, BudgetResult } from '../types';
import type { AppStackParamList } from '../navigation/types';

interface Step {
  key: string;
  title: string;
  subtitle: string;
  options: { id: string; label: string; sub?: string }[];
}

const fixedSteps: Step[] = [
  {
    key: 'service',
    title: 'Qual serviço você precisa?',
    subtitle: 'Selecione a categoria principal',
    options: [
      { id: 'leak',   label: 'Vazamento',    sub: 'Cano, torneira, registro' },
      { id: 'inst',   label: 'Instalação',   sub: 'Pia, vaso, chuveiro' },
      { id: 'unclog', label: 'Desentupimento', sub: 'Ralo, vaso, esgoto' },
      { id: 'other',  label: 'Outro reparo', sub: 'Diagnóstico geral' },
    ],
  },
  {
    key: 'place',
    title: 'Onde está o problema?',
    subtitle: 'Em qual cômodo da casa?',
    options: [
      { id: 'kitchen', label: 'Cozinha' },
      { id: 'bath',    label: 'Banheiro' },
      { id: 'laundry', label: 'Lavanderia' },
      { id: 'outside', label: 'Área externa' },
    ],
  },
  {
    key: 'duration',
    title: 'Há quanto tempo?',
    subtitle: 'Isso ajuda a estimar a complexidade',
    options: [
      { id: 'today',  label: 'Hoje',         sub: 'Acabou de acontecer' },
      { id: 'week',   label: 'Esta semana' },
      { id: 'month',  label: 'Mais de 1 mês' },
      { id: 'unsure', label: 'Não sei dizer' },
    ],
  },
  {
    key: 'urgency',
    title: 'Quando você precisa?',
    subtitle: 'Urgência afeta o preço final',
    options: [
      { id: 'now',    label: 'Agora',         sub: 'Emergência' },
      { id: 'today2', label: 'Hoje ainda' },
      { id: 'week2',  label: 'Esta semana' },
      { id: 'flex',   label: 'Sem pressa',    sub: 'Melhor preço' },
    ],
  },
];

export default function SmartBudgetScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { theme } = useTheme();
  const [stepIndex, setStepIndex] = useState(-1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pickedCategory, setPickedCategory] = useState<Category | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<BudgetResult | null>(null);
  const [computing, setComputing] = useState(false);

  useEffect(() => { providersApi.getCategories().then(setCategories); }, []);

  const pickCategory = (c: Category) => {
    setPickedCategory(c);
    setStepIndex(0);
  };

  const pickOption = async (optionId: string) => {
    const step = fixedSteps[stepIndex];
    const updated = { ...answers, [step.key]: optionId };
    setAnswers(updated);

    if (stepIndex < fixedSteps.length - 1) {
      setTimeout(() => setStepIndex(stepIndex + 1), 240);
      return;
    }

    setComputing(true);
    try {
      const res = await budgetApi.estimate(pickedCategory!.id, updated);
      setResult(res);
    } finally {
      setComputing(false);
    }
  };

  // Step -1: categoria
  if (stepIndex === -1) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => nav.goBack()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft color={theme.colors.text} size={18} />
          </Pressable>
          <Text style={{ color: theme.colors.textSec, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>Orçamento Inteligente</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 8 }}>
          <Text style={{ color: theme.colors.text, fontSize: 26, fontWeight: '800', lineHeight: 32 }}>Comece pela categoria</Text>
          <Text style={{ color: theme.colors.textSec, marginBottom: 16 }}>Vamos estimar com base em milhares de serviços</Text>
          {categories.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => pickCategory(c)}
              style={({ pressed }) => ({
                padding: 16, borderRadius: theme.radius.lg,
                backgroundColor: theme.colors.surface,
                borderWidth: 1.5, borderColor: theme.colors.hairline,
                transform: [{ scale: pressed ? 0.99 : 1 }],
              })}
            >
              <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '700' }}>{c.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Resultado
  if (result || computing) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => { setResult(null); setStepIndex(0); }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft color={theme.colors.text} size={18} />
          </Pressable>
          <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>Resultado</Text>
        </View>
        {computing || !result ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.accentBlue} />
            <Text style={{ color: theme.colors.textSec, marginTop: 12 }}>Calculando...</Text>
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, alignItems: 'center', paddingBottom: 120 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.primaryHi, alignItems: 'center', justifyContent: 'center', marginVertical: 16 }}>
                <Text style={{ fontSize: 32 }}>✨</Text>
              </View>
              <Text style={{ color: theme.colors.textSec, fontSize: 13 }}>Estimativa para o seu serviço</Text>
              <Text style={{ color: theme.colors.text, fontSize: 44, fontWeight: '800', letterSpacing: -1, marginTop: 4 }}>
                R$ {result.estimateMin} – {result.estimateMax}
              </Text>
              <Text style={{ color: theme.colors.textSec, fontSize: 12, marginTop: 8 }}>
                Baseado em serviços similares na sua região
              </Text>

              <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 16, marginTop: 20, alignSelf: 'stretch', borderWidth: 1, borderColor: theme.colors.hairline }}>
                <Text style={{ color: theme.colors.textSec, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Inclui</Text>
                {result.breakdown.map((row, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: 'row', justifyContent: 'space-between',
                      paddingVertical: 8,
                      borderBottomWidth: i < result.breakdown.length - 1 ? 1 : 0,
                      borderBottomColor: theme.colors.hairline,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontSize: 13 }}>{row.label}</Text>
                    <Text style={{ color: theme.colors.textSec, fontSize: 13 }}>{row.value}</Text>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: theme.radius.md, backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)', marginTop: 12, alignSelf: 'stretch' }}>
                <ShieldCheck size={14} color={theme.colors.success} />
                <Text style={{ color: theme.colors.success, fontSize: 12, fontWeight: '600' }}>Garantia de 90 dias em todos os serviços</Text>
              </View>
            </ScrollView>

            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 32, backgroundColor: theme.colors.bg, borderTopWidth: 1, borderTopColor: theme.colors.hairline }}>
              <Button onPress={() => nav.replace('ProviderList', { category: pickedCategory! })}>Ver profissionais</Button>
            </View>
          </>
        )}
      </SafeAreaView>
    );
  }

  // Steps
  const cur = fixedSteps[stepIndex];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          onPress={() => (stepIndex > 0 ? setStepIndex(stepIndex - 1) : setStepIndex(-1))}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeft color={theme.colors.text} size={18} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>Orçamento Inteligente</Text>
          <Text style={{ color: theme.colors.text, fontSize: 12 }}>Passo {stepIndex + 1} de {fixedSteps.length}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 20, marginBottom: 24 }}>
        {fixedSteps.map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1, height: 4, borderRadius: 2,
              backgroundColor: i <= stepIndex ? theme.colors.primaryHi : theme.colors.surface2,
            }}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 8 }}>
        <Text style={{ color: theme.colors.text, fontSize: 26, fontWeight: '800', lineHeight: 32 }}>{cur.title}</Text>
        <Text style={{ color: theme.colors.textSec, fontSize: 13, marginBottom: 24 }}>{cur.subtitle}</Text>

        {cur.options.map((o) => {
          const selected = answers[cur.key] === o.id;
          return (
            <Pressable
              key={o.id}
              onPress={() => pickOption(o.id)}
              style={({ pressed }) => ({
                padding: 16, borderRadius: theme.radius.lg,
                backgroundColor: selected ? 'rgba(43,77,184,0.18)' : theme.colors.surface,
                borderWidth: 1.5, borderColor: selected ? theme.colors.primaryHi : theme.colors.hairline,
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              <View>
                <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '700' }}>{o.label}</Text>
                {o.sub && <Text style={{ color: theme.colors.textSec, fontSize: 12, marginTop: 2 }}>{o.sub}</Text>}
              </View>
              <View
                style={{
                  width: 24, height: 24, borderRadius: 12,
                  borderWidth: 2, borderColor: selected ? theme.colors.primaryHi : 'rgba(255,255,255,0.2)',
                  backgroundColor: selected ? theme.colors.primaryHi : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {selected && <Check size={12} color="#fff" strokeWidth={3.5} />}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
