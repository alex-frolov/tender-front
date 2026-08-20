import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import {
  createExport,
  downloadExport,
  getExport,
  type ExportFormat,
  type ExportType,
} from '@/api/exports'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiErrorMessage, isApiError } from '@/lib/errors'

const FORMATS: readonly ExportFormat[] = ['xlsx', 'csv']

/** Шаг опроса статуса и потолок ожидания. */
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 2 * 60 * 1000

const FORMAT_LABELS: Record<ExportFormat, string> = {
  xlsx: 'Excel (xlsx)',
  csv: 'CSV',
}

const TYPE_LABELS: Record<ExportType, string> = {
  tenders: 'тендеров',
  bids: 'заявок',
  contracts: 'договоров',
}

/** Сохранение blob под именем: object URL живёт ровно до клика. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/**
 * Выгрузка списка в файл (POST /exports → опрос GET /exports/{id} → скачивание).
 *
 * Экспорт готовится в фоне: POST отвечает 202 и только идентификатором задачи,
 * поэтому статус опрашивается раз в две секунды, пока не станет `ready` или
 * `failed`. Опрос прекращается сам — иначе вкладка стучалась бы в API вечно.
 *
 * Фильтры передаются те же, что применены к списку: выгружается то, что
 * пользователь видит на экране, а не вся база.
 *
 * Право `exports.export` настраиваемое, поэтому 403 показываем пояснением,
 * а не общей ошибкой.
 */
export function ExportButton({
  exportType,
  filters,
}: {
  exportType: ExportType
  filters?: Record<string, unknown>
}) {
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [jobId, setJobId] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const createMutation = useMutation({
    mutationFn: () => createExport({ export_type: exportType, format, filters }),
    onSuccess: (job) => {
      setJobId(job.job_id ?? null)
      setStartedAt(Date.now())
    },
  })

  const jobQuery = useQuery({
    queryKey: ['export', jobId],
    queryFn: () => getExport(jobId ?? ''),
    enabled: jobId != null,
    // Опрашиваем, пока файл готовится, но не бесконечно: задачу выполняет
    // воркер, и если он лежит, статус так и останется `queued` — вкладка
    // стучалась бы в API до закрытия. После таймаута предлагаем проверить руками.
    refetchInterval: (query) => {
      const jobStatus = query.state.data?.status
      const inProgress = jobStatus === 'queued' || jobStatus === 'processing'
      const elapsed = startedAt == null ? 0 : Date.now() - startedAt
      return inProgress && elapsed < POLL_TIMEOUT_MS ? POLL_INTERVAL_MS : false
    },
  })

  const status = jobQuery.data?.status
  const inProgress = status === 'queued' || status === 'processing'
  const preparing = createMutation.isPending || inProgress
  // Ждём дольше таймаута — опрос уже остановлен, дальше только вручную.
  const pollingStopped =
    inProgress && startedAt != null && Date.now() - startedAt >= POLL_TIMEOUT_MS

  async function handleCreate(): Promise<void> {
    setError(null)
    setSaved(false)
    setJobId(null)
    try {
      await createMutation.mutateAsync()
    } catch (err) {
      setError(
        isApiError(err) && err.code === 'forbidden'
          ? 'Нет права на экспорт — оно выдаётся ролью («exports.export»).'
          : apiErrorMessage(err),
      )
    }
  }

  async function handleDownload(): Promise<void> {
    if (jobId == null) return
    setError(null)
    try {
      const { blob, filename } = await downloadExport(jobId)
      saveBlob(blob, filename ?? `${exportType}-${jobId.slice(0, 8)}.${format}`)
      setSaved(true)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={format} onValueChange={(value) => setFormat(value as ExportFormat)}>
        <SelectTrigger className="w-36" aria-label="Формат выгрузки">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FORMATS.map((value) => (
            <SelectItem key={value} value={value}>
              {FORMAT_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {status === 'ready' ? (
        <Button size="sm" onClick={() => void handleDownload()}>
          <Download className="size-4" />
          Скачать файл
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled={preparing} onClick={() => void handleCreate()}>
          <Download className="size-4" />
          {preparing ? 'Готовим выгрузку…' : `Выгрузить ${TYPE_LABELS[exportType]}`}
        </Button>
      )}

      {pollingStopped && (
        <span className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Файл всё ещё готовится.</span>
          <Button variant="ghost" size="sm" onClick={() => void jobQuery.refetch()}>
            Проверить
          </Button>
        </span>
      )}
      {status === 'failed' && (
        <span className="text-destructive text-sm">
          Выгрузка не удалась{jobQuery.data?.error != null ? `: ${jobQuery.data.error}` : ''}
        </span>
      )}
      {saved && <span className="text-sm text-emerald-600">Файл сохранён.</span>}
      {error != null && <span className="text-destructive text-sm">{error}</span>}
    </div>
  )
}
