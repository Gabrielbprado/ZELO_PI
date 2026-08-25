import type { ThemeMode } from './index';

/**
 * Cores derivadas de um matiz (`hue`) que o app usa para dar identidade a pessoas e
 * categorias sem precisar de imagem. Elas não cabem na `Palette` porque dependem de um
 * valor de dado (o hue vindo do banco), não de um token fixo.
 *
 * A convenção de "clarear no escuro, escurecer no claro" já existia inline em
 * `HomeScreen` para os ícones de categoria; aqui ela só foi extraída e generalizada,
 * para que Avatar e hero parem de assumir fundo escuro.
 */

/**
 * Fundo de avatar. A luminosidade é o teto em que as iniciais brancas ainda atingem
 * 4,5:1 no PIOR matiz (amarelo, ~60°) — um valor mais alto passaria no azul e falharia
 * no amarelo, que é exatamente o tipo de bug que só aparece para alguns usuários.
 */
export function avatarBg(hue: number, mode: ThemeMode): string {
  return mode === 'dark' ? `hsl(${hue}, 50%, 31%)` : `hsl(${hue}, 48%, 32%)`;
}

/**
 * Fundo do hero do perfil do profissional. Continua escuro nos dois modos de propósito:
 * é uma superfície imersiva que carrega texto claro (`heroFg`) e um scrim por cima, e
 * inverter isso no tema claro deixaria a tela sem hierarquia.
 */
export function heroBg(hue: number, mode: ThemeMode): string {
  return mode === 'dark' ? `hsl(${hue}, 35%, 22%)` : `hsl(${hue}, 32%, 28%)`;
}

/** Ícone/label de categoria sobre `surface`. */
export function categoryFg(hue: number, mode: ThemeMode): string {
  return mode === 'dark' ? `hsl(${hue}, 70%, 72%)` : `hsl(${hue}, 55%, 38%)`;
}

/** Chip translúcido de categoria sobre `surface`. */
export function categoryBg(hue: number, mode: ThemeMode): string {
  return mode === 'dark' ? `hsla(${hue}, 40%, 55%, 0.18)` : `hsla(${hue}, 60%, 45%, 0.12)`;
}
