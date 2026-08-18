import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET deve ter pelo menos 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET deve ter pelo menos 32 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGINS: z.string().default('http://localhost:8081'),
  // Diretório do bundle web do Expo (`mobile/dist`). Quando definido, a API
  // também serve o app — mesma origem, uma porta só. É o que torna viável
  // publicar uma prévia por um único túnel HTTP.
  WEB_DIST_DIR: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(200),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  // Push notifications (Expo). Kill-switch defaults ON; set to 'false' to
  // silence push in dev without removing the wiring. `z.coerce.boolean` is
  // intentionally avoided — it would treat the string 'false' as truthy.
  PUSH_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  EXPO_PUSH_API_URL: z.string().url().default('https://exp.host/--/api/v2/push/send'),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  // Serviço de recomendação (ml/). Mesma convenção booleana do PUSH_ENABLED.
  ML_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  ML_SERVICE_URL: z.string().url().optional(),
  ML_SERVICE_TOKEN: z.string().min(16).optional(),
  // 700ms local; em produção o Render free hiberna e leva 30-60s para acordar,
  // então lá o valor sobe — mas nunca a ponto de segurar a Home: o fallback
  // por avaliação assume o lugar bem antes disso.
  ML_TIMEOUT_MS: z.coerce.number().int().positive().default(700),
  ML_CANDIDATE_LIMIT: z.coerce.number().int().positive().max(200).default(150),
  ML_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(3),
  ML_CIRCUIT_COOLDOWN_MS: z.coerce.number().int().positive().default(30_000),
}).superRefine((cfg, ctx) => {
  // Um serviço de ranking aberto sem token receberia userId e coordenadas de
  // qualquer um. Se a integração está ligada e apontada para algum lugar, o
  // token é obrigatório — falhar no boot é melhor que vazar em produção.
  if (cfg.ML_ENABLED && cfg.ML_SERVICE_URL && !cfg.ML_SERVICE_TOKEN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ML_SERVICE_TOKEN'],
      message: 'ML_SERVICE_TOKEN é obrigatório quando ML_SERVICE_URL está definida',
    });
  }
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Configuração de ambiente inválida:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

export const isProd = env.NODE_ENV === 'production';
