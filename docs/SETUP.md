# SETUP — Instalação e desenvolvimento

Guia detalhado para subir o ZERO em ambiente local — **sem Docker**, com PostgreSQL nativo. Inclui passos para iOS, Android e Web, configuração de testes e credenciais de desenvolvimento.

> Este arquivo contém comandos e dados sensíveis de desenvolvimento (chaves de exemplo, usuários do seed). Não publique em repositório público sem revisão.

---

## 1. Pré-requisitos

| Ferramenta | Versão recomendada | Onde baixar |
|------------|--------------------|-------------|
| Node.js    | 20 LTS ou 22       | https://nodejs.org |
| npm        | 10+                | acompanha o Node |
| PostgreSQL | 14, 15 ou 16       | https://www.postgresql.org/download/ |
| Expo Go    | última (celular)   | App Store / Play Store |

Opcional, para testar nativamente no simulador:
- **Xcode** (iOS, apenas macOS)
- **Android Studio** com um AVD configurado

---

## 2. PostgreSQL sem Docker

### Windows
1. Baixe o instalador em https://www.postgresql.org/download/windows/ (EDB Installer).
2. Durante a instalação:
   - Defina uma senha para o usuário `postgres` (anote-a — vai entrar no `.env`).
   - Marque para instalar o **pgAdmin** se quiser uma UI gráfica.
3. Confirme que o serviço **postgresql-x64-16** está rodando em `services.msc`.
4. Adicione `C:\Program Files\PostgreSQL\16\bin` ao PATH para usar `psql` no terminal.

Crie os bancos:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE zero_marketplace;"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE zero_marketplace_test;"
```

### macOS

```bash
brew install postgresql@16
brew services start postgresql@16
createdb zero_marketplace
createdb zero_marketplace_test
```

### Linux (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo -u postgres createdb zero_marketplace
sudo -u postgres createdb zero_marketplace_test
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"
```

> **String de conexão**: ajuste usuário e senha conforme sua instalação. O exemplo padrão é `postgresql://postgres:postgres@localhost:5432/zero_marketplace?schema=public`.

---

## 3. Backend

```bash
cd backend
cp .env.example .env
```

### 3.1. Gerar segredos JWT

Cada secret deve ter pelo menos 32 caracteres. Use o gerador do Node:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Rode duas vezes e cole o resultado em `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` no `.env`. Use chaves DIFERENTES para acesso e refresh.

### 3.2. Ajuste `DATABASE_URL`

No `.env`:
```
DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/zero_marketplace?schema=public"
TEST_DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/zero_marketplace_test?schema=public"
```

### 3.3. Instalar, migrar, popular

```bash
npm install
npm run prisma:generate
npm run prisma:migrate     # cria as tabelas no banco principal
npm run prisma:seed        # popula com categorias e prestadores de exemplo
npm run dev                # sobe em http://localhost:4000
```

Confira: abra `http://localhost:4000/api/v1/health` → deve retornar `{"status":"ok",...}`.

### 3.4. Credenciais criadas pelo seed

> Use apenas em ambiente local. Em produção remova/desabilite essas contas.

| Papel | E-mail | Senha |
|-------|--------|-------|
| Cliente   | `marina@zero.dev`  | `Senha@123` |
| Prestador | `carlos@zero.dev`  | `Senha@123` |
| Prestador | `ana@zero.dev`     | `Senha@123` |
| Prestador | `roberto@zero.dev` | `Senha@123` |
| Prestador | `julia@zero.dev`   | `Senha@123` |
| Prestador | `pedro@zero.dev`   | `Senha@123` |
| Prestador | `lucia@zero.dev`   | `Senha@123` |

---

## 4. App mobile

```bash
cd mobile
npm install
```

### 4.1. Apontar para a API

`mobile/app.json` define `expo.extra.apiBaseUrl`. Por padrão, o app tenta detectar automaticamente:
- **Web**: usa o hostname atual + porta `4000`
- **Android emulator**: `http://10.0.2.2:4000/api/v1` (atalho do AVD para `localhost` do host)
- **iOS simulator / outros**: `http://localhost:4000/api/v1`

Para **dispositivo físico**, descubra o IP da sua máquina na LAN e ajuste:

```json
{
  "expo": {
    "extra": {
      "apiBaseUrl": "http://192.168.0.123:4000/api/v1"
    }
  }
}
```

Confira que o backend está escutando na LAN e que o firewall libera a porta 4000.

### 4.2. Rodar

| Comando | O que faz |
|---------|-----------|
| `npm run start`        | abre o Metro bundler (escolha a, i ou w) |
| `npm run start:lan`    | força modo LAN (necessário pra Expo Go em celular físico) |
| `npm run start:tunnel` | usa túnel ngrok (quando LAN não funciona) |
| `npm run android`      | sobe direto no emulador Android |
| `npm run ios`          | sobe direto no simulador iOS (macOS) |
| `npm run web`          | abre em `http://localhost:8081` no navegador |

