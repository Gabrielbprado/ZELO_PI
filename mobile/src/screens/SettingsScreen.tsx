import { useState } from 'react';
import { View, Text, Pressable, Switch, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ShieldCheck, Bell, MapPin, Lock, Moon, Sun } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import type { AppStackParamList } from '../navigation/types';

export default function SettingsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { theme, mode, toggle } = useTheme();
  const [notif, setNotif] = useState(true);
  const [loc, setLoc] = useState(true);
  const [twoFa, setTwoFa] = useState(false);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => nav.goBack()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.hairline }}>
          <ArrowLeft color={theme.colors.text} size={18} />
        </Pressable>
        <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>Configurações</Text>
      </View>

      <View style={{ paddingHorizontal: 20, gap: 12 }}>
        <Section title="Aparência">
          <ToggleRow
            icon={mode === 'dark' ? <Moon size={16} color={theme.colors.text} /> : <Sun size={16} color={theme.colors.text} />}
            label={mode === 'dark' ? 'Modo escuro' : 'Modo claro'}
            value={mode === 'dark'}
            onChange={() => toggle()}
          />
        </Section>

        <Section title="Notificações">
          <ToggleRow icon={<Bell size={16} color={theme.colors.text} />} label="Receber notificações push" value={notif} onChange={setNotif} />
        </Section>

        <Section title="Privacidade">
          <ToggleRow icon={<MapPin size={16} color={theme.colors.text} />} label="Compartilhar localização aproximada" value={loc} onChange={setLoc} />
        </Section>

        <Section title="Segurança">
          <ToggleRow
            icon={<Lock size={16} color={theme.colors.text} />}
            label="Verificação em duas etapas"
            value={twoFa}
            onChange={(v) => { setTwoFa(v); Alert.alert('Em breve', '2FA será habilitado no próximo update.'); }}
          />
          <Pressable
            onPress={() => nav.navigate('ChangePassword')}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 12,
              paddingHorizontal: 14, paddingVertical: 14,
              borderTopWidth: 1, borderTopColor: theme.colors.hairline,
              backgroundColor: pressed ? theme.colors.surface2 : 'transparent',
            })}
          >
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={16} color={theme.colors.text} />
            </View>
            <Text style={{ color: theme.colors.text, fontSize: 14, flex: 1 }}>Alterar senha</Text>
          </Pressable>
        </Section>

        <Text style={{ color: theme.colors.textTer, fontSize: 11, textAlign: 'center', marginTop: 12 }}>
          ZERO Marketplace · v1.0.0
        </Text>
      </View>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View>
      <Text style={{ color: theme.colors.textSec, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, paddingHorizontal: 4 }}>{title}</Text>
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.hairline, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}

function ToggleRow({ icon, label, value, onChange }: { icon: React.ReactNode; label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      <Text style={{ color: theme.colors.text, fontSize: 14, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: theme.colors.surface2, true: theme.colors.primaryHi }} thumbColor="#fff" />
    </View>
  );
}
