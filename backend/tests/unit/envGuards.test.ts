/**
 * Guards de boot do `config/env.ts`. O schema roda no import, o que torna o
 * teste direto do `env` impossível — recarregamos o módulo para cada caso.
 */

type EnvSnapshot = { [key: string]: string | undefined };

function snapshotEnv(): EnvSnapshot {
  return { ...process.env };
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const key of Object.keys(process.env)) delete process.env[key];
  for (const [k, v] of Object.entries(snapshot)) if (v !== undefined) process.env[k] = v;
}

function loadEnv(overrides: Record<string, string>) {
  jest.resetModules();
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
  // Delay a import até o momento certo: Zod avalia no primeiro require.
  // Isola o exit em modo de produção com valores ruins.
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as never);
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return { env: require('../../src/config/env').env as unknown, errors: errSpy.mock.calls };
  } finally {
    exitSpy.mockRestore();
    errSpy.mockRestore();
  }
}

describe('env guards de produção (P0.3)', () => {
  let saved: EnvSnapshot;

  beforeEach(() => { saved = snapshotEnv(); });
  afterEach(() => { restoreEnv(saved); });

  it('aceita secrets fortes em produção', () => {
    expect(() => loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@db.example:5432/prod',
      JWT_ACCESS_SECRET: 'a'.repeat(48),
      JWT_REFRESH_SECRET: 'b'.repeat(48),
      ADMIN_UI_USER: 'admin',
      ADMIN_UI_PASSWORD: 'strong-password-16-plus-chars',
      ASAAS_ENABLED: 'false',
      NOTIFICATIONS_ENABLED: 'false',
      ML_ENABLED: 'false',
    })).not.toThrow();
  });

  it('rejeita JWT_ACCESS_SECRET com marcador dev_only_ em produção', () => {
    expect(() => loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@db.example:5432/prod',
      JWT_ACCESS_SECRET: 'dev_only_access_secret_troque_isto_em_producao_0123',
      JWT_REFRESH_SECRET: 'b'.repeat(48),
      ADMIN_UI_USER: 'admin',
      ADMIN_UI_PASSWORD: 'strong-password-16-plus-chars',
      ASAAS_ENABLED: 'false',
      NOTIFICATIONS_ENABLED: 'false',
      ML_ENABLED: 'false',
    })).toThrow(/process\.exit/);
  });

  it('rejeita JWT_ACCESS_SECRET igual a JWT_REFRESH_SECRET em produção', () => {
    const same = 'x'.repeat(48);
    expect(() => loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@db.example:5432/prod',
      JWT_ACCESS_SECRET: same,
      JWT_REFRESH_SECRET: same,
      ADMIN_UI_USER: 'admin',
      ADMIN_UI_PASSWORD: 'strong-password-16-plus-chars',
      ASAAS_ENABLED: 'false',
      NOTIFICATIONS_ENABLED: 'false',
      ML_ENABLED: 'false',
    })).toThrow(/process\.exit/);
  });

  it('rejeita ADMIN_UI_PASSWORD curto em produção', () => {
    expect(() => loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@db.example:5432/prod',
      JWT_ACCESS_SECRET: 'a'.repeat(48),
      JWT_REFRESH_SECRET: 'b'.repeat(48),
      ADMIN_UI_USER: 'admin',
      ADMIN_UI_PASSWORD: 'curta',
      ASAAS_ENABLED: 'false',
      NOTIFICATIONS_ENABLED: 'false',
      ML_ENABLED: 'false',
    })).toThrow(/process\.exit/);
  });

  it('aceita o padrão dev_only_ fora de produção (preserva onboarding)', () => {
    expect(() => loadEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/dev',
      JWT_ACCESS_SECRET: 'dev_only_access_secret_troque_isto_em_producao_0123',
      JWT_REFRESH_SECRET: 'dev_only_refresh_secret_troque_isto_em_producao_9876',
      ADMIN_UI_USER: 'admin',
      ADMIN_UI_PASSWORD: 'curta',
      ASAAS_ENABLED: 'false',
      NOTIFICATIONS_ENABLED: 'false',
      ML_ENABLED: 'false',
    })).not.toThrow();
  });
});
