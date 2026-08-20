import { useCallback, useRef, useState } from 'react'

/**
 * Единый формат курсорной пагинации API (см. ревизию спеки: все списки —
 * { items, next_cursor }).
 */
export interface CursorPageData<T> {
  items: T[]
  next_cursor: string | null | undefined
}

export interface UseCursorPageResult<T> {
  items: T[]
  nextCursor: string | null
  /** Идёт первичная загрузка (список пуст). */
  isLoading: boolean
  /** Догрузка следующей страницы. */
  isFetchingMore: boolean
  hasMore: boolean
  /** Загрузка следующей страницы (дозапись в конец списка). */
  loadMore: (fetcher: (cursor: string | null) => Promise<CursorPageData<T>>) => Promise<void>
  /** Сброс состояния (смена фильтров / переход на другую страницу). */
  reset: () => void
}

/**
 * Курсорная пагинация («Показать ещё»): хранит накопленные items и next_cursor.
 * Удобно для списков тендеров, ставок аукциона и т.п.
 */
export function useCursorPage<T>(): UseCursorPageResult<T> {
  const [items, setItems] = useState<T[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isFetchingMore, setIsFetchingMore] = useState(false)

  const nextCursorRef = useRef<string | null>(null)
  const itemsRef = useRef<T[]>([])
  // Поколение списка: reset() его увеличивает, и ответ на запрос, начатый до
  // сброса, уже не дописывается (смена фильтров/тендера во время загрузки).
  const generationRef = useRef(0)
  // Поколение запроса «в полёте» — гасит повторный вызов того же loadMore
  // (двойной клик по «Показать ещё», двойной прогон эффекта в StrictMode).
  const inFlightRef = useRef<number | null>(null)

  const updateCursor = useCallback((next: string | null | undefined) => {
    nextCursorRef.current = next ?? null
    setNextCursor(next ?? null)
  }, [])

  const loadMore = useCallback(
    async (fetcher: (cursor: string | null) => Promise<CursorPageData<T>>) => {
      const generation = generationRef.current
      if (inFlightRef.current === generation) return
      inFlightRef.current = generation

      if (itemsRef.current.length === 0) {
        setIsLoading(true)
      }
      setIsFetchingMore(true)
      try {
        const page = await fetcher(nextCursorRef.current)
        // Пока ждали ответ, список сбросили — эта страница уже не от него.
        if (generation !== generationRef.current) return
        itemsRef.current = [...itemsRef.current, ...page.items]
        setItems(itemsRef.current)
        updateCursor(page.next_cursor)
      } finally {
        // Флаги и слот «в полёте» принадлежат актуальному поколению: устаревший
        // запрос не должен гасить индикатор уже идущей загрузки.
        if (generation === generationRef.current) {
          inFlightRef.current = null
          setIsLoading(false)
          setIsFetchingMore(false)
        }
      }
    },
    [updateCursor],
  )

  const reset = useCallback(() => {
    generationRef.current += 1
    inFlightRef.current = null
    nextCursorRef.current = null
    itemsRef.current = []
    setItems([])
    setNextCursor(null)
    setIsLoading(false)
    setIsFetchingMore(false)
  }, [])

  return {
    items,
    nextCursor,
    isLoading,
    isFetchingMore,
    hasMore: nextCursor !== null,
    loadMore,
    reset,
  }
}