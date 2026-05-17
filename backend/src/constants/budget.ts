/**
 * Pricing reference tables used by the Smart Budget estimator.
 *
 * Values are expressed in BRL using integer reais (not cents) because the
 * estimator returns a guidance range, not a settlement amount. The real
 * gateway always operates in minor units.
 */

/** Base [min, max] price range per category id. */
export const BASE_PRICE_BY_CATEGORY: Readonly<Record<string, readonly [number, number]>> = {
  plumb: [120, 280],
  bolt: [120, 320],
  hammer: [200, 800],
  brush: [350, 900],
  spray: [140, 320],
  sofa: [120, 600],
  hvac: [180, 480],
  leaf: [90, 240],
};

/** Fallback range when the category is not known. */
export const DEFAULT_PRICE_RANGE: readonly [number, number] = [150, 300];

/** Multipliers applied based on the urgency answer in the Smart Budget flow. */
export const URGENCY_MULTIPLIER: Readonly<Record<string, number>> = {
  now: 1.6,
  today: 1.25,
  today2: 1.25,
  week: 1.0,
  week2: 1.0,
  flex: 0.85,
  unsure: 1.1,
  month: 1.1,
};

export const DEFAULT_URGENCY_MULTIPLIER = 1;

/** Default currency used in the budget response. */
export const BUDGET_CURRENCY = 'BRL';
