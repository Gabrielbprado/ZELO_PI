# Runbook — Backup e restore do Postgres

**Dono:** DevOps · **Última revisão:** 2026-11-04 · **Relacionado:** P0.1 da auditoria.

Problema que este runbook resolve: Render free tier não oferece backup automático e tem lifetime de 90 dias no plano Postgres free. Sem backup validado, o sistema está a uma falha de distância de perda total de dados.

## Backup manual (snapshot pontual)

Pré-requisitos: `pg_dump` 16 instalado localmente.

```bash
DATABASE_URL="postgresql://usuario:senha@host:porta/zelo_marketplace" \
  ./scripts/backup-postgres.sh
```

Isso gera `./backups/zelo-YYYYMMDDTHHMMSSZ.dump` + `.sha256`. Dumps locais com mais de 7 dias são expurgados automaticamente.

## Backup para S3 (ou S3-compatível como Backblaze B2)

```bash
export DATABASE_URL="..."
export BACKUP_S3_BUCKET="zelo-backups-prod"
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_DEFAULT_REGION="sa-east-1"   # ou endpoint do B2

./scripts/backup-postgres.sh
```

### Lifecycle do bucket (configurar no console AWS/B2)

- Transição para Glacier após 30 dias.
- Expiração após 365 dias (ou mais, conforme política).
- Bloqueio de delete sem MFA em bucket de produção.

## Agendamento (GitHub Actions)

Crie `.github/workflows/backup-postgres.yml`:

```yaml
name: backup-postgres
on:
  schedule:
    - cron: '0 6 * * *'   # 06:00 UTC = 03:00 BRT
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Instalar Postgres client 16
        run: |
          sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
          wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
          sudo apt-get update
          sudo apt-get install -y postgresql-client-16
      - name: Rodar backup
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          BACKUP_S3_BUCKET: ${{ secrets.BACKUP_S3_BUCKET }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: sa-east-1
        run: bash ./scripts/backup-postgres.sh
```

**Secrets necessários no GitHub:** `DATABASE_URL`, `BACKUP_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

## Restore de validação (mensal)

**Nunca restore direto em produção.** Faça em um Postgres paralelo.

```bash
# 1) baixe o dump mais recente
aws s3 cp "s3://$BACKUP_S3_BUCKET/" ./backups/ --recursive --exclude '*' --include '*.dump*'

# 2) suba um Postgres local
docker run -d --name zelo-restore-test -p 5433:5432 \
  -e POSTGRES_PASSWORD=restore \
  -e POSTGRES_DB=zelo_restore \
  postgis/postgis:16-3.4

# 3) restore
DATABASE_URL="postgresql://postgres:restore@localhost:5433/zelo_restore" \
  ./scripts/restore-postgres.sh ./backups/zelo-ULTIMO.dump

# 4) valide contagens
docker exec zelo-restore-test psql -U postgres -d zelo_restore \
  -c 'SELECT COUNT(*) users FROM "User"; SELECT COUNT(*) FROM "Booking"; SELECT COUNT(*) FROM "Payment";'

# 5) derrube
docker rm -f zelo-restore-test
```

**Critério de sucesso:** contagens batem com monitoring do dia (dentro de ±5%). Qualquer desvio maior que isso é alarme.

## Alarmes mínimos

Configure no painel de monitoramento (UptimeRobot, Grafana Cloud free):

- Workflow `backup-postgres` NÃO rodou nas últimas 26h → alertar canal de ops.
- Tamanho do último dump desviou mais de 50% do anterior → alertar (pode indicar corrupção ou perda).
- Validação mensal (runbook acima) falhou → bloqueador de release.

## Pendências externas

- [ ] Criar bucket S3/B2 (nome sugerido: `zelo-backups-prod`).
- [ ] Criar IAM user com permissão SÓ para `PutObject` nesse bucket (não `GetObject`, não `DeleteObject`).
- [ ] Adicionar os 4 secrets ao GitHub repo.
- [ ] Criar `.github/workflows/backup-postgres.yml` a partir do template acima.
- [ ] Rodar validação de restore pela primeira vez, documentar duração (serve como SLA informal).
