import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Home, Navigation } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '../components/Button';
import {
  joinTracking,
  onProviderLocation,
  emitLocation,
  leaveTracking,
  type ProviderLocation,
} from '../api/realtime';
import type { AppStackParamList } from '../navigation/types';

/** Distância assumida do trajeto (m) — normaliza o progresso a partir do 1º ponto recebido. */
const ASSUMED_ROUTE_M = 3000;
const AVG_SPEED_KMH = 28;
const PANEL_H = 340;
const MARKER = 44;

function distMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export default function TrackingScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'Tracking'>>();
  const { theme } = useTheme();
  const c = theme.colors;

  const [role, setRole] = useState<'client' | 'provider' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loc, setLoc] = useState<ProviderLocation | null>(null);
  const [start, setStart] = useState<ProviderLocation | null>(null);
  const [sharing, setSharing] = useState(false);
  const shareTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let alive = true;
    (async () => {
      const r = await joinTracking(params.bookingId);
      if (!alive) return;
      if (!r.ok) return setError(r.error ?? 'Não foi possível acompanhar este serviço.');
      setRole(r.role ?? null);
      unsub = await onProviderLocation((l) => {
        if (l.bookingId !== params.bookingId) return;
        setLoc(l);
        setStart((prev) => prev ?? l);
      });
    })();
    return () => {
      alive = false;
      unsub?.();
      if (shareTimer.current) clearInterval(shareTimer.current);
      void leaveTracking(params.bookingId);
    };
  }, [params.bookingId]);

  const traveled = loc && start ? distMeters(start, loc) : 0;
  const progress = Math.min(1, traveled / ASSUMED_ROUTE_M);
  const remainingM = Math.max(0, ASSUMED_ROUTE_M - traveled);
  const etaMin = Math.max(1, Math.round((remainingM / 1000 / AVG_SPEED_KMH) * 60));
  const arrived = progress >= 0.98;

  // Profissional: simula o deslocamento (funciona na web sem GPS nativo), interpolando de
  // um ponto de partida até o destino e publicando a posição a cada passo.
  const toggleShare = useCallback(() => {
    if (sharing) {
      if (shareTimer.current) clearInterval(shareTimer.current);
      setSharing(false);
      return;
    }
    setSharing(true);
    const from = { lat: -23.5610, lng: -46.6560 };
    const to = { lat: -23.5880, lng: -46.6430 };
    const steps = 24;
    let step = 0;
    shareTimer.current = setInterval(() => {
      step += 1;
      const t = Math.min(1, step / steps);
      const jitter = (t < 1 ? (Math.sin(step) * 0.0004) : 0);
      const lat = from.lat + (to.lat - from.lat) * t + jitter;
      const lng = from.lng + (to.lng - from.lng) * t + jitter;
      void emitLocation(params.bookingId, lat, lng);
      if (t >= 1 && shareTimer.current) {
        clearInterval(shareTimer.current);
        setSharing(false);
      }
    }, 1500);
  }, [sharing, params.bookingId]);

  const markerTop = (PANEL_H - MARKER - 16) * (1 - progress) + 8;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voltar">
          <ArrowLeft size={24} color={c.text} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>Acompanhar deslocamento</Text>
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        {error ? (
          <View style={{ backgroundColor: c.dangerBg, borderRadius: 12, padding: 16 }}>
            <Text style={{ color: c.danger, fontWeight: '600' }}>{error}</Text>
          </View>
        ) : (
          <>
            {/* "Mapa" — pista de rota com o profissional se aproximando do destino. */}
            <View style={{ height: PANEL_H, backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.hairline, overflow: 'hidden' }}>
              {/* linha da rota */}
              <View style={{ position: 'absolute', left: '50%', top: 16, bottom: 16, width: 4, marginLeft: -2, backgroundColor: c.chartTrack, borderRadius: 2 }} />
              <View style={{ position: 'absolute', left: '50%', top: markerTop + MARKER / 2, bottom: 16, width: 4, marginLeft: -2, backgroundColor: c.primary, borderRadius: 2 }} />

              {/* destino (casa do cliente) */}
              <View style={{ position: 'absolute', left: '50%', bottom: 8, marginLeft: -20, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.successBg, borderWidth: 2, borderColor: c.success }}>
                <Home size={20} color={c.success} />
              </View>

              {/* profissional em movimento */}
              <View style={{ position: 'absolute', left: '50%', top: markerTop, marginLeft: -MARKER / 2, width: MARKER, height: MARKER, borderRadius: MARKER / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary, borderWidth: 3, borderColor: c.onPrimary }}>
                <Navigation size={20} color={c.onPrimary} />
              </View>
            </View>

            {/* status */}
            <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: c.textTer, fontSize: 12, fontWeight: '600' }}>DISTÂNCIA</Text>
                <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>
                  {remainingM >= 1000 ? `${(remainingM / 1000).toFixed(1)} km` : `${Math.round(remainingM)} m`}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: c.textTer, fontSize: 12, fontWeight: '600' }}>CHEGADA EM</Text>
                <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>{arrived ? 'chegou 🎉' : `~${etaMin} min`}</Text>
              </View>
            </View>

            <View style={{ marginTop: 12, backgroundColor: arrived ? c.successBg : c.surface2, borderRadius: 12, padding: 14 }}>
              <Text style={{ color: arrived ? c.success : c.textSec, fontWeight: '600' }}>
                {!loc
                  ? role === 'provider'
                    ? 'Inicie o deslocamento para o cliente acompanhar você em tempo real.'
                    : 'Aguardando o profissional iniciar o deslocamento…'
                  : arrived
                    ? 'O profissional chegou ao local.'
                    : 'O profissional está a caminho.'}
              </Text>
              {loc ? (
                <Text style={{ color: c.textTer, fontSize: 12, marginTop: 4 }}>
                  {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)} · atualizado {new Date(loc.at).toLocaleTimeString('pt-BR')}
                </Text>
              ) : null}
            </View>

            {role === 'provider' ? (
              <Button
                variant={sharing ? 'danger' : 'primary'}
                onPress={toggleShare}
                style={{ marginTop: 16 }}
              >
                {sharing ? 'Parar deslocamento' : 'Iniciar deslocamento'}
              </Button>
            ) : null}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
