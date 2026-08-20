import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupplierProfile, updateSupplierProfile } from '@/api/endpoints'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { apiErrorMessage } from '@/lib/errors'
import {
  SUPPLIER_VERIFICATION_BADGE_VARIANTS,
  SUPPLIER_VERIFICATION_LABELS,
} from '@/lib/company'

/** Ключ кэша профиля поставщика. */
const SUPPLIER_PROFILE_QUERY_KEY = ['supplier-profile'] as const

/** Список через запятую → массив без пустых элементов и дублей. */
function parseList(value: string): string[] {
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
  return [...new Set(items)]
}

/** Список тегов; пустой показывается прочерком, а не пустотой. */
function TagList({ items }: { items: readonly string[] }) {
  if (items.length === 0) return <span className="text-muted-foreground text-sm">—</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item} variant="secondary">
          {item}
        </Badge>
      ))}
    </div>
  )
}

/**
 * Профиль поставщика своей компании (GET/PUT /suppliers/profile).
 *
 * Категории и компетенции — свободные строки: справочника в контракте нет,
 * бэкенд хранит их как есть. Рейтинг, статус проверки, признак РНП и
 * результаты проверок приходят только на чтение — их ведёт площадка.
 *
 * Правка доступна admin компании (у остальных ролей бэкенд ответит 403,
 * поэтому форму им не показываем).
 */
export function SupplierProfileCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient()
  const profileQuery = useQuery({
    queryKey: SUPPLIER_PROFILE_QUERY_KEY,
    queryFn: getSupplierProfile,
    staleTime: 60_000,
  })
  const profile = profileQuery.data ?? null

  const [editOpen, setEditOpen] = useState(false)
  const [categories, setCategories] = useState('')
  const [capabilities, setCapabilities] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // Как и в реквизитах компании: при открытой форме фоновый рефетч не должен
  // затирать незавершённый ввод.
  useEffect(() => {
    if (profile == null || editOpen) return
    setCategories((profile.categories ?? []).join(', '))
    setCapabilities((profile.capabilities ?? []).join(', '))
  }, [profile, editOpen])

  const updateMutation = useMutation({
    mutationFn: updateSupplierProfile,
    onSuccess: (next) => {
      queryClient.setQueryData(SUPPLIER_PROFILE_QUERY_KEY, next)
    },
  })

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setFormError(null)
    try {
      await updateMutation.mutateAsync({
        categories: parseList(categories),
        capabilities: parseList(capabilities),
        // PUT заменяет профиль целиком, а отсутствующее поле бэкенд считает
        // пустым списком. Документы UI пока не редактирует, поэтому
        // возвращаем их как есть — иначе правка категорий их бы отвязала.
        documents: profile?.documents ?? [],
      })
      setEditOpen(false)
    } catch (err) {
      setFormError(apiErrorMessage(err))
    }
  }

  const status = profile?.verification_status

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Профиль поставщика</CardTitle>
          <CardDescription>
            Категории и компетенции — по ним площадка подбирает поставщиков под закупки.
          </CardDescription>
        </div>
        {canEdit && !editOpen && !profileQuery.isError && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            Редактировать
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {profileQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">Загружаем профиль…</p>
        ) : profileQuery.isError ? (
          <div className="space-y-3">
            <p className="text-destructive text-sm">
              Не удалось загрузить профиль: {apiErrorMessage(profileQuery.error)}
            </p>
            <Button variant="outline" size="sm" onClick={() => void profileQuery.refetch()}>
              Повторить
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {status != null && (
                <Badge variant={SUPPLIER_VERIFICATION_BADGE_VARIANTS[status]}>
                  {SUPPLIER_VERIFICATION_LABELS[status]}
                </Badge>
              )}
              {profile?.rnp_blocked === true && (
                <Badge variant="danger">В реестре недобросовестных поставщиков</Badge>
              )}
              <span className="text-muted-foreground text-sm">
                Рейтинг: {profile?.rating != null ? profile.rating.toFixed(1) : '—'}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="text-muted-foreground text-xs">Категории</div>
              <TagList items={profile?.categories ?? []} />
            </div>

            <div className="space-y-1.5">
              <div className="text-muted-foreground text-xs">Компетенции</div>
              <TagList items={profile?.capabilities ?? []} />
            </div>

            {editOpen && (
              <form onSubmit={handleSubmit} className="space-y-3 border-t pt-4">
                <div className="space-y-1.5">
                  <label htmlFor="supplier-categories" className="text-sm font-medium">
                    Категории
                  </label>
                  <Input
                    id="supplier-categories"
                    value={categories}
                    onChange={(event) => setCategories(event.target.value)}
                    placeholder="строительство, электромонтаж"
                  />
                  <p className="text-muted-foreground text-xs">Через запятую.</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="supplier-capabilities" className="text-sm font-medium">
                    Компетенции
                  </label>
                  <Input
                    id="supplier-capabilities"
                    value={capabilities}
                    onChange={(event) => setCapabilities(event.target.value)}
                    placeholder="проектирование, монтаж под ключ"
                  />
                  <p className="text-muted-foreground text-xs">Через запятую.</p>
                </div>

                {formError != null && <p className="text-destructive text-sm">{formError}</p>}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>
                    Отмена
                  </Button>
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Сохраняем…' : 'Сохранить'}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
