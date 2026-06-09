import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Send, MoreHorizontal, Paperclip, FileText, X } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import { useAuth } from '../contexts/AuthContext';
import * as messagesApi from '../api/messages';
import { getRealtimeSocket, type RealtimeMessage } from '../api/realtime';
import type { MessageItem } from '../types';
import type { AppStackParamList } from '../navigation/types';

const POLL_FALLBACK_MS = 8000;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'Chat'>>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<messagesApi.UploadedAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<MessageItem>>(null);

  const load = useCallback(async () => {
    const items = await messagesApi.listThread(params.otherUserId);
    setMessages(items);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
  }, [params.otherUserId]);

  useEffect(() => {
    load();

    let pollId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let socket: Awaited<ReturnType<typeof getRealtimeSocket>> | undefined;

    const startPolling = () => {
      if (pollId === null) pollId = setInterval(load, POLL_FALLBACK_MS);
    };
    const stopPolling = () => {
      if (pollId !== null) {
        clearInterval(pollId);
        pollId = null;
      }
    };

    const onIncoming = (msg: RealtimeMessage) => {
      if (msg.senderId !== params.otherUserId || msg.receiverId !== user?.id) return;
      setMessages((m) => (m.some((it) => it.id === msg.id) ? m : [...m, msg]));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    };
    const onConnect = () => { stopPolling(); load(); };
    const onDrop = () => startPolling();

    (async () => {
      try {
        socket = await getRealtimeSocket();
        if (cancelled) return;
        socket.on('message:new', onIncoming);
        socket.on('connect', onConnect);
        socket.on('disconnect', onDrop);
        socket.on('connect_error', onDrop);
        if (!socket.connected) startPolling();
      } catch {
        startPolling();
      }
    })();

    return () => {
      cancelled = true;
      stopPolling();
      socket?.off('message:new', onIncoming);
      socket?.off('connect', onConnect);
      socket?.off('disconnect', onDrop);
      socket?.off('connect_error', onDrop);
    };
  }, [load, params.otherUserId, user?.id]);

  const handleAttach = async () => {
    if (uploading || sending) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      if (asset.size && asset.size > MAX_ATTACHMENT_BYTES) {
        Alert.alert('Arquivo grande demais', 'O limite é 25 MB.');
        return;
      }
      setUploading(true);
      const uploaded = await messagesApi.uploadAttachment({
        uri: asset.uri,
        name: asset.name ?? 'arquivo',
        type: asset.mimeType ?? 'application/octet-stream',
      });
      setPending(uploaded);
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar o arquivo.');
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    const content = text.trim();
    if ((!content && !pending) || sending) return;

    const attachment = pending;
    const optimistic: MessageItem = {
      id: `tmp-${Date.now()}`,
      senderId: user!.id,
      receiverId: params.otherUserId,
      content,
      attachmentUrl: attachment?.url,
      attachmentName: attachment?.name,
      attachmentType: attachment?.type,
      attachmentSize: attachment?.size,
      createdAt: new Date().toISOString(),
    };

    setText('');
    setPending(null);
    setSending(true);
    setMessages((m) => [...m, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const real = await messagesApi.sendMessage({
        receiverId: params.otherUserId,
        content: content || undefined,
        attachmentUrl: attachment?.url,
        attachmentName: attachment?.name,
        attachmentType: attachment?.type,
        attachmentSize: attachment?.size,
      });
      setMessages((m) => m.map((it) => (it.id === optimistic.id ? real : it)));
    } catch {
      setMessages((m) => m.filter((it) => it.id !== optimistic.id));
      setText(content);
      setPending(attachment);
      Alert.alert('Erro ao enviar', 'Verifique sua conexão e tente novamente.');
    } finally {
      setSending(false);
    }
  };

  // Enter sends, Shift+Enter inserts a newline. Native keyboards generally use
  // the send button; this is mostly for the web build where users have a
  // physical keyboard.
  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const native = e.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean };
    if (native.key === 'Enter' && !native.shiftKey) {
      e.preventDefault?.();
      send();
    }
  };

  const handleClear = () => {
    Alert.alert(
      'Limpar conversa',
      'Apagar todas as mensagens trocadas com este contato? Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            try {
              await messagesApi.clearThread(params.otherUserId);
              setMessages([]);
            } catch {
              Alert.alert('Erro', 'Não foi possível limpar a conversa.');
            }
          },
        },
      ],
    );
  };

  const openOptions = () => {
    Alert.alert('Conversa', undefined, [
      { text: 'Limpar conversa', style: 'destructive', onPress: handleClear },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const openAttachment = (url: string) => {
    const absolute = messagesApi.resolveAttachmentUrl(url);
    Linking.openURL(absolute).catch(() => Alert.alert('Erro', 'Não foi possível abrir o anexo.'));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.hairline }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft color={theme.colors.text} size={20} />
        </Pressable>
        <Avatar name={params.otherName} size={36} hue={params.otherHue ?? 220} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '600', fontSize: 15 }}>{params.otherName}</Text>
          <Text style={{ color: theme.colors.textTer, fontSize: 11 }}>Online</Text>
        </View>
        <Pressable onPress={openOptions} hitSlop={8} accessibilityLabel="Mais opções" style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
          <MoreHorizontal color={theme.colors.text} size={20} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 6 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const mine = item.senderId === user?.id;
            const fg = mine ? '#fff' : theme.colors.text;
            const fgFaint = mine ? 'rgba(255,255,255,0.6)' : theme.colors.textTer;
            return (
              <View
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '82%',
                  backgroundColor: mine ? theme.colors.primaryHi : theme.colors.surface,
                  borderRadius: 14,
                  borderBottomRightRadius: mine ? 4 : 14,
                  borderBottomLeftRadius: mine ? 14 : 4,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderWidth: 1,
                  borderColor: mine ? theme.colors.primaryHi : theme.colors.hairline,
                }}
              >
                {item.attachmentUrl ? (
                  <Pressable
                    onPress={() => openAttachment(item.attachmentUrl!)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingVertical: 6, paddingHorizontal: 8,
                      backgroundColor: mine ? 'rgba(255,255,255,0.10)' : theme.colors.surface2,
                      borderRadius: 8,
                      marginBottom: item.content ? 6 : 0,
                    }}
                  >
                    <FileText size={18} color={fg} />
                    <View style={{ flexShrink: 1 }}>
                      <Text numberOfLines={1} style={{ color: fg, fontSize: 13, fontWeight: '500' }}>
                        {item.attachmentName ?? 'Arquivo'}
                      </Text>
                      {item.attachmentSize ? (
                        <Text style={{ color: fgFaint, fontSize: 10 }}>{formatBytes(item.attachmentSize)}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                ) : null}
                {item.content ? (
                  <Text style={{ color: fg, fontSize: 14, lineHeight: 18 }}>{item.content}</Text>
                ) : null}
                <Text style={{ color: fgFaint, fontSize: 10, marginTop: 4, alignSelf: 'flex-end' }}>
                  {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            );
          }}
        />

        {pending ? (
          <View style={{ marginHorizontal: 12, marginBottom: 6, paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.hairline }}>
            <FileText size={16} color={theme.colors.text} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 13, fontWeight: '500' }}>{pending.name}</Text>
              <Text style={{ color: theme.colors.textTer, fontSize: 11 }}>{formatBytes(pending.size)}</Text>
            </View>
            <Pressable onPress={() => setPending(null)} hitSlop={8} accessibilityLabel="Remover anexo">
              <X size={16} color={theme.colors.textSec} />
            </Pressable>
          </View>
        ) : null}

        {sending ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ActivityIndicator size="small" color={theme.colors.textSec} />
            <Text style={{ color: theme.colors.textSec, fontSize: 11 }}>Enviando…</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.colors.hairline }}>
          <Pressable
            onPress={handleAttach}
            disabled={uploading || sending}
            accessibilityLabel="Anexar arquivo"
            style={({ pressed }) => ({
              width: 40, height: 40, borderRadius: 20,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: pressed ? theme.colors.surface2 : 'transparent',
              opacity: uploading || sending ? 0.5 : 1,
            })}
          >
            {uploading ? <ActivityIndicator size="small" color={theme.colors.textSec} /> : <Paperclip size={20} color={theme.colors.text} />}
          </Pressable>
          <TextInput
            placeholder="Mensagem"
            placeholderTextColor={theme.colors.textTer}
            value={text}
            onChangeText={setText}
            onKeyPress={onKeyPress}
            multiline
            blurOnSubmit={false}
            style={{
              flex: 1, color: theme.colors.text, fontSize: 14,
              backgroundColor: theme.colors.surface,
              borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
              maxHeight: 120, minHeight: 40,
              borderWidth: 1, borderColor: theme.colors.hairline,
            }}
          />
          <Pressable
            onPress={send}
            disabled={sending || (!text.trim() && !pending)}
            accessibilityLabel="Enviar mensagem"
            style={({ pressed }) => ({
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: theme.colors.primaryHi,
              alignItems: 'center', justifyContent: 'center',
              opacity: !sending && (text.trim() || pending) ? 1 : 0.4,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Send size={16} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
