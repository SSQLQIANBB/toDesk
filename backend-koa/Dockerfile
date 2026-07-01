FROM node:22-alpine

RUN corepack enable \
    && corepack prepare pnpm@10.14.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend-koa/package.json ./backend-koa/package.json
COPY client-vue/package.json ./client-vue/package.json

RUN pnpm install --frozen-lockfile

COPY backend-koa ./backend-koa

WORKDIR /app/backend-koa

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["pnpm", "start"]