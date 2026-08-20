# Tender Front — Детальный план этапа 1

**Статус:** этап 1 — каркас репозитория, контракт, деплой-пайплайн, основа UI.
**Цель:** работающий SPA-каркас с авторизацией, каталогом тендеров, карточкой тендера и live-аукционом, задеплоенный рядом с API.

---

## 0. Принятые решения (зафиксировано 2026-08-17)

| Решение | Значение |
|---|---|
| Репозиторий | `tender-front` (отдельный, рядом с `tender` в `channels/github/repositories/`) |
| Стек | React 19 + Vite + TypeScript + TanStack Query + React Router + Tailwind 4 + shadcn/ui |
| Контракт | Только `tender/app/public/openapi.yaml` (EN) |
| Генерация | `openapi-typescript` → `src/api/schema.d.ts` |
| Деплой | Docker: nginx (статика) + прокси `/api` → API-контейнер, один compose-профиль |
| Язык UI | Русский (аудитория демо — RU/EN гибрид, основной RU) |

---

## 1. Объём этапа 1 (что входит)

1. Инициализация репозитория и Vite-проекта
2. Подключение контракта: openapi-typescript + openapi-fetch, структура API-слоя
3. Auth: логин/регистрация, refresh-токен, 2FA-код, защита роутов
4. Каталог тендеров (таблица + фильтры + курсор-пагинация)
5. Карточка тендера (детали, лоты, статусы, timeline)
6. Live-аукцион: страница ставок + SSE (Mercure) + таймер
7. Макеты (layout, шапка, сайдбар, темы)
8. Деплой: Dockerfile, nginx.conf, docker-compose, CI

**НЕ входит в этап 1 (этап 2):** компании/верификация, вопросы/жалобы, контракты с подписанием, документы с загрузкой, уведомления/подписки, saved searches, webhooks, админка (permissions/role-permissions/users), analytics/dashboard, экспорт.

---

## 2. Структура репозитория (target)

Корень git-репозитория — **`app/`** (решение владельца 2026-08-17: файлы репо только в `app/`, память/заметки — вне git, в корне каталога проекта). Всё дерево ниже — содержимое `app/`:

```
app/  ← корень git-репозитория tender-front
├── .github/workflows/ci.yml
├── README.md               ← решения, структура (создан 17.08)
├── docs/
│   ├── openapi-revision.md ← ревизия спеки (17.08)
│   ├── stage1-plan.md      ← этот файл
│   └── wireframes.html     ← дизайн-наброски страниц (17.08)
├── docker/
│   ├── nginx.conf
│   └── web.Dockerfile
├── docker-compose.yml     ← dev-профиль (front + api)
├── public/
├── src/
│   ├── api/
│   │   ├── schema.d.ts        ← автоген (не в git? решить: генерить в CI)
│   │   ├── client.ts          ← openapi-fetch инстанс
│   │   ├── auth.ts            ← токены, refresh, 2FA
│   │   └── endpoints.ts       ← типизированные обёртки операций
│   ├── components/
│   │   ├── ui/                ← shadcn/ui компоненты
│   │   ├── layout/            ← AppLayout, Header, Sidebar, Footer
│   │   └── tender/            ← TenderCard, TenderTable, TenderStatusBadge
│   ├── features/
│   │   ├── auth/              ← LoginPage, RegisterPage, TwoFactorPage
│   │   ├── tenders/           ← TendersPage, TenderDetailPage, TenderFilters
│   │   └── auction/           ← AuctionPage, BidComposer, AuctionTimer, SSELive
│   ├── hooks/
│   │   ├── useCursorPage.ts   ← пагинация {items, next_cursor}
│   │   └── useIdempotentMutation.ts
│   ├── lib/
│   │   ├── money.ts           ← formatMoney (minor units → ₽)
│   │   ├── format.ts          ← даты, статусы, enum-мапы
│   │   └── utils.ts           ← cn() и пр.
│   ├── router.tsx
│   ├── App.tsx
│   └── main.tsx
├── .env.example
├── index.html
├── package.json
├── tailwind.config.ts
├── vite.config.ts
└── tsconfig.json
```

---

## 3. Этапы внутри этапа 1 (по дням, оценка)

