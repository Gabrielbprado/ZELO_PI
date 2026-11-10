import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Home, Navigation } from 'lucide-react-native';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import {
  joinTracking,
  onProviderLocation,
  emitLocation,
  leaveTracking,
  type ProviderLocation,
} from '../api/realtime';
import * as travelApi from '../api/travel';
import type { AppStackParamList } from '../navigation/types';

/** Distância de referência usada apenas para desenhar o avanço no painel. */
const ASSUMED_ROUTE_M = 3000;
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

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

function nextRand(seed: number): { value: number; next: number } {
  const next = (seed * 16807) % 2147483647;
  return { value: (next % 1000) / 1000, next };
}

type LandmarkType = 'building' | 'park' | 'market' | 'bank' | 'school';

const LANDMARK_STYLE: Record<LandmarkType, { color: string; label: string }> = {
  building: { color: '#94a3b8', label: '🏢' },
  park: { color: '#22c55e', label: '🌳' },
  market: { color: '#f59e0b', label: '🛒' },
  bank: { color: '#6366f1', label: '🏦' },
  school: { color: '#f43f5e', label: '🏫' },
};

function buildLandmarks(bookingId: string): Array<{ id: number; x: number; y: number; type: LandmarkType }> {
  const seed = Math.abs(hashString(bookingId));
  const types: LandmarkType[] = ['building', 'park', 'market', 'bank', 'school'];
  const landmarks: Array<{ id: number; x: number; y: number; type: LandmarkType }> = [];
  let s = seed;
  for (let i = 0; i < 14; i++) {
    const r1 = nextRand(s);
    s = r1.next;
    const r2 = nextRand(s);
    s = r2.next;
    const r3 = nextRand(s);
    s = r3.next;
    // Evita a faixa central da rota (16%..84% de largura, 8%..92% de altura).
    const x = 4 + r1.value * 92;
    const y = 8 + r2.value * 84;
    const inRoute = x > 16 && x < 84 && y > 8 && y < 92;
    if (inRoute) continue;
    landmarks.push({ id: i, x, y, type: types[Math.floor(r3.value * types.length)] });
  }
  return landmarks;
}

function startErrorMessage(err: unknown): string {
  const apiErr = err as { response?: { data?: { error?: { message?: string } } } };
  return (
    apiErr?.response?.data?.error?.message ??
    (err instanceof Error ? err.message : 'Não foi possível iniciar o deslocamento. Tente novamente.')
  );
}

