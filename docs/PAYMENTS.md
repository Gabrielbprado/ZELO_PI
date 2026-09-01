# PAYMENTS — Integração com o Asaas (PIX)

Como o ZELO cobra de verdade, mantendo o fluxo mock funcionando quando não há gateway.

## Princípio: gateway é dependência opcional

Mesma disciplina do Redis/RabbitMQ/ML. Com `ASAAS_ENABLED=false` (padrão), o pagamento usa
um **PIX mock** — dev e demo funcionam sem conta no Asaas. Ligado, gera uma cobrança PIX
**real** e confirma pelo **webhook** do gateway. O `asaasClient.service.ts` **nunca lança**:
qualquer falha do Asaas degrada para o mock, a request nunca quebra.

## Fluxo

```
  Cliente                 Backend                         Asaas
  ───────                 ───────                         ─────
  POST /payments  ──────► createPaymentForBooking
                          ├─ ensureCustomer  ───────────► POST /customers  → cus_…
                          │  (id salvo em User.asaasCustomerId, reusado)
                          └─ createPixPayment ──────────► POST /payments (PIX) → pay_…
                                                          (id fica em Payment.externalId)
  (tela de checkout)      buildPixResponse ─────────────► GET /payments/{id}/pixQrCode
                          └─ QR base64 + copia-e-cola  ◄── { encodedImage, payload }

  … cliente paga o PIX no banco …

                          POST /payments/webhook/asaas ◄── Asaas (event PAYMENT_RECEIVED)
                          ├─ valida header asaas-access-token
                          ├─ confirmPaymentByExternalId(pay_…)
                          └─ Payment=PAID + payment.confirmed no OUTBOX
                                                          → microserviço de notificações
                                                            avisa o profissional
```

O webhook é a **fonte da verdade** da confirmação quando o Asaas está ligado (não o botão
"confirmar", que é do fluxo mock). É idempotente: dois webhooks do mesmo pagamento emitem
um único `payment.confirmed`.

## Configuração

| Var | Padrão | Papel |
|---|---|---|
| `ASAAS_ENABLED` | `false` | Liga a cobrança real. Off = PIX mock. |
| `ASAAS_BASE_URL` | `https://sandbox.asaas.com/api/v3` | Sandbox por padrão; produção é `https://api.asaas.com/v3`. |
| `ASAAS_API_KEY` | — | Chave da conta Asaas. **Obrigatória** quando `ENABLED=true`. |
| `ASAAS_WEBHOOK_TOKEN` | — | Token que o Asaas envia no header `asaas-access-token`; valida a origem do webhook. |
| `ASAAS_TIMEOUT_MS` | `8000` | Timeout das chamadas ao gateway. |

Para ligar (sandbox): pegue a API key no painel do Asaas, defina `ASAAS_ENABLED=true` e
`ASAAS_API_KEY=...` (no `.env` da raiz para o Docker), e cadastre o webhook no painel do
Asaas apontando para **`https://SEU_HOST/api/v1/payments/webhook/asaas`** com um
`ASAAS_WEBHOOK_TOKEN` combinado.

## Testes

- **Unit** (`tests/unit/asaasClient.service.test.ts`): cria cliente/cobrança, busca QR, e
  degradação — gateway fora / 5xx / corpo inválido → `null`, nunca exceção.
- **Integração** (`tests/integration/payments.webhook.test.ts`): o webhook confirma o
  pagamento e emite `payment.confirmed`; rejeita token inválido (401); ignora eventos que
  não são de recebimento; é idempotente; não quebra com cobrança desconhecida.
