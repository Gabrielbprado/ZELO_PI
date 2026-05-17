import { useState } from 'react';
import { View, Text, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { ArrowLeft, Star } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AxiosError } from 'axios';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '../components/Button';
import * as reviewsApi from '../api/reviews';
import type { AppStackParamList } from '../navigation/types';

const labels = ['', 'Péssimo', 'Ruim', 'Razoável', 'Bom', 'Excelente'];

export default function ReviewScreen() {
  const nav = useNavigation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'Review'>>();
  const { theme } = useTheme();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await reviewsApi.createReview({
        bookingId: params.bookingId,
        rating,
        comment: comment.trim() || undefined,
      });
      Alert.alert('Obrigado!', 'Sua avaliação foi registrada.', [
        { text: 'Ok', onPress: () => nav.goBack() },
      ]);
    } catch (e) {
      setError(e instanceof AxiosError ? (e.response?.data?.error?.message ?? 'Falha ao enviar avaliação') : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => nav.goBack()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft color={theme.colors.text} size={18} />
        </Pressable>
        <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>Avaliar serviço</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, paddingHorizontal: 20 }}>
        <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '800', marginTop: 16 }}>
          Como foi o serviço de {params.providerName}?
        </Text>
        <Text style={{ color: theme.colors.textSec, fontSize: 13, marginTop: 6 }}>
          Sua avaliação ajuda outras pessoas a contratar com confiança.
        </Text>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 32 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setRating(n)} hitSlop={8}>
              <Star
                size={44}
                color={n <= rating ? theme.colors.star : theme.colors.surface2}
                fill={n <= rating ? theme.colors.star : 'transparent'}
              />
            </Pressable>
          ))}
        </View>
        <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 12 }}>
          {labels[rating]}
        </Text>

        <Text style={{ color: theme.colors.textSec, fontSize: 12, fontWeight: '600', marginTop: 24 }}>Comentário (opcional)</Text>
        <TextInput
          multiline
          numberOfLines={4}
          value={comment}
          onChangeText={setComment}
          placeholder="Conte como foi o atendimento, pontualidade, qualidade..."
          placeholderTextColor={theme.colors.textTer}
          style={{
            marginTop: 8,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
            borderWidth: 1.5,
            borderColor: theme.colors.hairline,
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: theme.colors.text,
            fontSize: 14,
            minHeight: 100,
            textAlignVertical: 'top',
          }}
        />

        {error && <Text style={{ color: theme.colors.danger, fontSize: 13, marginTop: 8 }}>{error}</Text>}

        <Button loading={loading} onPress={submit} style={{ marginTop: 16 }}>Enviar avaliação</Button>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
