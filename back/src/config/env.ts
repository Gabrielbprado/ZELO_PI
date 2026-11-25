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
  // Moderar é mais folgado que ranquear: quem espera é quem acabou de enviar uma
  // denúncia (uma vez), não a Home (toda sessão). Vale pagar mais para triar na hora.
  ML_MODERATION_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),
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
  // Retenção de dados. DELETE-side effect: ligado por env, nunca por default.
  // Prerequisito operacional: backup diário validado. Prazos:
  //   OUTBOX: 30d (histórico de eventos já publicados — raro ter que olhar passado)
  //   PROCESSED_EVENT: 7d (janela típica de retry de webhook do Asaas)
  //   AUDIT_LOG: 365d (auditoria legal/financeira; produto/legal podem exigir mais)
  RETENTION_CLEANUP_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  RETENTION_OUTBOX_DAYS: z.coerce.number().int().positive().default(30),
  RETENTION_PROCESSED_EVENT_DAYS: z.coerce.number().int().positive().default(7),
  RETENTION_AUDIT_LOG_DAYS: z.coerce.number().int().positive().default(365),
  // Bull Board (UI das filas) em /admin/queues. Basic auth em vez de Bearer porque a UI
  // faz polling no navegador — o browser reenvia a credencial Basic a cada request, um
  // header Bearer não. OBRIGATÓRIO em produção — sem defaults por segurança.
  ADMIN_UI_USER: z.string().min(1, 'ADMIN_UI_USER é obrigatório'),
  ADMIN_UI_PASSWORD: z.string().min(1, 'ADMIN_UI_PASSWORD é obrigatório'),
  // Asaas (gateway de pagamento). Dependência OPCIONAL: com ASAAS_ENABLED=false, PIX fica
  // indisponível e o cliente pode escolher dinheiro. Ligado, gera cobrança PIX real e
  // confirma pelo webhook do Asaas. Base URL default é o SANDBOX de propósito.
  ASAAS_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  ASAAS_BASE_URL: z.string().url().default('https://sandbox.asaas.com/api/v3'),
  ASAAS_API_KEY: z.string().optional(),
  // Token que o Asaas envia no header `asaas-access-token` do webhook; valida a origem.
  ASAAS_WEBHOOK_TOKEN: z.string().min(16).optional(),
  ASAAS_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  // Comissão da plataforma (%) retida na liquidação do escrow.
  PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(50).default(12),
  // Habilita o endpoint admin de confirmação manual de pagamento. Fora da lista
  // "operar normalmente": só é ligado em cenários específicos (sandbox que não
  // simula PIX, reconciliação de suporte quando webhook falhou). Desligado por
  // padrão em QUALQUER ambiente — tem que ser ligado explicitamente.
  ALLOW_ADMIN_FORCE_CONFIRM: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  // Sentry para erros remotos. Sem SENTRY_DSN, o módulo é no-op — nenhum overhead
  // em dev/test, zero chance de vazar erro de dev para o projeto de produção.
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
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

  // Asaas ligado sem chave de API não faz sentido — falha no boot em vez de aceitar
  // configuração que nunca conseguiria cobrar de verdade.
  if (cfg.ASAAS_ENABLED && !cfg.ASAAS_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ASAAS_API_KEY'],
      message: 'ASAAS_API_KEY é obrigatória quando ASAAS_ENABLED=true',
    });
  }

if (cfg.ASAAS_ENABLED && !cfg.ASAAS_WEBHOOK_TOKEN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ASAAS_WEBHOOK_TOKEN'],
      message: 'ASAAS_WEBHOOK_TOKEN é obrigatório quando ASAAS_ENABLED=true',
    });
  }

  if (cfg.NODE_ENV === 'production' && cfg.ASAAS_WEBHOOK_TOKEN && cfg.ASAAS_WEBHOOK_TOKEN.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ASAAS_WEBHOOK_TOKEN'],
      message: 'ASAAS_WEBHOOK_TOKEN deve ter pelo menos 32 chars em produção',
    });
  }

  // Guarda contra os defaults de desenvolvimento versionados no docker-compose.yml.
  // Esses valores existem só para `docker compose up` funcionar sem configuração;
  // em produção qualquer um deles indica que o operador esqueceu de sobrescrever
  // e o sistema subiria com secrets conhecidos — qualquer um forjaria tokens.
  // Preferimos travar o boot do que servir com credencial exposta no git.
  if (cfg.NODE_ENV === 'production') {
    const forbiddenPatterns = ['dev_only_', 'troque_isto', 'zelo_admin_1234'];
    const secretFields: Array<[keyof typeof cfg, string | undefined]> = [
      ['JWT_ACCESS_SECRET', cfg.JWT_ACCESS_SECRET],
      ['JWT_REFRESH_SECRET', cfg.JWT_REFRESH_SECRET],
      ['ML_SERVICE_TOKEN', cfg.ML_SERVICE_TOKEN],
      ['NOTIFICATIONS_SERVICE_TOKEN', cfg.NOTIFICATIONS_SERVICE_TOKEN],
      ['ASAAS_WEBHOOK_TOKEN', cfg.ASAAS_WEBHOOK_TOKEN],
      ['ASAAS_API_KEY', cfg.ASAAS_API_KEY],
      ['ADMIN_UI_PASSWORD', cfg.ADMIN_UI_PASSWORD],
    ];
    for (const [field, value] of secretFields) {
      if (!value) continue;
      const hit = forbiddenPatterns.find((p) => value.includes(p));
      if (hit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field as string],
          message: `${String(field)} contém marcador de desenvolvimento ("${hit}"). Em produção, gere um valor forte com \`openssl rand -base64 48\`.`,
        });
      }
    }

    // JWTs iguais entre si quebram a separação access/refresh: um token roubado pode
    // ser aceito pelo outro verificador. Travar o boot quando o operador define os dois
    // iguais é mais seguro que confiar que ninguém vai fazer isso.
    if (cfg.JWT_ACCESS_SECRET && cfg.JWT_REFRESH_SECRET && cfg.JWT_ACCESS_SECRET === cfg.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET deve ser diferente de JWT_ACCESS_SECRET',
      });
    }

    if (cfg.ADMIN_UI_PASSWORD && cfg.ADMIN_UI_PASSWORD.length < 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ADMIN_UI_PASSWORD'],
        message: 'ADMIN_UI_PASSWORD deve ter pelo menos 16 chars em produção',
      });
    }
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
  const fieldErrors = parsed.error.flatten().fieldErrors;
  const missingRequired = Object.entries(fieldErrors)
    .filter(([, errors]) => errors.some(e => e.includes('Required') || e.includes('obrigatório')))
    .map(([field]) => field);

  console.error('❌ Configuração de ambiente inválida:');
  if (missingRequired.length > 0) {
    console.error(`   Variáveis OBRIGATÓRIAS ausentes: ${missingRequired.join(', ')}`);
    console.error('   Copie .env.example para .env e preencha os valores.');
  }
  console.error('   Detalhes:');
  for (const [field, errors] of Object.entries(fieldErrors)) {
    for (const err of errors) {
      console.error(`     - ${field}: ${err}`);
    }
  }
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

export const isProd = env.NODE_ENV === 'production';
