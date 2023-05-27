# syntax=docker/dockerfile:1

##
# Builder
##
FROM node:18-alpine AS builder
USER node
WORKDIR /app/

COPY ./package.json ./package-lock.json ./tsconfig.json ./
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


##
# Dev
##
FROM restreamio/gstreamer:latest-prod AS dev
RUN groupadd --gid 1000 node && \
    useradd --uid 1000 --gid 1000 --create-home --shell /bin/sh node

RUN apt-get update && \
    apt-get -y install curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get purge -y --auto-remove curl && \
    apt-get -y install nodejs && \
    npm i -g npm --update-notifier false && \
    npm cache clean --force && \
    apt-get autoclean

COPY --from=mwader/static-ffmpeg:6.0 /ffmpeg /usr/local/bin/
COPY --from=mwader/static-ffmpeg:6.0 /ffprobe /usr/local/bin/

##
# App
##
# FIXME: This is a hack to get the apollo_g_streamer binary into the container
RUN mkdir -p /home/christian/Downloads/apollo-g-streamer/cmake-build-debug/
COPY apollo_g_streamer /home/christian/Downloads/apollo-g-streamer/cmake-build-debug/apollo_g_streamer
RUN chmod +x /home/christian/Downloads/apollo-g-streamer/cmake-build-debug/apollo_g_streamer

USER node
WORKDIR /app/

COPY package.json package-lock.json ./

ENV NODE_ENV=production
RUN npm ci && \
    npm cache clean --force

COPY resources/ ./resources/
COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/resources/public/static/frontend/dist/ ./resources/public/static/frontend/dist/

# TODO: remove debug APOLLO_GST_TARGET_FPS env
# ENV APOLLO_GST_TARGET_FPS=60
CMD ["node", "--enable-source-maps", "dist/index.js"]
