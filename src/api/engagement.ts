import { client, unwrap } from './client'
import type { components, operations } from './schema'

// ---------- Вопросы и жалобы по тендеру ----------

export type Question = components['schemas']['Question']
export type Complaint = components['schemas']['Complaint']
export type ComplaintStatus = NonNullable<Complaint['status']>

/**
 * Вопросы по тендеру (GET /tenders/{id}/questions).
 *
 * Право `tenders.qa` настраиваемое: admin — всегда, manager и agent — по
 * настройке площадки, поэтому 403 здесь штатный ответ.
 *
 * Ответ заказчика приходит полем `answer`, но проставить его через API нельзя:
 * эндпоинта ответа в контракте нет (см. «Чего ещё нет» в CLAUDE.md).
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
 * Жалоба на процедуру (POST /tenders/{id}/complaints). Основание (`ground`) —
 * обязательное отдельное поле: по нему жалоба разбирается, текст его не заменяет.
 *
 * Списка жалоб в контракте нет — созданная жалоба возвращается ответом и после
 * перезагрузки страницы во фронте недоступна.
 */
export async function fileComplaint(
  tenderId: string,
  input: { text: string; ground: string; lot_id?: string },
): Promise<Complaint> {
  const result = await client.POST('/tenders/{tenderId}/complaints', {
    params: { path: { tenderId } },
    body: input,
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
