import { View, Text, Pressable, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Settings, Bell, ShieldCheck, ChevronRight, LogOut, MessageSquare, UserCog, Briefcase } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import { useAuth } from '../contexts/AuthContext';
import type { AppStackParamList, RootTabParamList } from '../navigation/types';

type Row =
  | { id: string; label: string; icon: React.ReactNode; kind: 'stack'; to: keyof AppStackParamList }
  | { id: string; label: string; icon: React.ReactNode; kind: 'tab';   to: keyof RootTabParamList };

export default function ProfileScreen() {
  const stackNav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const tabNav   = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const { theme } = useTheme();
  const { user, logout } = useAuth();

  const rows: Row[] = [
    { id: 'edit', label: 'Editar perfil',  icon: <UserCog size={18} color={theme.colors.text} />,       kind: 'stack', to: 'EditProfile' },
    { id: 'noti', label: 'Notificações',   icon: <Bell size={18} color={theme.colors.text} />,          kind: 'stack', to: 'Notifications' },
    { id: 'msg',  label: 'Mensagens',      icon: <MessageSquare size={18} color={theme.colors.text} />, kind: 'tab',   to: 'MessagesTab' },
    ...(user?.role === 'PROVIDER'
      ? [{ id: 'pro', label: 'Gestão profissional', icon: <Briefcase size={18} color={theme.colors.text} />, kind: 'stack' as const, to: 'ProviderManage' as const }]
      : []
    ),
    { id: 'sec',  label: 'Segurança e privacidade', icon: <ShieldCheck size={18} color={theme.colors.text} />, kind: 'stack', to: 'Settings' },
    { id: 'cfg',  label: 'Configurações',  icon: <Settings size={18} color={theme.colors.text} />,      kind: 'stack', to: 'Settings' },
  ];

  const goTo = (r: Row) => {
    if (r.kind === 'tab')   return tabNav.navigate(r.to);
    if (r.kind === 'stack') return stackNav.navigate(r.to as never);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
        <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '800' }}>Perfil</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 16, paddingBottom: 32 }}>
        <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 16, borderWidth: 1, borderColor: theme.colors.hairline, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={user?.name ?? '?'} size={64} hue={user?.avatarHue ?? 220} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 17 }}>{user?.name}</Text>
            <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>{user?.email}</Text>
            <Text style={{ color: theme.colors.accentBlue, fontSize: 11, marginTop: 4, fontWeight: '700' }}>
              {user?.role === 'PROVIDER' ? 'PROFISSIONAL' : 'CLIENTE'}
            </Text>
          </View>
        </View>

        <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.hairline, overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <Pressable
              key={r.id}
              onPress={() => goTo(r)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: 14, paddingVertical: 14,
                borderBottomWidth: i < rows.length - 1 ? 1 : 0,
                borderBottomColor: theme.colors.hairline,
                backgroundColor: pressed ? theme.colors.surface2 : theme.colors.surface,
              })}
            >
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                {r.icon}
              </View>
              <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '500', flex: 1 }}>{r.label}</Text>
              <ChevronRight size={16} color={theme.colors.textTer} />
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => Alert.alert('Sair', 'Tem certeza que quer sair?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Sair', style: 'destructive', onPress: logout },
          ])}
          style={({ pressed }) => ({
            flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
            paddingVertical: 14, borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.dangerBg,
            borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <LogOut size={16} color={theme.colors.danger} />
          <Text style={{ color: theme.colors.danger, fontWeight: '700' }}>Sair</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
