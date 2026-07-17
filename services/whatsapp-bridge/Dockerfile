FROM node:20-bookworm-slim

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV WHATSAPP_AUTH_PATH=/app/.wwebjs_auth

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY server.js ./

RUN mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache \
  && chown -R node:node /app

USER node
EXPOSE 3101
CMD ["npm", "start"]
