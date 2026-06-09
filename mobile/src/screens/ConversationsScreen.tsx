import { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MoreHorizontal } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import { Badge } from '../components/Badge';
import * as messagesApi from '../api/messages';
import type { AppStackParamList } from '../navigation/types';

export default function ConversationsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { theme } = useTheme();
  const [items, setItems] = useState<messagesApi.Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await messagesApi.listConversations();
      setItems(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const hasUnread = items.some((c) => c.unread > 0);

  const handleMarkAllRead = async () => {
    setBusy(true);
    try {
      await messagesApi.markAllAsRead();
      await load();
    } catch {
      Alert.alert('Erro', 'Não foi possível marcar como lidas.');
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    Alert.alert(
      'Limpar conversas',
      'Isso vai apagar todas as suas conversas e mensagens. Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar tudo',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await messagesApi.clearConversations();
              setItems([]);
            } catch {
              Alert.alert('Erro', 'Não foi possível limpar as conversas.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const openOptions = () => {
    if (busy) return;
    const options: Array<{ text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }> = [];
    if (items.length > 0) options.push({ text: 'Atualizar', onPress: () => { setRefreshing(true); load(); } });
    if (hasUnread) options.push({ text: 'Marcar todas como lidas', onPress: handleMarkAllRead });
    if (items.length > 0) options.push({ text: 'Limpar conversas', style: 'destructive', onPress: handleClear });
    options.push({ text: 'Cancelar', style: 'cancel' });
    Alert.alert('Mensagens', undefined, options);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 }}>Mensagens</Text>
        <Pressable
          onPress={openOptions}
          disabled={busy}
          accessibilityLabel="Mais opções"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 36, height: 36, borderRadius: 18,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: pressed ? theme.colors.surface2 : 'transparent',
            opacity: busy ? 0.5 : 1,
          })}
        >
          {busy
            ? <ActivityIndicator size="small" color={theme.colors.textSec} />
            : <MoreHorizontal size={20} color={theme.colors.text} />}
        </Pressable>
      </View>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.text} />
        </View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={{ color: theme.colors.textSec, textAlign: 'center', fontSize: 14, lineHeight: 20 }}>
            Sem conversas ainda.{'\n'}Inicie um chat a partir do perfil de um profissional.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.user?.id ?? Math.random().toString()}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.colors.hairline, marginVertical: 4 }} />}
          refreshControl={<RefreshControl tintColor={theme.colors.textSec} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          renderItem={({ item }) =>
            !item.user ? null : (
              <Pressable
                onPress={() => nav.navigate('Chat', { otherUserId: item.user!.id, otherName: item.user!.name, otherHue: item.user!.avatarHue })}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingVertical: 12, paddingHorizontal: 4,
                  backgroundColor: pressed ? theme.colors.surface : 'transparent',
                  borderRadius: theme.radius.md,
                })}
              >
                <Avatar name={item.user.name} size={44} hue={item.user.avatarHue} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '600', fontSize: 15, flex: 1 }} numberOfLines={1}>
                      {item.user.name}
                    </Text>
                    <Text style={{ color: theme.colors.textTer, fontSize: 11 }}>
                      {new Date(item.lastAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={{ color: theme.colors.textSec, fontSize: 13, marginTop: 2 }}>{item.lastContent}</Text>
                </View>
                {item.unread > 0 && <Badge tone="danger">{String(item.unread)}</Badge>}
              </Pressable>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}
