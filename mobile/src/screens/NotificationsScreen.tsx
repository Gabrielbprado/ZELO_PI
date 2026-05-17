import { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Bell, Check } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import * as notificationsApi from '../api/notifications';
import type { Notification } from '../types';

export default function NotificationsScreen() {
  const nav = useNavigation();
  const { theme } = useTheme();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await notificationsApi.list();
      setItems(r);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markAll = async () => { await notificationsApi.markAllRead(); load(); };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => nav.goBack()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft color={theme.colors.text} size={18} />
        </Pressable>
        <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700', flex: 1 }}>Notificações</Text>
        <Pressable onPress={markAll}>
          <Text style={{ color: theme.colors.accentBlue, fontSize: 13, fontWeight: '600' }}>Marcar tudo</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={theme.colors.accentBlue} /></View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Bell size={48} color={theme.colors.textTer} />
          <Text style={{ color: theme.colors.textSec, marginTop: 12 }}>Sem notificações no momento</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 8 }}
          refreshControl={<RefreshControl tintColor={theme.colors.accentBlue} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          renderItem={({ item }) => (
            <View
              style={{
                flexDirection: 'row', gap: 12,
                padding: 12, borderRadius: theme.radius.md,
                backgroundColor: item.readAt ? theme.colors.surface : 'rgba(43,77,184,0.08)',
                borderWidth: 1, borderColor: item.readAt ? theme.colors.hairline : 'rgba(43,77,184,0.25)',
              }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={16} color={theme.colors.accentBlue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 13 }}>{item.title}</Text>
                <Text style={{ color: theme.colors.textSec, fontSize: 12, marginTop: 2 }}>{item.body}</Text>
                <Text style={{ color: theme.colors.textTer, fontSize: 10, marginTop: 4 }}>{new Date(item.createdAt).toLocaleString('pt-BR')}</Text>
              </View>
              {item.readAt && <Check size={12} color={theme.colors.textTer} />}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
