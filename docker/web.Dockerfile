# Прод-образ фронта: сборка Vite → статика в nginx.
#
# Ассеты собираются на этапе build и копируются в образ; ни node_modules,
# ни исходники в финальный слой не попадают.

FROM node:22-alpine AS build

WORKDIR /app

# Сначала манифесты — слой с зависимостями переиспользуется, пока они не менялись.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .

# Базовый URL API попадает в бандл на этапе сборки (Vite инлайнит VITE_*).
# По умолчанию — same-origin /api/v1: фронт и API за одним nginx, и менять
# ничего не нужно. Аргумент оставлен для развёртывания с API на другом домене.
ARG VITE_API_BASE=/api/v1
ENV VITE_API_BASE=$VITE_API_BASE

RUN npm run build

FROM nginx:1.27-alpine AS web

# Апстрим API внутри compose-сети. Подставляется в конфиг при старте
# (envsubst в штатном entrypoint nginx: /etc/nginx/templates/*.template).
ENV API_UPSTREAM=web:80

COPY docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
