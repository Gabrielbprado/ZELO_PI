# ZELO Mobile

React Native (Expo) app for the ZELO Marketplace. Runs on iOS, Android and
the web.

---

## Architecture

```
src/
├── api/          # one Axios module per backend resource
├── components/   # presentational atoms (Button, Input, Avatar, Badge, …)
├── constants/    # storage keys, API config — no magic strings anywhere else
├── contexts/     # AuthContext, ThemeContext
├── hooks/        # reusable hooks (useAsync, …)
├── navigation/   # bottom tabs + native stacks
├── screens/      # 17 screens (auth, marketplace, booking, chat, etc.)
├── theme/        # light/dark palettes + tokens (spacing, radius, fonts)
├── types/        # shared TypeScript types matching the backend contracts
└── utils/        # platform abstraction layer (SecureStore / AsyncStorage)
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

See [`docs/SETUP.md`](../docs/SETUP.md) — Node install, Postgres, LAN IP for a
physical device, etc.