### День 1-2: Каркас
- [ ] `npm create vite@latest . -- --template react-ts`
- [ ] Tailwind 4 (`@tailwindcss/vite`), shadcn/ui init
- [ ] React Router (layout: Header + main + footer)
- [ ] Docker: `web.Dockerfile` (nginx:alpine, multi-stage: node build → copy dist), `nginx.conf` (SPA fallback + `/api/` proxy), `docker-compose.yml` (service front, сеть с API)
- [ ] CI: lint + typecheck + build на каждый PR
- **Definition of Done:** `docker compose up` отдаёт пустой SPA на :8080, `/api/health` проксируется в API

### День 3: Контракт и API-слой
- [ ] `npm i -D openapi-typescript` + `openapi-fetch`
- [ ] Скрипт `sync:openapi` (копия `tender/app/public/openapi.yaml` → `src/api/openapi.yaml`)
- [ ] `npm run gen:types` → `src/api/schema.d.ts`
- [ ] `client.ts`: baseUrl из `VITE_API_BASE`, автоподстановка Bearer, обработка 401 (refresh queue), `Error`-схема (RFC 9457)
- [ ] Хуки: `useCursorPage`, `useIdempotentMutation`
- **DoD:** в dev-консоли типобезопасный запрос `/tenders` с реальным токеном возвращает данные; типы не содержат `any` из-за спеки

### День 4-5: Auth-флоу
- [ ] LoginPage (email+password) → POST /auth/token
- [ ] RegisterPage (компания, user) → POST /auth/register
- [ ] 2FA-экран при `two_factor_enabled` → POST /auth/2fa/confirm
- [ ] Refresh: POST /auth/refresh по таймеру/на 401, logout
- [ ] ProtectedRoute + redirect на /login
- [ ] Страница /users/me (профиль, кнопка logout)
- **DoD:** полный цикл регистрация→верификация email (по ссылке из письма)→логин→2FA→работа с данными

### День 6-7: Каталог тендеров
- [ ] TendersPage: таблица (номер, title, статус, НМЦК, регион, дедлайн)
- [ ] Фильтры: status, law_type, region, price_min/max, q (поиск) — по параметрам спеки
- [ ] TenderStatusBadge (9 статусов, цвета), formatMoney
- [ ] Курсор-пагинация («Показать ещё» / infinite scroll)
- [ ] Карточка тендера → роут /tenders/:id
- **DoD:** список из реального API, фильтры работают, пагинация сквозная

### День 8-9: Карточка тендера + лоты
- [ ] TenderDetailPage: шапка (статус, НМЦК, закон), описание, timeline (bids_end, auction_start…)
- [ ] Лоты (GET /tenders/{id}/lots): таблица лотов, позиции
- [ ] Действия по статусу: publish/withdraw/cancel (для customer-роли), переход к аукциону
- [ ] Компания-заказчик, документы (список, placeholder на этап 2)
- **DoD:** полная карточка тендера, все статусы отображаются корректно

### День 10-11: Live-аукцион (фишка)
- [ ] AuctionPage: таймер до старта/окончания (из timeline)
- [ ] SSE: GET /auctions/{id}/stream → EventSource на discovery-URL (Mercure)
- [ ] Таблица current best bid / история ставок (GET /auctions/{id}/bids)
- [ ] BidComposer: ставка (POST /auctions/{id}/bids) с Idempotency-Key
- [ ] Падение цены, статусы аукциона (state machine из схемы)
- **DoD:** live-обновление цены без перезагрузки, ставка уходит без дублей (идемпотентность видна в UI)

### День 12-13: Полировка + деплой
- [ ] Mobile-адаптив (таблица → карточки)
- [ ] Состояния: loading skeletons, error states (RFC 9457 сообщения), empty states
- [ ] README.md (скриншоты, quick start), LICENSE (MIT, как у API)
- [ ] Деплой на прод-окружение (рядом с API, один compose)
- [ ] Smoke-тест через браузер: регистрация → тендер → ставка на аукционе
- **DoD:** live-демо доступно по URL, README с картинками, CI зелёный

**Итого: ~12-13 дней (вечерний режим ~3-4 недели).**

---

## 4. Решения по ключевым точкам