### 4.3. Testar em celular físico

1. Instale o **Expo Go** na loja de apps.
2. No mesmo Wi-Fi do PC, rode `npm run start:lan` no diretório `mobile/`.
3. Escaneie o QR-code com a câmera (iOS) ou pelo próprio Expo Go (Android).
4. Se o `apiBaseUrl` apontar pra `localhost`, o celular não vai alcançar — ajuste para o IP da LAN como descrito acima.

### 4.4. Tema claro / escuro

O toggle fica em **Perfil → Configurações → Aparência**. A preferência fica salva em `expo-secure-store` (iOS/Android) ou `AsyncStorage` (web). Por padrão, o app inicia no tema do sistema.

---

## 5. Testes

### 5.1. Unitários (não precisam de banco)

```bash
cd backend
npm run test:unit
```

Cobre:
- `password.test.ts` — política de força, bcrypt round-trip
- `tokens.test.ts` — JWT assinatura/verificação, refresh token hash, parsing de duração
- `validators.test.ts` — Zod (register, login, booking, review, message, budget)
- `budget.service.test.ts` — lógica determinística do estimador (mock do Prisma)

### 5.2. Integração (com banco de teste)

Pré-requisito: `TEST_DATABASE_URL` no `.env` aponta para `zero_marketplace_test`, e o schema já foi migrado nesse banco.

```bash
cd backend
DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
npm run test:integration
```

> Em PowerShell: `$env:DATABASE_URL = $env:TEST_DATABASE_URL; npx prisma migrate deploy; npm run test:integration`

Cobre (16 testes HTTP):
- `health.test.ts` — endpoint público
- `security.test.ts` — Helmet, CORS allowlist, payload size, X-Powered-By
- `auth.test.ts` — registro, força de senha, login, brute-force lock, refresh rotation + reuse detection, logout, JWT adulterado
- `providers.test.ts` — listagem, filtro, detalhe, 404, validação de UUID
- `bookings.test.ts` — RBAC (cliente vs prestador), isolamento por usuário, validação
- `budget.test.ts` — estimativa pública

> Os testes de integração truncam todas as tabelas entre suites — **não rode contra um banco com dados que você queira preservar**.

### 5.3. Tudo de uma vez

```bash
npm test
```

---

## 6. Variáveis de ambiente

| Variável | Obrigatória | Default | Descrição |
|----------|-------------|---------|-----------|
| `NODE_ENV` | não | `development` | `development` \| `test` \| `production` |
| `PORT` | não | `4000` | porta HTTP |
| `DATABASE_URL` | sim | — | string Postgres do banco de dev |
| `TEST_DATABASE_URL` | testes | — | string Postgres do banco de testes |
| `JWT_ACCESS_SECRET` | sim | — | ≥ 32 chars |
| `JWT_REFRESH_SECRET` | sim | — | ≥ 32 chars, diferente do anterior |
| `JWT_ACCESS_EXPIRES_IN` | não | `15m` | duração do access token |
| `JWT_REFRESH_EXPIRES_IN` | não | `7d` | duração do refresh token |
| `CORS_ORIGINS` | não | `http://localhost:8081` | allowlist separada por vírgula |
| `RATE_LIMIT_WINDOW_MS` | não | `900000` | 15 min |
| `RATE_LIMIT_MAX` | não | `200` | requisições por janela |
| `AUTH_RATE_LIMIT_MAX` | não | `10` | limite para `/auth/*` |
| `BCRYPT_SALT_ROUNDS` | não | `12` | custo do bcrypt |

---

## 7. Troubleshooting

### "JWT_ACCESS_SECRET deve ter pelo menos 32 chars"
Gere uma chave maior com `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`.

### "ECONNREFUSED 127.0.0.1:5432"
PostgreSQL não está rodando. Inicie o serviço (`services.msc` no Windows, `brew services` no macOS, `systemctl` no Linux).

### "P1010: User ... was denied access"
Senha incorreta no `DATABASE_URL`. Confira em `psql` se o usuário/senha funcionam.

### Celular físico não conecta no backend
- Estão na mesma rede Wi-Fi?
- Firewall liberando porta 4000?
- `apiBaseUrl` no `app.json` aponta para o IP correto (não `localhost`)?
- Se a LAN é restritiva (Wi-Fi público), use `npm run start:tunnel`.

### Web pede CORS
Adicione `http://localhost:8081` (ou a origem usada) em `CORS_ORIGINS` no `.env` do backend e reinicie.
