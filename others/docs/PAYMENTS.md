# PAYMENTS — Integração com Asaas (PIX + Cartão)

> **Gateway de pagamento: Asaas (exclusivo).** O ZELO utiliza exclusivamente o Asaas
> para todos os fluxos financeiros: PIX, cartão de crédito/débito, confirmação,
> estorno, split (quando habilitado), webhooks e conciliação. **Nenhum outro gateway é
> suportado.** Decisão arquitetural formalizada em 2026-11-04; mudança desse ponto
> exige revisão arquitetural formal.

Como o ZELO cobra de verdade, com que gateway e por que não simula quando ele está fora.

## Princípio: gateway é dependência opcional

Mesma disciplina do Redis/RabbitMQ/ML para disponibilidade — mas não para confirmação
financeira. Com `ASAAS_ENABLED=false` (padrão), PIX e cartão ficam indisponíveis e o
cliente deve escolher dinheiro ou tentar depois. Com a Asaas ligada, a API cria uma
cobrança **real** no gateway e confirma pelo **webhook**. O `asaasClient.service.ts`
**nunca lança**: timeout, 5xx e corpo inválido viram `null`; a camada de pagamento
transforma isso em erro explícito, sem criar cobrança simulada. O cliente também tem
um *circuit breaker* (3 falhas → aberto por 30 s) para não martelar o gateway quando
ele está instável.

## Fluxo

```
  Cliente                 Backend                            Asaas
  ───────                 ───────                            ──────
  POST /payments  ──────► createPaymentForBooking
                          └─ ensureAsaasCustomer ──────────► POST /customers (1ª vez)
                                                             (id vai em User.asaasCustomerId)

                          PIX:
                          └─ createPixPayment ─────────────► POST /payments (billingType=PIX)
                                                             → id "pay_…"
                          GET /payments/:id/pix ───────────► GET /payments/{id}/pixQrCode
                                                             ← { encodedImage, payload }

                          CARTÃO:
                          └─ createCardPayment ────────────► POST /payments
                                                             (billingType=CREDIT_CARD,
                                                              creditCard, creditCardHolderInfo,
                                                              installmentCount, installmentValue)
                                                             → id "pay_…" (CONFIRMED/REFUSED)

  … cliente paga (PIX no banco, cartão aprovado na hora) …

                          POST /payments/webhook/asaas ◄──── Asaas (PAYMENT_RECEIVED, …)
                          ├─ valida header asaas-access-token (timingSafeEqual)
                          ├─ claimWebhookEvent (idempotência em ProcessedEvent)
                          ├─ asaasGetPayment(id)  → palavra final sobre o status
                          ├─ applyGatewayPaymentStatus (RECEIVED/CONFIRMED → PAID)
                          └─ Payment=PAID + payment.confirmed no OUTBOX
                                                             → microserviço de notificações
                                                               avisa o profissional
```

O webhook é a **fonte da verdade** da confirmação quando a Asaas está ligada. O botão
"confirmar" existe apenas para dinheiro, acionado pelo profissional. A idempotência
sobre o webhook se dá em três camadas:

1. `ProcessedEvent` (consumer=`asaas-webhook`, eventId único vindo do campo `id` do
   webhook): dois POSTs do mesmo evento = o segundo é no-op.
2. `applyGatewayPaymentStatus` usa `updateMany` com guard `status NOT IN (PAID,
   REFUNDED)`, então uma segunda transição é no-op.
3. O evento `payment.confirmed` só nasce quando a transição efetivamente mudou o
   status — nunca duplicado no outbox.

## Métodos aceitos

| Método         | Flag no body         | Confirmação                 |
|----------------|----------------------|-----------------------------|
| PIX            | `method: "pix"`      | Webhook da Asaas             |
| Cartão crédito | `method: "credit_card"` | Resposta imediata + webhook |
| Cartão débito  | `method: "debit_card"`  | Resposta imediata + webhook |
| Dinheiro       | `method: "cash"`     | Profissional confirma no app |

### Cartão: dados exigidos

A Asaas pede `creditCardHolderInfo` em todo pagamento com cartão. No request:

```json
{
  "bookingId": "…",
  "method": "credit_card",
  "installments": 3,
  "card": {
    "holderName": "ANA SILVA",
    "number": "5162306101010019",
    "expiryMonth": "12",
    "expiryYear": "2030",
    "ccv": "318"
  },
  "cardHolderInfo": {
    "postalCode": "01310100",
    "addressNumber": "1500",
    "phone": "11999999999"
  }
}
```

`name`, `email` e `cpfCnpj` do titular vêm do perfil do cliente (`User.name`, `email`,
`cpf`). CPF é **obrigatório** para cartão — o pagamento é bloqueado com `400` se o
perfil não tiver.

> Aviso de PCI: hoje o número do cartão trafega até o backend. Para produção, trocar
> por tokenização via `/creditCard/tokenize` da Asaas (passa o cartão direto do
> cliente para a Asaas; o backend recebe só um `creditCardToken`). Fica como follow-up.

### Parcelamento

Até 12x via tabela interna (`INSTALLMENT_FEE_RATES` em `payments.service.ts`). A API
`GET /payments/installments?amount=…` devolve as opções com `installmentAmount`,
`totalAmount` e `interestRate`. O backend envia `installmentCount` e
`installmentValue` para a Asaas; `value` da cobrança é o total com juros.

## Configuração

