/**
 * Formatação monetária centralizada do app.
 *
 * Inconsistência que este arquivo elimina: cada tela de pagamento formatava valor
 * de um jeito (`R$ ${amount}` cru, `formatBRL` só na carteira, etc.).
 *
 * Convenção do backend:
 * - `Booking.priceFinal` / `Payment.amount` → REAIS inteiros.
 * - `Wallet.balanceCents` / `LedgerEntry.amountCents` → CENTAVOS.
 */
export function formatReais(value: number | null | undefined): string {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function formatCents(cents: number | null | undefined): string {
  const v = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  return (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Converte input digitado em pt-BR ("1.234,56" | "1234,56" | "1234.56") para centavos.
 * Tolerante a R$, espaços e separadores — devolve 0 se inválido.
 */
export function parseBRLToCents(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[R$\s]/g, '');
  if (!cleaned) return 0;
  // Se tem vírgula, ela é o separador decimal; pontos são milhar.
  // Se não tem vírgula, ponto é decimal (teclado decimal-pad).
  let normalized: string;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = cleaned;
  }
  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 100);
}

export function formatCountdown(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}
