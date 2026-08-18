/**
 * Dados e utilitários compartilhados entre o seed de demonstração (`seed.ts`)
 * e o seed sintético usado para treinar o recomendador (`seed.ml.ts`).
 *
 * As categorias vivem aqui porque os ids (`plumb`, `bolt`, …) são chaves
 * primárias referenciadas pelo app, pelo modelo de ML e pelos testes — ter duas
 * cópias divergindo silenciosamente seria um bug difícil de enxergar.
 */

export const categories = [
  { id: 'plumb',  name: 'Encanador',   iconKey: 'plumb',  hue: 210, order: 1 },
  { id: 'bolt',   name: 'Eletricista', iconKey: 'bolt',   hue: 45,  order: 2 },
  { id: 'hammer', name: 'Reformas',    iconKey: 'hammer', hue: 25,  order: 3 },
  { id: 'brush',  name: 'Pintura',     iconKey: 'brush',  hue: 280, order: 4 },
  { id: 'spray',  name: 'Limpeza',     iconKey: 'spray',  hue: 180, order: 5 },
  { id: 'sofa',   name: 'Móveis',      iconKey: 'sofa',   hue: 320, order: 6 },
  { id: 'hvac',   name: 'Ar-condic.',  iconKey: 'hvac',   hue: 195, order: 7 },
  { id: 'leaf',   name: 'Jardinagem',  iconKey: 'leaf',   hue: 130, order: 8 },
];

export const CATEGORY_IDS = categories.map((c) => c.id);

/** Centróides reais de bairros de São Paulo. */
export const SP_NEIGHBORHOODS = [
  { name: 'Vila Madalena', lat: -23.5547, lng: -46.6905 },
  { name: 'Pinheiros',     lat: -23.5670, lng: -46.7020 },
  { name: 'Itaim Bibi',    lat: -23.5853, lng: -46.6747 },
  { name: 'Moema',         lat: -23.6010, lng: -46.6620 },
  { name: 'Tatuapé',       lat: -23.5402, lng: -46.5760 },
  { name: 'Santana',       lat: -23.5020, lng: -46.6250 },
  { name: 'Perdizes',      lat: -23.5370, lng: -46.6800 },
  { name: 'Butantã',       lat: -23.5710, lng: -46.7280 },
  { name: 'Ipiranga',      lat: -23.5900, lng: -46.6050 },
  { name: 'Lapa',          lat: -23.5220, lng: -46.7030 },
  { name: 'Saúde',         lat: -23.6180, lng: -46.6390 },
  { name: 'Mooca',         lat: -23.5580, lng: -46.6000 },
];

/**
 * Faixa de preço-base por categoria (BRL). Alimenta a log-normal de `priceFrom`
 * e o cálculo de `price_band_fit` no modelo.
 */
export const CATEGORY_PRICE_BASE: Record<string, number> = {
  plumb: 110, bolt: 130, hammer: 260, brush: 300,
  spray: 150, sofa: 180, hvac: 200, leaf: 100,
};

/**
 * Multiplicador de sazonalidade por categoria e mês (0 = janeiro).
 * Ar-condicionado dispara no verão brasileiro; jardinagem na primavera;
 * limpeza antes das festas; encanamento na temporada de chuva.
 */
export const CATEGORY_SEASONALITY: Record<string, number[]> = {
  //        jan  fev  mar  abr  mai  jun  jul  ago  set  out  nov  dez
  hvac:   [2.5, 2.5, 1.6, 1.0, 0.6, 0.5, 0.5, 0.7, 1.0, 1.4, 1.8, 2.4],
  leaf:   [1.0, 1.0, 1.1, 1.0, 0.8, 0.7, 0.7, 1.0, 1.8, 1.8, 1.5, 1.1],
  spray:  [1.0, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.1, 1.2, 1.4],
  plumb:  [1.3, 1.3, 1.3, 1.0, 0.9, 0.8, 0.8, 0.9, 1.0, 1.2, 1.3, 1.3],
  bolt:   [1.1, 1.1, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.1, 1.2],
  hammer: [0.8, 0.9, 1.1, 1.2, 1.2, 1.1, 1.1, 1.2, 1.2, 1.1, 1.0, 0.7],
  brush:  [0.8, 0.9, 1.1, 1.2, 1.2, 1.2, 1.2, 1.2, 1.1, 1.1, 1.0, 0.8],
  sofa:   [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.1, 1.2, 1.3],
};

// ──────────────────────────────────────────────────────────────────────────
// PRNG determinístico
//
// `Math.random()` não é semeável, o que tornaria as métricas de avaliação do
// modelo irreprodutíveis entre execuções. mulberry32 é rápido, tem qualidade
// mais que suficiente para geração de dados e cabe em cinco linhas — não vale
// uma dependência nova.
// ──────────────────────────────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;
  /** Cache do segundo valor de Box-Muller (a transformada produz dois por vez). */
  private spare: number | null = null;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  /** Uniforme em [0, 1). */
  random(): number {
    return this.next();
  }

  /** Uniforme em [min, max). */
  uniform(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Inteiro em [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.uniform(min, max + 1));
  }

  /** Normal padrão via Box-Muller (forma polar). */
  normal(mean = 0, sd = 1): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return mean + sd * v;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = this.uniform(-1, 1);
      v = this.uniform(-1, 1);
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    this.spare = v * mul;
    return mean + sd * (u * mul);
  }

  logNormal(mu: number, sigma: number): number {
    return Math.exp(this.normal(mu, sigma));
  }

  /** Gamma(shape, 1) — Marsaglia-Tsang. Base para Beta e Dirichlet. */
  gamma(shape: number): number {
    if (shape < 1) {
      // Boost de Johnk para shape < 1.
      return this.gamma(shape + 1) * Math.pow(this.random(), 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      const x = this.normal();
      const v = Math.pow(1 + c * x, 3);
      if (v <= 0) continue;
      const u = this.random();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  beta(a: number, b: number): number {
    const x = this.gamma(a);
    const y = this.gamma(b);
    return x / (x + y);
  }

  /** Dirichlet simétrico de dimensão `k` com concentração `alpha`. */
  dirichlet(k: number, alpha: number): number[] {
    const g = Array.from({ length: k }, () => this.gamma(alpha));
    const sum = g.reduce((a, b) => a + b, 0) || 1;
    return g.map((v) => v / sum);
  }

  /** Gumbel(0,1) — usado no truque argmax para amostrar de um logit. */
  gumbel(): number {
    // Clampa para não gerar Infinity quando random() devolve exatamente 0.
    const u = Math.min(1 - 1e-12, Math.max(1e-12, this.random()));
    return -Math.log(-Math.log(u));
  }

  /** Escolhe um índice proporcional aos pesos (todos >= 0). */
  weighted(weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return this.int(0, weights.length - 1);
    let r = this.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Fisher-Yates in-place. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  bool(p: number): boolean {
    return this.random() < p;
  }
}

/** Distância aproximada em km entre dois pontos (equiretangular, ok para SP). */
export function haversineKm(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const R = 6371;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
