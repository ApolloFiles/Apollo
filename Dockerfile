# syntax=docker/dockerfile:1

##
# Builder
##
FROM node:20-alpine AS builder
USER node
WORKDIR /app/

COPY ./package.json ./package-lock.json ./tsconfig.json ./
COPY ./prisma/ ./prisma/
RUN npm ci && \
    npm cache clean --force

COPY src/ ./src/
RUN npm run build

WORKDIR /app/resources/public/static/frontend/

COPY ./resources/public/static/frontend/package.json ./resources/public/static/frontend/package-lock.json ./resources/public/static/frontend/tsconfig.json ./resources/public/static/frontend/webpack.config.js  ./
RUN npm ci && \
    npm cache clean --force

COPY ./resources/public/static/frontend/src/ ./src/
RUN npm run build

WORKDIR /app/resources/public/static/nuxt-frontend/

COPY ./resources/public/static/nuxt-frontend/package.json ./resources/public/static/nuxt-frontend/package-lock.json ./resources/public/static/nuxt-frontend/tsconfig.json ./resources/public/static/nuxt-frontend/app.config.ts ./resources/public/static/nuxt-frontend/nuxt.config.ts ./
RUN npm ci && \
    npm cache clean --force

COPY ./resources/public/static/nuxt-frontend/app.vue ./app.vue
COPY ./resources/public/static/nuxt-frontend/components/ ./components/
COPY ./resources/public/static/nuxt-frontend/public/ ./public/
COPY ./resources/public/static/nuxt-frontend/types/ ./types/
RUN npm run generate

##
# Quick fix for ffmpeg nvenc support
##
FROM nvidia/cuda:12.3.0-base-ubuntu22.04 AS ffmpeg-cuda
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
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
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

COPY package.json package-lock.json ./
COPY ./prisma/ ./prisma/

ENV NODE_ENV=production
RUN npm ci && \
    npm cache clean --force

COPY resources/ ./resources/
COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/resources/public/static/frontend/dist/ ./resources/public/static/frontend/dist/
COPY --from=builder /app/resources/public/static/nuxt-frontend/.output/public/ ./resources/public/static/nuxt-frontend/

# TODO: remove debug APOLLO_GST_TARGET_FPS env
# ENV APOLLO_GST_TARGET_FPS=60
CMD ["node", "--enable-source-maps", "dist/index.js"]
