# Runbook — Diagnóstico de falhas do webhook Asaas Sandbox

**Quando usar:** Asaas Sandbox reporta 401/404 em notificações para `/api/v1/payments/webhook/asaas`.
**Escopo:** só Sandbox. Para produção, revise segredos com time de ops antes.
**Regra:** nunca cole aqui o valor literal do token. Use variáveis de ambiente.

## Diagnóstico rápido — qual é o erro?

| Resposta do backend | Causa provável | Ação |
|---|---|---|
| **401 body vazio** | Antes da correção: token inválido (controller) | — (obsoleto após Etapa 2 de hardening) |
| **401 com `{error:{code:"INVALID_WEBHOOK_TOKEN"}}`** | Token no Asaas Sandbox dashboard ≠ `ASAAS_WEBHOOK_TOKEN` do backend | Seção **Token mismatch** abaixo |
| **401 com `{error:{code:"UNAUTHORIZED",message:"Token de acesso ausente"}}`** | Verb errado (GET/PUT/DELETE) no path do webhook — caía no `authenticate` middleware | **Obsoleto após correção**: agora retorna 405 |
| **405 com `Allow: POST`** | Alguém mandou verb não-POST na URL correta | Confirmar que Asaas Sandbox está configurado com método POST (padrão) |
| **404** | URL cadastrada no Asaas Sandbox diverge do path real | Seção **URL mismatch** abaixo |
| **404 vindo do ngrok (HTML "Tunnel not found")** | Tunnel expirou; URL antiga ainda cadastrada no Asaas | Seção **Ngrok expirou** abaixo |

## Token mismatch (401)

### Confirmar o tamanho do token no backend sem vazar o valor

```bash
docker exec zelo-api sh -c 'if [ -n "$ASAAS_WEBHOOK_TOKEN" ]; then echo "configurado (${#ASAAS_WEBHOOK_TOKEN} chars)"; else echo "AUSENTE"; fi'
```

### Checar nos logs qual tamanho o Asaas está mandando

Depois da correção, cada 401 loga:
```
"tokenHeaderPresent": true,
"receivedLength": 12,
"expectedLength": 49,
```

Se `receivedLength > 0` mas `≠ expectedLength`: o Asaas está mandando um token **de outro tamanho**. Causas:
- Copy-paste com aspas ou espaço (comum: valor com `"abc..."` virando 2 chars a mais).
- Token antigo ainda cadastrado no Asaas após rotação no backend.

Se `tokenHeaderPresent: false`: o Asaas não está enviando o header.
- Dashboard Asaas tem campo "Access Token" vazio.
- Nome do header configurado no Asaas difere de `asaas-access-token` (padrão do gateway).

### Resolver

1. Dashboard Asaas Sandbox → **Integrações → Webhooks** → confirmar valor do campo "Token de autenticação".
2. Se ele está diferente: ou (a) atualize o dashboard do Asaas com o valor do backend (pegue de forma segura: `docker exec zelo-api printenv ASAAS_WEBHOOK_TOKEN`), ou (b) rotacione o token em ambos os lados.
3. **Nunca cole o token em chat/email/issue** — use canal seguro (Vault, 1Password).

## URL mismatch (404)

### URL real do backend

Local (Docker Compose padrão):
```
POST http://localhost:4000/api/v1/payments/webhook/asaas
```

Exposto via ngrok (sessão atual):
```bash
# Mostra a URL pública ativa:
curl -s http://localhost:4040/api/tunnels | python -c "import sys,json; print(json.load(sys.stdin)['tunnels'][0]['public_url'])"
```

**A URL completa a cadastrar no Asaas é:**
```
<URL_PUBLICA_NGROK>/api/v1/payments/webhook/asaas
```

### Paths COMUNS de erro que dão 404

- `/payments/webhook/asaas` (sem `/api/v1`)
- `/api/v1/webhook/asaas` (sem `/payments`)
- `/api/payments/webhook/asaas` (sem `/v1`)
- `/webhook/asaas` (sem prefixo todo)

### Resolver

1. Dashboard Asaas Sandbox → **Webhooks** → verificar URL cadastrada.
2. Confirmar que começa com `https://` (ngrok sempre oferece HTTPS no tunnel, use-o).
3. Confirmar que termina em `/api/v1/payments/webhook/asaas` **exatamente**.
4. Rodar no terminal local com o token correto para validar antes de salvar no dashboard:
   ```bash
   docker exec zelo-api sh -c 'curl -s -w "\nSTATUS: %{http_code}\n" -X POST http://localhost:4000/api/v1/payments/webhook/asaas \
     -H "Content-Type: application/json" \
     -H "asaas-access-token: $ASAAS_WEBHOOK_TOKEN" \
     -d "{\"id\":\"diag_$(date +%s)\",\"event\":\"PAYMENT_UPDATED\"}"'
   # Esperado: 200 com body {"received":true}
   ```

## Ngrok expirou

Ngrok free tier gera um subdomínio novo a cada `ngrok http 4000`. Se o processo caiu e subiu de novo, a URL cadastrada no Asaas aponta para um tunnel morto → 404 (ou HTML interstício, depende da versão).

### Resolver

1. Iniciar ngrok e obter a nova URL:
   ```bash
   ngrok http 4000
   ```
2. Atualizar o dashboard do Asaas Sandbox com a nova URL + `/api/v1/payments/webhook/asaas`.
3. Testar com o curl da seção anterior.
4. Se o problema voltar frequentemente, considerar ngrok reserved domain (plano pago) ou cloudflared.

## Reteste a partir do próprio Asaas Sandbox

1. Dashboard Asaas → **Cobranças** → crie cobrança sandbox.
2. Simule pagamento (botão "simular pagamento").
3. Observe os logs do backend: deve aparecer `"msg": "asaas webhook processado"` em até alguns segundos.
4. Se aparecer `"msg": "asaas webhook: token inválido"` → volta para Token mismatch.
5. Se o Asaas marca a entrega como falhou com status HTTP em branco → provável ngrok expirado.

## O que NÃO fazer

- ❌ Desabilitar autenticação ("deixa qualquer um chamar o webhook por enquanto"). O webhook movimenta dinheiro — nunca abra.
- ❌ Sempre retornar 200 independente de validação. A idempotência depende de rejeitar o que não é válido.
- ❌ Logar o valor do token para debug. A redaction do Pino já cobre `token`, mas evite expor nos logs em geral.
- ❌ Usar o mesmo token em dev e prod. Rotacione por ambiente.
