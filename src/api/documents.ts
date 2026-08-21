import { client, unwrap } from './client'
import type { components, operations } from './schema'

export type Document = components['schemas']['Document']
export type DocumentType = components['schemas']['DocumentType']
export type DocumentVisibility = components['schemas']['DocumentVisibility']

/** Сущность, к которой приложен документ. */
export type DocumentEntityType = NonNullable<Document['entity_type']>

/** Роль владельца документа в типе (кто его прикладывает). */
export type DocumentOwnerRole = NonNullable<
  NonNullable<operations['createDocumentType']['requestBody']>['content']['application/json']['owner_role']
>

/**
 * Документы сущности (GET /documents?entity_type=&entity_id=).
 *
 * Оба параметра обязательны: списка «все документы площадки» в API нет и быть
 * не должно. Видимость применяет бэкенд — чужой приватный документ просто
 * не попадёт в выдачу, отказа при этом не будет.
 */
export async function listDocuments(
  entityType: DocumentEntityType,
  entityId: string,
): Promise<Document[]> {
  const result = await client.GET('/documents', {
    params: { query: { entity_type: entityType, entity_id: entityId } },
  })
  const data = await unwrap(result)
  return data.items ?? []
}

/** Карточка документа со списком версий (GET /documents/{id}). */
export async function getDocument(documentId: string): Promise<Document> {
  const result = await client.GET('/documents/{documentId}', {
    params: { path: { documentId } },
  })
  return unwrap(result)
}

/**
 * Загрузка документа (POST /documents, multipart/form-data).
 *
 * Единственное место во фронте, где тело запроса не JSON: файл уходит как есть,
 * без base64 — это дешевле по памяти на сервере и не раздувает запрос на треть.
 * `bodySerializer` возвращает FormData; openapi-fetch в этом случае не ставит
 * Content-Type сам, и браузер проставляет его вместе с boundary — заголовок
 * руками задавать нельзя, иначе boundary потеряется.
 *
 * Повторная загрузка на ту же сущность создаёт новую версию документа.
 */
export async function uploadDocument(input: {
  file: File
  document_type_id: string
  entity_type: DocumentEntityType
  entity_id: string
  visibility?: DocumentVisibility
}): Promise<Document> {
  const result = await client.POST('/documents', {
    body: input as never,
    bodySerializer: () => {
      const form = new FormData()
      form.append('file', input.file)
      form.append('document_type_id', input.document_type_id)
      form.append('entity_type', input.entity_type)
      form.append('entity_id', input.entity_id)
      if (input.visibility != null) form.append('visibility', input.visibility)
      return form
    },
  })
  return unwrap(result)
}

/**
 * Скачивание документа (GET /documents/{id}/download).
 *
 * Как и у экспорта: `download_url` из карточки — путь к защищённому эндпоинту,
 * обычная ссылка получит 401, поэтому файл берём тем же клиентом как blob.
 */
export async function downloadDocument(
  documentId: string,
): Promise<{ blob: Blob; filename: string | null }> {
  const result = await client.GET('/documents/{documentId}/download', {
    params: { path: { documentId } },
    parseAs: 'blob',
  })
  const blob = (await unwrap(result)) as Blob
  const disposition = result.response.headers.get('content-disposition')
  const match = disposition == null ? null : /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)

  return { blob, filename: match?.[1] != null ? decodeURIComponent(match[1]) : null }
}

/** Каталог типов документов (GET /document-types, доступно всем ролям). */
export async function listDocumentTypes(): Promise<DocumentType[]> {
  const result = await client.GET('/document-types')
  const data = await unwrap(result)
  return data.items ?? []
}

/**
 * Новый тип документа (POST /document-types, только суперадмин).
 *
 * `auto_generated` всегда false: такие типы заводит плагин-генератор
 * (`DocumentGenerator`), а не человек через интерфейс. Поле обязательно в
 * сгенерированном типе — у него есть default в спеке, — поэтому передаём явно.
 */
export async function createDocumentType(input: {
  code: string
  name: string
  owner_role: DocumentOwnerRole
  visibility?: DocumentVisibility
  required?: boolean
}): Promise<DocumentType> {
  const result = await client.POST('/document-types', {
    body: { ...input, required: input.required ?? false, auto_generated: false },
  })
  return unwrap(result)
}

/** Правка типа документа (PUT /document-types/{id}, только суперадмин). */
export async function updateDocumentType(
  documentTypeId: string,
  input: {
    name?: string
    owner_role?: DocumentOwnerRole
    visibility?: DocumentVisibility
    required?: boolean
    active?: boolean
  },
): Promise<DocumentType> {
  const result = await client.PUT('/document-types/{documentTypeId}', {
    params: { path: { documentTypeId } },
    body: input,
  })
  return unwrap(result)
}

/**
 * Деактивация типа документа (DELETE /document-types/{id}).
 * Тип не удаляется: на него ссылаются уже загруженные документы — он просто
 * перестаёт предлагаться при загрузке.
 */
export async function deactivateDocumentType(documentTypeId: string): Promise<void> {
  const result = await client.DELETE('/document-types/{documentTypeId}', {
    params: { path: { documentTypeId } },
  })
  if (result.error !== undefined) {
    throw result.error
  }
}

/**
 * Скан договора (POST /contracts/{id}/scan, multipart). Прикладывает любая
 * сторона договора; файл становится документом с сущностью `contract`.
 */
export async function uploadContractScan(contractId: string, file: File): Promise<Document> {
  const result = await client.POST('/contracts/{contractId}/scan', {
    params: { path: { contractId } },
    body: { file } as never,
    bodySerializer: () => {
      const form = new FormData()
      form.append('file', file)
      return form
    },
  })
  return unwrap(result)
}
