import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View, Text } from 'react-native';
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

  // Profissional: abre a sessão no backend, pede permissão de GPS e passa a
  // publicar a posição real do dispositivo via socket a cada atualização.
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
