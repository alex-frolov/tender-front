import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Gavel, FileText } from 'lucide-react'
import { getDashboard, type DashboardPeriod, type Deadline } from '@/api/analytics'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/AuthContext'
import { apiErrorMessage, isApiError } from '@/lib/errors'
import { formatDateTime, formatRemaining } from '@/lib/format'
import { TenderStatsCard } from './TenderStatsCard'

const PERIODS: readonly DashboardPeriod[] = ['day', 'week', 'month']

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  day: 'Сутки',
  week: 'Неделя',
  month: 'Месяц',
}

/**
 * Счётчик: одно число крупно и подпись под ним. Диаграмма здесь не нужна —
 * сравнивать нечего, это три независимые величины.
 */
function StatTile({
  label,
  value,
  hint,
  to,
}: {
  label: string
  value: number | undefined
  hint: string
  to: string
}) {
  return (
    <Link
      to={to}
      className="hover:bg-accent/50 rounded-xl border p-4 transition-colors"
    >
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value ?? '—'}</div>
      <div className="text-muted-foreground mt-1 text-xs">{hint}</div>
    </Link>
  )
}

/** Строка ближайшего срока: что истекает, когда и сколько осталось. */
function DeadlineRow({ deadline }: { deadline: Deadline }) {
  const isTender = deadline.entity_type === 'tender'
  const Icon = isTender ? FileText : Gavel
  const to = isTender ? `/tenders/${deadline.entity_id}` : `/auctions/${deadline.entity_id}`

  return (
    <Link
      to={to}
      className="hover:bg-accent/50 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors"
    >
      <span className="flex items-center gap-2 text-sm">
        <Icon className="text-muted-foreground size-4" />
        {isTender ? 'Приём заявок' : 'Окончание торгов'}
        <span className="text-muted-foreground font-mono text-xs">
          {deadline.entity_id?.slice(0, 8)}
        </span>
      </span>
      <span className="text-sm">
        {deadline.deadline_at != null ? (
          <>
            <span className="tabular-nums">{formatDateTime(deadline.deadline_at)}</span>
            <span className="text-muted-foreground ml-2 text-xs">
              {formatRemaining(deadline.deadline_at)}
            </span>
          </>
        ) : (
          '—'
        )}
      </span>
    </Link>
  )
}

/**
 * Главная (/): счётчики компании, ближайшие сроки и статистика тендеров
 * (GET /dashboard, GET /stats/tenders). Раньше корень просто редиректил
 * на список тендеров.
 *
 * Право `dashboard.view` настраиваемое: admin и суперадмин имеют его всегда,
 * менеджер и агент — по настройке площадки. Поэтому 403 здесь не ошибка,
 * а штатный ответ, и страница объясняет его вместо красной плашки.
 *
 * У пользователя без компании (платформенный админ) дашборда нет вовсе:
 * счётчики считаются по компании, и бэкенд отвечает 409.
 */
export function DashboardPage() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<DashboardPeriod>('week')

  const dashboardQuery = useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => getDashboard(period),
  })

  const data = dashboardQuery.data
  const deadlines = data?.upcoming_deadlines ?? []
  const error = dashboardQuery.error
  const forbidden = isApiError(error) && error.code === 'forbidden'
  const noCompany = user?.company_id == null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Обзор</h1>
          <p className="text-muted-foreground text-sm">
            Что происходит по вашей компании прямо сейчас.
          </p>
        </div>
        <div className="flex gap-1">
          {PERIODS.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={period === value ? 'default' : 'outline'}
              onClick={() => setPeriod(value)}
            >
              {PERIOD_LABELS[value]}
            </Button>
          ))}
        </div>
      </div>

      {noCompany ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Обзор недоступен</CardTitle>
            <CardDescription>
              Счётчики и сроки считаются по компании, а ваш аккаунт к компании не привязан.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/tenders">К тендерам</Link>
            </Button>
          </CardContent>
        </Card>
      ) : forbidden ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Нет доступа к обзору</CardTitle>
            <CardDescription>
              Раздел открывается правом «dashboard.view». Его можно выдать роли в настройках
              площадки — обратитесь к администратору.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/tenders">К тендерам</Link>
            </Button>
          </CardContent>
        </Card>
      ) : dashboardQuery.isError ? (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-destructive text-sm">
              Не удалось загрузить обзор: {apiErrorMessage(error)}
            </p>
            <Button variant="outline" onClick={() => void dashboardQuery.refetch()}>
              Повторить
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Активные тендеры"
              value={data?.active_tenders}
              hint="Опубликованы и идут"
              to="/tenders"
            />
            <StatTile
              label="Мои заявки"
              value={data?.my_bids}
              hint="Поданы вашей компанией"
              to="/tenders"
            />
            <StatTile
              label="Договоры"
              value={data?.my_contracts}
              hint="С вашим участием"
              to="/contracts"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ближайшие сроки</CardTitle>
              <CardDescription>
                Приём заявок и окончание торгов в пределах выбранного периода
                ({PERIOD_LABELS[period].toLowerCase()}).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {dashboardQuery.isLoading ? (
                <p className="text-muted-foreground text-sm">Загружаем сроки…</p>
              ) : deadlines.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  В этом горизонте сроков нет — попробуйте увеличить период.
                </p>
              ) : (
                deadlines.map((deadline) => (
                  <DeadlineRow
                    key={`${deadline.entity_type}-${deadline.entity_id}`}
                    deadline={deadline}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}

      <TenderStatsCard />
    </div>
  )
}
