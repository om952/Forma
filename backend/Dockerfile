# One image, three roles, chosen by the command:
#   API      node dist/server.js        (default)
#   worker   node dist/worker.js
#   release  npm run migrate:deploy     (run once per deploy, before the others)

# Debian slim rather than Alpine: Prisma's schema engine and bcrypt's prebuilt
# binaries both target glibc first.
ARG NODE_IMAGE=node:22-bookworm-slim

# ---- build: compile TypeScript and generate the Prisma client ---------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

# openssl: Prisma's schema engine (migrations). tini: forwards SIGTERM to Node
# and reaps zombies, so the graceful drain in shutdown.ts actually runs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=4000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The client is generated here rather than copied from the build stage so it
# always matches the exact Prisma version installed in this image.
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

COPY --from=build /app/dist ./dist

# Local-driver uploads. Mount a volume here, or use STORAGE_DRIVER=s3.
RUN mkdir -p /app/uploads && chown node:node /app/uploads

ARG APP_RELEASE
ENV APP_RELEASE=${APP_RELEASE}

USER node
EXPOSE 4000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.js"]
