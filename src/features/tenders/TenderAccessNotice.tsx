import { useQuery } from '@tanstack/react-query'
import { Lock, ShieldCheck } from 'lucide-react'
import { checkTenderAccess } from '@/api/planning'
import { Card, CardContent } from '@/components/ui/card'
import { apiErrorMessage } from '@/lib/errors'

/**
 * Почему участие закрыто (GET /tenders/{id}/access).
 *
 * Показывается только для закрытых процедур (`access_type: contract_holders`)
 * и только участнику: заказчик к своей процедуре допущен по определению.
 * Ответ API объясняет причину — договора нет, истёк или расторгнут, — и именно
 * это важно участнику: «нет доступа» без причины не подсказывает, что делать.
 */
const REASON_TEXT: Record<string, string> = {
  contract_required: 'Нужен действующий рамочный договор с заказчиком.',
  contract_expired: 'Рамочный договор истёк — участие закрыто до продления.',
  contract_terminated: 'Рамочный договор расторгнут — участие закрыто.',
  ok: 'Доступ открыт.',
}

export function TenderAccessNotice({ tenderId }: { tenderId: string }) {
  const accessQuery = useQuery({
    queryKey: ['tender-access', tenderId],
    queryFn: () => checkTenderAccess(tenderId),
    enabled: tenderId !== '',
  })

  if (accessQuery.isLoading) return null

  if (accessQuery.isError) {
    return (
      <Card>
        <CardContent className="text-destructive py-4 text-sm">
          Не удалось проверить доступ к процедуре: {apiErrorMessage(accessQuery.error)}
        </CardContent>
      </Card>
    )
  }

  const access = accessQuery.data
  const accessible = access?.accessible === true
  const reason = access?.reason ?? null
  const text =
    reason != null && REASON_TEXT[reason] != null
      ? REASON_TEXT[reason]
      : accessible
        ? REASON_TEXT.ok
        : 'Участие в закрытой процедуре ограничено.'

  return (
    <Card
      className={
        accessible
          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
          : 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
      }
    >
      <CardContent className="flex items-center gap-2 py-4 text-sm">
        {accessible ? (
          <ShieldCheck className="size-4 shrink-0" />
        ) : (
          <Lock className="size-4 shrink-0" />
        )}
        <span>
          <span className="font-medium">
            {accessible ? 'Закрытая процедура: доступ есть. ' : 'Закрытая процедура. '}
          </span>
          {text}
        </span>
      </CardContent>
    </Card>
  )
}
