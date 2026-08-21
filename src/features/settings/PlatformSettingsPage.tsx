import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getPlatformTimezone, getRateLimits, updatePlatformTimezone } from '@/api/platform'
import { useAuth } from '@/features/auth/AuthContext'
import { apiErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { AccessDeniedCard } from './AccessDeniedCard'
import { ContractTypesCard } from './ContractTypesCard'
import { DocumentTypesCard } from './DocumentTypesCard'

const TIMEZONE_KEY = ['platform-timezone'] as const
const RATE_LIMITS_KEY = ['rate-limits'] as const

/**
 * Список IANA-таймзон из самого браузера (Intl). Хардкодить его во фронте
 * незачем: значение проверяет бэкенд (422 на неизвестную зону), а Intl даёт
 * актуальный каталог. В старых движках метода нет — тогда поле остаётся
 * свободным вводом без подсказок.
 */
function supportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
  try {
    return intl.supportedValuesOf?.('timeZone') ?? []
  } catch {
    return []
  }
}

/**
 * Один именованный лимит: `per_tender` в контракте — свободная карта
 * (`additionalProperties`), а на практике бэкенд кладёт в неё такие же тройки
 * {limit, remaining, reset_at}, что и в `global` (например, auction_bids,
 * tender_reads). Разбираем эту форму, а всё непредвиденное показываем как есть,
 * чтобы новый вид лимита не исчезал со страницы молча.
 */
interface NamedLimit {
  limit: string
  remaining: string
  resetAt: string | null
  raw: string | null
}

function parseLimit(value: unknown): NamedLimit {
  if (typeof value !== 'object' || value === null) {
    return { limit: '—', remaining: '—', resetAt: null, raw: value == null ? '—' : String(value) }
  }
  const record = value as Record<string, unknown>
  const limit = record.limit
  const remaining = record.remaining
  const resetAt = record.reset_at
  const known = typeof limit === 'number' || typeof remaining === 'number'
  if (!known) {
    return { limit: '—', remaining: '—', resetAt: null, raw: JSON.stringify(value) }
  }
  return {
    limit: typeof limit === 'number' ? String(limit) : '—',
    remaining: typeof remaining === 'number' ? String(remaining) : '—',
    resetAt: typeof resetAt === 'string' ? resetAt : null,
    raw: null,
  }
}

/**
 * Настройки площадки (/settings/platform, только platform_admin):
 * доменная таймзона и текущие лимиты запросов.
 *
 * Таймзона — не косметика: от неё считаются сроки процедур (`timeline`),
 * поэтому смена применяется ко всем будущим расчётам, и об этом сказано в UI.
 * Лимиты приходят из `GET /rate-limits` только на чтение — менять их через API
 * нельзя (в контракте нет PUT), это параметр развёртывания.
 */
