// Testa apenas a lógica determinística do serviço de orçamento (sem persistência).
// Mockamos o Prisma para isolar a função de estimativa.

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    budgetEstimate: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'mock', ...data })),
    },
  },
}));

import { estimateBudget } from '../../src/services/budget.service';

describe('budget.service', () => {
  it('aplica multiplicador de emergência (now > flex)', async () => {
    const emergency = await estimateBudget(undefined, 'plumb', { urgency: 'now' });
    const relaxed   = await estimateBudget(undefined, 'plumb', { urgency: 'flex' });
    expect(emergency.estimateMin).toBeGreaterThan(relaxed.estimateMin);
    expect(emergency.estimateMax).toBeGreaterThan(relaxed.estimateMax);
  });

  it('retorna breakdown com 3 itens', async () => {
    const r = await estimateBudget(undefined, 'plumb', {});
    expect(r.breakdown).toHaveLength(3);
    expect(r.currency).toBe('BRL');
  });

  it('faz fallback em categoria desconhecida', async () => {
    const r = await estimateBudget(undefined, 'inexistente', { urgency: 'flex' });
    expect(r.estimateMin).toBeGreaterThan(0);
    expect(r.estimateMax).toBeGreaterThan(r.estimateMin);
  });
});
