# SECURITY — Checklist e medidas implementadas

Lista das proteções aplicadas no backend e mobile, e quais testes automatizados cobrem cada uma.

## Hashing e armazenamento de senhas
- bcryptjs, default **12 rounds** (`BCRYPT_SALT_ROUNDS`)
- Política mínima: 8+ caracteres, ao menos uma maiúscula, uma minúscula e um número
- Política também é mostrada como checklist em tempo real na tela de cadastro do mobile
- **Senha nunca aparece em logs** (redact configurado no Pino) nem em respostas (`publicUserSelect` exclui `passwordHash`)
- Testes: `tests/unit/password.test.ts`, `tests/integration/auth.test.ts`

## Autenticação
- **Access token JWT** (HS256, default 15 min) com payload mínimo (`sub`, `role`, `email`)
- **Refresh token opaco** (64 bytes aleatórios) — armazenado no banco apenas como SHA-256, nunca em plaintext
- Rotação em **cada uso** do refresh; reuso de token revogado **invalida toda a árvore** (defesa contra roubo)
- `logout` revoga o refresh token na origem
- Testes: `tests/integration/auth.test.ts` (refresh rotation + reuse detection)

## Brute force
- Conta bloqueada por 15 min após 6 tentativas de login com senha errada
- Contador zera após login bem-sucedido
- Mensagens de erro **não revelam** se o e-mail existe
- Testes: `tests/integration/auth.test.ts` ("bloqueia conta após 6 falhas seguidas")

## Rate limiting (express-rate-limit)
- 200 req / 15 min por IP (geral)
- 10 req / 15 min em `/auth/register` e `/auth/login` (ataques distribuídos ainda passam — combinar com WAF em prod)
- `trust proxy: 1` para usar X-Forwarded-For corretamente atrás de proxy

## Validação de entrada (Zod)
- Body, query e params validados em toda rota
- Coerção segura (e-mail lowercased, números coerced)
- Mensagens de erro padronizadas com código `VALIDATION_ERROR`
- Schemas estritos descartam campos extras → previne **mass assignment**
- Testes: `tests/unit/validators.test.ts`, `tests/integration/bookings.test.ts`

## RBAC (Role-Based Access Control)
- Papéis: `CLIENT`, `PROVIDER`, `ADMIN`
- Middleware `requireRole(...)` para rotas restritas
- Transições de estado de booking validadas por papel (cliente só CANCELLED; prestador ACCEPTED/IN_PROGRESS/COMPLETED/CANCELLED)
- Isolamento por usuário: cada um só vê os próprios bookings/conversas
- Testes: `tests/integration/bookings.test.ts` (cliente tenta aceitar → 403; terceiro tenta acessar → 403)

## Headers HTTP
- **Helmet** — X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security (em prod), Referrer-Policy
- `x-powered-by: Express` **removido** (`app.disable('x-powered-by')`)
- CORS com allowlist via `CORS_ORIGINS`
- Testes: `tests/integration/security.test.ts`

## Anti-pollution
- `hpp()` bloqueia duplicação de parâmetros (`?role=CLIENT&role=ADMIN`)

## Payload size
- `express.json({ limit: '1mb' })` — payloads acima retornam 413/400
- Testes: `tests/integration/security.test.ts`

## Logging seguro
- Pino com **redact** em `authorization`, `cookie`, `password`, `passwordHash`, `token`, `refreshToken`
- Em produção, nível `info` e formato JSON estruturado

## Erros do Prisma
- `P2002` (constraint única) → 409 sem expor o SQL
- `P2025` (registro não encontrado) → 404 sem expor o SQL
- Erros inesperados em produção: mensagem genérica (`Erro interno do servidor`)

## Storage de tokens no mobile
- **iOS / Android**: `expo-secure-store` (Keychain / Keystore — protegido por OS)
- **Web**: `AsyncStorage` (localStorage)
- Tokens nunca aparecem em URLs

## Transporte
- Em produção, HTTPS é mandatório
- Em dev, HTTP local é aceitável; certifique-se de que `CORS_ORIGINS` está correto

## Pontos de atenção (não cobertos automaticamente)
- **CSRF**: a API é stateless (JWT no header), então CSRF clássico não se aplica. Se for adicionar cookies de sessão, adicionar `csurf` ou SameSite=Strict.
- **Upload de arquivos**: ainda não implementado. Ao adicionar (portfolio, KYC), validar MIME, size e usar storage externo (S3, R2, Vercel Blob) — não servir do próprio backend.
- **PII**: o seed cria dados fictícios. Em prod, considerar pseudonimização de logs e LGPD-compliance.
- **2FA**: UI prevista, lógica ainda não implementada. Roadmap: TOTP via `otplib`.
- **Geolocalização**: latitude/longitude estão no schema mas não há validação de proximidade. Adicionar PostGIS quando for usar.
- **WebSocket / real-time**: chat e notificações fazem polling. Para produção, mover para WS autenticado.

## Como rodar a suíte de segurança

```bash
cd backend
npm run test:unit              # validação, hashing, tokens
npm run test:integration       # CORS, headers, brute force, RBAC, validators HTTP
```