export function PlatformSettingsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isPlatformAdmin = user?.role === 'platform_admin'

  const [timezone, setTimezone] = useState('')
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const timezoneQuery = useQuery({
    queryKey: TIMEZONE_KEY,
    queryFn: getPlatformTimezone,
    enabled: isPlatformAdmin,
  })
  const limitsQuery = useQuery({
    queryKey: RATE_LIMITS_KEY,
    queryFn: getRateLimits,
    enabled: isPlatformAdmin,
  })

  // Поле наполняем текущим значением, пока пользователь его не трогал.
  const currentTimezone = timezoneQuery.data ?? null
  useEffect(() => {
    if (currentTimezone != null) setTimezone(currentTimezone)
  }, [currentTimezone])

  const zones = useMemo(supportedTimeZones, [])

  const updateMutation = useMutation({
    mutationFn: updatePlatformTimezone,
    onSuccess: (next) => {
      queryClient.setQueryData(TIMEZONE_KEY, next)
      setSaved(true)
    },
  })

  if (!isPlatformAdmin) {
    return <AccessDeniedCard>Настройки площадки доступны только суперадмину.</AccessDeniedCard>
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setFormError(null)
    setSaved(false)
    const value = timezone.trim()
    if (value === '') {
      setFormError('Укажите таймзону в формате IANA, например Europe/Moscow.')
      return
    }
    try {
      await updateMutation.mutateAsync(value)
    } catch (err) {
      setFormError(apiErrorMessage(err))
    }
  }

  const limits = limitsQuery.data
  const global = limits?.global
  const perTender = Object.entries(limits?.per_tender ?? {})

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Часовой пояс площадки</CardTitle>
          <CardDescription>
            Доменная таймзона (`tenants.timezone_default`): в ней считаются сроки
            процедур — приём заявок, вскрытие, торги. Смена влияет на расчёты
            будущих публикаций.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {timezoneQuery.isLoading ? (
            <p className="text-muted-foreground text-sm">Загружаем текущее значение…</p>
          ) : timezoneQuery.isError ? (
            <div className="space-y-3">
              <p className="text-destructive text-sm">
                Не удалось загрузить таймзону: {apiErrorMessage(timezoneQuery.error)}
              </p>
              <Button variant="outline" onClick={() => void timezoneQuery.refetch()}>
                Повторить
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="tz" className="text-sm font-medium">
                  IANA-идентификатор
                </label>
                <Input
                  id="tz"
                  list="tz-options"
                  value={timezone}
                  onChange={(event) => {
                    setTimezone(event.target.value)
                    setSaved(false)
                  }}
                  placeholder="Europe/Moscow"
                  className="max-w-sm"
                />
                {zones.length > 0 && (
                  <datalist id="tz-options">
                    {zones.map((zone) => (
                      <option key={zone} value={zone} />
                    ))}
                  </datalist>
                )}
                <p className="text-muted-foreground text-xs">
                  Сейчас: {currentTimezone ?? 'не задана'}
                </p>
              </div>

              {formError != null && <p className="text-destructive text-sm">{formError}</p>}
              {saved && <p className="text-sm text-emerald-600">Таймзона сохранена.</p>}

              <Button
                type="submit"
                disabled={updateMutation.isPending || timezone.trim() === (currentTimezone ?? '')}
              >
                {updateMutation.isPending ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Лимиты запросов</CardTitle>
          <CardDescription>
            Текущие лимиты API — глобальный и по тендерам. Значения только для
            чтения: они задаются конфигурацией развёртывания, а не через API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {limitsQuery.isLoading ? (
            <p className="text-muted-foreground text-sm">Загружаем лимиты…</p>
          ) : limitsQuery.isError ? (
            <div className="space-y-3">
              <p className="text-destructive text-sm">
                Не удалось загрузить лимиты: {apiErrorMessage(limitsQuery.error)}
              </p>
              <Button variant="outline" onClick={() => void limitsQuery.refetch()}>
                Повторить
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Лимит</p>
                  <p className="text-lg font-semibold">{global?.limit ?? '—'}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Остаток</p>
                  <p className="text-lg font-semibold">{global?.remaining ?? '—'}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Сброс счётчика</p>
                  <p className="text-lg font-semibold">
                    {global?.reset_at != null ? formatDateTime(global.reset_at) : '—'}
                  </p>
                </div>
              </div>

              {perTender.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Лимит по тендерам</TableHead>
                      <TableHead>Лимит</TableHead>
                      <TableHead>Остаток</TableHead>
                      <TableHead>Сброс</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perTender.map(([key, value]) => {
                      const parsed = parseLimit(value)
                      return (
                        <TableRow key={key}>
                          <TableCell className="font-mono text-xs">{key}</TableCell>
                          {parsed.raw != null ? (
                            <TableCell colSpan={3} className="font-mono text-xs">
                              {parsed.raw}
                            </TableCell>
                          ) : (
                            <>
                              <TableCell>{parsed.limit}</TableCell>
                              <TableCell>{parsed.remaining}</TableCell>
                              <TableCell>
                                {parsed.resetAt != null ? formatDateTime(parsed.resetAt) : '—'}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ContractTypesCard />

      <DocumentTypesCard />
    </div>
  )
}
