import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getRolePermissions,
  listPermissions,
  updateRolePermissions,
  type ConfigurableRole,
  type Permission,
  type PermissionGroup,
} from '@/api/platform'
import { useAuth } from '@/features/auth/AuthContext'
import { apiErrorMessage } from '@/lib/errors'
import { ROLE_LABELS } from '@/lib/users'
import { AccessDeniedCard } from './AccessDeniedCard'

const PERMISSIONS_KEY = ['permissions'] as const
const ROLE_PERMISSIONS_KEY = ['role-permissions'] as const

/** Роли, у которых набор прав настраивается (контракт PUT /role-permissions). */
const CONFIGURABLE_ROLES: readonly ConfigurableRole[] = ['manager', 'agent']

/** Русские подписи групп каталога прав. */
const GROUP_LABELS: Record<PermissionGroup, string> = {
  common: 'Общие',
  customer: 'Заказчик',
  supplier: 'Поставщик',
  platform: 'Площадка',
}

/** Порядок групп — по ходу процедуры, платформенные права в конце. */
const GROUP_ORDER: readonly PermissionGroup[] = ['common', 'customer', 'supplier', 'platform']

/** Состояние матрицы: роль → код права → включено. */
type Matrix = Record<ConfigurableRole, Record<string, boolean>>

/**
 * Несохранённые правки — по ролям отдельно: «Сохранить» на одной роли не должен
 * трогать черновик другой (сохраняем и отправляем мы тоже по одной роли).
 */
type Draft = { [K in ConfigurableRole]?: Record<string, boolean> }

const EMPTY_MATRIX: Matrix = { manager: {}, agent: {} }

/** Группировка каталога прав по группам, в фиксированном порядке. */
function groupPermissions(permissions: Permission[]): [PermissionGroup, Permission[]][] {
  const groups = new Map<PermissionGroup, Permission[]>()
  for (const permission of permissions) {
    const group = permission.group ?? 'common'
    const bucket = groups.get(group)
    if (bucket == null) groups.set(group, [permission])
    else bucket.push(permission)
  }
  return GROUP_ORDER.filter((group) => groups.has(group)).map((group) => [
    group,
    groups.get(group) ?? [],
  ])
}

/**
 * Права ролей (/settings/role-permissions, только platform_admin).
 *
 * Настраиваются ТОЛЬКО «Менеджер» и «Агент»: у admin и platform_admin полный
 * набор всегда (ролевая иерархия FR-1.5.2), поэтому в контракте PUT
 * принимает лишь эти две роли.
 *
 * Изменения применяются немедленно и на всю площадку, поэтому правки копятся
 * локально и уходят одним «Сохранить» на роль — по одному PUT на изменённую
 * роль (тело — полная карта «код → включено»).
 */
