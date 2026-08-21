import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Paperclip, Upload } from 'lucide-react'
import {
  downloadDocument,
  listDocuments,
  listDocumentTypes,
  uploadDocument,
  type DocumentEntityType,
  type DocumentVisibility,
} from '@/api/documents'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiErrorMessage, isApiError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'

const VISIBILITY_LABELS: Record<DocumentVisibility, string> = {
  public: 'Публичный',
  private: 'Приватный',
}

/** Байты → человекочитаемый размер: файлы тут от килобайт до десятков мегабайт. */
function formatSize(bytes: number | undefined): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`
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
 * Документы сущности: список, загрузка и скачивание
 * (GET/POST /documents, GET /documents/{id}/download).
 *
 * Один компонент на все сущности (тендер, лот, заявка, договор, претензия) —
 * набор действий одинаковый, различается только пара entity_type/entity_id.
 *
 * Видимость документа берётся из его типа, но её можно переопределить при
 * загрузке: публичный документ видят все допущенные участники, приватный —
 * только компания-владелец. Чужие приватные документы в списке не появляются:
 * их отфильтровывает бэкенд, а не фронт.
 *
 * Загрузка — единственное место, где тело запроса не JSON: файл уходит
 * multipart'ом как есть (см. `api/documents.ts`).
 */
export function DocumentsCard({
  entityType,
  entityId,
  canUpload,
  title = 'Документы',
  description,
}: {
  entityType: DocumentEntityType
  entityId: string
  canUpload: boolean
  title?: string
  description?: string
}) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const documentsQuery = useQuery({
    queryKey: ['documents', entityType, entityId],
    queryFn: () => listDocuments(entityType, entityId),
    enabled: entityId !== '',
  })

  const typesQuery = useQuery({
    queryKey: ['document-types'],
    queryFn: listDocumentTypes,
    staleTime: 5 * 60_000,
    enabled: canUpload,
  })

  const [typeId, setTypeId] = useState('')
  const [visibility, setVisibility] = useState<DocumentVisibility | ''>('')
  const [error, setError] = useState<string | null>(null)

  const uploadMutation = useMutation({
    mutationFn: uploadDocument,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', entityType, entityId] })
    },
  })

  const documents = documentsQuery.data ?? []
  // Загружать можно только в активный тип: деактивированные остаются на старых
  // документах, но новые к ним не прикладываются.
  const types = (typesQuery.data ?? []).filter((type) => type.active !== false)
  const forbidden =
    isApiError(documentsQuery.error) && documentsQuery.error.code === 'forbidden'

  async function handleFile(file: File | undefined): Promise<void> {
    if (file == null) return
    setError(null)
    if (typeId === '') {
      setError('Сначала выберите тип документа.')
      return
    }
    try {
      await uploadMutation.mutateAsync({
        file,
        document_type_id: typeId,
        entity_type: entityType,
        entity_id: entityId,
        ...(visibility === '' ? {} : { visibility }),
      })
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      // Сброс input'а: без него повторный выбор того же файла не вызовет change.
      if (fileInputRef.current != null) fileInputRef.current.value = ''
    }
  }

  async function handleDownload(documentId: string, fallback: string): Promise<void> {
    setError(null)
    try {
      const { blob, filename } = await downloadDocument(documentId)
      saveBlob(blob, filename ?? fallback)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Paperclip className="size-4" />
          {title}
        </CardTitle>
        {description != null && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {documentsQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">Загружаем документы…</p>
        ) : forbidden ? (
          <p className="text-muted-foreground text-sm">
            Нет права на просмотр документов — оно выдаётся ролью.
          </p>
        ) : documentsQuery.isError ? (
          <p className="text-destructive text-sm">
            Не удалось загрузить документы: {apiErrorMessage(documentsQuery.error)}
          </p>
        ) : documents.length === 0 ? (
          <p className="text-muted-foreground text-sm">Документов нет.</p>
        ) : (
          <ul className="divide-y">
            {documents.map((item) => {
              const versions = item.versions ?? []
              const current = versions[versions.length - 1]
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="text-sm font-medium">{item.title}</span>
                  {item.visibility != null && (
                    <Badge variant={item.visibility === 'public' ? 'secondary' : 'warning'}>
                      {VISIBILITY_LABELS[item.visibility]}
                    </Badge>
                  )}
                  {versions.length > 1 && (
                    <span className="text-muted-foreground text-xs">
                      версия {versions.length}
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs">
                    {formatSize(current?.size_bytes)}
                  </span>
                  {current?.uploaded_at != null && (
                    <span className="text-muted-foreground text-xs">
                      {formatDateTime(current.uploaded_at)}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() =>
                      void handleDownload(item.id ?? '', item.title ?? 'document')
                    }
                  >
                    <Download className="size-4" />
                    Скачать
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        {canUpload && (
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Тип документа</label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger className="w-64">
                  <SelectValue
                    placeholder={
                      typesQuery.isLoading
                        ? 'Загружаем типы…'
                        : types.length === 0
                          ? 'Типы не заведены'
                          : 'Выберите тип'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {types.map((type) => (
                    <SelectItem key={type.id} value={String(type.id)}>
                      {type.name}
                      {type.required === true ? ' · обязательный' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Видимость</label>
              <Select
                value={visibility === '' ? 'default' : visibility}
                onValueChange={(value) =>
                  setVisibility(value === 'default' ? '' : (value as DocumentVisibility))
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Как в типе</SelectItem>
                  <SelectItem value="public">{VISIBILITY_LABELS.public}</SelectItem>
                  <SelectItem value="private">{VISIBILITY_LABELS.private}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <Button
              size="sm"
              disabled={uploadMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-4" />
              {uploadMutation.isPending ? 'Загружаем…' : 'Загрузить файл'}
            </Button>
          </div>
        )}

        {error != null && <p className="text-destructive text-sm">{error}</p>}
      </CardContent>
    </Card>
  )
}
