import { prisma } from '../config/prisma';
import {
  BASE_PRICE_BY_CATEGORY,
  BUDGET_CURRENCY,
  DEFAULT_PRICE_RANGE,
  DEFAULT_URGENCY_MULTIPLIER,
  URGENCY_MULTIPLIER,
} from '../constants/budget';

export interface BudgetBreakdownItem {
  label: string;
  value: string;
}

export interface BudgetEstimateResult {
  id: string;
  estimateMin: number;
  estimateMax: number;
  currency: string;
  breakdown: BudgetBreakdownItem[];
}

const VISIT_FEE_BRL = 80;

/**
 * Estimate a price range for a category given the user's Smart Budget
 * answers. The result is also persisted so we can analyse what users ask
 * for over time.
 */
export async function estimateBudget(
  userId: string | undefined,
  categoryId: string,
  answers: Record<string, string>,
): Promise<BudgetEstimateResult> {
  const baseRange = BASE_PRICE_BY_CATEGORY[categoryId] ?? DEFAULT_PRICE_RANGE;
  const multiplier = pickUrgencyMultiplier(answers);
  const min = Math.round(baseRange[0] * multiplier);
  const max = Math.round(baseRange[1] * multiplier);

  const persisted = await prisma.budgetEstimate.create({
    data: { userId, categoryId, answers, estimateMin: min, estimateMax: max },
  });

  return {
    id: persisted.id,
    estimateMin: min,
    estimateMax: max,
    currency: BUDGET_CURRENCY,
    breakdown: buildBreakdown(min, max),
  };
}

function pickUrgencyMultiplier(answers: Record<string, string>): number {
  const key = answers.urgency ?? answers.when ?? 'flex';
  return URGENCY_MULTIPLIER[key] ?? DEFAULT_URGENCY_MULTIPLIER;
}

function buildBreakdown(min: number, max: number): BudgetBreakdownItem[] {
  return [
    { label: 'Visita técnica', value: `R$ ${VISIT_FEE_BRL}` },
    { label: 'Mão de obra (1–2h)', value: `R$ ${Math.round(min * 0.5)} – ${Math.round(max * 0.5)}` },
    { label: 'Material básico', value: `R$ ${Math.round(min * 0.15)} – ${Math.round(max * 0.2)}` },
  ];
}
