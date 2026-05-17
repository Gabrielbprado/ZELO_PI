import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { Appearance } from 'react-native';
import * as Storage from '../utils/storage';
import { StorageKey } from '../constants';
import { darkTheme, lightTheme, Theme, ThemeMode } from '../theme';

interface ThemeState {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => Promise<void>;
  toggle: () => Promise<void>;
}

const Ctx = createContext<ThemeState | null>(null);

function initialMode(): ThemeMode {
  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Storage.get(StorageKey.THEME)
      .then((stored) => {
        if (isThemeMode(stored)) setModeState(stored);
      })
      .finally(() => setReady(true));
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    await Storage.set(StorageKey.THEME, next);
  }, []);

  const toggle = useCallback(async () => {
    await setMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setMode]);

  const value = useMemo<ThemeState>(
    () => ({
      theme: mode === 'light' ? lightTheme : darkTheme,
      mode,
      setMode,
      toggle,
    }),
    [mode, setMode, toggle],
  );

  if (!ready) return null;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme precisa estar dentro de ThemeProvider');
  return ctx;
}
