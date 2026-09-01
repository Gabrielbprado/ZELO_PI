# 0009 — Tema claro como padrão

**Status:** Aceita

## Contexto

As duas paletas (clara e escura) já existiam completas, mas o app abria no **escuro por
acidente**: `Appearance.getColorScheme()` devolve `null` no primeiro frame e na web, e o
código caía no escuro nesse caso. O produto queria o claro como identidade principal.

## Decisão

Tema **claro é o padrão**; escuro continua como opção persistida, com um terceiro modo
"Sistema". O `null` do color scheme passa a resolver para claro. Tokens novos
(`onPrimary`, `onDanger`, `scrim`, …) centralizam as ~20 cores "sobre o primary" que antes
eram `#fff` espalhados. A cor primária foi ajustada para o branco sobre ela passar o
contraste AA (`#C2551F`/`#AB4A1D`), verificado por um script de contraste (WCAG) no CI.

## Consequências

- **A favor:** identidade visual correta desde o primeiro frame; contraste AA verificado
  automaticamente (script de contraste + varredura de literais de cor fora do tema).
- **Contra:** o tema claro toca 24 telas com estilos inline; risco de regressão visual real,
  mitigado pelos tokens centralizados e por uma varredura manual no `npm run web` nos três
  modos.
