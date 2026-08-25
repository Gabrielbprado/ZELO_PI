#!/usr/bin/env node
/**
 * Falha se uma cor literal aparecer fora de `src/theme/`.
 *
 * Existe porque o app estiliza 100% inline e `tsc --noEmit` não tem opinião sobre cor:
 * até agora nada impedia alguém de escrever `'#fff'` numa tela nova e o CI passar — foi
 * exatamente assim que ~50 literais se acumularam, vários deles ilegíveis no tema claro.
 *
 * A paleta e as funções derivadas de matiz vivem em `src/theme/` e são a única exceção.
 *
 * Uso: node scripts/check-colors.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Onde definir cor literal é o trabalho, e não um vazamento. */
const ALLOWED_DIRS = [join('src', 'theme')];

/**
 * Exceções pontuais, com motivo. Toda entrada nova aqui precisa de justificativa —
 * a lista é curta de propósito.
 */
const ALLOWED_LINES = [
  // `shadowColor` no iOS não aceita cor translúcida do jeito que os tokens são escritos,
  // e a sombra é sempre preta em ambos os modos.
  /shadowColor:\s*'#000'/,
  /'transparent'/,
];

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
      yield* walk(full);
    } else if (/\.tsx?$/.test(full)) {
      yield full;
    }
  }
}

const offences = [];
for (const file of walk(join(root, 'src'))) {
  const rel = relative(root, file);
  if (ALLOWED_DIRS.some((d) => rel.startsWith(d + sep))) continue;

  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (!COLOR_LITERAL.test(line)) return;
    // Uma linha pode conter um literal permitido e nada mais; só então é liberada.
    const stripped = ALLOWED_LINES.reduce((acc, re) => acc.replace(new RegExp(re, 'g'), ''), line);
    if (!COLOR_LITERAL.test(stripped)) return;
    offences.push(`${rel}:${i + 1}  ${line.trim()}`);
  });
}

if (offences.length > 0) {
  console.error('Cores literais fora de src/theme/:\n');
  offences.forEach((o) => console.error('  ' + o));
  console.error(`\n${offences.length} ocorrência(s). Use um token da Palette ou um helper de src/theme/colorFns.ts.`);
  process.exit(1);
}
console.log('Nenhuma cor literal fora de src/theme/.');
