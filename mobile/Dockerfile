# ─────────────────────────────────────────────────────────────────────────────
# Bundle web do app ZELO (Expo)
#
# Este contêiner não serve nada: ele COMPILA o app e copia o resultado para um
# volume, de onde a própria API o serve (WEB_DIST_DIR). Uma origem só significa
# zero CORS e nenhuma porta extra para o navegador.
#
# Sem EXPO_PUBLIC_API_BASE_URL o app descobre a API sozinho a partir da URL da
# página (`window.location.hostname` + porta 4000), o que já cobre acesso por
# localhost e pelo IP da LAN. Passe o build-arg apenas se a API estiver em
# outro host ou porta.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG EXPO_PUBLIC_API_BASE_URL=""
ENV EXPO_PUBLIC_API_BASE_URL=$EXPO_PUBLIC_API_BASE_URL
RUN npm run build:web


FROM node:20-slim AS export

WORKDIR /app
COPY --from=build /app/dist ./dist

# `/export` é o volume compartilhado com a API. O conteúdo antigo sai primeiro
# para que um rebuild não deixe chunks órfãos de uma versão anterior.
CMD ["sh", "-c", "rm -rf /export/* /export/.[!.]* 2>/dev/null; cp -a /app/dist/. /export/ && echo 'bundle web publicado em /export'"]
