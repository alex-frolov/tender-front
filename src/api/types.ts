import type { operations } from './schema'

/**
 * Типы входов операций — прямо из сгенерированной схемы. Через них обёртки
 * описывают параметры и тела, не копируя поля руками: новое поле или значение
 * enum в спеке после `npm run gen` появляется здесь само.
 */
export type OperationId = keyof operations

/** Query-параметры операции (`GET /tenders` → `QueryParams<'listTenders'>`). */
export type QueryParams<Op extends OperationId> = NonNullable<operations[Op]['parameters']['query']>

/** JSON-тело запроса операции. */
export type RequestBody<Op extends OperationId> =
  NonNullable<operations[Op]['requestBody']> extends { content: { 'application/json': infer Body } }
    ? Body
    : never

/** JSON-тело успешного ответа операции с заданным кодом. */
export type ResponseBody<Op extends OperationId, Code extends number = 200> =
  operations[Op]['responses'] extends Record<Code, { content: { 'application/json': infer Body } }>
    ? Body
    : never
