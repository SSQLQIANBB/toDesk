FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client-vue/package.json client-vue/package.json

RUN pnpm install --filter client-vue... --frozen-lockfile

COPY client-vue client-vue

ARG VITE_API_BASE_URL=
ARG VITE_SOCKET_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

WORKDIR /app/client-vue
RUN pnpm run build

FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/client-vue/dist /usr/share/nginx/html

EXPOSE 80