| Var | Padrão | Papel |
|---|---|---|
| `ASAAS_ENABLED` | `false` | Liga a cobrança real. Off = PIX/cartão indisponíveis; dinheiro continua funcionando. |
| `ASAAS_BASE_URL` | `https://sandbox.asaas.com/api/v3` | Base da API. Em produção: `https://api.asaas.com/v3`. |
| `ASAAS_API_KEY` | — | API key da Asaas (`$aact_YTU5…` em sandbox). **Obrigatória** quando `ENABLED=true`. |
| `ASAAS_WEBHOOK_TOKEN` | — | Token que a Asaas envia no header `asaas-access-token` do webhook. **Obrigatório** com Asaas ligada; mín. 32 chars em produção. |
| `ASAAS_TIMEOUT_MS` | `8000` | Timeout das chamadas ao gateway. |

## Setup do sandbox — passo a passo

### 1. Criar conta e API key

1. Acesse https://sandbox.asaas.com e crie uma conta (gratuita; isolada da produção).
2. Vá em **"Minha conta" → "Integrações" → "API Access"**.
3. Copie a **API key** (`$aact_YTU5…`).

### 2. Configurar o `.env`

```env
ASAAS_ENABLED=true
ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3
ASAAS_API_KEY=$aact_YTU5...
ASAAS_WEBHOOK_TOKEN=um-token-aleatorio-com-mais-de-32-chars
ASAAS_TIMEOUT_MS=8000
```

> O `ASAAS_WEBHOOK_TOKEN` é escolhido **por você** — não vem da Asaas. Você cola o
> mesmo valor no painel da Asaas (próximo passo). O backend compara o header
> `asaas-access-token` com esse valor (comparação em tempo constante via `timingSafeEqual`).

### 3. Expor o backend com ngrok

A Asaas precisa chamar seu webhook por HTTPS público:

```powershell
# Instalação única
winget install ngrok.ngrok
ngrok config add-authtoken SEU_TOKEN

# Suba o backend em outra janela
npm --prefix backend run dev   # :4000

# Exponha num terminal separado
ngrok http 4000
```

### 4. Cadastrar o webhook na Asaas

No painel sandbox → **"Integrações" → "Webhooks"**:

1. URL: `https://SEU-TUNEL.ngrok-free.app/api/v1/payments/webhook/asaas`
2. Email de alerta: o seu
3. **Token de autenticação**: cole exatamente o mesmo valor de `ASAAS_WEBHOOK_TOKEN`
4. Eventos: marque **Pagamentos** (`PAYMENT_CREATED`, `PAYMENT_RECEIVED`,
   `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_DELETED`).
5. Habilite e salve.

### 5. Fluxo ponta a ponta

1. No app ZELO, logue como cliente e crie um booking até o status `COMPLETED`/
   `ACCEPTED` com `priceFinal` definido.
2. Vá para a tela de pagamento:
   - **PIX**: toque em "Gerar PIX". QR aparece; use o copia-e-cola no painel da Asaas
     ("Pagamentos" → cobrança → "Simular recebimento"). O webhook dispara e o polling
     do mobile detecta `PAID`.
   - **Cartão**: preencha os dados. Cartão sandbox que **aprova**:
     `5162 3061 0101 0019`, validade `12/30`, CVV `318`. CEP `01310-100`, número
     `1500`, telefone `11999999999`. Pagamento sai `CONFIRMED` imediatamente.
   - **Dinheiro**: logue como profissional e confirme — vira `PAID`.

### 6. Troubleshooting

- **401 Unauthorized no webhook**: o `asaas-access-token` recebido não bate com
  `ASAAS_WEBHOOK_TOKEN`. Reconfirme que ambos têm o mesmo valor literal e tamanho.
- **200 com `ignored: "fetch_failed"`**: o backend recebeu o webhook mas falhou ao
  rebuscar o pagamento na Asaas (timeout/credencial). Veja `ASAAS_TIMEOUT_MS` e a API key.
- **200 com `ignored: "invalid_payload"`**: a Asaas mandou um corpo fora do contrato
  (p.ex. teste do painel sem `payment`). Normal em simulações; não quebra nada.
- **Payment fica eternamente `PENDING`**: `ngrok` caiu ou mudou de URL. Reconfigure
  o webhook no painel da Asaas com a URL atual.
- **`circuit breaker aberto`** nos logs: 3 falhas consecutivas abriram o breaker
  por 30 s. Normal após queda da Asaas ou credencial errada.

## Testes

- **Unit** (`tests/unit/asaasClient.service.test.ts`): `isAsaasChargeId`,
  `mapAsaasStatusToInternal`, `createCustomer`, `createPixPayment`, `createCardPayment`,
  `getPayment`, `getPixQrCode` com `global.fetch` mockado — garante que o cliente
  **nunca lança** e respeita o contrato de parsing.
- **Integração** (`tests/integration/payments.webhook.test.ts`): webhook confirma o
  pagamento e emite `payment.confirmed`; rejeita token inválido (401); ignora payload
  sem `payment.id`; idempotente (sequencial e concorrente); não quebra com cobrança
  desconhecida; marca FAILED em status terminal negativo. Requer **PostGIS** no DB
  de teste (use o Postgres do `docker-compose.yml` — `postgis/postgis:16-3.4`).

```powershell
# Unitários (não precisam de infra):
npm --prefix backend test -- tests/unit/asaasClient.service.test.ts

# Integração (precisa do zelo-db do compose + TEST_DATABASE_URL no .env):
docker compose up -d db
npm --prefix backend run test:integration -- tests/integration/payments.webhook.test.ts
```
