import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cancelTender, publishTender, updateTender, withdrawTender } from '@/api/endpoints'
import type { components } from '@/api/schema'
import { apiErrorMessage } from '@/lib/errors'
import { canManageTender } from '@/lib/tenderAccess'
import { useAuth } from '@/features/auth/AuthContext'

type Tender = components['schemas']['Tender']
type TenderStatus = components['schemas']['TenderStatus']

/** Коды причин отмены — как в контракте CancelTenderRequest. */
const CANCEL_REASON_LABELS: Record<string, string> = {
  cancellation_needs: 'Отмена потребности',
  changing_order_conditions: 'Изменение условий заказа',
  carrier_refusal: 'Отказ перевозчика',
  other: 'Другое',
}

/** Статусы, в которых тендер можно отменить (workflow: любой до contract). */
const CANCELLABLE: readonly TenderStatus[] = [
  'draft',
  'published',
  'withdrawn',
  'accepting_bids',
  'bidding',
  'evaluation',
  'awarding',
  'contract',
]

/** Статусы, которые нельзя редактировать (после accepting_bids правка закрыта). */
const EDITABLE: readonly TenderStatus[] = ['draft', 'published', 'withdrawn', 'accepting_bids']

/**
 * Статусы, из которых доступна публикация (POST /tenders/{id}/publish):
 * черновик и отозванный тендер (перепубликация, workflow REPUBLISH).
 */
const PUBLISHABLE: readonly TenderStatus[] = ['draft', 'withdrawn']

/**
 * Панель управления тендером (admin/manager СВОЕЙ компании): публикация
 * черновика (draft/withdrawn → published), правка полей до окончания приёма
 * заявок, отзыв публикации (published → withdrawn) и отмена с причиной.
 * Мутации инвалидируют кэш списка и карточки.
 *
 * Участнику чужой процедуры панель не показывается вовсе (canManageTender):
 * бэкенд резолвит тендер в тенанте актора, поэтому любое из этих действий
 * на чужом тендере — гарантированная ошибка.
 */
