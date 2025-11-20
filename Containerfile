FROM docker.io/node:24-alpine AS builder

LABEL org.opencontainers.image.source="https://github.com/ApolloFiles/Apollo"

RUN mkdir /app/ && chown node:node /app/
USER node
WORKDIR /app/

## Backend
COPY --chown=node:node \
     ./backend/package.json \
     ./backend/package-lock.json \
     ./backend/tsconfig.json \
     ./backend/
COPY --chown=node:node ./backend/prisma/ ./backend/prisma/

RUN cd backend/ && \
    npm clean-install && \
    npm cache clean --force

COPY --chown=node:node ./backend/src/ ./backend/src/

RUN cd backend/ && \
    npm run build

## Frontend
COPY --chown=node:node \
     ./frontend/package.json \
     ./frontend/package-lock.json \
     ./frontend/tsconfig.json \
     ./frontend/vite.config.ts \
     ./frontend/svelte.config.ts \
     ./frontend/
COPY --chown=node:node ./frontend/patches/ ./frontend/patches/

RUN cd frontend/ && \
    npm clean-install && \
    npm cache clean --force

COPY --chown=node:node ./frontend/src/ ./frontend/src/
COPY --chown=node:node ./frontend/static/ ./frontend/static/
COPY --chown=node:node ./frontend/messages/ ./frontend/messages/
COPY --chown=node:node ./frontend/project.inlang/ ./frontend/project.inlang/

RUN cd frontend/ && \
    npm run build

FROM docker.io/nvidia/cuda:13.0.2-base-ubuntu24.04 AS ffmpeg-cuda

ENV NODE_ENV=production

RUN apt-get update && \
    apt-get install -y \
      ffmpeg \
      file && \
    apt-get autoclean

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

RUN groupadd --gid 1001 node && \
    useradd --uid 1001 --gid 1001 --create-home --shell /bin/sh node

RUN mkdir /app/ && chown node:node /app/
USER node
WORKDIR /app/

COPY --chown=node:node LICENSE README.md ./

## Backend
COPY --chown=node:node ./backend/package.json ./backend/package-lock.json ./backend/
COPY --chown=node:node ./backend/prisma/ ./backend/prisma/
COPY --from=builder --chown=node:node /app/backend/dist/ ./backend/dist/

RUN cd backend/ && \
    npm clean-install --omit dev && \
    npm cache clean --force

## Frontend
COPY --chown=node:node ./frontend/package.json ./frontend/package-lock.json ./frontend/
COPY --chown=node:node ./frontend/patches/ ./frontend/patches/
COPY --from=builder --chown=node:node /app/frontend/dist/ ./frontend/dist/

CMD ["node", "--enable-source-maps", "backend/dist/main.js"]
