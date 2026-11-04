import { useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck, Bell, MapPin, Lock, Moon, Sun, Smartphone } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { PageHeader } from '../components/PageHeader';
import { Section } from '../components/Section';
import { ListRow } from '../components/ListRow';
import type { ThemePreference } from '../theme';
import type { AppStackParamList } from '../navigation/types';

export default function SettingsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { theme, preference, setPreference } = useTheme();
  const [notif, setNotif] = useState(true);
  const [loc, setLoc] = useState(true);
  const [twoFa, setTwoFa] = useState(false);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <PageHeader title="Ajustes" onBack={() => nav.goBack()} />

      <ScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.s5, gap: theme.spacing.s4, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Section title="Aparência">
          <ThemePicker value={preference} onChange={setPreference} />
        </Section>

        <Section title="Notificações">
          <ListRow icon={<Bell size={17} color={theme.colors.text} />} title="Notificações push" value={notif} onToggle={setNotif} />
        </Section>

        <Section title="Privacidade">
          <ListRow icon={<MapPin size={17} color={theme.colors.text} />} title="Localização aproximada" subtitle="Usada para sugerir profissionais próximos" value={loc} onToggle={setLoc} />
        </Section>

        <Section title="Segurança">
          <ListRow
            icon={<Lock size={17} color={theme.colors.text} />}
            title="Verificação em duas etapas"
            value={twoFa}
            onToggle={(v) => { setTwoFa(v); Alert.alert('Em breve', '2FA será habilitado no próximo update.'); }}
            divider
          />
          <ListRow
            icon={<ShieldCheck size={17} color={theme.colors.text} />}
            title="Alterar senha"
            onPress={() => nav.navigate('ChangePassword')}
          />
        </Section>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 4 }}>
          <Lock size={11} color={theme.colors.textTer} />
          <Text style={{ color: theme.colors.textTer, fontSize: 12, textAlign: 'center' }}>
            ZERO Marketplace · v1.0.0
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'Sistema', Icon: Smartphone },
  { value: 'light',  label: 'Claro',   Icon: Sun },
  { value: 'dark',   label: 'Escuro',  Icon: Moon },
];

/**
 * Três estados em vez de um interruptor: "Sistema" precisa ser uma escolha explícita e
 * persistida, senão não há como distinguir "quer claro" de "quer acompanhar o aparelho".
 */
function ThemePicker({ value, onChange }: { value: ThemePreference; onChange: (v: ThemePreference) => void }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', padding: 10, gap: 8 }}>
      {THEME_OPTIONS.map(({ value: option, label, Icon }) => {
        const active = value === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Tema ${label}`}
            onPress={() => onChange(option)}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              gap: 6,
              paddingVertical: 12,
              borderRadius: theme.radius.md,
              backgroundColor: active ? theme.colors.primaryGlow : theme.colors.surface2,
              borderWidth: 1,
              borderColor: active ? theme.colors.primary : 'transparent',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon size={20} color={active ? theme.colors.primaryText : theme.colors.textSec} />
            <Text style={{ color: active ? theme.colors.primaryText : theme.colors.textSec, fontSize: 13, fontWeight: active ? '600' : '400' }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
