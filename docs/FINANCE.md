# FINANCE — Carteira, escrow, comissão e saque

O ciclo financeiro do ZELO. É a razão de o outbox transacional existir: aqui, perder um
evento custaria dinheiro.

## Modelo

- **Wallet** (por profissional, em CENTAVOS): `balanceCents` (disponível) e `pendingCents`
  (em escrow, pago mas ainda não liberado).
- **LedgerEntry**: lançamento imutável, fonte da verdade do TOTAL da carteira. Categorias:
  `ESCROW_HOLD` (+), `PLATFORM_FEE` (−), `PAYOUT` (−), `REFUND` (+).
- **Payout**: saque via PIX (reserva o saldo na criação; processa via Asaas Transfer).
- `Payment` ganha `platformFeeCents` e `netAmountCents`, preenchidos na liquidação.

## Fluxo (dirigido por eventos)

```
  payment.confirmed ──► ledger.consumer ──► ESCROW_HOLD
                                            pendingCents += valor
  booking.completed ──► ledger.consumer ──► liquida (se pago E concluído):
                                            pendingCents −= valor
                                            balanceCents += líquido
                                            PLATFORM_FEE (−comissão)
  POST /wallet/me/payouts ─────────────────► reserva (PAYOUT −) → Asaas Transfer
                                            sucesso: PAID · falha: FAILED + REFUND (estorno)
```

- **Ordem não importa**: cada handler chama `trySettle`, que só libera quando pago E
  concluído. Se o pagamento vem antes da conclusão, fica em escrow; se depois, libera na
  hora. Idempotente (marca `netAmountCents` com um `updateMany` condicional e confere o
  `ESCROW_HOLD`), então reentregas do broker não duplicam dinheiro.
- **Roda dentro da transação idempotente do consumidor**: mover dinheiro e marcar o evento
  como processado commitam juntos.

## A invariante (testada)

Para toda carteira: **`balanceCents + pendingCents == SUM(CREDIT) − SUM(DEBIT)`**.

A movimentação pending→balance na liquidação NÃO é lançamento (não muda o total); só os
fatos que mudam o total entram no ledger. `tests/integration/financial.test.ts` verifica a
invariante depois de cada operação (liquidação, saque).

Exemplo (100 reais, comissão 12%): ESCROW_HOLD +10000 → liquida (pending 0, balance 8800) +
PLATFORM_FEE −1200 → saque 5000 (PAYOUT −5000, balance 3800). Ledger: 10000−1200−5000 = 3800
= balance+pending. ✓

## Saque (Asaas Transfer)

`requestPayout` valida o saldo e **reserva** de forma atômica (debita + `PAYOUT` no ledger,
com re-checagem do saldo no `updateMany` para não permitir saque concorrente além do saldo).
Depois processa: com Asaas ligado, chama `POST /transfers` (PIX); sem Asaas, o mock aprova.
Se o gateway recusa, **estorna** com um lançamento `REFUND` (o ledger é append-only, nunca
se apaga um lançamento) e marca o Payout como `FAILED`.

Comissão configurável em `PLATFORM_FEE_PERCENT` (padrão 12).

## Endpoints

- `GET /wallet/me` — saldo e pendente.
- `GET /wallet/me/statement?cursor=` — extrato paginado.
- `GET|POST /wallet/me/payouts` — listar / solicitar saque.

Todos exigem papel `PROVIDER`. Mobile: `WalletScreen` (saldo + extrato) e `PayoutScreen`.
