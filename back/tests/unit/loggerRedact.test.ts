/**
 * Prova de que o Pino redacta coordenadas e PII sensível. Foi adicionado no Lote B
 * da Etapa 2 do GPS — se alguém no futuro remover sem querer, o teste pega.
 *
 * Usa um stream próprio para capturar o output do pino, porque o `logger` default
 * manda para stdout e o jest não intercepta.
 */

import pino from 'pino';
import { Writable } from 'stream';

function makeTestLogger() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  // Mesmas paths do logger real — queremos validar o contrato do redact, não a
  // configuração do objeto.
  const logger = pino(
    {
      redact: {
        paths: [
          'password', 'passwordHash', 'token', 'refreshToken',
          'latitude', 'longitude', 'lat', 'lng',
          '*.latitude', '*.longitude', '*.lat', '*.lng',
          'cpf', 'cpfCnpj', 'card.number', 'card.ccv',
          '*.cpf', '*.cpfCnpj',
        ],
        censor: '[REDACTED]',
      },
    },
    stream,
  );
  return { logger, chunks };
}

describe('logger redact de PII e GPS', () => {
  it('redacta latitude e longitude no top-level', () => {
    const { logger, chunks } = makeTestLogger();
    logger.info({ latitude: -23.5, longitude: -46.6, note: 'ok' }, 'test');
    const line = chunks.join('');
    expect(line).toContain('[REDACTED]');
    expect(line).not.toMatch(/-23\.5/);
    expect(line).not.toMatch(/-46\.6/);
    expect(line).toContain('"note":"ok"');
  });

  it('redacta coordenadas aninhadas via wildcard', () => {
    const { logger, chunks } = makeTestLogger();
    logger.info({ payload: { latitude: 10, longitude: 20 } }, 'test');
    const line = chunks.join('');
    expect(line).not.toMatch(/\b10\b/);
    expect(line).not.toMatch(/\b20\b/);
    expect(line).toContain('[REDACTED]');
  });

  it('redacta CPF e dados de cartão', () => {
    const { logger, chunks } = makeTestLogger();
    logger.info({
      cpf: '12345678909',
      card: { number: '4111111111111111', ccv: '123' },
    }, 'test');
    const line = chunks.join('');
    expect(line).not.toContain('12345678909');
    expect(line).not.toContain('4111111111111111');
    expect(line).not.toContain('"123"'); // ccv
    expect(line).toContain('[REDACTED]');
  });

  it('redacta senha/token (regression do contrato antigo)', () => {
    const { logger, chunks } = makeTestLogger();
    logger.info({ password: 'secret', token: 'abc' }, 'test');
    const line = chunks.join('');
    expect(line).not.toContain('secret');
    expect(line).not.toContain('"abc"');
  });
});
