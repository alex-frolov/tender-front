# Ревизия OpenAPI: пригодность для автогенерации типов

**Дата:** 2026-08-17
**Источник контракта (единственный):** `tender/app/public/openapi.yaml` (EN-версия, 3448 строк)
**Проверяемый инструмент:** `openapi-typescript` (типы) + `openapi-fetch` (типобезопасный REST-клиент)

---

## Резюме

Спека **пригодна для автогенерации типов без доработок**. Качество выше типичного пет-проекта:
- Валидный OpenAPI 3.1.0, YAML парсится без ошибок.
- 82 path, 62 именованные схемы в `components.schemas`.
- 0 неразрешённых `$ref` (все ссылки резолвятся в `#/components/...`).
- 0 ошибок «required-поле отсутствует в properties».
- Все enum-схемы имеют явный `type`, нет бестиповых схем.
- Пагинация оформлена единообразно (`items` + `next_cursor`).
- Деньги — `amount_minor: integer` + `currency`, без float. Это идеально для типизации.

---

## Проверки и результаты

| Проверка | Результат |
|---|---|
| YAML-парсинг | ✅ OK |
| `openapi: 3.1.0` | ✅ (поддерживается openapi-typescript v7) |
| Неразрешённые `$ref` | ✅ 0 |
| `required` вне `properties` | ✅ 0 |
| Enum без явного `type` | ✅ 0 |
| Схемы без type/properties/oneOf | ✅ 0 |
| Методы: GET 36, POST 55, PUT 4, PATCH 6, DELETE 7 | ✅ |
| Теги (домены): platform 17, tenders 15, auth 14, contracts 14, auctions 13, notifications 10, documents 8, companies 6, bids 4, analytics 5 | ✅ |
| Глобальная security (bearerAuth + apiKeyAuth) | ✅ |

## Метрики API

- **108 операций** суммарно (36 GET / 55 POST / 4 PUT / 6 PATCH / 7 DELETE)
- **82 пути**, из них для демо-фронта ядро — ~30: auth (14), tenders (15), auctions (13), contracts (14), documents (8)

## Что важно для генерации типов

### 1. Пагинация — единый паттерн `{ items, next_cursor }`
Примеры подтверждены на `/tenders`, `/auctions/{auctionId}/bids`, `/tenders/{tenderId}/bids`:
```yaml
type: object
properties:
  items: { type: array, items: { $ref: '#/components/schemas/TenderListItem' } }
  next_cursor: { type: string, nullable: true }
```
Паттерн cursor-пагинации сквозной — один дженерик-хук `useCursorPage` покроет все списки.

### 2. UUID и nullable — консистентно
- Все ID — `type: string, format: uuid` (uuid v7 в рантайме).
- Nullable-поля явно помечены (`nullable: true`): `email_verified_at`, `nmck_minor`, `description` и т.д.
- openapi-typescript корректно сгенерирует `string | null`.

### 3. Enum'ы — именованные, есть `type`
`TenderStatus` (9 значений), `UserRole`, `CompanyStatus`, `ProcedureType`, `LawType` и др. Сгенерируются как union-типы.

### 4. Деньги — целочисленные minor units
`Money: { amount_minor: integer, currency: string }`. На фронте нужен **форматтер в presentation layer** (как и задумано в спеке): `formatMoney(amount_minor, currency)`.

### 5. Ошибки — RFC 9457 (Problem Details)
Схема `Error` — единая для всех 4xx/5xx. На фронте один `ApiError`-обработчик + маппинг кодов ошибок на сообщения.

### 6. Идемпотентность
Заголовок `Idempotency-Key` для мутаций (ставки на аукционе, подача предложений). В клиенте — хук `useIdempotentMutation` (uuid v4 per-операция, retry-safe). Это сильная фича для демо: «повторный запрос ≠ дубль ставки».

---

## Найденные мелочи (не блокеры, рекомендации на этап 2+)

1. **`/documents` POST** — ответ inline, желательно именованную схему `DocumentUploadResult` (удобнее для типов + документации).
2. **`POST /tenders`** — ответ inline (вероятно `Tender` + `number`); стоит проверить и именовать.
3. **`GET /procurement-plans`** — список без `next_cursor`; если планируется пагинация — добавить (или осознанно оставить плоским).
4. **Secure-эндпоинты** — глобальная security покрывает всё, но часть операций (auth/register, forgot password) не требует токена. Для генерации клиента это не мешает, но на этапе 2 стоит проставить `security: []` на публичные операции — тогда автогенерация даст точную карту «public vs authed».
5. **Ответы с `204`/`stream` (SSE)** — `/auctions/{auctionId}/stream` отдаёт `AuctionStreamDiscovery` (это discovery-документ с URL Mercure), а не сам поток — для типов ок; сам SSE подключается через `EventSource` к URL из discover-ответа.

---

## Рекомендация по подключению генерации

```bash
# в tender-front
npm i -D openapi-typescript
npx openapi-typescript ../tender/app/public/openapi.yaml -o src/api/schema.d.ts
# ожидаемый размер: ~1500-2500 строк .d.ts (62 схемы, 108 операций)
```

Подход: **контракт — единственный источник правды**. Синхронизация — вручную (копия спеки) или `submodule` — решим на этапе 1 (рекомендую просто скрипт `npm run sync:openapi` с curl/rsync, без submodule).

## Вердикт

**Go.** Генерация типов и клиента из `app/public/openapi.yaml` — сразу на этапе 1, без правок спеки. Все 62 схемы типизируются, все 108 операций получат типобезопасные обёртки.