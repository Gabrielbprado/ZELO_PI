import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  DATABASE_URL: z.string().url(),
  // Token compartilhado com o backend-gateway. Mesmo esquema do X-ML-Token do serviço
  // de recomendação: a API interna não é pública, só o backend a chama.
  SERVICE_TOKEN: z.string().min(16, 'SERVICE_TOKEN deve ter ao menos 16 chars'),
  // O broker é a RAZÃO deste serviço existir, então aqui ele é obrigatório — não há o
  // modo "desligado" que o backend tem. A conexão ainda é resiliente a quedas.
  RABBITMQ_URL: z.string().url(),
  RABBITMQ_EXCHANGE: z.string().default('zelo.events'),
  EVENT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  // Push Expo. Mesma convenção booleana e o mesmo kill-switch do backend.
  PUSH_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  EXPO_PUSH_API_URL: z.string().url().default('https://exp.host/--/api/v2/push/send'),
  EXPO_ACCESS_TOKEN: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuração de ambiente inválida (notifications):');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
