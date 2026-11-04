# ZELO Mobile

React Native (Expo) app for the ZELO Marketplace. Runs on iOS, Android and
the web.

> **Setup, Docker, deploy and troubleshooting live in the root
> [`../README.md`](../README.md)** and [`../docs/SETUP.md`](../docs/SETUP.md).
> This file only covers what's specific to the mobile package.

---

## Architecture

```
src/
├── api/          # one Axios module per backend resource; single-flight 401 refresh
├── components/   # presentational atoms (Button, Input, Avatar, Badge, ListRow, …)
├── constants/    # storage keys, API config — no magic strings anywhere else
├── contexts/     # AuthContext, ThemeContext
├── hooks/        # reusable hooks (useAsync, …)
├── navigation/   # bottom tabs + native stacks
├── screens/      # 20+ screens (auth, marketplace, booking, payment, tracking, chat, …)
├── theme/        # light/dark palettes + tokens (spacing, radius, fonts)
├── types/        # shared TypeScript types matching the backend contracts
└── utils/        # platform abstraction layer (SecureStore / AsyncStorage) + money helpers
```

Design choices worth knowing:

- **Theme-aware via `useTheme()`** — every new screen pulls colours from the
  hook, never from a hard-coded palette. Toggling between light and dark
  doesn't require re-renders to be triggered manually.
- **Token storage is platform-aware** — `expo-secure-store` on native
  (Keychain / Keystore), `AsyncStorage` on the web.
- **Single-flight refresh** — the Axios interceptor de-duplicates parallel
  401s so the app never thrashes `/auth/refresh`.
- **`useAsync` hook** — simple status-machine for `loading | success | error`
  on screens that just need to fetch on mount.

---

## Scripts

| Command                | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| `npm run start`        | Metro bundler (interactive).                         |
| `npm run start:lan`    | Force LAN mode (Expo Go on a physical phone).        |
| `npm run start:tunnel` | Ngrok tunnel (restrictive Wi-Fi).                    |
| `npm run android`      | Boot the Android emulator.                           |
| `npm run ios`          | Boot the iOS simulator (macOS only).                 |
| `npm run web`          | Run on the web at `localhost:8081`.                  |
| `npm run typecheck`    | `tsc --noEmit`.                                      |

---

## Light / dark theme

- `useTheme()` (in `src/contexts/ThemeContext.tsx`) exposes `theme`, `mode`,
  `setMode` and `toggle`.
- Preference is persisted on device (SecureStore on native, AsyncStorage on
  web) under the `StorageKey.THEME` key.
- Defaults to the system theme on first launch.
- Toggle is available in **Profile → Settings → Appearance**.

Theme-aware components always pull from the hook:

```tsx
import { useTheme } from '../contexts/ThemeContext';

export function MyCard() {
  const { theme } = useTheme();
  return <View style={{ backgroundColor: theme.colors.surface }} />;
}
```

---

## Setup

See [`../docs/SETUP.md`](../docs/SETUP.md) — Node install, Postgres, LAN IP for a
physical device, etc.

---

## Planned: GPS tracking in background (Etapa 3)

The backend side of live GPS tracking is **already implemented** (`BookingTravel`
session, Redis-only coordinates, REST + Socket.IO). The mobile side depends on
`react-native-maps` + `expo-location` + a foreground service on Android and
Background Modes on iOS — none of which are installed yet.

Full plan with permission hooks, the `useProviderTravel` hook, the task
handler, and the 24 mandatory physical-device test cases is in
[`../docs/plans/ETAPA_3_MOBILE_GPS.md`](../docs/plans/ETAPA_3_MOBILE_GPS.md).
**Do not start this work without authorization** — it needs native deps + EAS
Build + API keys + physical devices.
