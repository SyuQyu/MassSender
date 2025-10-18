FROM node:20-bullseye

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PORT=5005 \
    WWEBJS_HEADLESS=true \
    CHROMIUM_PATH=/usr/bin/chromium

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
  && ln -sf /usr/bin/chromium /usr/bin/chromium-browser \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

CMD ["npm", "run", "start"]
