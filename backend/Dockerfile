FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci

COPY . .

RUN npm run build

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /app /app

RUN mkdir -p /app/runtime/tasks

EXPOSE 3001

CMD ["node", "dist/src/main.js"]
