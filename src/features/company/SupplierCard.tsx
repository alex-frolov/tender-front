import { useQuery } from '@tanstack/react-query'
import { getSupplier } from '@/api/planning'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  SUPPLIER_VERIFICATION_BADGE_VARIANTS,
  SUPPLIER_VERIFICATION_LABELS,
} from '@/lib/company'
import { apiErrorMessage, isApiError } from '@/lib/errors'

/** Список строк тегами; пустой — прочерк. */
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
 * Карточка поставщика (GET /suppliers/{supplierId}): профиль, рейтинг и
 * результаты проверок (РНП, суды — из плагина).
 *
 * Показывается по идентификатору компании — например, стороне договора или
 * участнику, чья заявка уже раскрыта. Профиля может не быть вовсе (компания
 * его не заполняла): тогда API отвечает 404, и это не ошибка, а «нет данных».
 *
 * `checks` — свободная карта плагина: набор проверок не фиксирован контрактом,
 * поэтому выводим что пришло, а не заранее известные поля.
 */
export function SupplierCard({ supplierId }: { supplierId: string }) {
  const supplierQuery = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn: () => getSupplier(supplierId),
    enabled: supplierId !== '',
    retry: false,
  })

  const supplier = supplierQuery.data
  const notFound = isApiError(supplierQuery.error) && supplierQuery.error.code === 'not_found'
  const checks = Object.entries(supplier?.checks ?? {})

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Поставщик</CardTitle>
        <CardDescription>
          Профиль компании-исполнителя: категории, рейтинг и проверки площадки.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {supplierQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">Загружаем карточку…</p>
        ) : notFound ? (
          <p className="text-muted-foreground text-sm">
            Профиль поставщика не заполнен.
          </p>
        ) : supplierQuery.isError ? (
          <div className="space-y-3">
            <p className="text-destructive text-sm">
              Не удалось загрузить карточку: {apiErrorMessage(supplierQuery.error)}
            </p>
            <Button variant="outline" size="sm" onClick={() => void supplierQuery.refetch()}>
              Повторить
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{supplier?.legal_name || 'Без названия'}</span>
              {supplier?.inn != null && (
                <span className="text-muted-foreground text-xs">ИНН {supplier.inn}</span>
              )}
              {supplier?.verification_status != null && (
                <Badge
                  variant={SUPPLIER_VERIFICATION_BADGE_VARIANTS[supplier.verification_status]}
                >
                  {SUPPLIER_VERIFICATION_LABELS[supplier.verification_status]}
                </Badge>
              )}
              {supplier?.rnp_blocked === true && (
                <Badge variant="danger">В реестре недобросовестных поставщиков</Badge>
              )}
              <span className="text-muted-foreground text-sm">
                Рейтинг: {supplier?.rating != null ? supplier.rating.toFixed(1) : '—'}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="text-muted-foreground text-xs">Категории</div>
              <TagList items={supplier?.categories ?? []} />
            </div>

            <div className="space-y-1.5">
              <div className="text-muted-foreground text-xs">Компетенции</div>
              <TagList items={supplier?.capabilities ?? []} />
            </div>

            {checks.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-muted-foreground text-xs">Проверки</div>
                <dl className="grid gap-2 sm:grid-cols-2">
                  {checks.map(([key, value]) => (
                    <div key={key} className="rounded-lg border p-2 text-sm">
                      <dt className="text-muted-foreground text-xs">{key}</dt>
                      <dd className="font-mono text-xs">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
