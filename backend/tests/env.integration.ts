import 'dotenv/config';

// Os testes de integração rodam contra um banco DEDICADO. Para evitar destruição
// acidental de dados de dev, exigimos uma URL diferente da DATABASE_URL padrão.
const testUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!testUrl) {
  throw new Error('TEST_DATABASE_URL não definida. Veja docs/SETUP.md.');
}
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testUrl;
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET_TEST ?? 'integration_access_secret_at_least_32_chars_xxx';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET_TEST ?? 'integration_refresh_secret_at_least_32_chars_xxx';
process.env.BCRYPT_SALT_ROUNDS = '10';
process.env.RATE_LIMIT_MAX = '10000';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.CORS_ORIGINS = 'http://localhost:8081,http://example.test';

// Recomendação: a integração fica LIGADA e apontada para um host inexistente.
// `env` é congelado no import, então definir isto em runtime dentro de um teste
// não teria efeito — precisa estar aqui. Os testes controlam o comportamento
// mockando `global.fetch`; o padrão (mock que rejeita) representa o serviço de
// ML fora do ar, que é o estado de qualquer deploy antes do primeiro treino.
process.env.ML_ENABLED = 'true';
process.env.ML_SERVICE_URL = 'http://ml.invalido.test';
process.env.ML_SERVICE_TOKEN = 'token_de_teste_com_16_chars';
process.env.ML_TIMEOUT_MS = '200';

// Asaas fica DESLIGADO na integração (createPayment usa o PIX mock, sem chamar a rede),
// mas o token de webhook é definido para o teste do webhook exercitar a validação.
process.env.ASAAS_WEBHOOK_TOKEN = 'test-webhook-token';
