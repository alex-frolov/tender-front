import { Link, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { getTender } from '@/api/endpoints'
import { FullPageSpinner } from '@/components/auth/ProtectedRoute'
import { TenderStatusBadge } from '@/components/tender/TenderStatusBadge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { TenderBids } from '@/features/bids/TenderBids'
import { TenderActions } from '@/features/tenders/TenderActions'
import { TenderLots } from '@/features/tenders/TenderLots'
import { useAuth } from '@/features/auth/AuthContext'
import { DocumentsCard } from '@/features/documents/DocumentsCard'
import { TenderAccessNotice } from '@/features/tenders/TenderAccessNotice'
import { TenderQuestions } from '@/features/tenders/TenderQuestions'
import { canManageTender, isTenderCustomer } from '@/lib/tenderAccess'
import { apiErrorMessage } from '@/lib/errors'
import {
  ACCESS_TYPE_LABELS,
  LAW_TYPE_LABELS,
  PRICE_BASIS_LABELS,
  PROCEDURE_TYPE_LABELS,
  TIMELINE_LABELS,
  type AccessType,
  type LawType,
  type PriceBasis,
  type ProcedureType,
} from '@/lib/enums'
import { formatDateTime, formatRemaining } from '@/lib/format'
import { formatMoney } from '@/lib/money'

/** Русская подпись enum-значения, пришедшего свободной строкой (Tender.procedure_type/law_type). */
function labelOrRaw<T extends string>(
  labels: Record<T, string>,
  value: string | undefined,
): string | undefined {
  if (value == null) return undefined
  return labels[value as T] ?? value
}

/** Stat-карточка шапки: подпись + крупное значение + опциональный хелпер. */
function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="text-xl font-bold tabular-nums">{value}</span>
        {hint != null && <span className="text-muted-foreground text-xs">{hint}</span>}
      </CardContent>
    </Card>
  )
}

/** Строка «поле — значение» в карточке реквизитов. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <span className="text-muted-foreground w-56 shrink-0 text-sm">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  )
}

/**
 * Карточка тендера (GET /tenders/{id}).
 *
 * Выводится всё, что отдаёт схема Tender: реквизиты (номер, процедура, закон,
 * доступ, регион, ОКПД2, базис цены), деньги (НМЦК, НДС), сроки (timeline +
 * deadline = timeline.bids_end), причина отмены и служебные даты.
 * Роль зрителя в процедуре — из сравнения `customer_id` с его компанией
 * (см. lib/tenderAccess): от неё зависит, показывать ли управление тендером
 * и лотами.
 */
