import { api } from './client';
import type { BudgetResult } from '../types';

export async function estimate(categoryId: string, answers: Record<string, string>): Promise<BudgetResult> {
  const { data } = await api.post<BudgetResult>('/budget/estimate', { categoryId, answers });
  return data;
}
