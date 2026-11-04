# Plano detalhado — Etapa 3 (mobile GPS + mapa)

**Pré-requisito explícito:** Etapa 2 homologada em staging (migration aplicada, integration tests verdes, consumer `travel.consumer` ativo no RabbitMQ real). **Não começar antes.**

## Decisões já fixadas

- **Mapas:** `react-native-maps`.
- **GPS/Background:** `expo-location` + `expo-task-manager`.
- **Contratos backend:** congelados na Etapa 2 (ver `src/routes/bookings.routes.ts` + eventos `travel:*`).

## Arquitetura mobile proposta

```
┌─────────────────────────────────────────────────┐
│ TrackingScreen (provider ou client)             │
│ - usa hook useProviderTravel ou useClientTravel │
│ - renderiza <MapView> (react-native-maps)       │
└──────────────┬──────────────────────────────────┘
               │
   ┌───────────┴───────────┐
   │                       │
┌──▼─────────────┐  ┌──────▼────────────┐
│ useProvider    │  │ useClientTravel   │
│ Travel (hook)  │  │ (hook)            │
│                │  │                   │
│ start→arrived  │  │ subscribe socket  │
│ /cancel REST   │  │ travel:*          │
│                │  │ GET fallback REST │
│ background     │  │ staleness guard   │
│ TaskManager    │  │                   │
└──┬──────────┬──┘  └────┬──────────────┘
   │          │          │
   │ socket   │ REST     │ socket + REST
   │          │          │
   ▼          ▼          ▼
┌─────────────────────────────┐
│ backend /api/v1/bookings/   │
│ :id/travel/*                │
│ Socket.IO /realtime         │
└─────────────────────────────┘
```

## Lote M1 — Dependências e permissões

### Instalação

```bash
cd mobile
npx expo install react-native-maps
npx expo install expo-location expo-task-manager
```

Versões ancoradas pelo `expo install` à SDK 58 — **não trocar para versões manuais** sem revalidar.

### `app.json` — alterações

```jsonc
{
  "expo": {
    "plugins": [
      "expo-secure-store",
      "expo-notifications",
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "O ZELO precisa acessar sua localização para compartilhar com o cliente enquanto você se desloca até o serviço. Fora dos deslocamentos ativos, o acesso é desligado.",
          "locationWhenInUsePermission": "O ZELO precisa acessar sua localização para iniciar o deslocamento.",
          "isIosBackgroundLocationEnabled": true,
          "isAndroidBackgroundLocationEnabled": true,
          "isAndroidForegroundServiceEnabled": true
        }
      ]
    ],
    "ios": {
      "bundleIdentifier": "dev.zero.marketplace",
      "supportsTablet": false,
      "infoPlist": {
        "UIBackgroundModes": ["location", "fetch"],
        "NSLocationWhenInUseUsageDescription": "Usado para iniciar o compartilhamento do deslocamento com o cliente.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "Usado para manter o compartilhamento do deslocamento com o cliente mesmo com o app minimizado."
      }
    },
    "android": {
      "package": "dev.zero.marketplace",
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION"
      ],
      "config": {
        "googleMaps": {
          "apiKey": "EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY"
        }
      }
    }
  }
}
```

**Dependência externa:** chave Google Maps Android (console Google Cloud). iOS usa Apple Maps nativo, sem chave. Web não é target da feature GPS.

**Crítico:** depois de editar `app.json`, **tem que rebuildar o app com EAS Build**. Expo Go não carrega plugins nativos novos. `npm start` continua funcionando em dev, mas o background location só acorda em dev-client ou standalone.

## Lote M2 — Hook `useProviderTravel`

Responsabilidade: ciclo de vida da sessão do **provider** (quem compartilha a localização).

### Interface

```ts
type TravelStatus = 'idle' | 'starting' | 'sharing' | 'arriving' | 'cancelling' | 'ended' | 'error';

interface UseProviderTravel {
  status: TravelStatus;
  error: string | null;
  // Pede permissão, inicia sessão no backend, começa o background task.
  start: (bookingId: string) => Promise<void>;
  // Marca chegada no backend, para o task.
  arrive: () => Promise<void>;
  // Cancela sessão.
  cancel: () => Promise<void>;
}
```

