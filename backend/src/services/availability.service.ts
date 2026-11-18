import { prisma } from '../config/prisma';
import { BadRequestError, NotFoundError } from '../errors';
import { withCache, invalidatePrefix } from './cache.service';

/**
 * Agenda e disponibilidade do profissional.
 *
 * Modelo: uma grade semanal (`ProviderAvailability`, minutos desde a meia-noite) menos os
 * bloqueios pontuais (`ProviderTimeOff`) menos os agendamentos ativos = os horários livres.
 *
 * O horário de atendimento é horário civil de Brasília (America/Sao_Paulo). Datas de
 * booking/folga continuam como instantes UTC no banco; a conversão acontece ao montar slots.
 */

const MINUTES_IN_DAY = 24 * 60;
const SLOT_STEP_MINUTES = 60;
const DEFAULT_SLOT_MINUTES = 60;
const SLOTS_TTL_SEC = 60;
const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';
const ACTIVE_BOOKING_STATUSES = ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS'] as const;
const businessClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
});

function nextDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Interpreta a data/hora do calendário de Brasília e devolve o instante UTC equivalente. */
function localDateTimeToUtc(dateKey: string, minuteOfDay: number): Date {
  const wallClock = new Date(`${dateKey}T00:00:00.000Z`);
  wallClock.setUTCMinutes(minuteOfDay);
  const wallClockMs = wallClock.getTime();
  let instantMs = wallClockMs;

  // Corrige o offset da zona IANA. Repetir cobre também mudanças históricas de DST.
  for (let i = 0; i < 3; i += 1) {
    const parts = Object.fromEntries(businessClock.formatToParts(new Date(instantMs)).map((p) => [p.type, p.value]));
    const formattedAsUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    const next = wallClockMs - (formattedAsUtc - instantMs);
    if (next === instantMs) break;
    instantMs = next;
  }
  return new Date(instantMs);
}

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
    const parsedDate = new Date(`${dateStr}T00:00:00.000Z`);
    const dayStart = localDateTimeToUtc(dateStr, 0);
    if (Number.isNaN(dayStart.getTime()) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateStr) {
      throw new BadRequestError('Data inválida');
    }
    const dayEnd = localDateTimeToUtc(nextDateKey(dateStr), 0);
    const weekday = parsedDate.getUTCDay();

    const [rules, bookings, timeOffs] = await Promise.all([
      prisma.providerAvailability.findMany({ where: { providerId, weekday } }),
      prisma.booking.findMany({
        where: {
          providerId,
          status: { in: [...ACTIVE_BOOKING_STATUSES] },
          scheduledAt: { gte: dayStart, lt: dayEnd },
        },
        select: { scheduledAt: true, durationMinutes: true },
      }),
      prisma.providerTimeOff.findMany({
        where: { providerId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
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
        const startMs = localDateTimeToUtc(dateStr, m).getTime();
        const endMs = localDateTimeToUtc(dateStr, m + DEFAULT_SLOT_MINUTES).getTime();
        if (startMs <= now) continue; // não oferece horário no passado
        const overlaps = busy.some(([bs, be]) => startMs < be && endMs > bs);
        if (!overlaps) slots.push({ startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString() });
      }
    }
    return slots;
  }) as Promise<Slot[]>;
}
