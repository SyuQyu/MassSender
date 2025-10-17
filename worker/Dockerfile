FROM node:20-alpine

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PORT=5005

RUN apk add --no-cache chromium nss

COPY package.json package-lock.json* ./
RUN npm install

COPY src ./src

CMD ["npm", "run", "start"]
