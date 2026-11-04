import { View, Text, Alert, ScrollView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Settings, Bell, ShieldCheck, MessageSquare, UserCog, Briefcase, LayoutDashboard, ShieldAlert } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import { Section } from '../components/Section';
import { ListRow } from '../components/ListRow';
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
    { id: 'edit', label: 'Editar perfil',  icon: <UserCog size={17} color={theme.colors.text} />,       kind: 'stack', to: 'EditProfile' },
    { id: 'noti', label: 'Notificações',   icon: <Bell size={17} color={theme.colors.text} />,          kind: 'stack', to: 'Notifications' },
    { id: 'msg',  label: 'Mensagens',      icon: <MessageSquare size={17} color={theme.colors.text} />, kind: 'tab',   to: 'MessagesTab' },
    ...(user?.role === 'PROVIDER'
      ? [{ id: 'pro', label: 'Gestão profissional', icon: <Briefcase size={17} color={theme.colors.text} />, kind: 'stack' as const, to: 'ProviderManage' as const }]
      : []
    ),
    ...(user?.role === 'ADMIN'
      ? [
          { id: 'admin', label: 'Painel administrativo', icon: <LayoutDashboard size={17} color={theme.colors.text} />, kind: 'stack' as const, to: 'AdminDashboard' as const },
          { id: 'mod',   label: 'Moderação de denúncias', icon: <ShieldAlert size={17} color={theme.colors.text} />,    kind: 'stack' as const, to: 'AdminReports' as const },
        ]
      : []
    ),
    { id: 'sec',  label: 'Segurança e privacidade', icon: <ShieldCheck size={17} color={theme.colors.text} />, kind: 'stack', to: 'Settings' },
    { id: 'cfg',  label: 'Configurações',  icon: <Settings size={17} color={theme.colors.text} />,      kind: 'stack', to: 'Settings' },
  ];

  const goTo = (r: Row) => {
    if (r.kind === 'tab')   return tabNav.navigate(r.to);
    if (r.kind === 'stack') return stackNav.navigate(r.to as never);
  };

  // `Alert.alert` com botões NÃO chama os callbacks no React Native Web (o build que roda
  // no navegador) — então a confirmação de logout usava o `onPress` que nunca disparava.
  // Na web usamos `window.confirm`; no nativo, o Alert de sempre.
  const confirmLogout = () => {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && window.confirm('Tem certeza que quer sair?')) void logout();
      return;
    }
    Alert.alert('Sair', 'Tem certeza que quer sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => { void logout(); } },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: theme.spacing.s5, paddingTop: 8, paddingBottom: 12 }}>
        <Text style={{ color: theme.colors.text, ...theme.type.largeTitle }}>Perfil</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.s5, gap: theme.spacing.s4, paddingBottom: 32 }}>
        <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.s4, borderWidth: 1, borderColor: theme.colors.hairline, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={user?.name ?? '?'} size={60} hue={user?.avatarHue ?? 220} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 20, letterSpacing: -0.3 }}>{user?.name}</Text>
            <Text style={{ color: theme.colors.textSec, fontSize: 13, marginTop: 1 }}>{user?.email}</Text>
            <Text style={{ color: theme.colors.primaryText, fontSize: 12, marginTop: 4, fontWeight: '700' }}>
              {user?.role === 'PROVIDER' ? 'PROFISSIONAL' : 'CLIENTE'}
            </Text>
          </View>
        </View>

        <Section>
          {rows.map((r, i) => (
            <ListRow
              key={r.id}
              icon={r.icon}
              title={r.label}
              divider={i < rows.length - 1}
              onPress={() => goTo(r)}
            />
          ))}
        </Section>

        <Section>
          <ListRow
            title="Sair"
            destructive
            onPress={confirmLogout}
          />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
