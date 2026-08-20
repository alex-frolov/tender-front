import { client, unwrap } from './client'
import type { components } from './schema'

export type Bid = components['schemas']['Bid']
export type BidStatus = components['schemas']['BidStatus']
export type BidCreate = components['schemas']['BidCreate']

/** Страница списка заявок (единый формат курсорной пагинации API). */
export interface BidsPage {
  items: Bid[]
  next_cursor: string | null
}

/**
 * Заявки тендера (GET /tenders/{id}/bids).
 *
 * До вскрытия (tenders.bids_opened_at не проставлен) приходят только
 * метаданные: заказчик видит все заявки, участник — свою. После вскрытия
 * добавляется расшифрованное содержимое: заказчику — целиком, участнику —
 * только part1.
 */
export async function listBids(
  tenderId: string,
  cursor?: string | null,
  limit?: number,
): Promise<BidsPage> {
  const result = await client.GET('/tenders/{tenderId}/bids', {
    params: {
      path: { tenderId },
      query: { cursor: cursor ?? undefined, limit },
    },
  })
  const data = await unwrap(result)
  return { items: data.items ?? [], next_cursor: data.next_cursor ?? null }
}

export interface SubmitBidInput {
  tenderId: string
  body: BidCreate
  /** Уникальный ключ идемпотентности (см. useIdempotentMutation). */
  idempotencyKey: string
}

/**
 * Подача заявки участником (POST /tenders/{id}/bids, 201 → Bid).
 *
 * Действует инвариант «одна заявка на лот»: повторная подача до окончания
 * приёма заменяет существующую заявку (тот же id, статус снова submitted),
 * дубль не создаётся. Возможно только пока тендер в статусе accepting_bids.
 */
export async function submitBid({ tenderId, body, idempotencyKey }: SubmitBidInput): Promise<Bid> {
  const result = await client.POST('/tenders/{tenderId}/bids', {
    params: {
      path: { tenderId },
      header: { 'Idempotency-Key': idempotencyKey },
    },
    body,
  })
  return unwrap(result)
}

export interface WithdrawBidInput {
  bidId: string
  reason: string
  idempotencyKey: string
}

/**
 * Отзыв своей заявки (POST /bids/{bidId}/withdraw): submitted → withdrawn,
 * причина обязательна. Только до окончания приёма заявок.
 */
export async function withdrawBid({
  bidId,
  reason,
  idempotencyKey,
}: WithdrawBidInput): Promise<Bid> {
  const result = await client.POST('/bids/{bidId}/withdraw', {
    params: {
      path: { bidId },
      header: { 'Idempotency-Key': idempotencyKey },
    },
    body: { reason },
  })
  return unwrap(result)
}

/** Решение заказчика по заявке (реестр BidDecision в спеке). */
export type BidDecision = 'admit' | 'reject'

/**
 * Рассмотрение заявки заказчиком (POST /bids/{bidId}/qualification):
 * submitted → admitted | rejected, причина обязательна.
 *
 * Допуск здесь — предусловие торгов: ставку на аукционе принимают только от
 * компании с заявкой в статусе admitted на этот лот.
 */
export async function qualifyBid(
  bidId: string,
  decision: BidDecision,
  reason: string,
): Promise<Bid> {
  const result = await client.POST('/bids/{bidId}/qualification', {
    params: { path: { bidId } },
    body: { decision, reason },
  })
  return unwrap(result)
}
