import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { addFavorite, listFavorites, removeFavorite } from '@/api/engagement'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Ключ кэша избранного: список общий для всех экранов. */
const FAVORITES_QUERY_KEY = ['favorites'] as const

/**
 * Звёздочка «в избранном» для тендера или лота (POST/DELETE /favorites).
 *
 * Избранное — список, а не флаг на сущности: чтобы понять, отмечен ли тендер,
 * нужен весь список, поэтому он грузится один раз общим запросом и переиспользуется
 * всеми звёздочками на странице (React Query дедуплицирует по ключу).
 *
 * Право `favorites.manage` по умолчанию есть у всех ролей компании; при отказе
 * кнопка просто покажет ошибку в подсказке, а не сломает список.
 */
export function FavoriteToggle({
  entityType,
  entityId,
  className,
}: {
  entityType: 'tender' | 'lot'
  entityId: string
  className?: string
}) {
  const queryClient = useQueryClient()

  const favoritesQuery = useQuery({
    queryKey: FAVORITES_QUERY_KEY,
    queryFn: listFavorites,
    staleTime: 60_000,
  })

  const favorite = favoritesQuery.data?.find(
    (item) => item.entity_type === entityType && item.entity_id === entityId,
  )

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY })
  }

  const addMutation = useMutation({
    mutationFn: () => addFavorite({ entity_type: entityType, entity_id: entityId }),
    onSuccess: invalidate,
  })
  const removeMutation = useMutation({
    mutationFn: (favoriteId: string) => removeFavorite(favoriteId),
    onSuccess: invalidate,
  })

  const pending = addMutation.isPending || removeMutation.isPending
  const marked = favorite != null

  function toggle(): void {
    if (marked && favorite?.id != null) {
      removeMutation.mutate(favorite.id)
    } else if (!marked) {
      addMutation.mutate()
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('size-8 p-0', className)}
      disabled={pending || favoritesQuery.isLoading}
      onClick={(event) => {
        // Звёздочка живёт внутри кликабельной строки — всплытие увело бы
        // пользователя на карточку тендера вместо отметки.
        event.preventDefault()
        event.stopPropagation()
        toggle()
      }}
      aria-pressed={marked}
      aria-label={marked ? 'Убрать из избранного' : 'В избранное'}
      title={marked ? 'Убрать из избранного' : 'В избранное'}
    >
      <Star className={cn('size-4', marked && 'fill-amber-400 text-amber-500')} />
    </Button>
  )
}
