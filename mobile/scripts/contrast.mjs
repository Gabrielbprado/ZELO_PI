#!/usr/bin/env node
/**
 * Verifica o contraste WCAG dos pares de token que carregam texto.
 *
 * Existe porque `tsc --noEmit` não tem opinião sobre cor: dá para trocar um token por um
 * valor ilegível e o CI passar. Os pares abaixo são os que o app efetivamente renderiza
 * como texto sobre fundo — se um deles cair abaixo do mínimo, a build falha.
 *
 * Uso: node scripts/contrast.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'src', 'theme', 'palettes.ts'), 'utf8');

/** Lê `nome: 'valor',` de dentro de um bloco `export const <name>: Palette = { … };`. */
function parsePalette(name) {
  const block = source.match(new RegExp(`export const ${name}: Palette = \\{([\\s\\S]*?)\\n\\};`));
  if (!block) throw new Error(`paleta ${name} não encontrada em palettes.ts`);
  const palette = {};
  for (const [, key, value] of block[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)) palette[key] = value;
  return palette;
}

function parseColor(value) {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b, a = '1'] = rgba[1].split(',').map((s) => s.trim());
    return { r: +r, g: +g, b: +b, a: +a };
  }
  throw new Error(`cor não suportada pelo verificador: ${value}`);
}

