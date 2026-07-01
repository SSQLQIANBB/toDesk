FROM node:22-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend-koa/package.json backend-koa/package.json

RUN pnpm install --filter backend-koa... --frozen-lockfile

COPY backend-koa backend-koa

WORKDIR /app/backend-koa

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["pnpm", "run", "start"]
