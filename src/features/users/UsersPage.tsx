import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { deleteUser, inviteUser, listUsers, type CompanyRole } from '@/api/users'
import { FullPageSpinner } from '@/components/auth/ProtectedRoute'
import { useAuth } from '@/features/auth/AuthContext'
import { apiErrorMessage } from '@/lib/errors'
import {
  ROLE_LABELS,
  VERIFICATION_BADGE_VARIANTS,
  VERIFICATION_LABELS,
} from '@/lib/users'

/** Доступные роли при приглашении (default — agent, как в контракте). */
const INVITE_ROLES: readonly CompanyRole[] = ['admin', 'manager', 'agent']

/**
 * Управление пользователями компании (только admin). Роут /users:
 * список, приглашение, мягкое удаление. Для остальных ролей — заглушка
 * «Нет доступа».
 */
export function UsersPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<CompanyRole>('agent')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Запрос делаем только для admin: для остальных ролей это 403, а запрос не нужен.
  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
    enabled: user?.role === 'admin',
  })

  const inviteMutation = useMutation({
    mutationFn: inviteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  // Прямой заход по URL: не-админам показываем заглушку вместо попытки запроса.
  if (user?.role !== 'admin') {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Нет доступа</CardTitle>
            <CardDescription>Раздел доступен только администраторам компании.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/tenders">К тендерам</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  function resetInviteForm(): void {
    setInviteEmail('')
    setInviteName('')
    setInviteRole('agent')
    setInviteError(null)
  }

  function openInvite(): void {
    resetInviteForm()
    setInviteOpen(true)
  }

  async function handleInviteSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setInviteError(null)
    try {
      await inviteMutation.mutateAsync({
        email: inviteEmail,
        name: inviteName,
        role: inviteRole,
      })
      setInviteOpen(false)
      resetInviteForm()
    } catch (err) {
      setInviteError(apiErrorMessage(err))
    }
  }

  async function handleDelete(targetUser: { id?: string; name?: string; email?: string }): Promise<void> {
    if (targetUser.id == null) return
    const label = targetUser.name || targetUser.email || targetUser.id
    const confirmed = window.confirm(`Удалить пользователя «${label}»? Действие необратимо.`)
    if (!confirmed) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync(targetUser.id)
    } catch (err) {
      // 409 (нельзя удалить последнего админа и т.п.) — показываем как есть.
      setDeleteError(apiErrorMessage(err))
    }
  }

  const currentUserId = user.id
  const items = usersQuery.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Пользователи</h1>
          <p className="text-muted-foreground text-sm">
            Сотрудники вашей компании: роли, статус верификации и удаление.
          </p>
        </div>
        <Button onClick={openInvite}>Пригласить</Button>
      </div>

      {deleteError != null && <p className="text-destructive text-sm">{deleteError}</p>}

      {usersQuery.isLoading ? (
        <FullPageSpinner />
      ) : usersQuery.isError ? (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-destructive text-sm">
              Не удалось загрузить список пользователей: {apiErrorMessage(usersQuery.error)}
            </p>
            <Button variant="outline" onClick={() => void usersQuery.refetch()}>
              Попробовать снова
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Пользователи не найдены. Пригласите первого сотрудника.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const roleLabel = ROLE_LABELS[item.role ?? 'agent']
                  const verificationStatus = item.verification_status ?? 'active'
                  const verificationLabel =
                    VERIFICATION_LABELS[verificationStatus] ?? verificationStatus
                  const isSelf = item.id != null && item.id === currentUserId
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name || '—'}</TableCell>
                      <TableCell>{item.email || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{roleLabel}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={VERIFICATION_BADGE_VARIANTS[verificationStatus]}>
                          {verificationLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {isSelf ? (
                          <span className="text-muted-foreground text-xs">Это вы</span>
                        ) : (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={deleteMutation.isPending}
                            onClick={() => void handleDelete(item)}
                          >
                            Удалить
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {inviteOpen && (
        <div
          className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setInviteOpen(false)}
        >
          <Card
            className="w-full max-w-md"
            onClick={(event) => event.stopPropagation()}
          >
            <CardHeader>
              <CardTitle className="text-lg">Пригласить сотрудника</CardTitle>
              <CardDescription>
                На email будет отправлено приглашение (статус — «Приглашён»).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInviteSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="invite-email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="invite-email"
                    type="email"
                    autoComplete="off"
                    required
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="you@company.ru"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="invite-name" className="text-sm font-medium">
                    Имя
                  </label>
                  <Input
                    id="invite-name"
                    type="text"
                    required
                    maxLength={200}
                    value={inviteName}
                    onChange={(event) => setInviteName(event.target.value)}
                    placeholder="Иван Петров"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Роль</label>
                  <Select
                    value={inviteRole}
                    onValueChange={(value) => setInviteRole(value as CompanyRole)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVITE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {inviteError != null && (
                  <p className="text-destructive text-sm">{inviteError}</p>
                )}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)}>
                    Отмена
                  </Button>
                  <Button type="submit" disabled={inviteMutation.isPending}>
                    {inviteMutation.isPending ? 'Приглашаем…' : 'Пригласить'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}