export function RolePermissionsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isPlatformAdmin = user?.role === 'platform_admin'

  const [draft, setDraft] = useState<Draft>({})
  const [error, setError] = useState<string | null>(null)
  const [savedRole, setSavedRole] = useState<ConfigurableRole | null>(null)

  const catalogQuery = useQuery({
    queryKey: PERMISSIONS_KEY,
    queryFn: listPermissions,
    enabled: isPlatformAdmin,
  })
  const rolesQuery = useQuery({
    queryKey: ROLE_PERMISSIONS_KEY,
    queryFn: getRolePermissions,
    enabled: isPlatformAdmin,
  })

  // Матрица с сервера: роль → код → enabled. База для сравнения «что изменено».
  const serverMatrix = useMemo<Matrix>(() => {
    const roles = rolesQuery.data
    if (roles == null) return EMPTY_MATRIX
    const matrix: Matrix = { manager: {}, agent: {} }
    for (const role of CONFIGURABLE_ROLES) {
      for (const item of roles[role] ?? []) {
        if (item.permission_code != null) {
          matrix[role][item.permission_code] = item.enabled === true
        }
      }
    }
    return matrix
  }, [rolesQuery.data])

  const matrix = useMemo<Matrix>(
    () => ({
      manager: draft.manager ?? serverMatrix.manager,
      agent: draft.agent ?? serverMatrix.agent,
    }),
    [draft, serverMatrix],
  )

  const saveMutation = useMutation({
    mutationFn: ({ role, permissions }: { role: ConfigurableRole; permissions: Record<string, boolean> }) =>
      updateRolePermissions(role, permissions),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROLE_PERMISSIONS_KEY })
    },
  })

  if (!isPlatformAdmin) {
    return <AccessDeniedCard>Каталог прав доступен только суперадмину площадки.</AccessDeniedCard>
  }

  function toggle(role: ConfigurableRole, code: string): void {
    setSavedRole(null)
    setDraft((current) => {
      const base = current[role] ?? serverMatrix[role]
      return { ...current, [role]: { ...base, [code]: !(base[code] === true) } }
    })
  }

  /** Изменена ли роль относительно набора с сервера (только по каталогу). */
  function isDirty(role: ConfigurableRole, codes: string[]): boolean {
    return codes.some((code) => (matrix[role][code] === true) !== (serverMatrix[role][code] === true))
  }

  async function handleSave(role: ConfigurableRole, codes: string[]): Promise<void> {
    setError(null)
    setSavedRole(null)
    // Отправляем ПОЛНУЮ карту по каталогу: PUT задаёт набор целиком, а не
    // патчит его — иначе не выключить право, которого нет в теле запроса.
    const permissions: Record<string, boolean> = {}
    for (const code of codes) permissions[code] = matrix[role][code] === true
    try {
      await saveMutation.mutateAsync({ role, permissions })
      setSavedRole(role)
      // Сбрасываем черновик только сохранённой роли — вторая роль ждёт своего
      // «Сохранить» и её несохранённые переключения должны остаться.
      setDraft((current) => {
        const next = { ...current }
        delete next[role]
        return next
      })
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  if (catalogQuery.isLoading || rolesQuery.isLoading) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground text-sm">Загружаем каталог прав…</p>
        </CardContent>
      </Card>
    )
  }

  if (catalogQuery.isError || rolesQuery.isError) {
    const failure = catalogQuery.error ?? rolesQuery.error
    return (
      <Card>
        <CardContent className="space-y-4">
          <p className="text-destructive text-sm">
            Не удалось загрузить права: {apiErrorMessage(failure)}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void catalogQuery.refetch()
              void rolesQuery.refetch()
            }}
          >
            Повторить
          </Button>
        </CardContent>
      </Card>
    )
  }

  const catalog = catalogQuery.data ?? []
  const codes = catalog.map((permission) => permission.code).filter((code): code is string => code != null)
  const grouped = groupPermissions(catalog)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Права ролей</CardTitle>
          <CardDescription>
            Настраиваются роли «Менеджер» и «Агент». У администратора компании и
            суперадмина полный набор прав всегда — их изменить нельзя. Сохранение
            применяется немедленно ко всем пользователям роли.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {CONFIGURABLE_ROLES.map((role) => {
            const dirty = isDirty(role, codes)
            return (
              <Button
                key={role}
                variant={dirty ? 'default' : 'outline'}
                disabled={!dirty || saveMutation.isPending}
                onClick={() => void handleSave(role, codes)}
              >
                {saveMutation.isPending && saveMutation.variables?.role === role
                  ? 'Сохраняем…'
                  : `Сохранить «${ROLE_LABELS[role]}»`}
              </Button>
            )
          })}
          {savedRole != null && (
            <span className="text-sm text-emerald-600">
              Набор прав роли «{ROLE_LABELS[savedRole]}» обновлён.
            </span>
          )}
          {error != null && <span className="text-destructive text-sm">{error}</span>}
        </CardContent>
      </Card>

      {grouped.map(([group, permissions]) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle className="text-base">{GROUP_LABELS[group]}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Право</TableHead>
                  <TableHead className="w-32 text-center">Менеджер</TableHead>
                  <TableHead className="w-32 text-center">Агент</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissions.map((permission) => {
                  const code = permission.code
                  if (code == null) return null
                  return (
                    <TableRow key={code}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{permission.name || code}</span>
                            <Badge variant="outline" className="font-mono text-xs">
                              {code}
                            </Badge>
                          </div>
                          {permission.description != null && permission.description !== '' && (
                            <p className="text-muted-foreground text-xs">{permission.description}</p>
                          )}
                        </div>
                      </TableCell>
                      {CONFIGURABLE_ROLES.map((role) => (
                        <TableCell key={role} className="text-center">
                          <input
                            type="checkbox"
                            className="accent-primary size-4"
                            aria-label={`${permission.name || code} — ${ROLE_LABELS[role]}`}
                            checked={matrix[role][code] === true}
                            onChange={() => toggle(role, code)}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
