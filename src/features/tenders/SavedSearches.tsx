import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookmarkPlus, Trash2 } from 'lucide-react'
import {
  createSavedSearch,
  listSavedSearches,
  removeSavedSearch,
  type DigestPeriod,
} from '@/api/engagement'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiErrorMessage } from '@/lib/errors'

const DIGEST_PERIODS: readonly DigestPeriod[] = ['none', 'daily', 'weekly']

const DIGEST_LABELS: Record<DigestPeriod, string> = {
  none: 'Без рассылки',
  daily: 'Дайджест раз в день',
  weekly: 'Дайджест раз в неделю',
}

/**
 * Сохранённые поиски (GET/POST/DELETE /saved-searches).
 *
 * Сохраняется тот же набор фильтров, что уходит в GET /tenders, поэтому
 * применение сохранённого поиска — это просто запись его фильтров обратно
 * в query-строку списка: один источник правды на фильтры остаётся URL.
 *
 * `digest_period` включает рассылку новинок по этому поиску — она живёт
 * на бэкенде (дайджест уведомлений), фронт только выбирает периодичность.
 */
export function SavedSearches({
  currentFilters,
  onApply,
}: {
  currentFilters: Record<string, unknown>
  onApply: (filters: Record<string, unknown>) => void
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [digest, setDigest] = useState<DigestPeriod>('none')
  const [error, setError] = useState<string | null>(null)

  const searchesQuery = useQuery({
    queryKey: ['saved-searches'],
    queryFn: listSavedSearches,
    staleTime: 60_000,
  })

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['saved-searches'] })
  }

  const createMutation = useMutation({ mutationFn: createSavedSearch, onSuccess: invalidate })
  const removeMutation = useMutation({ mutationFn: removeSavedSearch, onSuccess: invalidate })

  const searches = searchesQuery.data ?? []
  const hasFilters = Object.keys(currentFilters).length > 0

  async function handleSave(): Promise<void> {
    setError(null)
    if (name.trim() === '') {
      setError('Дайте поиску название.')
      return
    }
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        filters: currentFilters,
        digest_period: digest,
      })
      setOpen(false)
      setName('')
      setDigest('none')
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {searches.map((search) => (
          <span
            key={search.id}
            className="bg-muted/50 flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-3 text-sm"
          >
            <button
              type="button"
              className="hover:underline"
              onClick={() => onApply((search.filters ?? {}) as Record<string, unknown>)}
              title={
                search.digest_period != null && search.digest_period !== 'none'
                  ? DIGEST_LABELS[search.digest_period]
                  : 'Применить фильтры'
              }
            >
              {search.name}
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="size-6 p-0"
              disabled={removeMutation.isPending}
              onClick={() => search.id != null && removeMutation.mutate(search.id)}
              aria-label={`Удалить поиск «${search.name}»`}
            >
              <Trash2 className="size-3" />
            </Button>
          </span>
        ))}

        {!open && (
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasFilters}
            title={
              hasFilters
                ? 'Сохранить текущие фильтры'
                : 'Сначала задайте фильтры — сохранять пустой поиск нечего'
            }
            onClick={() => setOpen(true)}
          >
            <BookmarkPlus className="size-4" />
            Сохранить поиск
          </Button>
        )}
      </div>

      {open && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <div className="space-y-1.5">
            <label htmlFor="search-name" className="text-sm font-medium">
              Название
            </label>
            <Input
              id="search-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              placeholder="Стройка в Липецке"
              className="w-64"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Рассылка</label>
            <Select value={digest} onValueChange={(value) => setDigest(value as DigestPeriod)}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIGEST_PERIODS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {DIGEST_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" disabled={createMutation.isPending} onClick={() => void handleSave()}>
            {createMutation.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          {error != null && <p className="text-destructive w-full text-sm">{error}</p>}
        </div>
      )}
    </div>
  )
}
