import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Zap, ShieldCheck, Clock, Check, Search, Star } from 'lucide-react-native';
import { AxiosError } from 'axios';
import { useTheme } from '../contexts/ThemeContext';
import { Badge } from '../components/Badge';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import * as providersApi from '../api/providers';
import * as emergencyApi from '../api/emergency';
import { useAuth } from '../contexts/AuthContext';
import type { AppStackParamList } from '../navigation/types';
import type { Category } from '../types';

export default function EmergencyScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [picked, setPicked] = useState<Category | null>(null);
  const [matching, setMatching] = useState(false);
  const [result, setResult] = useState<emergencyApi.EmergencyMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    providersApi.getCategories().then((cs) => {
      setCategories(cs);
      setPicked((p) => p ?? cs.find((c) => c.id === 'plumb') ?? cs[0] ?? null);
    });
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 2400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ).start();
  }, [pulse]);

  const pulseStyle = () => ({
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.25] }) }],
    opacity:    pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
  });

  const startMatch = async () => {
    if (!picked) return;
    setMatching(true);
    setError(null);
    setResult(null);
    try {
      const r = await emergencyApi.matchEmergency({
        categoryId: picked.id,
        city: user?.city ?? undefined,
        neighborhood: user?.neighborhood ?? undefined,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof AxiosError ? (e.response?.data?.error?.message ?? 'Sem profissionais disponíveis agora') : 'Erro');
    } finally {
      setMatching(false);
    }
  };

  const requestBooking = () => {
    if (!result || !picked) return;
    nav.navigate('Booking', { providerId: result.provider.id, categoryId: picked.id });
  };

  // RESULT
  if (result) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => setResult(null)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft color={theme.colors.text} size={18} />
          </Pressable>
          <Badge tone="danger" icon={<Zap size={11} color={theme.colors.danger} fill={theme.colors.danger} />}>EMERGÊNCIA</Badge>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, gap: 16 }}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Avatar name={result.provider.name} size={88} hue={result.provider.avatarHue} />
            <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '800', marginTop: 12 }}>{result.provider.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Star size={14} color={theme.colors.star} fill={theme.colors.star} />
              <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{result.provider.rating.toFixed(1)}</Text>
              <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>· {result.provider.jobsDone} serviços</Text>
            </View>
            <Text style={{ color: theme.colors.textSec, fontSize: 12, marginTop: 4 }}>
              {picked?.name} · a {result.distanceKm} km
            </Text>
          </View>

          <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 16, borderWidth: 1, borderColor: theme.colors.hairline, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={20} color={theme.colors.accentBlue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '700' }}>ETA estimado: {result.etaMin} min</Text>
              <Text style={{ color: theme.colors.textSec, fontSize: 12 }}>{result.nearbyCount} profissionais avaliados nesta busca</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: theme.radius.md, backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' }}>
            <ShieldCheck size={14} color={theme.colors.success} />
            <Text style={{ color: theme.colors.success, fontSize: 12, fontWeight: '600' }}>Profissional verificado · garantia de 90 dias</Text>
          </View>
        </ScrollView>

        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 32, gap: 8, backgroundColor: theme.colors.bg, borderTopWidth: 1, borderTopColor: theme.colors.hairline }}>
          <Button onPress={requestBooking}>Solicitar este profissional</Button>
          <Button variant="ghost" onPress={() => setResult(null)}>Procurar outro</Button>
        </View>
      </SafeAreaView>
    );
  }

  // MATCHING
  if (matching) {
    return <Matching categoryName={picked?.name ?? ''} />;
  }

  // CHOOSER + CTA
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => nav.goBack()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft color={theme.colors.text} size={18} />
        </Pressable>
        <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '600' }}>Emergência</Text>
      </View>

      <ScrollView contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 20, paddingBottom: 32 }}>
        <Text style={{ color: theme.colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 12 }}>
          Precisa de ajuda{'\n'}agora?
        </Text>
        <Text style={{ color: theme.colors.textSec, textAlign: 'center', marginTop: 8, maxWidth: 280 }}>
          Conectamos você ao profissional verificado mais próximo em até 30 minutos.
        </Text>

        {/* Categoria */}
        <View style={{ alignSelf: 'stretch', marginTop: 20 }}>
          <Text style={{ color: theme.colors.textSec, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>O que você precisa?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {categories.map((c) => {
              const active = picked?.id === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setPicked(c)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                    backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                    borderWidth: 1.5, borderColor: active ? theme.colors.primaryHi : theme.colors.hairline,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600' }}>{c.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ marginTop: 32, width: 220, height: 220, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[{ position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(239,68,68,0.15)' }, pulseStyle()]} />
          <Animated.View style={[{ position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(239,68,68,0.18)' }, pulseStyle()]} />
          <Pressable
            onPress={startMatch}
            disabled={!picked}
            style={({ pressed }) => ({
              width: 140, height: 140, borderRadius: 70,
              backgroundColor: theme.colors.danger,
              alignItems: 'center', justifyContent: 'center',
              opacity: picked ? 1 : 0.5,
              shadowColor: theme.colors.danger, shadowOpacity: 0.5, shadowRadius: 20,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
          >
            <Zap size={28} color="#fff" fill="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 2, marginTop: 6 }}>SOS</Text>
          </Pressable>
        </View>

        {error && (
          <Text style={{ color: theme.colors.danger, marginTop: 16, fontSize: 13, textAlign: 'center' }}>{error}</Text>
        )}

        <View style={{ marginTop: 28, gap: 10, width: '100%' }}>
          {[
            { i: <ShieldCheck size={14} color={theme.colors.success} />, t: 'Apenas profissionais verificados' },
            { i: <Clock size={14} color={theme.colors.accentBlue} />,    t: 'Tempo médio de chegada: 24 min' },
            { i: <Check size={14} color={theme.colors.success} strokeWidth={3} />, t: 'Pague só após o serviço' },
          ].map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.hairline }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: theme.colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                {r.i}
              </View>
              <Text style={{ color: theme.colors.text, fontSize: 13 }}>{r.t}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Matching({ categoryName }: { categoryName: string }) {
  const { theme } = useTheme();
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(ring, { toValue: 1, duration: 2000, useNativeDriver: true })).start();
  }, [ring]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <Animated.View
          style={{
            position: 'absolute', width: 200, height: 200, borderRadius: 100,
            borderWidth: 2, borderColor: theme.colors.primaryHi,
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.3] }) }],
          }}
        />
        <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Search size={36} color="#fff" />
        </View>
      </View>
      <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '700' }}>Procurando profissional...</Text>
      <Text style={{ color: theme.colors.textSec, fontSize: 13, marginTop: 4 }}>{categoryName}</Text>
      <ActivityIndicator color={theme.colors.accentBlue} style={{ marginTop: 24 }} />
    </SafeAreaView>
  );
}