/** Achata uma cor translúcida sobre o fundo, que é o que o olho realmente vê. */
function flatten(fg, bg) {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(fgValue, bgValue) {
  const bg = parseColor(bgValue);
  const fg = flatten(parseColor(fgValue), bg);
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

/**
 * Fundo representativo do hero do perfil (`heroBg` é derivado de um matiz, então não é
 * um token). Usado para achatar o `scrim`, que flutua sobre ele e não sobre um card.
 */
const HERO_BACKDROP = '#3A3540';

/** [texto, fundo, mínimo, descrição, backdropOpcional] */
const PAIRS = [
  ['text',        'bg',          AA_NORMAL, 'texto principal sobre o fundo'],
  ['text',        'surface',     AA_NORMAL, 'texto principal sobre card'],
  ['text',        'surface2',    AA_NORMAL, 'texto principal sobre superfície secundária'],
  ['textSec',     'bg',          AA_NORMAL, 'texto secundário sobre o fundo'],
  ['textSec',     'surface',     AA_NORMAL, 'texto secundário sobre card'],
  ['textTer',      'surface',     AA_NORMAL, 'texto terciário (10-12px) sobre card'],
  ['textTer',      'bg',          AA_NORMAL, 'texto terciário (10-12px) sobre o fundo'],
  ['onPrimary',    'primaryDeep', AA_NORMAL, 'rótulo sobre ação preenchida'],
  ['onPrimarySec', 'primaryDeep', AA_NORMAL, 'rótulo de apoio (12px) sobre ação preenchida'],
  ['onDanger',     'dangerDeep',  AA_NORMAL, 'rótulo sobre ação destrutiva preenchida'],
  ['danger',       'bg',          AA_NORMAL, 'mensagem de erro sobre o fundo'],
  ['danger',       'surface',     AA_NORMAL, 'mensagem de erro sobre card'],
  ['success',      'successBg',   AA_NORMAL, 'texto de sucesso sobre seu realce'],
  ['danger',       'dangerBg',    AA_NORMAL, 'texto de erro sobre seu realce'],
  ['warn',         'warnBg',      AA_NORMAL, 'texto de alerta sobre seu realce'],
  ['primaryText','primaryGlow', AA_NORMAL, 'texto de destaque sobre seu realce'],
  ['primaryText',  'surface',     AA_NORMAL, 'link/ação sobre card'],
  ['primaryText',  'bg',          AA_NORMAL, 'link/ação sobre o fundo'],
  ['heroFg',       'scrim',       AA_NORMAL, 'ícone flutuante sobre o scrim do hero', HERO_BACKDROP],
  ['heroFg',       'heroRing',    AA_LARGE,  'avatar sobre o anel do hero', HERO_BACKDROP],
  ['star',        'surface',     AA_LARGE,  'estrela de avaliação sobre card'],
];

let failures = 0;
for (const paletteName of ['lightPalette', 'darkPalette']) {
  const palette = parsePalette(paletteName);
  console.log(`\n${paletteName}`);
  for (const [fg, bg, min, label, backdropOverride] of PAIRS) {
    if (!(fg in palette)) throw new Error(`token ausente em ${paletteName}: ${fg}`);
    if (!(bg in palette)) throw new Error(`token ausente em ${paletteName}: ${bg}`);

    // Um realce translúcido não tem cor própria: ele assume a do que está atrás. E o app
    // pinta esses realces tanto sobre card (`surface`) quanto sobre a tela (`bg`) — o
    // segundo caso é o mais escuro dos dois no tema claro, e foi onde o botão "Sair"
    // escapou da primeira versão deste teste. Por isso ambos são verificados.
    const translucent = parseColor(palette[bg]).a < 1;
    const backdrops = translucent
      ? (backdropOverride ? [backdropOverride] : [palette.surface, palette.bg])
      : [null];

    for (const backdrop of backdrops) {
      const bgValue = backdrop
        ? (() => { const f = flatten(parseColor(palette[bg]), parseColor(backdrop)); return `rgb(${f.r},${f.g},${f.b})`; })()
        : palette[bg];
      const value = ratio(palette[fg], bgValue);
      const ok = value >= min;
      if (!ok) failures++;
      const over = backdrop && backdrops.length > 1 ? ` sobre ${backdrop === palette.surface ? 'surface' : 'bg'}` : '';
      console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${value.toFixed(2).padStart(5)}:1 (min ${min.toFixed(1)})  ${fg} / ${bg}${over} — ${label}`);
    }
  }
}

/**
 * As cores derivadas de matiz não são tokens — são funções de um dado vindo do banco.
 * Um teste de par único não as cobre: a mesma fórmula passa no azul e falha no amarelo.
 * Por isso o matiz é varrido inteiro, e o pior caso é que decide.
 */
const hueFns = readFileSync(join(here, '..', 'src', 'theme', 'colorFns.ts'), 'utf8');

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  const f = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (!s) return { r: l * 255, g: l * 255, b: l * 255, a: 1 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: f(p, q, h + 1 / 3) * 255, g: f(p, q, h) * 255, b: f(p, q, h - 1 / 3) * 255, a: 1 };
}

/** Extrai `hsl(${hue}, S%, L%)` do corpo de uma função de colorFns.ts, por modo. */
function readHueFormula(fnName, mode) {
  const body = hueFns.match(new RegExp(`export function ${fnName}[\\s\\S]*?\\n\\}`));
  if (!body) throw new Error(`função ${fnName} não encontrada em colorFns.ts`);
  const branches = [...body[0].matchAll(/hsl\(\$\{hue\},\s*(\d+)%,\s*(\d+)%\)/g)];
  if (branches.length !== 2) throw new Error(`${fnName}: esperava duas fórmulas hsl (dark e light)`);
  const [dark, light] = branches;
  const pick = mode === 'dark' ? dark : light;
  return { s: +pick[1], l: +pick[2] };
}

console.log('\ncores derivadas de matiz (pior caso na varredura de 0–359°)');
for (const mode of ['light', 'dark']) {
  const palette = parsePalette(mode === 'light' ? 'lightPalette' : 'darkPalette');
  const { s: sat, l: light } = readHueFormula('avatarBg', mode);
  let worst = Infinity;
  let worstHue = 0;
  for (let hue = 0; hue < 360; hue += 5) {
    const bg = hslToRgb(hue, sat, light);
    const fg = parseColor(palette.onPrimary);
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
    const value = (hi + 0.05) / (lo + 0.05);
    if (value < worst) { worst = value; worstHue = hue; }
  }
  const ok = worst >= AA_NORMAL;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${worst.toFixed(2).padStart(5)}:1 (min ${AA_NORMAL.toFixed(1)})  ${mode}: iniciais do avatar no matiz ${worstHue}°`);
}

if (failures > 0) {
  console.error(`\n${failures} par(es) abaixo do mínimo WCAG. Ajuste palettes.ts.`);
  process.exit(1);
}
console.log('\nTodos os pares passam no mínimo WCAG AA.');
