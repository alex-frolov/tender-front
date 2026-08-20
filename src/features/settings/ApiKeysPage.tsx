import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
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
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
  type ApiKey,
  type ApiKeyScope,
} from '@/api/apiKeys'
import { apiErrorMessage, isApiError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { AccessDeniedCard } from './AccessDeniedCard'
import { API_KEY_SCOPES, API_KEY_SCOPE_LABELS } from './apiKeyScopes'

/** Ключ кэша списка ключей. */
const API_KEYS_KEY = ['api-keys'] as const

/** Состояние ключа: отозван / просрочен / активен. */
function keyState(key: ApiKey): { label: string; variant: 'success' | 'neutral' | 'danger' } {
  if (key.revoked_at != null) return { label: 'Отозван', variant: 'danger' }
  if (key.expires_at != null && new Date(key.expires_at).getTime() < Date.now()) {
    return { label: 'Просрочен', variant: 'neutral' }
  }
  return { label: 'Активен', variant: 'success' }
}

/**
 * Плашка с сырым токеном. Токен возвращается ОДИН раз — при выпуске и при
 * ротации; в списке его уже нет (на бэкенде хранится только хэш), поэтому
 * закрытие плашки необратимо и об этом сказано прямо.
 */
function TokenOnce({ token, onClose }: { token: string; onClose: () => void }) {
  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle className="text-base">Токен показан один раз</CardTitle>
        <CardDescription>
          Скопируйте его сейчас: повторно узнать этот токен нельзя — только
          выпустить новый ротацией.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <code className="bg-muted block overflow-x-auto rounded-md p-3 font-mono text-sm">
          {token}
        </code>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void navigator.clipboard?.writeText(token)}
          >
            Скопировать
          </Button>
          <Button type="button" onClick={onClose}>
            Я сохранил
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * API-ключи компании (FR-1.5.13, /settings/api-keys).
 *
 * Ключ выпускается от имени компании и при аутентификации СУЖАЕТ права своего
 * владельца до выбранных scopes (пустой набор или `api:all` — полные права
 * владельца). Токен отдаётся один раз, дальше доступны только отзыв и ротация.
 *
 * Доступ — право `api_keys.manage`: у admin и platform_admin оно есть всегда,
 * менеджеру/агенту его выдаёт суперадмин. Право настраиваемое, поэтому раздел
 * открыт всем ролям, а отказ (403) страница показывает явно.
 */
export function ApiKeysPage() {
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<ApiKeyScope[]>([])
  const [expiresAt, setExpiresAt] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [issuedToken, setIssuedToken] = useState<string | null>(null)

  const keysQuery = useQuery({ queryKey: API_KEYS_KEY, queryFn: listApiKeys, retry: false })

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: API_KEYS_KEY })
  }

  const createMutation = useMutation({ mutationFn: createApiKey, onSuccess: invalidate })
  const rotateMutation = useMutation({ mutationFn: rotateApiKey, onSuccess: invalidate })
  const revokeMutation = useMutation({ mutationFn: revokeApiKey, onSuccess: invalidate })

  // 403 = права api_keys.manage нет. Отличаем его от «сеть/сервер упали»:
  // в первом случае показывать «повторить» бессмысленно.
  if (keysQuery.isError && isApiError(keysQuery.error) && keysQuery.error.code === 'forbidden') {
    return (
      <AccessDeniedCard>
        Управление API-ключами требует права «api_keys.manage». Его выдаёт
        администратор компании или суперадмин площадки.
      </AccessDeniedCard>
    )
  }

  function toggleScope(scope: ApiKeyScope): void {
    setScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    )
  }

  function openCreate(): void {
    setName('')
    setScopes([])
    setExpiresAt('')
    setFormError(null)
    setCreateOpen(true)
  }

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault()
    setFormError(null)
    if (name.trim() === '') {
      setFormError('Укажите название ключа — по нему его отличают в списке.')
      return
    }
    try {
      const issued = await createMutation.mutateAsync({
        name: name.trim(),
        // Пустой набор бэкенд трактует как полный доступ владельца — так и не
        // отправляем поле, чтобы не спорить с этим правилом контракта.
        ...(scopes.length > 0 ? { scopes } : {}),
        // <input type="date"> даёт YYYY-MM-DD, а контракт ждёт date-time.
        ...(expiresAt !== '' ? { expires_at: new Date(expiresAt).toISOString() } : {}),
      })
      setCreateOpen(false)
      setIssuedToken(issued.token)
    } catch (err) {
      setFormError(apiErrorMessage(err))
    }
  }

  async function handleRotate(key: ApiKey): Promise<void> {
    if (key.id == null) return
    if (!window.confirm(`Ротация ключа «${key.name ?? key.id}»: старый токен перестанет работать. Продолжить?`)) {
      return
    }
    setRowError(null)
    try {
      const issued = await rotateMutation.mutateAsync(key.id)
      setIssuedToken(issued.token)
    } catch (err) {
      setRowError(apiErrorMessage(err))
    }
  }

  async function handleRevoke(key: ApiKey): Promise<void> {
    if (key.id == null) return
    if (!window.confirm(`Отозвать ключ «${key.name ?? key.id}»? Запросы с ним начнут получать 401.`)) {
      return
    }
    setRowError(null)
    try {
      await revokeMutation.mutateAsync(key.id)
    } catch (err) {
      setRowError(apiErrorMessage(err))
    }
  }

  const items = keysQuery.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground max-w-2xl text-sm">
          Ключи для доступа к API от имени компании. Ключ не расширяет права
          владельца, а сужает их до выбранных scopes — пустой набор или
          «Полный доступ владельца» оставляет права как есть.
        </p>
        <Button onClick={openCreate}>Выпустить ключ</Button>
      </div>

      {issuedToken != null && (
        <TokenOnce token={issuedToken} onClose={() => setIssuedToken(null)} />
      )}

      {rowError != null && <p className="text-destructive text-sm">{rowError}</p>}

      {createOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Новый ключ</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="key-name" className="text-sm font-medium">
                    Название
                  </label>
                  <Input
                    id="key-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={100}
                    placeholder="Интеграция с 1С"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="key-expires" className="text-sm font-medium">
                    Действует до (необязательно)
                  </label>
                  <Input
                    id="key-expires"
                    type="date"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                  />
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Scopes</legend>
                <p className="text-muted-foreground text-sm">
                  Ничего не выбрано — ключ получает полные права владельца.
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {API_KEY_SCOPES.map((scope) => (
                    <label key={scope} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="accent-primary mt-0.5 size-4"
                        checked={scopes.includes(scope)}
                        onChange={() => toggleScope(scope)}
                      />
                      <span>
                        {API_KEY_SCOPE_LABELS[scope]}
                        <span className="text-muted-foreground block font-mono text-xs">
                          {scope}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {formError != null && <p className="text-destructive text-sm">{formError}</p>}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Выпускаем…' : 'Выпустить'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {keysQuery.isLoading ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-sm">Загружаем ключи…</p>
          </CardContent>
        </Card>
      ) : keysQuery.isError ? (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-destructive text-sm">
              Не удалось загрузить ключи: {apiErrorMessage(keysQuery.error)}
            </p>
            <Button variant="outline" onClick={() => void keysQuery.refetch()}>
              Повторить
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Ключей пока нет. Выпустите первый — токен будет показан один раз.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Состояние</TableHead>
                  <TableHead>Действует до</TableHead>
                  <TableHead>Последнее использование</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((key) => {
                  const state = keyState(key)
                  const keyScopes = key.scopes ?? []
                  const revoked = key.revoked_at != null
                  return (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name || '—'}</TableCell>
                      <TableCell>
                        {keyScopes.length === 0 ? (
                          <span className="text-muted-foreground text-sm">Полный доступ</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {keyScopes.map((scope) => (
                              <Badge key={scope} variant="outline" title={scope}>
                                {API_KEY_SCOPE_LABELS[scope] ?? scope}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={state.variant}>{state.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {key.expires_at != null ? formatDateTime(key.expires_at) : 'Бессрочно'}
                      </TableCell>
                      <TableCell>
                        {key.last_used_at != null ? formatDateTime(key.last_used_at) : '—'}
                      </TableCell>
                      <TableCell className="space-x-2 text-right whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={revoked || rotateMutation.isPending}
                          onClick={() => void handleRotate(key)}
                        >
                          Ротация
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={revoked || revokeMutation.isPending}
                          onClick={() => void handleRevoke(key)}
                        >
                          Отозвать
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
