# 0004 — Redis como dependência opcional

**Status:** Aceita

## Contexto

Cache, rate limit distribuído e estado compartilhado do circuit breaker melhoram a
plataforma, mas o sistema já funcionava sem nenhum deles. Numa apresentação, o Redis pode
cair — e não pode levar a API junto. O Render free tampouco oferece Redis gerenciado.

## Decisão

Redis é **opcional** e degradável. `REDIS_ENABLED=false` sobe a API normalmente. O cliente
usa `enableOfflineQueue: false` e `maxRetriesPerRequest: 1`: quando o Redis está fora, o
comando falha **na hora** e o `cache.service` executa o loader direto no banco, em vez de
enfileirar e travar a request. O rate limit cai para `MemoryStore` (por instância). Em
produção, a URL aponta para um provedor externo com free tier (Upstash).

## Consequências

- **A favor:** "Redis fora do ar" vira "sem cache", nunca "API quebrada" — verificado por
  teste de degradação que derruba o Redis e confere que a API responde (~3.8 ms).
- **Contra:** com N instâncias e Redis off, o rate limit e o breaker voltam a ser
  por-instância; o cache-aside adiciona uma disciplina de invalidação (por tag set, nunca
  `KEYS *`) que precisa ser mantida a cada nova chave.
