FROM node:22-alpine AS builder

RUN corepack enable \
    && corepack prepare pnpm@10.14.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend-koa/package.json ./backend-koa/package.json
COPY client-vue/package.json ./client-vue/package.json

RUN pnpm install --frozen-lockfile

COPY client-vue ./client-vue

RUN pnpm --filter client-vue build

FROM nginx:1.27-alpine

COPY client-vue/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/client-vue/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]