# Proposta — Proteção de CPF em repouso (P0.6)

**Status:** aguardando decisão de produto/legal · **Impacto:** LGPD, backfill de dados existentes · **Prazo recomendado:** antes de abrir para usuários pagantes reais.

## Problema

Hoje `User.cpf` é armazenado em plaintext no Postgres. Um breach do banco (dump vazado, backup não criptografado, SQL injection futura) expõe CPFs em claro — LGPD Art. 48 obriga notificação em 72h e abre multa até 2% do faturamento.

## Opções

### A — Hash determinístico (HMAC-SHA256 com pepper)

**Como:** armazenar `hmac_sha256(pepper_secret, cpf)` em `cpf_hash` (BYTEA). Remover `cpf` em claro.

- Pepper fica em env var (não no banco), rotacionável só com re-hash em massa.
- Busca por CPF exato continua funcionando (lookup direto por hash).
- Deduplicação (`@unique`) continua funcionando no hash.

**Vantagens:** irreversível; vazamento do banco **não** expõe CPFs utilizáveis sem o pepper; implementação simples.

**Desvantagens:**
- Não é possível devolver o CPF formatado pro próprio usuário (ex.: tela de perfil). Alternativa: guardar os 3 primeiros + 2 últimos dígitos (`123.***.**9-10`) em um campo auxiliar para exibição.
- Não é possível enviar o CPF para o Asaas no fluxo de pagamento — o Asaas EXIGE CPF em claro. Isso **invalida a opção A** se o fluxo de cartão for manter.

### B — Encryption simétrica (AES-256-GCM com AWS KMS / libsodium)

**Como:** `cpf_encrypted` (BYTEA) = ciphertext + nonce + tag. Chave mestre guardada em KMS (AWS/GCP) ou libsodium secret file.

- Serviço descriptografa só quando precisa (fluxo de pagamento).
- Deduplicação exige um `cpf_hash` adicional (determinístico) para o `@unique`.
- Logs de acesso à chave KMS viram trilha de auditoria natural.

**Vantagens:** permite devolver CPF ao usuário e enviar ao Asaas; irreversibilidade "operacional" mesmo com dump do banco (se a chave estiver em KMS, só acessível ao serviço).

**Desvantagens:**
- Gerenciamento de chave: rotação, backup, acesso restrito.
- Se a chave for perdida, o dado é permanentemente ilegível (feature, não bug).
- Precisa de KMS ou equivalente — custo recorrente (AWS KMS: $1/chave/mês + $0.03/10k operações).

### C — Mixto (hash para dedup/busca + encryption para retrieval)

Duas colunas:
- `cpf_hash` — HMAC-SHA256 com pepper (unique index, buscas, dedup).
- `cpf_encrypted` — AES-256-GCM (só decryptado no fluxo de pagamento).

Melhor de dois mundos. Custo: 2 colunas, 2 operações de escrita, 1 chave KMS.

## Recomendação

**Opção C.** Único caminho que:
1. Permite devolver CPF ao usuário e enviar ao Asaas (fluxo de cartão exige).
2. Impede vazamento utilizável em caso de dump do banco (sem a chave KMS, o `cpf_encrypted` é ruído).
3. Mantém `@unique` e buscas via hash.

## Plano de implementação (após aprovação)

1. **Decisão de infra:** AWS KMS (US$1/mês/chave) ou libsodium com secret file montado no Render (zero custo, gestão manual). Recomendo KMS para audit trail automático.
2. **Migration aditiva (não destrutiva):**
   ```sql
   ALTER TABLE "User" ADD COLUMN "cpfHash" BYTEA;
   ALTER TABLE "User" ADD COLUMN "cpfEncrypted" BYTEA;
   CREATE UNIQUE INDEX "User_cpfHash_key" ON "User"("cpfHash");
   ```
3. **Serviço de criptografia:** `src/services/encryption.service.ts` com `encryptCpf(cpf)`, `decryptCpf(enc)`, `hashCpf(cpf)`.
4. **Backfill controlado:** script que lê `cpf` → calcula hash e encryption → escreve nas novas colunas. Executa com backup validado antes.
5. **Switchover:** uma vez validado, remover `cpf` (plaintext) em migration separada após janela de observação.
6. **Rotação de pepper:** procedimento documentado em runbook.

## Pendências externas

- [ ] **Decisão de produto:** aprovar opção C.
- [ ] **Decisão de infra:** AWS KMS vs libsodium local.
- [ ] **Decisão de legal:** retenção do CPF (quanto tempo após inatividade?).
- [ ] **Criação de chave KMS** (se AWS KMS for escolhido).
- [ ] **Backfill agendado** em janela de manutenção com backup imediatamente antes.

## O que NÃO fazer até lá

- Não adicionar CPF a logs novos. O redact do Pino já precisa ser estendido (ver P1 — proteção de PII em logs).
- Não expor `cpf` em respostas públicas (a projeção `publicUserSelect` já inclui, mas só é usada em contexto owner-only — manter assim).