export function TenderDetailPage() {
  const { tenderId } = useParams<{ tenderId: string }>()
  const { user } = useAuth()
  // Форма создания уводит сюда, если черновик создался, а публикация упала:
  // тендер существует, и повторить публикацию можно кнопкой в TenderActions.
  const location = useLocation()
  const publishError = (location.state as { publishError?: string } | null)?.publishError ?? null

  const tenderQuery = useQuery({
    queryKey: ['tender', tenderId],
    queryFn: () => getTender(tenderId ?? ''),
    enabled: tenderId != null,
  })

  if (tenderId == null) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground text-sm">Не указан идентификатор тендера.</p>
        </CardContent>
      </Card>
    )
  }

  if (tenderQuery.isLoading) {
    return <FullPageSpinner />
  }

  if (tenderQuery.isError) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <p className="text-destructive text-sm">
            Не удалось загрузить тендер: {apiErrorMessage(tenderQuery.error)}
          </p>
          <Button variant="outline" onClick={() => void tenderQuery.refetch()}>
            Повторить
          </Button>
        </CardContent>
      </Card>
    )
  }

  const tender = tenderQuery.data
  if (tender == null) {
    return null
  }

  const procedureValue = labelOrRaw<ProcedureType>(PROCEDURE_TYPE_LABELS, tender.procedure_type)
  const lawValue = labelOrRaw<LawType>(LAW_TYPE_LABELS, tender.law_type)
  const accessValue = labelOrRaw<AccessType>(ACCESS_TYPE_LABELS, tender.access_type)
  const priceBasisValue = labelOrRaw<PriceBasis>(PRICE_BASIS_LABELS, tender.price_basis)

  const nmckValue =
    tender.nmck_minor != null ? formatMoney(tender.nmck_minor, tender.currency) : null
  const nmckHintParts: string[] = []
  if (tender.vat_rate != null) {
    // Базис цены решает, входит НДС в НМЦК или нет; для net (дефолт формы
    // создания) «вкл. НДС» было прямо неверным утверждением о главной цифре.
    const vatNote =
      tender.price_basis === 'gross' ? 'вкл. НДС' : tender.price_basis === 'net' ? 'без НДС' : 'НДС'
    nmckHintParts.push(`${vatNote} ${tender.vat_rate}%`)
  }
  if (tender.no_start_price === true) nmckHintParts.push('нет стартовой цены')
  const nmckHint = nmckHintParts.length > 0 ? nmckHintParts.join(' · ') : undefined

  const procedureSub = [lawValue, accessValue].filter((value) => value != null).join(' · ')

  // Срок подачи заявок: бэкенд отдаёт его и отдельным полем deadline, и внутри
  // timeline (bids_end) — до публикации таймлайна нет, поэтому оба могут быть пусты.
  const deadline = tender.deadline ?? tender.timeline?.bids_end ?? null

  // Порядок сроков — по ходу процедуры; ключи вне словаря выводим как есть,
  // чтобы новый срок из плагина не исчезал из карточки.
  const timelineEntries = Object.entries(tender.timeline ?? {}).sort(
    ([a], [b]) => timelineOrder(a) - timelineOrder(b),
  )

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/tenders">
          <ArrowLeft className="size-4" />
          К списку тендеров
        </Link>
      </Button>

      {publishError != null && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
          <CardContent className="text-sm">
            Черновик создан, но опубликовать его не удалось: {publishError}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-muted-foreground text-sm">
              {tender.number || '—'}
            </span>
            <TenderStatusBadge status={tender.status} />
          </div>
          <h1 className="text-2xl font-semibold">{tender.title || 'Без названия'}</h1>
        </div>

        {/* В схеме Tender нет auction_id, прямой ссылки на аукцион лота нет —
            ведём в список аукционов компании (там тендер/лот видно в строке). */}
        {tender.status === 'bidding' && (
          <Button asChild variant="secondary">
            <Link to="/auctions">К аукционам →</Link>
          </Button>
        )}

        <TenderActions tender={tender} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {nmckValue != null && <StatCard label="НМЦК" value={nmckValue} hint={nmckHint} />}
        {(procedureValue != null || procedureSub !== '') && (
          <StatCard
            label="Процедура"
            value={procedureValue ?? procedureSub}
            hint={procedureSub === '' ? undefined : procedureSub}
          />
        )}
        <StatCard
          label="Подача заявок до"
          value={deadline != null ? formatDateTime(deadline) : '—'}
          hint={
            deadline != null
              ? formatRemaining(deadline)
              : 'Срок появится после публикации тендера'
          }
        />
        <StatCard label="Регион" value={tender.region || '—'} hint={okpd2Hint(tender.okpd2)} />
      </div>

      {tender.description != null && tender.description !== '' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Описание</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-line">{tender.description}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Сроки</CardTitle>
        </CardHeader>
        <CardContent>
          {timelineEntries.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Сроки рассчитываются при публикации тендера — у черновика их ещё нет.
            </p>
          ) : (
            <div className="divide-y">
              {timelineEntries.map(([key, value]) => (
                <DetailRow
                  key={key}
                  label={TIMELINE_LABELS[key] ?? key}
                  value={
                    typeof value === 'string'
                      ? `${formatDateTime(value)} · ${formatRemaining(value)}`
                      : String(value)
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Реквизиты</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            <DetailRow label="Номер" value={tender.number || '—'} />
            <DetailRow label="Процедура" value={procedureValue ?? '—'} />
            <DetailRow label="Закон" value={lawValue ?? '—'} />
            <DetailRow label="Тип доступа" value={accessValue ?? '—'} />
            <DetailRow label="Регион" value={tender.region || '—'} />
            <DetailRow label="ОКПД2" value={tender.okpd2 || '—'} />
            <DetailRow label="Валюта" value={tender.currency || '—'} />
            <DetailRow
              label="Ставка НДС"
              value={tender.vat_rate != null ? `${tender.vat_rate}%` : '—'}
            />
            <DetailRow label="Базис цены" value={priceBasisValue ?? '—'} />
            <DetailRow
              label="Стартовая цена"
              value={tender.no_start_price === true ? 'Не задана (без НМЦК)' : (nmckValue ?? '—')}
            />
            {tender.execution_rating != null && (
              <DetailRow label="Оценка исполнения" value={`${tender.execution_rating} из 5`} />
            )}
            {tender.cancellation_reason_code != null && (
              <DetailRow
                label="Причина отмены"
                value={[tender.cancellation_reason_code, tender.cancellation_reason_text]
                  .filter((part) => part != null && part !== '')
                  .join(' · ')}
              />
            )}
            <DetailRow
              label="Создан"
              value={tender.created_at != null ? formatDateTime(tender.created_at) : '—'}
            />
            <DetailRow
              label="Изменён"
              value={tender.updated_at != null ? formatDateTime(tender.updated_at) : '—'}
            />
          </div>
        </CardContent>
      </Card>

      <TenderLots tender={tender} />

      <TenderBids tender={tender} />

      {/* Закрытая процедура: участнику объясняем, почему участие недоступно.
          Заказчику это не нужно — к своей процедуре он допущен по определению. */}
      {tender.access_type === 'contract_holders' && !isTenderCustomer(tender, user) && (
        <TenderAccessNotice tenderId={tender.id ?? ''} />
      )}

      <DocumentsCard
        entityType="tender"
        entityId={tender.id ?? ''}
        canUpload={canManageTender(tender, user)}
        description="Документация процедуры. Приватные документы видит только компания-владелец."
      />

      <TenderQuestions tender={tender} />
    </div>
  )
}

/** Хелпер регион-карточки: ОКПД2 подписью, если он задан. */
function okpd2Hint(okpd2: string | null | undefined): string | undefined {
  return okpd2 != null && okpd2 !== '' ? `ОКПД2 ${okpd2}` : undefined
}

/** Порядок ключей timeline по ходу процедуры; неизвестные — в конец. */
function timelineOrder(key: string): number {
  const index = Object.keys(TIMELINE_LABELS).indexOf(key)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}
