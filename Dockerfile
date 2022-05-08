# FIXME: Use a slim image or maybe fork the project and clean build it too (newer ubuntu version?)
FROM jrottenberg/ffmpeg:5-nvidia
# FIXME: Required because ffmpeg base image is setting it and breaking my CMD node call at the bottom
ENTRYPOINT []

# TODO: We have to remove the cuda src as the public key cannot be verified
RUN rm /etc/apt/sources.list.d/cuda.list && \
    apt-get update && \
    apt-get -y upgrade && \
    apt-get -y install wget && \
    apt-get autoclean

RUN wget -qO- https://deb.nodesource.com/setup_16.x | bash - && \
    apt-get update && \
    apt-get install -y nodejs && \
    npm i -g npm --update-notifier false && \
    npm cache clean --force && \
    apt-get autoclean

##
# App
##
WORKDIR /app/

COPY package.json package-lock.json ./

ENV NODE_ENV=production
RUN npm ci && \
    npm cache clean --force

COPY dist/ ./dist/
COPY resources/ ./resources/

CMD ["node", "--enable-source-maps", "dist/index.js"]
