import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { OpenStreetMapView } from '../components/OpenStreetMapView';
import {
  joinTracking,
  onProviderLocation,
  emitLocation,
  leaveTracking,
  type ProviderLocation,
} from '../api/realtime';
import * as travelApi from '../api/travel';
import type { AppStackParamList } from '../navigation/types';

const MAP_HEIGHT = 340;
function distanceMeters(a: ProviderLocation, b: ProviderLocation): number {
  const earthRadius = 6_371_000;
  const lat = ((b.lat - a.lat) * Math.PI) / 180;
  const lng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(lat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(lng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function toProviderLocation(location: travelApi.TravelLocation): ProviderLocation {
  return {
    bookingId: location.bookingId,
    lat: location.latitude,
    lng: location.longitude,
    at: location.recordedAt,
    accuracy: location.accuracy ?? null,
    speed: location.speed ?? null,
  };
}

function errorMessage(err: unknown): string {
  const apiErr = err as { response?: { data?: { error?: { message?: string } } } };
  return apiErr?.response?.data?.error?.message ?? (err instanceof Error ? err.message : 'Não foi possível iniciar o deslocamento. Tente novamente.');
}

export default function TrackingScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'Tracking'>>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const colors = theme.colors;
  const isProvider = user?.role === 'PROVIDER';
  const watchSub = useRef<Location.LocationSubscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loc, setLoc] = useState<ProviderLocation | null>(null);
  const [start, setStart] = useState<ProviderLocation | null>(null);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'waiting' | 'active'>('idle');

  const stopWatch = useCallback(() => {
    watchSub.current?.remove();
    watchSub.current = null;
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let retry: ReturnType<typeof setInterval> | null = null;
    let alive = true;

    (async () => {
      unsub = await onProviderLocation((point) => {
        if (!alive || point.bookingId !== params.bookingId) return;
        setLoc(point);
        setStart((prev) => prev ?? point);
      });

      if (!isProvider) {
        const tryJoin = async () => {
          const joined = await joinTracking(params.bookingId);
          if (!alive || !joined.ok) return;
          try {
            const latest = await travelApi.getCurrentLocation(params.bookingId);
            if (alive && latest) {
              const point = toProviderLocation(latest);
              setLoc(point);
              setStart((prev) => prev ?? point);
            }
          } catch {
            // A sessão pode encerrar entre a entrada na sala e a leitura da última posição.
          }
          if (retry) {
            clearInterval(retry);
            retry = null;
          }
        };
        void tryJoin();
        retry = setInterval(() => void tryJoin(), 5000);
      }
    })();

    return () => {
      alive = false;
      unsub?.();
      if (retry) clearInterval(retry);
      if (watchSub.current) {
        stopWatch();
        void travelApi.cancelTravel(params.bookingId).catch(() => undefined);
      }
      void leaveTracking(params.bookingId);
    };
  }, [params.bookingId, isProvider, stopWatch]);

  const traveled = loc && start ? distanceMeters(start, loc) : 0;
  const speedKmh = loc?.speed != null ? Math.max(0, loc.speed * 3.6) : null;

  const stopSharing = useCallback(async (reason: 'arrived' | 'cancelled') => {
    setBusy(true);
    stopWatch();
    setSharing(false);
    setGpsStatus('idle');
    try {
      if (reason === 'arrived') await travelApi.markArrived(params.bookingId);
      else await travelApi.cancelTravel(params.bookingId);
    } catch {
      // A sessão pode ter sido encerrada no servidor por timeout.
    } finally {
      setBusy(false);
    }
    void leaveTracking(params.bookingId);
  }, [params.bookingId, stopWatch]);

  const toggleShare = useCallback(async () => {
    setBusy(true);
    setError(null);
    let sessionOpened = false;
    try {
      if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.isSecureContext) {
        throw new Error('O navegador só libera a localização em HTTPS ou localhost.');
      }
      await travelApi.startTravel(params.bookingId);
      sessionOpened = true;

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Autorize o acesso à localização para compartilhar o deslocamento.');

      const joined = await joinTracking(params.bookingId);
      if (!joined.ok) throw new Error('Não foi possível entrar na sala de rastreamento.');

      setLoc(null);
      setStart(null);
      setSharing(true);
      setGpsStatus('waiting');
      watchSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        (position) => {
          const { latitude, longitude, accuracy, speed } = position.coords;
          const at = new Date(position.timestamp).toISOString();
          const point: ProviderLocation = {
            bookingId: params.bookingId,
            lat: latitude,
            lng: longitude,
            at,
            accuracy: accuracy ?? null,
            speed: speed ?? null,
          };
          setLoc(point);
          setStart((prev) => prev ?? point);
          setGpsStatus('active');
          void emitLocation(params.bookingId, latitude, longitude, accuracy, speed, at).catch(() => {
            setError('Sem conexão com a API. Verifique a rede e tente novamente.');
          });
        },
      );
    } catch (err) {
      if (sessionOpened) await travelApi.cancelTravel(params.bookingId).catch(() => undefined);
      setSharing(false);
      setGpsStatus('idle');
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [params.bookingId]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <PageHeader title="Deslocamento" subtitle="Localização em tempo real" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        {error ? (
          <View style={{ backgroundColor: colors.dangerBg, borderRadius: 12, padding: 16 }}>
            <Text style={{ color: colors.danger, fontWeight: '600' }}>{error}</Text>
            {isProvider && <Button variant="secondary" onPress={toggleShare} style={{ marginTop: 12 }}>Tentar novamente</Button>}
          </View>
        ) : (
          <>
            <OpenStreetMapView location={loc} height={MAP_HEIGHT} />

            <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: colors.textTer, fontSize: 12, fontWeight: '600' }}>DESLOCAMENTO EM LINHA RETA</Text>
                <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{traveled >= 1000 ? `${(traveled / 1000).toFixed(2)} km` : `${Math.round(traveled)} m`}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: colors.textTer, fontSize: 12, fontWeight: '600' }}>VELOCIDADE</Text>
                <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{speedKmh != null ? `${speedKmh.toFixed(0)} km/h` : '—'}</Text>
              </View>
            </View>

            <View style={{ marginTop: 12, backgroundColor: colors.surface2, borderRadius: 12, padding: 14 }}>
              <Text style={{ color: colors.textSec, fontWeight: '600' }}>
                {!loc
                  ? sharing ? 'Obtendo sua localização…' : isProvider ? 'Inicie o deslocamento para compartilhar sua posição.' : 'Aguardando o profissional iniciar o deslocamento…'
                  : isProvider ? 'Sua posição está sendo compartilhada enquanto esta tela estiver aberta.' : 'A posição do profissional está sendo atualizada em tempo real.'}
              </Text>
              {params.destinationAddress && <Text numberOfLines={2} style={{ color: colors.textTer, fontSize: 12, marginTop: 5 }}>Destino: {params.destinationAddress}</Text>}
              {loc && <Text style={{ color: colors.textTer, fontSize: 12, marginTop: 4 }}>{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}{loc.accuracy != null ? ` · ±${Math.round(loc.accuracy)} m` : ''} · atualizado {new Date(loc.at).toLocaleTimeString('pt-BR')}</Text>}
            </View>

            {isProvider && (sharing ? (
              <>
                <Button loading={busy} onPress={() => stopSharing('arrived')} style={{ marginTop: 16 }}>Cheguei ao destino</Button>
                <Button variant="secondary" onPress={() => stopSharing('cancelled')} style={{ marginTop: 8 }}>Cancelar deslocamento</Button>
              </>
            ) : <Button loading={busy} onPress={toggleShare} style={{ marginTop: 16 }}>Iniciar deslocamento</Button>)}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