export function TenderActions({ tender }: { tender: Tender }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [editOpen, setEditOpen] = useState(false)
  const [editTitle, setEditTitle] = useState(tender.title ?? '')
  const [editDescription, setEditDescription] = useState(tender.description ?? '')
  const [editReason, setEditReason] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const [publishOpen, setPublishOpen] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)

  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawReason, setWithdrawReason] = useState('')
  const [withdrawError, setWithdrawError] = useState<string | null>(null)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelCode, setCancelCode] = useState<string>('cancellation_needs')
  const [cancelText, setCancelText] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['tender', tender.id] })
    void queryClient.invalidateQueries({ queryKey: ['tenders'] })
  }

  const updateMutation = useMutation({
    mutationFn: (input: components['schemas']['TenderUpdate']) =>
      updateTender(tender.id ?? '', input),
    onSuccess: () => {
      invalidate()
      setEditOpen(false)
      setEditError(null)
    },
  })

  const publishMutation = useMutation({
    mutationFn: () => publishTender(tender.id ?? ''),
    onSuccess: () => {
      invalidate()
      setPublishOpen(false)
      setPublishError(null)
    },
  })

  const withdrawMutation = useMutation({
    mutationFn: (reason: string) => withdrawTender(tender.id ?? '', reason),
    onSuccess: () => {
      invalidate()
      setWithdrawOpen(false)
      setWithdrawError(null)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (input: components['schemas']['CancelTenderRequest']) =>
      cancelTender(tender.id ?? '', input),
    onSuccess: () => {
      invalidate()
      setCancelOpen(false)
      setCancelError(null)
    },
  })

  // Управление — только своей компании и только с правами (не agent).
  if (!canManageTender(tender, user)) {
    return null
  }

  const status = tender.status ?? 'draft'
  const canEdit = EDITABLE.includes(status)
  const canPublish = PUBLISHABLE.includes(status)
  const canWithdraw = status === 'published'
  const canCancel = CANCELLABLE.includes(status)

  async function handleEditSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setEditError(null)
    const input: components['schemas']['TenderUpdate'] = {}
    const title = editTitle.trim()
    if (title !== (tender.title ?? '')) {
      if (title === '') {
        setEditError('Название не может быть пустым.')
        return
      }
      input.title = title
    }
    // Пустая строка в TenderUpdate.description — это очистка поля (в отличие от
    // отсутствующего ключа, который значит «не менять»), поэтому отправляем её как есть.
    const description = editDescription.trim()
    if (description !== (tender.description ?? '')) {
      input.description = description
    }
    // Проверяем именно наличие ключей: пустая строка в title тут уже отсеяна.
    if (Object.keys(input).length === 0) {
      setEditError('Нет изменений: измените название или описание.')
      return
    }
    input.change_reason = editReason.trim() || 'Редактирование тендера'
    try {
      await updateMutation.mutateAsync(input)
    } catch (err) {
      setEditError(apiErrorMessage(err))
    }
  }

  async function handlePublish(): Promise<void> {
    setPublishError(null)
    try {
      await publishMutation.mutateAsync()
    } catch (err) {
      setPublishError(apiErrorMessage(err))
    }
  }

  async function handleWithdrawSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setWithdrawError(null)
    if (withdrawReason.trim() === '') {
      setWithdrawError('Укажите причину отзыва.')
      return
    }
    try {
      await withdrawMutation.mutateAsync(withdrawReason.trim())
    } catch (err) {
      setWithdrawError(apiErrorMessage(err))
    }
  }

  async function handleCancelSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setCancelError(null)
    const input: components['schemas']['CancelTenderRequest'] = {
      cancellation_reason_code:
        cancelCode as components['schemas']['CancelTenderRequest']['cancellation_reason_code'],
    }
    if (cancelCode === 'other' && cancelText.trim() === '') {
      setCancelError('Для причины «Другое» укажите текст.')
      return
    }
    if (cancelText.trim() !== '') input.cancellation_reason_text = cancelText.trim()
    try {
      await cancelMutation.mutateAsync(input)
    } catch (err) {
      setCancelError(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canPublish && (
          <Button size="sm" onClick={() => setPublishOpen((open) => !open)}>
            {status === 'withdrawn' ? 'Опубликовать снова' : 'Опубликовать'}
          </Button>
        )}
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen((open) => !open)}
          >
            Редактировать
          </Button>
        )}
        {canWithdraw && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWithdrawOpen((open) => !open)}
          >
            Отозвать публикацию
          </Button>
        )}
        {canCancel && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setCancelOpen((open) => !open)}
          >
            Отменить тендер
          </Button>
        )}
      </div>

      {publishOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {status === 'withdrawn' ? 'Повторная публикация' : 'Публикация тендера'}
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              Тендер станет виден участникам, бэкенд рассчитает сроки процедуры
              (приём заявок, рассмотрение, торги) и запланирует авто-переходы.
              До старта приёма заявок публикацию можно отозвать.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {publishError != null && <p className="text-destructive text-sm">{publishError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setPublishOpen(false)}>
                Отмена
              </Button>
              <Button
                type="button"
                onClick={() => void handlePublish()}
                disabled={publishMutation.isPending}
              >
                {publishMutation.isPending ? 'Публикуем…' : 'Опубликовать'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {editOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Редактирование тендера</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleEditSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="edit-title" className="text-sm font-medium">
                  Название
                </label>
                <Input
                  id="edit-title"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  maxLength={500}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="edit-desc" className="text-sm font-medium">
                  Описание
                </label>
                <Textarea
                  id="edit-desc"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  maxLength={10000}
                  rows={4}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="edit-reason" className="text-sm font-medium">
                  Причина правки (для аудита)
                </label>
                <Input
                  id="edit-reason"
                  value={editReason}
                  onChange={(event) => setEditReason(event.target.value)}
                  maxLength={1000}
                  placeholder="Уточнение условий…"
                />
              </div>
              {editError != null && <p className="text-destructive text-sm">{editError}</p>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditOpen(false)}
                >
                  Отмена
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Сохраняем…' : 'Сохранить'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {withdrawOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Отзыв публикации</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleWithdrawSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="withdraw-reason" className="text-sm font-medium">
                  Причина отзыва
                </label>
                <Input
                  id="withdraw-reason"
                  value={withdrawReason}
                  onChange={(event) => setWithdrawReason(event.target.value)}
                  maxLength={500}
                  placeholder="Например: уточняем условия…"
                />
              </div>
              {withdrawError != null && (
                <p className="text-destructive text-sm">{withdrawError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setWithdrawOpen(false)}
                >
                  Отмена
                </Button>
                <Button type="submit" variant="outline" disabled={withdrawMutation.isPending}>
                  {withdrawMutation.isPending ? 'Отзываем…' : 'Отозвать'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {cancelOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Отмена тендера</CardTitle>
            <p className="text-muted-foreground text-sm">
              Действие необратимо: тендер перейдёт в статус «Отменён», лоты и
              аукционы будут отменены.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCancelSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Причина отмены</label>
                <Select value={cancelCode} onValueChange={setCancelCode}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CANCEL_REASON_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {cancelCode === 'other' && (
                <div className="space-y-1.5">
                  <label htmlFor="cancel-text" className="text-sm font-medium">
                    Пояснение
                  </label>
                  <Input
                    id="cancel-text"
                    value={cancelText}
                    onChange={(event) => setCancelText(event.target.value)}
                    maxLength={2000}
                    placeholder="Опишите причину…"
                  />
                </div>
              )}
              {cancelError != null && <p className="text-destructive text-sm">{cancelError}</p>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCancelOpen(false)}
                >
                  Отмена
                </Button>
                <Button type="submit" variant="destructive" disabled={cancelMutation.isPending}>
                  {cancelMutation.isPending ? 'Отменяем…' : 'Отменить тендер'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}