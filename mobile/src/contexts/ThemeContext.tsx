import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { Appearance } from 'react-native';
import * as Storage from '../utils/storage';
import { StorageKey } from '../constants';
import { darkTheme, lightTheme, Theme, ThemeMode, ThemePreference } from '../theme';

interface ThemeState {
  theme: Theme;
  /** Modo efetivamente renderizado. */
  mode: ThemeMode;
  /** Escolha do usuário — pode ser `'system'`. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
  toggle: () => Promise<void>;
}

const Ctx = createContext<ThemeState | null>(null);

/**
 * Claro é o padrão do produto, e é também o fallback quando o SO não responde.
 *
 * `Appearance.getColorScheme()` devolve `null` no primeiro frame do nativo e com
 * frequência na web. A versão anterior tratava esse `null` como "escuro", o que fazia o
 * app abrir escuro para quem nunca escolheu nada — um default por acidente, não por
 * decisão. O `?? 'light'` abaixo é o conserto.
 */
function systemMode(): ThemeMode {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

const CYCLE: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light:  'dark',
  dark:   'system',
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [osMode, setOsMode] = useState<ThemeMode>(systemMode);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Storage.get(StorageKey.THEME)
      .then((stored) => {
        // Valores gravados por versões anteriores ('light'/'dark') continuam válidos,
        // então não há migração de storage a fazer.
        if (isPreference(stored)) setPreferenceState(stored);
      })
      .finally(() => setReady(true));
  }, []);

  // Sem este listener, escolher "Sistema" e trocar o tema do SO com o app aberto não
  // fazia nada — o valor só era lido uma vez, na montagem.
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setOsMode(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => sub.remove();
  }, []);

  const setPreference = useCallback(async (next: ThemePreference) => {
    setPreferenceState(next);
    await Storage.set(StorageKey.THEME, next);
  }, []);

  const toggle = useCallback(async () => {
    await setPreference(CYCLE[preference]);
  }, [preference, setPreference]);

  const mode: ThemeMode = preference === 'system' ? osMode : preference;

  const value = useMemo<ThemeState>(
    () => ({
      theme: mode === 'dark' ? darkTheme : lightTheme,
      mode,
      preference,
      setPreference,
      toggle,
    }),
    [mode, preference, setPreference, toggle],
  );

  // Segurar a árvore até ler o storage evita um flash no tema errado, que é bem mais
  // perceptível que os poucos ms de tela vazia.
  if (!ready) return null;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme precisa estar dentro de ThemeProvider');
  return ctx;
}
