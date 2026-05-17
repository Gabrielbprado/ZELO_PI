import { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
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

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
        <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '800' }}>Mensagens</Text>
      </View>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.accentBlue} />
        </View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={{ color: theme.colors.textSec, textAlign: 'center' }}>
            Sem conversas ainda.{'\n'}Inicie um chat a partir do perfil de um profissional.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.user?.id ?? Math.random().toString()}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 8 }}
          refreshControl={<RefreshControl tintColor={theme.colors.accentBlue} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          renderItem={({ item }) =>
            !item.user ? null : (
              <Pressable
                onPress={() => nav.navigate('Chat', { otherUserId: item.user!.id, otherName: item.user!.name, otherHue: item.user!.avatarHue })}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  padding: 12, borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.hairline,
                  transform: [{ scale: pressed ? 0.99 : 1 }],
                })}
              >
                <Avatar name={item.user.name} size={48} hue={item.user.avatarHue} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14, flex: 1 }} numberOfLines={1}>
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
