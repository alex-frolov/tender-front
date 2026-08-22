import { client, unwrap } from './client'
import type { components, operations } from './schema'

// ---------- Вопросы по тендеру ----------
//
// Жалоб на процедуру (`GET /complaints`, `POST /tenders/{id}/complaints`)
// здесь нет намеренно: решением владельца единственное разбирательство
// площадки — претензия заказчика к исполнителю по договору (`/claims`,
// features/contracts/ContractClaims). Эндпоинты жалоб в API остались,
// интерфейса у них нет.

export type Question = components['schemas']['Question']

/**
 * Вопросы по тендеру (GET /tenders/{id}/questions).
 *
 * Право `tenders.qa` настраиваемое: admin — всегда, manager и agent — по
 * настройке площадки, поэтому 403 здесь штатный ответ.
 *
 * Ответ заказчика приходит полем `answer` и проставляется через
 * `answerQuestion` — отвечает только заказчик процедуры.
 */
export async function listQuestions(tenderId: string): Promise<Question[]> {
  const result = await client.GET('/tenders/{tenderId}/questions', {
    params: { path: { tenderId } },
  })
  const data = await unwrap(result)
  return data.items ?? []
}

/** Вопрос по тендеру или конкретному лоту (POST /tenders/{id}/questions). */
export async function askQuestion(
  tenderId: string,
  input: { text: string; lot_id?: string },
): Promise<Question> {
  const result = await client.POST('/tenders/{tenderId}/questions', {
    params: { path: { tenderId } },
    body: input,
  })
  return unwrap(result)
}

/**
 * Публикация ответа заказчика (POST /tenders/{id}/questions/{questionId}/answer).
 *
 * Отвечать может только заказчик процедуры; у остальных — 404 (по коду ответа
 * нельзя выяснить, существует ли вопрос). Повторный ответ допустим: разъяснение
 * уточняют, момент публикации при этом обновляется.
 */
export async function answerQuestion(
  tenderId: string,
  questionId: string,
  answer: string,
): Promise<Question> {
  const result = await client.POST('/tenders/{tenderId}/questions/{questionId}/answer', {
    params: { path: { tenderId, questionId } },
    body: { answer },
  })
  return unwrap(result)
}

// ---------- Избранное ----------

export type Favorite = components['schemas']['Favorite']
export type FavoriteEntityType = NonNullable<Favorite['entity_type']>

/** Избранное пользователя (GET /favorites): тендеры и лоты. */
export async function listFavorites(): Promise<Favorite[]> {
  const result = await client.GET('/favorites')
  const data = await unwrap(result)
  return data.items ?? []
}

/** Добавление в избранное (POST /favorites); повтор → 409 `duplicate_favorite`. */
export async function addFavorite(input: {
  entity_type: FavoriteEntityType
  entity_id: string
  note?: string
}): Promise<Favorite> {
  const result = await client.POST('/favorites', { body: input })
  return unwrap(result)
}

/**
 * Удаление из избранного (DELETE /favorites?favoriteId=...): идентификатор
 * передаётся query-параметром, а не путём — так объявлено в контракте.
 */
export async function removeFavorite(favoriteId: string): Promise<void> {
  const result = await client.DELETE('/favorites', {
    params: { query: { favoriteId } },
  })
  if (result.error !== undefined) {
    throw result.error
  }
}

// ---------- Сохранённые поиски ----------

export type SavedSearch = components['schemas']['SavedSearch']

/** Периодичность дайджеста по сохранённому поиску. */
export type DigestPeriod = NonNullable<
  NonNullable<operations['createSavedSearch']['requestBody']>['content']['application/json']['digest_period']
>

/** Сохранённые поиски пользователя (GET /saved-searches). */
export async function listSavedSearches(): Promise<SavedSearch[]> {
  const result = await client.GET('/saved-searches')
  const data = await unwrap(result)
  return data.items ?? []
}

/**
 * Сохранение поиска (POST /saved-searches): имя, набор фильтров как есть
 * и периодичность дайджеста. `filters` — свободный объект: контракт не
 * ограничивает набор ключей, туда кладётся тот же query, что уходит в GET /tenders.
 */
export async function createSavedSearch(input: {
  name: string
  filters: Record<string, unknown>
  digest_period?: DigestPeriod
}): Promise<SavedSearch> {
  const result = await client.POST('/saved-searches', { body: input })
  return unwrap(result)
}

/** Удаление сохранённого поиска (DELETE /saved-searches?savedSearchId=...). */
export async function removeSavedSearch(savedSearchId: string): Promise<void> {
  const result = await client.DELETE('/saved-searches', {
    params: { query: { savedSearchId } },
  })
  if (result.error !== undefined) {
    throw result.error
  }
}
