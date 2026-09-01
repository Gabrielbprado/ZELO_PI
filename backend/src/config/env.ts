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
  // Microserviço de notificações (services/notifications). O backend é apenas o
  // gateway: lê o inbox por HTTP e delega a persistência/push ao serviço. Opcional e
  // desligado por padrão, exatamente como o ML — sem ele, GET /notifications devolve
  // lista vazia em vez de 500, e o app segue funcionando. O push (que antes saía
  // inline daqui) mudou-se por inteiro para o serviço.
  NOTIFICATIONS_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  NOTIFICATIONS_SERVICE_URL: z.string().url().optional(),
  NOTIFICATIONS_SERVICE_TOKEN: z.string().min(16).optional(),
  NOTIFICATIONS_TIMEOUT_MS: z.coerce.number().int().positive().default(1500),
  // Serviço de recomendação (ml/). Mesma convenção booleana do ML_ENABLED.
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
  // Redis. Mesma convenção booleana, e desligado por padrão de
  // propósito: `npm run dev` e a suíte de testes precisam continuar subindo em
  // uma máquina sem Redis nenhum. Ligá-lo é opt-in.
  REDIS_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  REDIS_URL: z.string().url().optional(),
  // Prefixo de todas as chaves. Permite que ambientes diferentes dividam uma
  // instância (o free tier costuma dar uma só) sem um invalidar o cache do outro.
  REDIS_KEY_PREFIX: z.string().default('zelo'),
  CACHE_TTL_CATEGORIES_SEC: z.coerce.number().int().positive().default(3600),
  CACHE_TTL_PROVIDER_SEC: z.coerce.number().int().positive().default(300),
  CACHE_TTL_PROVIDER_LIST_SEC: z.coerce.number().int().positive().default(60),
  CACHE_TTL_REVIEWS_SEC: z.coerce.number().int().positive().default(300),
  // RabbitMQ. Mesma convenção booleana e mesma disciplina do Redis: dependência
  // OPCIONAL, desligada por padrão. Com ela off, o outbox continua sendo gravado
  // (o evento nasce junto da transação, sempre), apenas não há relay publicando —
  // então `npm run dev` e a suíte sobem sem broker nenhum. Ligá-la é opt-in.
  RABBITMQ_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  RABBITMQ_URL: z.string().url().optional(),
  RABBITMQ_EXCHANGE: z.string().default('zelo.events'),
  // Intervalo do relay do outbox e tamanho do lote por varredura.
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  OUTBOX_RELAY_BATCH: z.coerce.number().int().positive().max(1000).default(100),
  // Após quantas reentregas um evento vai para a DLQ em vez de voltar para a fila
  // de retry. Conta a partir do header `x-death` que o RabbitMQ mantém.
  EVENT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  // Jobs (BullMQ). Kill-switch por cima do Redis: mesmo com Redis ligado, isto desliga o
  // agendamento. Efetivamente só rodam quando Redis está disponível (ver config/jobs.ts).
  JOBS_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  // Um booking REQUESTED sem resposta por este tempo é expirado por um job.
  BOOKING_EXPIRY_HOURS: z.coerce.number().int().positive().default(48),
  // Bull Board (UI das filas) em /admin/queues. Basic auth em vez de Bearer porque a UI
  // faz polling no navegador — o browser reenvia a credencial Basic a cada request, um
  // header Bearer não. Defaults só de DEV; sobrescreva em qualquer ambiente exposto.
  ADMIN_UI_USER: z.string().default('admin'),
  ADMIN_UI_PASSWORD: z.string().default('zelo-admin'),
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

  // Mesma razão do ML: uma API interna sem token aceitaria consultas de inbox de
  // qualquer origem. Se o gateway está ligado e apontado, o token é obrigatório.
  if (cfg.NOTIFICATIONS_ENABLED && cfg.NOTIFICATIONS_SERVICE_URL && !cfg.NOTIFICATIONS_SERVICE_TOKEN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['NOTIFICATIONS_SERVICE_TOKEN'],
      message: 'NOTIFICATIONS_SERVICE_TOKEN é obrigatório quando NOTIFICATIONS_SERVICE_URL está definida',
    });
  }

  // Ligar o Redis sem dizer onde ele está é sempre erro de configuração, e o
  // sintoma seria silencioso: tudo funcionaria, só que sem cache nenhum.
  if (cfg.REDIS_ENABLED && !cfg.REDIS_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['REDIS_URL'],
      message: 'REDIS_URL é obrigatória quando REDIS_ENABLED=true',
    });
  }

  // Mesma razão do Redis: ligar o barramento sem dizer onde o broker está deixaria
  // o relay girando em falso, e o sintoma seria mudo — eventos gravados no outbox,
  // nunca publicados.
  if (cfg.RABBITMQ_ENABLED && !cfg.RABBITMQ_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['RABBITMQ_URL'],
      message: 'RABBITMQ_URL é obrigatória quando RABBITMQ_ENABLED=true',
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