export default function TrackingScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'Tracking'>>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const c = theme.colors;
  const isProvider = user?.role === 'PROVIDER';

  const [error, setError] = useState<string | null>(null);
  const [loc, setLoc] = useState<ProviderLocation | null>(null);
  const [start, setStart] = useState<ProviderLocation | null>(null);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'waiting' | 'active'>('idle');
  const watchSub = useRef<Location.LocationSubscription | null>(null);

  const landmarks = useMemo(() => buildLandmarks(params.bookingId), [params.bookingId]);

  const stopWatch = useCallback(() => {
    watchSub.current?.remove();
    watchSub.current = null;
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let retry: ReturnType<typeof setInterval> | null = null;
    let alive = true;

    (async () => {
      unsub = await onProviderLocation((l) => {
        if (l.bookingId !== params.bookingId) return;
        setLoc(l);
        setStart((prev) => prev ?? l);
      });

      // O cliente pode abrir a tela antes do prestador iniciar a sessão. Nesse
      // caso o join é recusado; tentamos de novo até a sessão ficar ACTIVE.
      if (!isProvider) {
        const tryJoin = async () => {
          const r = await joinTracking(params.bookingId);
          if (!alive || !r.ok) return;
          if (retry) {
            clearInterval(retry);
            retry = null;
          }
        };
        void tryJoin();
        retry = setInterval(tryJoin, 5000);
      }
    })();

    return () => {
      alive = false;
      unsub?.();
      if (retry) clearInterval(retry);
      if (watchSub.current) {
        stopWatch();
        // Sair da tela encerra o compartilhamento para não deixar sessão ACTIVE órfã.
        void travelApi.cancelTravel(params.bookingId).catch(() => undefined);
      }
      void leaveTracking(params.bookingId);
    };
  }, [params.bookingId, isProvider, stopWatch]);

  const traveled = loc && start ? distMeters(start, loc) : 0;
  const progress = Math.min(1, traveled / ASSUMED_ROUTE_M);
  const speedKmh = loc?.speed != null ? Math.max(0, loc.speed * 3.6) : null;
  const markerTop = (PANEL_H - MARKER - 16) * (1 - progress) + 8;

  const stopSharing = useCallback(
    async (reason: 'arrived' | 'cancelled') => {
      setBusy(true);
      stopWatch();
      setSharing(false);
      setGpsStatus('idle');
      try {
        if (reason === 'arrived') await travelApi.markArrived(params.bookingId);
        else await travelApi.cancelTravel(params.bookingId);
      } catch {
        // Sessão já encerrada (410/409): estado local já está limpo.
      } finally {
        setBusy(false);
      }
      void leaveTracking(params.bookingId);
    },
    [params.bookingId, stopWatch],
  );

  const toggleShare = useCallback(async () => {
    setBusy(true);
    setError(null);
    let sessionOpened = false;

    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && !window.isSecureContext) {
        throw new Error(
          'O navegador só libera a localização em HTTPS ou localhost. Abra o app em http://localhost:4000.',
        );
      }

      await travelApi.startTravel(params.bookingId);
      sessionOpened = true;

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error(
          'Permissão de localização negada. Autorize o acesso ao GPS para compartilhar o deslocamento.',
        );
      }

      const joined = await joinTracking(params.bookingId);
      if (!joined.ok) throw new Error('Não foi possível entrar na sala de rastreamento.');

      setLoc(null);
      setStart(null);
      setSharing(true);
      setGpsStatus('waiting');

      watchSub.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (position) => {
          const { latitude, longitude, accuracy, speed } = position.coords;
          const point: ProviderLocation = {
            bookingId: params.bookingId,
            lat: latitude,
            lng: longitude,
            at: new Date(position.timestamp).toISOString(),
            accuracy: accuracy ?? null,
            speed: speed ?? null,
          };
          setLoc(point);
          setStart((prev) => prev ?? point);
          setGpsStatus('active');
          void emitLocation(params.bookingId, latitude, longitude, accuracy, speed, point.at);
        },
      );
    } catch (err) {
      if (sessionOpened) {
        try {
          await travelApi.cancelTravel(params.bookingId);
        } catch {
          /* sessão já encerrada */
        }
      }
      setSharing(false);
      setGpsStatus('idle');
      setError(startErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [params.bookingId]);

  const routeAheadH = PANEL_H - 16 - markerTop - MARKER / 2 - 20;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <PageHeader title="Deslocamento" subtitle="Acompanhe em tempo real" onBack={() => nav.goBack()} />

      <View style={{ paddingHorizontal: 16 }}>
        {error ? (
          <View style={{ backgroundColor: c.dangerBg, borderRadius: 12, padding: 16 }}>
            <Text style={{ color: c.danger, fontWeight: '600' }}>{error}</Text>
            {isProvider ? (
              <Button variant="secondary" onPress={toggleShare} style={{ marginTop: 12 }}>
                Tentar novamente
              </Button>
            ) : null}
          </View>
        ) : (
          <>
            {/* ─── Mapa tipo Waze (grade de quadradinhos + pontos de referência) ─── */}
            <View
              style={[
                styles.mapPanel,
                {
                  backgroundImage: `linear-gradient(${c.hairline} 1px, transparent 1px), linear-gradient(90deg, ${c.hairline} 1px, transparent 1px)`,
                  backgroundSize: '40px 40px',
                },
              ]}
            >
              {/* Ruas principais verticais */}
              <View style={[styles.road, { left: '24%' }]} />
              <View style={[styles.road, { left: '76%' }]} />
              {/* Linhas divisórias das ruas (tracejado) */}
              <View style={[styles.laneLine, { left: '24%', top: 0, bottom: 0 }]} />
              <View style={[styles.laneLine, { left: '76%', top: 0, bottom: 0 }]} />

              {/* Pontos de referência (POIs) */}
              {landmarks.map((l) => {
                const style = LANDMARK_STYLE[l.type];
                return (
                  <View
                    key={l.id}
                    style={[
                      styles.landmark,
                      { left: `${l.x}%`, top: `${l.y}%`, backgroundColor: style.color },
                    ]}
                  >
                    <Text style={styles.landmarkLabel}>{style.label}</Text>
                  </View>
                );
              })}

              {/* Rota à frente do profissional (tracejada) */}
              <View style={[styles.routeLine, { top: markerTop + MARKER / 2, height: Math.max(0, routeAheadH) }]} />

              {/* Marcador do profissional em movimento */}
              <View style={[styles.providerMarker, { top: markerTop }]}>
                <Navigation size={20} color={c.onPrimary} />
              </View>

              {/* Destino (casa do cliente) */}
              <View style={[styles.destinationMarker]}>
                <Home size={20} color={c.success} />
              </View>
            </View>

            {/* ─── Status ─── */}
            <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: c.textTer, fontSize: 12, fontWeight: '600' }}>DISTÂNCIA PERCORRIDA</Text>
                <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>
                  {traveled >= 1000 ? `${(traveled / 1000).toFixed(2)} km` : `${Math.round(traveled)} m`}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: c.textTer, fontSize: 12, fontWeight: '600' }}>VELOCIDADE</Text>
                <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>
                  {speedKmh != null ? `${speedKmh.toFixed(0)} km/h` : '—'}
                </Text>
              </View>
            </View>

            <View style={{ marginTop: 12, backgroundColor: c.surface2, borderRadius: 12, padding: 14 }}>
              <Text style={{ color: c.textSec, fontWeight: '600' }}>
                {!loc
                  ? sharing
                    ? gpsStatus === 'waiting'
                      ? 'Obtendo sua localização…'
                      : 'Compartilhando sua localização…'
                    : isProvider
                      ? 'Inicie o deslocamento para o cliente acompanhar você em tempo real.'
                      : 'Aguardando o profissional iniciar o deslocamento…'
                  : isProvider
                    ? 'Compartilhando sua localização em tempo real.'
                    : 'O profissional está a caminho.'}
              </Text>
              {loc ? (
                <Text style={{ color: c.textTer, fontSize: 12, marginTop: 4 }}>
                  {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                  {loc.accuracy != null ? ` · ±${Math.round(loc.accuracy)} m` : ''} · atualizado{' '}
                  {new Date(loc.at).toLocaleTimeString('pt-BR')}
                </Text>
              ) : null}
            </View>

            {isProvider ? (
              sharing ? (
                <>
                  <Button loading={busy} onPress={() => stopSharing('arrived')} style={{ marginTop: 16 }}>
                    Cheguei ao destino
                  </Button>
                  <Button variant="secondary" onPress={() => stopSharing('cancelled')} style={{ marginTop: 8 }}>
                    Cancelar deslocamento
                  </Button>
                </>
              ) : (
                <Button loading={busy} onPress={toggleShare} style={{ marginTop: 16 }}>
                  Iniciar deslocamento
                </Button>
              )
            ) : null}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mapPanel: {
    width: '100%',
    height: PANEL_H,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
    position: 'relative',
  },
  road: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '12%',
    backgroundColor: '#f1f5f9',
  },
  laneLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  landmark: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  landmarkLabel: {
    fontSize: 14,
    lineHeight: 18,
  },
  routeLine: {
    position: 'absolute',
    left: '50%',
    width: 2,
    borderWidth: 2,
    borderColor: '#6366f1',
    borderStyle: 'dashed',
  },
  providerMarker: {
    position: 'absolute',
    left: '50%',
    width: MARKER,
    height: MARKER,
    marginLeft: -MARKER / 2,
    borderRadius: MARKER / 2,
    backgroundColor: '#3b82f6',
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  destinationMarker: {
    position: 'absolute',
    left: '50%',
    bottom: 8,
    marginLeft: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#ffffff',
    zIndex: 10,
  },
});
