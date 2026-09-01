/**
 * Ciclo financeiro: escrow (retenção na confirmação do pagamento), liquidação com comissão
 * na conclusão, e saque. O que protege isto de bug de DINHEIRO:
 *  - a INVARIANTE do ledger: balance + pending == SUM(CREDIT) − SUM(DEBIT);
 *  - independência de ordem dos eventos e idempotência da liquidação;
 *  - o saque reserva/estorna mantendo a invariante.
 *
 * Comissão padrão: 12% (PLATFORM_FEE_PERCENT). 100 reais = 10000 centavos → fee 1200, net 8800.
 */
import request from 'supertest';
import { prisma } from '../../src/config/prisma';
import { getApp, createUser, createProvider, tokenFor } from './helpers';
import { settlePaymentConfirmed, settleBookingCompleted, ledgerTotalCents } from '../../src/services/ledger.service';

async function scenario(amountReais = 100, status: 'ACCEPTED' | 'COMPLETED' = 'COMPLETED') {
  const { user: providerUser, provider, category } = await createProvider();
  const client = await createUser({ email: `cli-${Date.now()}-${Math.random()}@fin.test` });
  const booking = await prisma.booking.create({
    data: { clientId: client.id, providerId: provider.id, categoryId: category.id, title: 'X', address: 'R', status },
  });
  const payment = await prisma.payment.create({
    data: { bookingId: booking.id, amount: amountReais, method: 'pix', status: 'PAID' },
  });
  return { providerUser, provider, booking, payment };
}

const walletOf = (userId: string) => prisma.wallet.findUnique({ where: { userId } });

async function assertInvariant(walletId: string) {
  const w = await prisma.wallet.findUnique({ where: { id: walletId } });
  expect(w!.balanceCents + w!.pendingCents).toBe(await ledgerTotalCents(walletId));
}

describe('escrow e liquidação', () => {
  it('retém no pagamento e libera na conclusão, descontando a comissão', async () => {
    const { providerUser, booking, payment } = await scenario(100, 'COMPLETED');

    await settlePaymentConfirmed(payment.id); // hold + (já concluído) liquida

    const w = await walletOf(providerUser.id);
    expect(w?.pendingCents).toBe(0);
    expect(w?.balanceCents).toBe(8800);
    await assertInvariant(w!.id);

    const p = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(p?.platformFeeCents).toBe(1200);
    expect(p?.netAmountCents).toBe(8800);
    void booking;
  });

  it('independe da ordem: pago antes de concluir → retém; conclui → libera', async () => {
    const { providerUser, booking, payment } = await scenario(100, 'ACCEPTED');

    await settlePaymentConfirmed(payment.id); // só retém (não concluído)
    let w = await walletOf(providerUser.id);
    expect(w?.pendingCents).toBe(10000);
    expect(w?.balanceCents).toBe(0);

    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'COMPLETED' } });
    await settleBookingCompleted(booking.id);

    w = await walletOf(providerUser.id);
    expect(w?.pendingCents).toBe(0);
    expect(w?.balanceCents).toBe(8800);
    await assertInvariant(w!.id);
  });

  it('é idempotente: reprocessar não duplica comissão nem retenção', async () => {
    const { providerUser, booking, payment } = await scenario(100, 'COMPLETED');

    await settlePaymentConfirmed(payment.id);
    await settlePaymentConfirmed(payment.id); // reentrega
    await settleBookingCompleted(booking.id); // reentrega
    await settleBookingCompleted(booking.id);

    const w = await walletOf(providerUser.id);
    expect(w?.balanceCents).toBe(8800);
    expect(w?.pendingCents).toBe(0);
    expect(await prisma.ledgerEntry.count({ where: { walletId: w!.id, category: 'ESCROW_HOLD' } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { walletId: w!.id, category: 'PLATFORM_FEE' } })).toBe(1);
    await assertInvariant(w!.id);
  });
});

describe('carteira e saque', () => {
  it('mostra o saldo e processa um saque (mock), mantendo a invariante', async () => {
    const { providerUser, payment } = await scenario(100, 'COMPLETED');
    await settlePaymentConfirmed(payment.id); // saldo 8800
    const app = await getApp();

    const wres = await request(app).get('/api/v1/wallet/me').set('Authorization', `Bearer ${tokenFor(providerUser)}`).expect(200);
    expect(wres.body.balanceCents).toBe(8800);

    const payout = await request(app)
      .post('/api/v1/wallet/me/payouts')
      .set('Authorization', `Bearer ${tokenFor(providerUser)}`)
      .send({ amountCents: 5000, pixKey: 'chave@pix.com' })
      .expect(201);
    expect(payout.body.status).toBe('PAID'); // sem Asaas, o mock aprova

    const w = await walletOf(providerUser.id);
    expect(w?.balanceCents).toBe(3800);
    await assertInvariant(w!.id);
  });

  it('recusa saque acima do saldo (400)', async () => {
    const { providerUser, payment } = await scenario(100, 'COMPLETED');
    await settlePaymentConfirmed(payment.id);
    const app = await getApp();
    await request(app)
      .post('/api/v1/wallet/me/payouts')
      .set('Authorization', `Bearer ${tokenFor(providerUser)}`)
      .send({ amountCents: 999_999, pixKey: 'chave@pix.com' })
      .expect(400);
  });

  it('a carteira é restrita a PROFISSIONAL', async () => {
    const client = await createUser({ role: 'CLIENT' });
    const app = await getApp();
    await request(app).get('/api/v1/wallet/me').set('Authorization', `Bearer ${tokenFor(client)}`).expect(403);
  });
});
