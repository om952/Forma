ARG NODE_IMAGE=node:22-bookworm-slim

# ---- build ------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Inlined into the browser bundle at build time, so it cannot change at run
# time. Left empty (the default), the app calls `/api/...` on its own origin —
# the setup in docker-compose.prod.yaml, where a reverse proxy routes `/api` to
# the backend. Set it only when the API lives on a different origin.
ARG NEXT_PUBLIC_API_BASE_URL=""
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- runtime: Next's standalone server, without the rest of node_modules ----
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

CMD ["node", "server.js"]
