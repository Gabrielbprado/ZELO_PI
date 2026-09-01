/**
 * Confiança e reputação: avaliação BIDIRECIONAL (cliente↔profissional) com recálculo
 * atômico da nota; verificação de documentos (KYC) com moderação por ADMIN e trilha de
 * auditoria; e denúncias moderadas.
 */
import request from 'supertest';
import { prisma } from '../../src/config/prisma';
import { getApp, createUser, createProvider, tokenFor } from './helpers';
import { createReview } from '../../src/services/reviews.service';
import { ConflictError, ForbiddenError } from '../../src/errors';

async function completedBooking() {
  const { user: providerUser, provider, category } = await createProvider();
  const client = await createUser({ email: `cli-${Date.now()}-${Math.random()}@trust.test` });
  const booking = await prisma.booking.create({
    data: { clientId: client.id, providerId: provider.id, categoryId: category.id, title: 'X', address: 'Rua 1', status: 'COMPLETED' },
  });
  return { providerUser, provider, client, booking };
}

describe('avaliação bidirecional', () => {
  it('cliente avalia o profissional (recalcula a nota); profissional avalia o cliente sem mexer na nota', async () => {
    const { providerUser, provider, client, booking } = await completedBooking();

    await createReview(client.id, { bookingId: booking.id, rating: 4 });
    let p = await prisma.providerProfile.findUnique({ where: { id: provider.id } });
    expect(p?.ratingCount).toBe(1);
    expect(p?.ratingAvg).toBe(4);

    // O profissional avalia o cliente — não afeta a nota exibida do profissional.
    await createReview(providerUser.id, { bookingId: booking.id, rating: 5 });
    p = await prisma.providerProfile.findUnique({ where: { id: provider.id } });
    expect(p?.ratingCount).toBe(1);

    expect(await prisma.review.count({ where: { bookingId: booking.id } })).toBe(2);
  });

  it('impede a mesma pessoa de avaliar duas vezes', async () => {
    const { client, booking } = await completedBooking();
    await createReview(client.id, { bookingId: booking.id, rating: 4 });
    await expect(createReview(client.id, { bookingId: booking.id, rating: 2 })).rejects.toThrow(ConflictError);
  });

  it('rejeita avaliação de quem não participa', async () => {
    const { booking } = await completedBooking();
    const stranger = await createUser({ email: `x-${Date.now()}@trust.test` });
    await expect(createReview(stranger.id, { bookingId: booking.id, rating: 5 })).rejects.toThrow(ForbiddenError);
  });
});

describe('KYC', () => {
  it('profissional envia documento, admin aprova → perfil VERIFIED + auditoria', async () => {
    const { user: pro, provider } = await createProvider();
    await prisma.providerProfile.update({ where: { id: provider.id }, data: { kycStatus: 'PENDING', kycVerifiedAt: null } });
    const admin = await createUser({ role: 'ADMIN', email: `adm-${Date.now()}@trust.test` });
    const app = await getApp();

    const doc = await request(app)
      .post('/api/v1/providers/me/documents')
      .set('Authorization', `Bearer ${tokenFor(pro)}`)
      .send({ type: 'CPF', fileKey: 'storage/cpf-123.jpg' })
      .expect(201);

    const pending = await request(app).get('/api/v1/admin/kyc/pending').set('Authorization', `Bearer ${tokenFor(admin)}`).expect(200);
    expect(pending.body.items.some((d: { id: string }) => d.id === doc.body.id)).toBe(true);

    await request(app).post(`/api/v1/admin/kyc/${doc.body.id}/approve`).set('Authorization', `Bearer ${tokenFor(admin)}`).expect(200);

    const p = await prisma.providerProfile.findUnique({ where: { id: provider.id } });
    expect(p?.kycStatus).toBe('VERIFIED');

    const audit = await prisma.auditLog.findFirst({ where: { action: 'KYC_APPROVE', entityId: doc.body.id } });
    expect(audit?.userId).toBe(admin.id);
  });

  it('a fila de KYC é restrita a ADMIN', async () => {
    const client = await createUser({ role: 'CLIENT' });
    const app = await getApp();
    await request(app).get('/api/v1/admin/kyc/pending').set('Authorization', `Bearer ${tokenFor(client)}`).expect(403);
  });

  it('admin rejeita com motivo', async () => {
    const { user: pro, provider } = await createProvider();
    const admin = await createUser({ role: 'ADMIN', email: `adm2-${Date.now()}@trust.test` });
    const app = await getApp();
    const doc = await request(app)
      .post('/api/v1/providers/me/documents')
      .set('Authorization', `Bearer ${tokenFor(pro)}`)
      .send({ type: 'RG', fileKey: 'storage/rg.jpg' })
      .expect(201);

    await request(app)
      .post(`/api/v1/admin/kyc/${doc.body.id}/reject`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ reason: 'Documento ilegível' })
      .expect(200);

    const reloaded = await prisma.providerDocument.findUnique({ where: { id: doc.body.id } });
    expect(reloaded?.status).toBe('REJECTED');
    expect(reloaded?.rejectionReason).toBe('Documento ilegível');
    void provider;
  });
});

describe('denúncias', () => {
  it('usuário denuncia, admin resolve → auditoria', async () => {
    const reporter = await createUser({ email: `rep-${Date.now()}@trust.test` });
    const target = await createUser({ email: `tgt-${Date.now()}@trust.test` });
    const admin = await createUser({ role: 'ADMIN', email: `adm3-${Date.now()}@trust.test` });
    const app = await getApp();

    const rep = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${tokenFor(reporter)}`)
      .send({ targetUserId: target.id, reason: 'FRAUD', description: 'Cobrou e sumiu' })
      .expect(201);

    await request(app)
      .patch(`/api/v1/admin/reports/${rep.body.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ status: 'RESOLVED' })
      .expect(200);

    const reloaded = await prisma.report.findUnique({ where: { id: rep.body.id } });
    expect(reloaded?.status).toBe('RESOLVED');
    expect(reloaded?.resolvedById).toBe(admin.id);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'REPORT_RESOLVED', entityId: rep.body.id } });
    expect(audit).not.toBeNull();
  });

  it('não permite denunciar a si mesmo', async () => {
    const user = await createUser({ email: `self-${Date.now()}@trust.test` });
    const app = await getApp();
    await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ targetUserId: user.id, reason: 'OTHER' })
      .expect(400);
  });
});
