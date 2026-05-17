import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, FlatList, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Send } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import { useAuth } from '../contexts/AuthContext';
import * as messagesApi from '../api/messages';
import type { MessageItem } from '../types';
import type { AppStackParamList } from '../navigation/types';

export default function ChatScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'Chat'>>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [text, setText] = useState('');
  const listRef = useRef<FlatList<MessageItem>>(null);

  const load = useCallback(async () => {
    const items = await messagesApi.listThread(params.otherUserId);
    setMessages(items);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
  }, [params.otherUserId]);

  useEffect(() => { load(); const id = setInterval(load, 8000); return () => clearInterval(id); }, [load]);

  const send = async () => {
    const content = text.trim();
    if (!content) return;
    setText('');
    const optimistic: MessageItem = {
      id: `tmp-${Date.now()}`,
      senderId: user!.id,
      receiverId: params.otherUserId,
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    try {
      const real = await messagesApi.sendMessage({ receiverId: params.otherUserId, content });
      setMessages((m) => m.map((it) => (it.id === optimistic.id ? real : it)));
    } catch {
      setMessages((m) => m.filter((it) => it.id !== optimistic.id));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.hairline }}>
        <Pressable onPress={() => nav.goBack()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft color={theme.colors.text} size={18} />
        </Pressable>
        <Avatar name={params.otherName} size={36} hue={params.otherHue ?? 220} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{params.otherName}</Text>
          <Text style={{ color: theme.colors.success, fontSize: 11 }}>Online</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => {
            const mine = item.senderId === user?.id;
            const fg     = mine ? '#fff' : theme.colors.text;
            const fgFaint = mine ? 'rgba(255,255,255,0.55)' : theme.colors.textTer;
            return (
              <View
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  backgroundColor: mine ? theme.colors.primaryHi : theme.colors.surface,
                  borderRadius: 16,
                  borderBottomRightRadius: mine ? 4 : 16,
                  borderBottomLeftRadius:  mine ? 16 : 4,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderWidth: 1,
                  borderColor: mine ? theme.colors.primaryHi : theme.colors.hairline,
                }}
              >
                <Text style={{ color: fg, fontSize: 14 }}>{item.content}</Text>
                <Text style={{ color: fgFaint, fontSize: 10, marginTop: 4, alignSelf: 'flex-end' }}>
                  {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            );
          }}
        />

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.colors.hairline }}>
          <TextInput
            placeholder="Mensagem"
            placeholderTextColor={theme.colors.textTer}
            value={text}
            onChangeText={setText}
            multiline
            style={{
              flex: 1, color: theme.colors.text, fontSize: 14,
              backgroundColor: theme.colors.surface,
              borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10,
              maxHeight: 120, borderWidth: 1, borderColor: theme.colors.hairline,
            }}
          />
          <Pressable
            onPress={send}
            style={({ pressed }) => ({
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: theme.colors.primaryHi,
              alignItems: 'center', justifyContent: 'center',
              opacity: text.trim() ? 1 : 0.5,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
            disabled={!text.trim()}
          >
            <Send size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
