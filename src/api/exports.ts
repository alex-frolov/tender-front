import { client, unwrap } from './client'
import type { operations } from './schema'

/** Задача экспорта (GET /exports/{jobId}). */
export type ExportJob = operations['getExport']['responses'][200]['content']['application/json']

/** Что выгружаем: тендеры, заявки или договоры. */
export type ExportType = NonNullable<
  operations['createExport']['requestBody']
>['content']['application/json']['export_type']

/** Формат файла. */
export type ExportFormat = NonNullable<
  operations['createExport']['requestBody']
>['content']['application/json']['format']

/** Статус задачи: в очереди, выполняется, готов, ошибка. */
export type ExportStatus = NonNullable<ExportJob['status']>

/**
 * Постановка экспорта в очередь (POST /exports, 202): файл готовится в фоне,
 * ответ несёт только `job_id`. Фильтры — тот же набор, что и у списка
 * (статус, даты); контракт описывает их свободным объектом.
 */
export async function createExport(input: {
  export_type: ExportType
  format: ExportFormat
  filters?: Record<string, unknown>
}) {
  const result = await client.POST('/exports', { body: input })
  return unwrap(result)
}

/** Состояние задачи экспорта: статус, ссылка на файл (только у готового), ошибка. */
export async function getExport(jobId: string): Promise<ExportJob> {
  const result = await client.GET('/exports/{jobId}', { params: { path: { jobId } } })
  return unwrap(result)
}

/** Имя файла из Content-Disposition; null, если заголовка нет. */
function filenameFromDisposition(header: string | null): string | null {
  if (header == null) return null
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header)
  return match?.[1] != null ? decodeURIComponent(match[1]) : null
}

/**
 * Скачивание готового файла (GET /exports/{jobId}/download).
 *
 * Ссылка `download_url` из ответа — путь к защищённому эндпоинту, а не готовый
 * URL для `<a href>`: без Bearer-токена он ответит 401. Поэтому файл берём тем
 * же клиентом (auth-middleware на месте) как blob, а сохранение делает уже
 * браузер по object URL. Неготовый экспорт → 409 `export_not_ready`.
 *
 * Имя берём из Content-Disposition ответа (сервер отдаёт
 * `export_tenders_{id}.csv`) — своё придумываем только если заголовка нет.
 */
export async function downloadExport(
  jobId: string,
): Promise<{ blob: Blob; filename: string | null }> {
  const result = await client.GET('/exports/{jobId}/download', {
    params: { path: { jobId } },
    parseAs: 'blob',
  })
  const blob = (await unwrap(result)) as Blob

  return {
    blob,
    filename: filenameFromDisposition(result.response.headers.get('content-disposition')),
  }
}
