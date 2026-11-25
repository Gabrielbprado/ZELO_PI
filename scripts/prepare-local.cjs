const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
const npmCli = process.env.npm_execpath;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
    shell: process.platform === 'win32' && command === 'docker',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  return result.stdout?.trim();
}

if (!npmCli) {
  console.error('Execute este script usando npm start.');
  process.exit(1);
}

console.log('› removendo containers antigos deste projeto (preserva os volumes)...');
run('docker', ['compose', 'down', '--remove-orphans']);

console.log('› iniciando PostgreSQL/PostGIS pelo Docker Compose...');
run('docker', ['compose', 'up', '-d', '--wait', 'db']);

console.log('› preparando banco e Prisma...');
run(process.execPath, [npmCli, 'run', 'prisma:generate'], { cwd: backend });
run(process.execPath, [npmCli, 'run', 'prisma:deploy'], { cwd: backend });

const categoryCount = Number(run(process.execPath, [
  '-e',
  "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.category.count().then(n=>process.stdout.write(String(n))).catch(e=>{console.error(e);process.exitCode=1}).finally(()=>p.$disconnect())",
], { cwd: backend, capture: true }));

if (categoryCount === 0) {
  console.log('› banco vazio: carregando dados de demonstração...');
  run(process.execPath, [npmCli, 'run', 'prisma:seed'], { cwd: backend });
} else {
  console.log('› banco já contém dados; seed ignorado.');
}