### 4.1 SPA-fallback и прокси (nginx)
```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  location /api/ {
    proxy_pass http://api:8080;   # имя сервиса API в compose-сети
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  location / {
    try_files $uri $uri/ /index.html;   # SPA fallback
  }
}
```
Один домен → **CORS не нужен**, cookies не пересекаются, TLS один.

### 4.2 Токены: хранение и refresh
- **Access token (15 мин):** в памяти (переменная модуля) — не в localStorage (XSS-гигиена).
- **Refresh token:** HttpOnly cookie, если API на том же домене; иначе localStorage с компромиссом (демо). **Решение в пользу HttpOnly-cookie — уточнить у API (поддержка cookie auth)**, fallback: localStorage + короткий refresh.
- Очередь refresh-запросов: параллельные 401 не дублируют POST /auth/refresh — один pending-промис.

### 4.3 Идемпотентный мутационный хук
```ts
useIdempotentMutation(mutationFn, { key: () => crypto.randomUUID() })
```
- Один `Idempotency-Key` на пользовательское действие; повторная отправка той же ставки (клик дважды / retry) — сервер возвращает тот же результат, не дубль.

### 4.4 Деньги
`formatMoney(amount_minor, 'RUB')` → `1 250 000,00 ₽`. Все суммы в UI — только через `lib/money.ts`. Никаких float.

### 4.5 Статусы/Enum — единая мапа
`src/lib/enums.ts`: TenderStatus 9 шт., UserRole, CompanyStatus, LawType, ProcedureType — с русскими лейблами и цветами бейджей. Импортируется из сгенерённых типов (компилятор не даст опечататься).

### 4.6 Синхронизация спеки (без submodule)
Скрипт `npm run sync:openapi`:
```bash
cp ../tender/app/public/openapi.yaml src/api/openapi.yaml
npx openapi-typescript src/api/openapi.yaml -o src/api/schema.d.ts
```
- В CI: шаг проверки, что `schema.d.ts` актуален (git diff пуст) — ловит рассинхрон.
- Альтернатива на этапе 2: GitHub Actions в репо `tender` пушит обновлённую спеку в `tender-front` (composite action). Пока — ручной скрипт.

---

## 5. Риски этапа 1

| Риск | Митигация |
|---|---|
| API не поднимается локально (нет .env.prod, требует DB/Redis/Rabbit/Mercure) | Для dev фронта — `VITE_API_BASE` указывает на задеплоенный API; локально поднять API по инструкции из `tender` README |
| Refresh token не помещается в HttpOnly-cookie (API без cookie-auth) | Fallback localStorage; токены-сроки уже короткие (15м/30д) |
| 2FA-флоу сложен для демо | Не блокирует: 2FA-экран простой (код из письма/приложения); если мешает — base64-код из TOTP-секрета в dev |
| Mercure-URL в discovery-ответе указывает на внутренний хост | В dev прокинуть `MERCURE_PUBLIC_URL` наружу; SSE-клиент читает discovery (это уже есть в API) |
| Объём: 82 пути — соблазн «сделать всё» | Этап 1 — жёсткий скоуп (таблица выше), остальное — этап 2 |
| Время на UI-полировку | shadcn/ui + Tailwind: готовые компоненты; тёмная тема из коробки |

---

## 6. Критерии приёмки этапа 1

1. Live-URL: страница логина, каталог, карточка, аукцион — работают против реального API.
2. Автогенерация типов в CI; `schema.d.ts` не расходится с `app/public/openapi.yaml`.
3. Live-аукцион: цена обновляется по SSE, ставка не дублируется при двойном клике.
4. Один docker-compose поднимает front+api; `/api/health` отвечает.
5. README с 3-5 скриншотами, quick start в 3 команды.
6. Линт/типы/тесты зелёные; PHP-стек не тронут (отдельный репо).

---

## 7. Что дальше (этап 2, после приёмки)

- Документы: загрузка/скачивание с прогрессом
- Контракты: список, карточка, «подписать»
- Вопросы/ответы и жалобы по тендеру
- Компании: профиль, верификация, роли (заказчик/поставщик)
- Уведомления: список, подписки (теги)
- Saved searches + favorites
- Dashboard/аналитика (GET /dashboard, /stats/tenders)
- Админка: permissions, role-permissions, users, webhooks
- RU/EN локализация (наброски дизайна уже учитывают переключение)