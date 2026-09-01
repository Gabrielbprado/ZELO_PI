// Ambiente dos testes do serviço de notificações.
//
// DATABASE_URL aponta para o schema `notifications` do banco de TESTE (o mesmo
// zero_marketplace_test do backend, schema isolado). RABBITMQ_URL tem um default só para
// o env.ts parsear — os testes que realmente falam com o broker são gated por
// BROKER_TESTS=1; os demais nunca conectam.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:55432/zero_marketplace_test?schema=notifications';
process.env.SERVICE_TOKEN = process.env.SERVICE_TOKEN ?? 'test_service_token_16_chars_ok';
process.env.RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:56672';
// Sem push real nos testes: a réplica de token e a persistência do inbox é o que se testa.
process.env.PUSH_ENABLED = 'false';
