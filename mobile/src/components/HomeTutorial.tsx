import { useState } from 'react';
import { Modal, View, Text, Pressable, useWindowDimensions } from 'react-native';
import { Search, Sparkles, Zap, LayoutGrid, X, ArrowRight } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

type Step = {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  eyebrow: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: Search,
    eyebrow: 'Passo 1 de 4',
    title: 'Encontre quem você precisa.',
    body: 'Busque por encanador, eletricista, diarista — ou navegue pelas categorias. Mostramos primeiro quem está perto e bem avaliado.',
  },
  {
    icon: Sparkles,
    eyebrow: 'Passo 2 de 4',
    title: 'Orçamento em 4 toques.',
    body: 'Descreva o serviço em poucos passos e receba uma estimativa transparente, antes mesmo de chamar um profissional.',
  },
  {
    icon: Zap,
    eyebrow: 'Passo 3 de 4',
    title: 'Emergência 24h.',
    body: 'Vazamento, queda de luz, fechadura travada? Toque em SOS e te conectamos com o profissional verificado mais próximo em minutos.',
  },
  {
    icon: LayoutGrid,
    eyebrow: 'Passo 4 de 4',
    title: 'Tudo em um lugar.',
    body: 'Acompanhe agendamentos, converse com o profissional e avalie o serviço — sem sair do app.',
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function HomeTutorial({ visible, onClose }: Props) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const isLast = index === STEPS.length - 1;
  const step = STEPS[index];
  const Icon = step.icon;

  const handleNext = () => {
    if (isLast) {
      onClose();
      setIndex(0);
      return;
    }
    setIndex((i) => i + 1);
  };

  const handleSkip = () => {
    onClose();
    setIndex(0);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleSkip}>
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.overlay,
          justifyContent: 'flex-end',
        }}
      >
        {/* Top "Pular" affordance */}
        <View style={{ flex: 1, padding: 24, alignItems: 'flex-end' }}>
          <Pressable
            onPress={handleSkip}
            hitSlop={12}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: theme.colors.surface,
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 999,
              opacity: pressed ? 0.7 : 1,
              marginTop: 16,
            })}
          >
            <X size={14} color={theme.colors.textSec} />
            <Text style={{ color: theme.colors.textSec, fontSize: 13, fontWeight: '600' }}>Pular</Text>
          </Pressable>
        </View>

        {/* Bottom sheet card */}
        <View
          style={{
            backgroundColor: theme.colors.bg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 28,
            paddingTop: 32,
            paddingBottom: 40,
          }}
        >
          {/* Drag handle */}
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.hairline2,
              marginBottom: 24,
            }}
          />

          {/* Icon + eyebrow */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                backgroundColor: theme.colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={26} color="#fff" strokeWidth={2.2} />
            </View>
            <Text
              style={{
                color: theme.colors.textSec,
                fontSize: 12,
                fontWeight: '700',
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
            >
              {step.eyebrow}
            </Text>
          </View>

          {/* Title + body */}
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 28,
              fontWeight: '700',
              letterSpacing: -0.9,
              lineHeight: 34,
              marginBottom: 12,
            }}
          >
            {step.title}
          </Text>
          <Text
            style={{
              color: theme.colors.textSec,
              fontSize: 15,
              lineHeight: 22,
              marginBottom: 28,
              maxWidth: width - 56,
            }}
          >
            {step.body}
          </Text>

          {/* Footer: dots + next */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {STEPS.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === index ? 24 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: i === index ? theme.colors.text : theme.colors.hairline2,
                  }}
                />
              ))}
            </View>

            <Pressable
              onPress={handleNext}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: theme.colors.text,
                paddingVertical: 14,
                paddingHorizontal: 22,
                borderRadius: 14,
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ color: theme.colors.bg, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 }}>
                {isLast ? 'Começar' : 'Próximo'}
              </Text>
              <ArrowRight size={16} color={theme.colors.bg} strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