### Fluxo interno

1. `start(bookingId)`:
   - `Location.requestForegroundPermissionsAsync()` — se negar, erro.
   - `Location.requestBackgroundPermissionsAsync()` — se negar em Android ≥10, continua só em foreground com aviso UI; em iOS idem.
   - `POST /api/v1/bookings/:id/travel/start` — se backend recusar, cancela fluxo.
   - `TaskManager.defineTask('zelo-travel-task', handler)` — registrado uma vez globalmente no `App.tsx` (fora do hook; TaskManager exige registro no top-level).
   - `Location.startLocationUpdatesAsync('zelo-travel-task', { accuracy, distanceInterval, foregroundService: { notificationTitle, notificationBody } })`.
   - Guarda bookingId em `expo-secure-store` para o task handler saber qual sessão alimentar.
2. `arrive()`:
   - `POST /api/v1/bookings/:id/travel/arrived` (precisa 200).
   - `Location.stopLocationUpdatesAsync('zelo-travel-task')`.
   - Limpa bookingId do SecureStore.
3. `cancel()`: idem arrive, mas chama `/cancel`.
4. **Reação a `travel:ended` do socket** (caso o backend encerre por timeout ou cascade): hook escuta e chama cleanup local mesmo sem ação do usuário.

### Task handler (nível de módulo)

```ts
// mobile/src/services/travelTask.ts
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import * as travelApi from '../api/travel';

export const TRAVEL_TASK = 'zelo-travel-task';

TaskManager.defineTask(TRAVEL_TASK, async ({ data, error }) => {
  if (error) return;
  const bookingId = await SecureStore.getItemAsync('activeTravelBookingId');
  if (!bookingId) return;
  const locations = (data as any).locations as Array<Location.LocationObject>;
  if (!locations?.length) return;
  const last = locations[locations.length - 1];
  await travelApi.postLocation(bookingId, {
    latitude: last.coords.latitude,
    longitude: last.coords.longitude,
    accuracy: last.coords.accuracy ?? null,
    heading: last.coords.heading ?? null,
    speed: last.coords.speed ?? null,
    recordedAt: new Date(last.timestamp).toISOString(),
  });
});
```

**Por que REST e não socket no task handler:** background em iOS suspende o WebSocket; `fetch` é mais confiável. O backend tem endpoint REST exatamente para isso (Fase 2).

## Lote M3 — Hook `useClientTravel`

Responsabilidade: receber posição e ciclo de vida do ponto de vista do **cliente**.

### Interface

```ts
interface UseClientTravel {
  status: 'idle' | 'watching' | 'ended';
  position: { latitude: number; longitude: number } | null;
  // true quando recordedAt > STALENESS_THRESHOLD_SEC atrás
  isStale: boolean;
  endedReason: 'arrived' | 'cancelled' | 'timeout' | null;
}
```

### Implementação

- `useFocusEffect`: conecta no socket, `travel:join` no booking.
- Escuta `travel:location:update` → atualiza `position`.
- Escuta `travel:ended` → set `endedReason`, zera `position`, chama `travel:leave`.
- Heartbeat local: `setInterval(1000)` que recalcula `isStale = Date.now() - recordedAtMs > STALENESS_THRESHOLD_MS`. **STALENESS_THRESHOLD = 30s.**
- Se socket cair, fallback REST `GET /travel/location` a cada 15s. 410 → `endedReason=unknown` + leave.

## Lote M4 — `TrackingScreen` para provider

- Renderiza mapa com o booking.address como destino.
- Botão primário "Iniciar deslocamento" → `startTravel`.
- Durante sessão ativa: mostra timestamp do último envio, botão "Cheguei" (confirmação) e "Cancelar" (confirmação dura).
- UI de erro para: permissão negada, backend rejeitou (ex.: booking não está ACCEPTED), Redis down (`503`).
- Icon da notificação de foreground service (Android): logo do ZELO, texto "Compartilhando sua localização com {nomeCliente}".

## Lote M5 — Mapa do cliente

