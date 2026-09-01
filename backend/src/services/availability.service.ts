import { prisma } from '../config/prisma';
import { BadRequestError, NotFoundError } from '../errors';
import { withCache, invalidatePrefix } from './cache.service';

/**
 * Agenda e disponibilidade do profissional.
 *
 * Modelo: uma grade semanal (`ProviderAvailability`, minutos desde a meia-noite) menos os
 * bloqueios pontuais (`ProviderTimeOff`) menos os agendamentos ativos = os horários livres.
 *
 * Simplificação de fuso assumida e documentada: tudo é calculado em UTC. Para o PI, a
 * consistência (mesma régua para agenda, folgas e bookings) importa mais que o offset;
 * evoluir para timezone por profissional é trocar o ponto de referência das contas abaixo.
 */

const MINUTES_IN_DAY = 24 * 60;
const SLOT_STEP_MINUTES = 60;
const DEFAULT_SLOT_MINUTES = 60;
const SLOTS_TTL_SEC = 60;
const ACTIVE_BOOKING_STATUSES = ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS'] as const;

export interface AvailabilityRule {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface Slot {
  startsAt: string;
  endsAt: string;
}

/** Resolve o id do perfil de profissional a partir do userId (para as rotas /me). */
async function resolveProviderId(userId: string): Promise<string> {
  const profile = await prisma.providerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) throw new NotFoundError('Perfil de profissional não encontrado');
  return profile.id;
}

export async function getMyAvailability(userId: string): Promise<AvailabilityRule[]> {
  const providerId = await resolveProviderId(userId);
  return getAvailability(providerId);
}

export function getAvailability(providerId: string): Promise<AvailabilityRule[]> {
  return prisma.providerAvailability.findMany({
    where: { providerId },
    select: { weekday: true, startMinute: true, endMinute: true },
    orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
  });
}

/** Substitui a grade inteira. Valida faixas e sobreposições no mesmo dia. */
export async function setMyAvailability(userId: string, rules: AvailabilityRule[]): Promise<AvailabilityRule[]> {
  const providerId = await resolveProviderId(userId);
  validateRules(rules);

  await prisma.$transaction([
    prisma.providerAvailability.deleteMany({ where: { providerId } }),
    prisma.providerAvailability.createMany({
      data: rules.map((r) => ({ providerId, weekday: r.weekday, startMinute: r.startMinute, endMinute: r.endMinute })),
    }),
  ]);
  await invalidatePrefix(`slots:${providerId}:`);
  return getAvailability(providerId);
}

function validateRules(rules: AvailabilityRule[]): void {
  for (const r of rules) {
    if (r.weekday < 0 || r.weekday > 6) throw new BadRequestError('weekday deve estar entre 0 e 6');
    if (r.startMinute < 0 || r.endMinute > MINUTES_IN_DAY || r.startMinute >= r.endMinute) {
      throw new BadRequestError('Faixa de horário inválida');
    }
  }
  // Sem sobreposição no mesmo dia.
  for (let d = 0; d <= 6; d += 1) {
    const day = rules.filter((r) => r.weekday === d).sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < day.length; i += 1) {
      if (day[i].startMinute < day[i - 1].endMinute) {
        throw new BadRequestError('Há faixas de horário sobrepostas no mesmo dia');
      }
    }
  }
}

export async function listMyTimeOff(userId: string) {
  const providerId = await resolveProviderId(userId);
  return prisma.providerTimeOff.findMany({ where: { providerId }, orderBy: { startsAt: 'asc' } });
}

export async function addMyTimeOff(userId: string, input: { startsAt: string; endsAt: string; reason?: string }) {
  const providerId = await resolveProviderId(userId);
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt >= endsAt) {
    throw new BadRequestError('Intervalo de folga inválido');
  }
  const created = await prisma.providerTimeOff.create({
    data: { providerId, startsAt, endsAt, reason: input.reason ?? null },
  });
  await invalidatePrefix(`slots:${providerId}:`);
  return created;
}

export async function removeMyTimeOff(userId: string, id: string): Promise<void> {
  const providerId = await resolveProviderId(userId);
  const res = await prisma.providerTimeOff.deleteMany({ where: { id, providerId } });
  if (res.count === 0) throw new NotFoundError('Folga não encontrada');
  await invalidatePrefix(`slots:${providerId}:`);
}

/** Invalidação usada quando um booking é criado/cancelado, para o slots refletir na hora. */
export async function invalidateSlots(providerId: string): Promise<void> {
  await invalidatePrefix(`slots:${providerId}:`);
}

/**
 * Horários livres do profissional numa data (YYYY-MM-DD). Público e cacheado 60s — o
 * cálculo não depende de quem pergunta.
 */
export async function computeSlots(providerId: string, dateStr: string): Promise<Slot[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new BadRequestError('Data inválida (use YYYY-MM-DD)');

  return withCache(`slots:${providerId}:${dateStr}`, SLOTS_TTL_SEC, async () => {
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(dayStart.getTime())) throw new BadRequestError('Data inválida');
    const dayStartMs = dayStart.getTime();
    const dayEndMs = dayStartMs + MINUTES_IN_DAY * 60_000;
    const weekday = dayStart.getUTCDay();

    const [rules, bookings, timeOffs] = await Promise.all([
      prisma.providerAvailability.findMany({ where: { providerId, weekday } }),
      prisma.booking.findMany({
        where: {
          providerId,
          status: { in: [...ACTIVE_BOOKING_STATUSES] },
          scheduledAt: { gte: dayStart, lt: new Date(dayEndMs) },
        },
        select: { scheduledAt: true, durationMinutes: true },
      }),
      prisma.providerTimeOff.findMany({
        where: { providerId, startsAt: { lt: new Date(dayEndMs) }, endsAt: { gt: dayStart } },
        select: { startsAt: true, endsAt: true },
      }),
    ]);
    if (rules.length === 0) return [];

    // Intervalos ocupados (em ms absolutos) de bookings e folgas.
    const busy: Array<[number, number]> = [
      ...bookings
        .filter((b) => b.scheduledAt)
        .map((b): [number, number] => {
          const s = (b.scheduledAt as Date).getTime();
          return [s, s + b.durationMinutes * 60_000];
        }),
      ...timeOffs.map((t): [number, number] => [t.startsAt.getTime(), t.endsAt.getTime()]),
    ];

    const now = Date.now();
    const slots: Slot[] = [];
    for (const rule of rules) {
      for (let m = rule.startMinute; m + DEFAULT_SLOT_MINUTES <= rule.endMinute; m += SLOT_STEP_MINUTES) {
        const startMs = dayStartMs + m * 60_000;
        const endMs = startMs + DEFAULT_SLOT_MINUTES * 60_000;
        if (startMs <= now) continue; // não oferece horário no passado
        const overlaps = busy.some(([bs, be]) => startMs < be && endMs > bs);
        if (!overlaps) slots.push({ startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString() });
      }
    }
    return slots;
  }) as Promise<Slot[]>;
}
