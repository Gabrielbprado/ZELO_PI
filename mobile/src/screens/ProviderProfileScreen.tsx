import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Share2, Heart, Check, ShieldCheck, Star, ChevronRight, MessageSquare, Phone } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import * as providersApi from '../api/providers';
import type { Provider, Review } from '../types';
import type { AppStackParamList } from '../navigation/types';

export default function ProviderProfileScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'ProviderProfile'>>();
  const { theme } = useTheme();
  const [pro, setPro] = useState<Provider | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    providersApi.getProvider(params.providerId).then(setPro);
    providersApi.getProviderReviews(params.providerId).then(setReviews);
  }, [params.providerId]);

  if (!pro) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg }}>
      <ActivityIndicator color={theme.colors.accentBlue} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={{ height: 260, backgroundColor: `hsl(${pro.avatarHue}, 35%, 22%)` }}>
          <SafeAreaView edges={['top']} style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Pressable onPress={() => nav.goBack()} style={pillBtn}>
              <ArrowLeft color={theme.colors.text} size={18} />
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable style={pillBtn}><Share2 color={theme.colors.text} size={16} /></Pressable>
              <Pressable style={pillBtn}><Heart color={theme.colors.text} size={16} /></Pressable>
            </View>
          </SafeAreaView>

          <View style={{ position: 'absolute', bottom: 16, left: 20, right: 20, flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <View>
              <Avatar name={pro.name} size={88} hue={pro.avatarHue} ring="rgba(255,255,255,0.12)" />
              {pro.verified && (
                <View style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.success, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: theme.colors.bg }}>
                  <Check size={14} color="#fff" strokeWidth={3.5} />
                </View>
              )}
            </View>
            <View style={{ flex: 1, paddingBottom: 4 }}>
              <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '800' }}>{pro.name}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 }}>
                {pro.categories[0]?.name ?? '—'} · {pro.neighborhood ?? ''}
              </Text>
            </View>
          </View>
        </View>

        {/* KYC */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: theme.radius.lg, backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(34,197,94,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={20} color={theme.colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14 }}>KYC Verificado</Text>
              <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>RG, CPF e endereço confirmados</Text>
            </View>
            <ChevronRight size={16} color={theme.colors.textSec} />
          </View>
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 8, paddingVertical: 16 }}>
          {[
            { v: pro.rating.toFixed(1), l: `${pro.reviews} avaliações`, star: true },
            { v: pro.jobsDone, l: 'serviços feitos' },
            { v: `${pro.yearsExp} anos`, l: 'de experiência' },
          ].map((s, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.hairline }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {s.star && <Star size={14} color={theme.colors.star} fill={theme.colors.star} />}
                <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>{s.v}</Text>
              </View>
              <Text style={{ color: theme.colors.textSec, fontSize: 10, marginTop: 2 }}>{s.l}</Text>
            </View>
          ))}
        </View>

        {/* About */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '700', marginBottom: 8 }}>Sobre</Text>
          <Text style={{ color: theme.colors.textSec, fontSize: 13, lineHeight: 20 }}>{pro.bio ?? 'Profissional verificado pela plataforma.'}</Text>
        </View>

        {/* Services */}
        {pro.services && pro.services.length > 0 && (
          <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '700', marginBottom: 8 }}>Tabela de preços</Text>
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.hairline, overflow: 'hidden' }}>
              {pro.services.map((s, i) => (
                <View
                  key={s.id}
                  style={{
                    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    paddingHorizontal: 14, paddingVertical: 12,
                    borderBottomWidth: i < pro.services!.length - 1 ? 1 : 0,
                    borderBottomColor: theme.colors.hairline,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontSize: 13 }}>{s.title}</Text>
                  <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600' }}>
                    R$ {s.priceMin}{s.priceMax && s.priceMax !== s.priceMin ? ` – ${s.priceMax}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Reviews */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Avaliações</Text>
            <Text style={{ color: theme.colors.accentBlue, fontSize: 12 }}>Ver todas ({pro.reviews})</Text>
          </View>
          <View style={{ gap: 8 }}>
            {reviews.slice(0, 3).map((r) => (
              <View key={r.id} style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 12, borderWidth: 1, borderColor: theme.colors.hairline }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Avatar name={r.author?.name ?? '?'} size={32} hue={r.author?.avatarHue ?? 220} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600' }}>{r.author?.name ?? 'Anônimo'}</Text>
                    <Text style={{ color: theme.colors.textTer, fontSize: 11 }}>
                      {new Date(r.createdAt).toLocaleDateString('pt-BR')}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} size={12} color={s <= r.rating ? theme.colors.star : theme.colors.surface2} fill={s <= r.rating ? theme.colors.star : theme.colors.surface2} />
                    ))}
                  </View>
                </View>
                {r.comment && <Text style={{ color: theme.colors.textSec, fontSize: 12, lineHeight: 18 }}>{r.comment}</Text>}
              </View>
            ))}
            {reviews.length === 0 && (
              <Text style={{ color: theme.colors.textTer, fontSize: 12, textAlign: 'center', paddingVertical: 12 }}>
                Sem avaliações ainda.
              </Text>
            )}
          </View>
        </View>
      </ScrollView>

      {/* CTA */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 32, backgroundColor: theme.colors.bg, flexDirection: 'row', gap: 8, alignItems: 'center', borderTopWidth: 1, borderColor: theme.colors.hairline }}>
        <Pressable
          onPress={() => nav.navigate('Chat', { otherUserId: pro.userId, otherName: pro.name, otherHue: pro.avatarHue })}
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}
        >
          <MessageSquare size={20} color={theme.colors.text} />
        </Pressable>
        <Pressable style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Phone size={20} color={theme.colors.text} />
        </Pressable>
        <Pressable
          onPress={() => nav.navigate('Booking', { providerId: pro.id, categoryId: pro.categories[0]?.id ?? '' })}
          style={({ pressed }) => ({
            flex: 1, height: 48, borderRadius: 24,
            backgroundColor: theme.colors.primaryHi,
            alignItems: 'center', justifyContent: 'center',
            transform: [{ scale: pressed ? 0.97 : 1 }],
            shadowColor: theme.colors.primaryHi, shadowOpacity: 0.4, shadowRadius: 12,
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Contratar · R$ {pro.priceFrom}+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const pillBtn = {
  width: 36, height: 36, borderRadius: 18,
  backgroundColor: 'rgba(15,23,42,0.6)',
  alignItems: 'center' as const, justifyContent: 'center' as const,
};