- Nova `TrackingWatchScreen.tsx` (ou reusa `TrackingScreen` baseado em role).
- Marker fixo no booking.address.
- Marker móvel com a posição do provider (vindo do hook).
- Rotação opcional do marker por `heading`.
- Ao `isStale` ficar true: muda cor do marker para cinza + banner "Posição desatualizada há Xs".
- Ao `endedReason` chegar: abre modal "Prestador chegou" ou "Deslocamento encerrado" conforme razão.

## Lote M6 — Limpeza de estado local

Ao `endedReason` chegar (via socket OU detecção local):
- `position = null`.
- Socket `travel:leave`.
- Se provider: chama cleanup do task (`Location.stopLocationUpdatesAsync`) + limpa SecureStore.
- UI navega de volta à tela anterior após 2s.

**Garantia:** nenhum estado residual deve guardar coordenadas após encerramento. Testar com React DevTools no `__DEV__`.

## Lote M7 — Testes

### Automatizados (sem device)

- `useProviderTravel` com `jest` + mock de `expo-location`: cobre fluxo start→arrive, permissão negada, erro backend.
- `useClientTravel` com fake socket.io + jest fake timers: cobre staleness, ended reason, fallback REST.
- Snapshot do `TrackingScreen` em role=provider e role=client.

### Manuais obrigatórios (device físico)

| Teste | Android | iOS |
|---|---|---|
| Permissão sem background | ✓ | ✓ |
| Permissão full background | ✓ | ✓ |
| Permissão revogada durante sessão | ✓ | ✓ |
| Tela bloqueada durante sessão | ✓ | ✓ |
| App minimizado durante sessão | ✓ | ✓ |
| App force-killed (swipe) | ✓ | ✓ |
| Rede caindo e voltando | ✓ | ✓ |
| Cliente recebe staleness quando provider perde rede | ✓ | ✓ |
| Chegada apaga posição do mapa | ✓ | ✓ |
| Cancelamento apaga posição do mapa | ✓ | ✓ |
| Prestador tenta emitir após arrived | ✓ | ✓ |
| Permissão always ligada mas device em modo economia de bateria | ✓ | ✓ |

**Critério de aceite:** todos os 12×2 = 24 cenários acima **passam em ao menos 2 modelos de cada plataforma** (ex.: Pixel + Samsung em Android, iPhone + iPhone SE/mini em iOS). Feature não é declarada pronta sem isso.

## Pendências externas antes da Etapa 3

- [ ] **Chave API Google Maps Android** no console Google Cloud, restrita por package name + SHA-1 do EAS Build.
- [ ] **EAS Build provisioning iOS** configurado com Background Modes (Capability).
- [ ] **Devices físicos** para testes (não simulador — background location é restrito em simulador).
- [ ] **TestFlight / interno Google Play** para distribuir o build com background location.

## Riscos específicos da Etapa 3

- **R-M1 — OEMs Android chineses (Xiaomi, Huawei, Oppo) matam background agressivamente.** `expo-location` com foreground service mitiga mas não resolve totalmente. Testar em Xiaomi explicitamente.
- **R-M2 — iOS Low Power Mode reduz frequência de updates.** Não há API para contornar. Aceito; cliente vê "stale" nessa condição.
- **R-M3 — Rebuild obrigatório após plugin novo.** Expo Go stakeholders precisam saber que a feature exige build nativo.
- **R-M4 — Google Maps API Key em env público (`EXPO_PUBLIC_*`) é inlinada no bundle.** Padrão para maps keys, mas precisa de restrição por package name + SHA-1 no console.

## Estimativa

| Lote | Esforço |
|---|---|
| M1 (deps + permissões) | 1 dia |
| M2 (`useProviderTravel` + task) | 2-3 dias |
| M3 (`useClientTravel`) | 1-2 dias |
| M4 (TrackingScreen provider) | 1 dia |
| M5 (TrackingScreen client) | 1-2 dias |
| M6 (cleanup) | 0.5 dia |
| M7 (testes auto + manuais) | 2-3 dias + bateria de device |
| **Total** | **8-12 dias úteis + homologação em device** |

## O que NÃO vou fazer sem autorização explícita

- Instalar deps mobile.
- Alterar `app.json`.
- Qualquer commit/push.
- Criar builds EAS.
- Publicar APK/IPA.
