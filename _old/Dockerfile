# syntax=docker/dockerfile:1

##
# Builder
##
FROM docker.io/node:24-alpine AS builder

RUN mkdir /app/ && chown node:node /app/
USER node
WORKDIR /app/

COPY --chown=node:node ./package.json ./package-lock.json ./tsconfig.json ./
COPY --chown=node:node ./prisma/ ./prisma/
RUN npm ci && \
    npm cache clean --force

COPY --chown=node:node src/ ./src/
RUN npm run build

WORKDIR /app/resources/public/static/frontend/

COPY --chown=node:node ./resources/public/static/frontend/package.json ./resources/public/static/frontend/package-lock.json ./resources/public/static/frontend/tsconfig.json ./resources/public/static/frontend/webpack.config.js  ./
RUN npm ci && \
    npm cache clean --force

COPY --chown=node:node ./resources/public/static/frontend/src/ ./src/
RUN npm run build

WORKDIR /app/resources/public/static/nuxt-frontend/

COPY --chown=node:node ./resources/public/static/nuxt-frontend/package.json ./resources/public/static/nuxt-frontend/package-lock.json ./resources/public/static/nuxt-frontend/tsconfig.json ./resources/public/static/nuxt-frontend/app.config.ts ./resources/public/static/nuxt-frontend/nuxt.config.ts ./
RUN npm ci && \
    npm cache clean --force

COPY --chown=node:node ./resources/public/static/nuxt-frontend/app.vue ./app.vue
COPY --chown=node:node ./resources/public/static/nuxt-frontend/components/ ./components/
COPY --chown=node:node ./resources/public/static/nuxt-frontend/public/ ./public/
COPY --chown=node:node ./resources/public/static/nuxt-frontend/types/ ./types/
RUN npm run generate

WORKDIR /app/frontend/

COPY --chown=node:node ./frontend/ ./
RUN npm ci && \
    npm run build && \
    npm cache clean --force

##
# Quick fix for ffmpeg nvenc support
##
FROM docker.io/nvidia/cuda:12.3.2-base-ubuntu22.04 AS ffmpeg-cuda
RUN apt-get update && apt-get install -y ffmpeg

##
# Dev
##
FROM ffmpeg-cuda AS dev
RUN groupadd --gid 1000 node && \
    useradd --uid 1000 --gid 1000 --create-home --shell /bin/sh node

RUN apt-get update && \
    apt-get -y install curl && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
    apt-get purge -y --auto-remove curl && \
    apt-get update && \
    apt-get -y install nodejs && \
    npm i -g npm --update-notifier false && \
    npm cache clean --force && \
    apt-get autoclean

##
# App
##
USER node
WORKDIR /app/

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node ./prisma/ ./prisma/

ENV NODE_ENV=production
RUN npm ci && \
    npm cache clean --force

COPY --chown=node:node resources/ ./resources/
COPY --chown=node:node --from=builder /app/frontend/package.json ./frontend/package.json
COPY --chown=node:node --from=builder /app/frontend/build/ ./frontend/build/
# FIXME: Somehow fix the need for the node_modules/ for server-side-rendering :( (hls.js)
COPY --chown=node:node --from=builder /app/frontend/node_modules/ ./frontend/node_modules/
COPY --chown=node:node --from=builder /app/dist/ ./dist/
COPY --chown=node:node --from=builder /app/resources/public/static/frontend/dist/ ./resources/public/static/frontend/dist/
COPY --chown=node:node --from=builder /app/resources/public/static/nuxt-frontend/.output/public/ ./resources/public/static/nuxt-frontend/

CMD ["node", "--enable-source-maps", "dist/index.js"]
