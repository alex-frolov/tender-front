import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClaim, listClaims, resolveClaim, type ClaimOutcome, type ClaimStage } from '@/api/endpoints'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { formatMoney } from '@/lib/money'
import {
  CLAIM_OUTCOME_LABELS,
  CLAIM_STAGE_LABELS,
  CLAIM_STATUS_BADGE_VARIANTS,
  CLAIM_STATUS_LABELS,
} from '@/lib/contracts'

const STAGES: readonly ClaimStage[] = ['approve', 'in_work', 'done_by_performer']
const OUTCOMES: readonly ClaimOutcome[] = ['rejected', 'settled', 'accepted', 'terminate_contract']

/** Рубли из формы → minor units (целые копейки). */
function toMinor(value: string): number | null {
  const parsed = Number(value.replace(',', '.'))
  if (!Number.isFinite(parsed) || value.trim() === '') return null
  return Math.round(parsed * 100)
}

/**
 * Претензии по договору (GET/POST /claims, POST /claims/{id}/resolve).
 *
 * Претензия приостанавливает работы: аукцион уходит в статус «Претензия»,
 * и до её урегулирования исполнение не двигается. Выставляет и урегулирует
 * только заказчик (право claims.manage), исполнитель видит разбирательство
 * против себя — поэтому список показывается обеим сторонам, а формы нет.
 */
export function ContractClaims({
  contractId,
  canManage,
}: {
  contractId: string
  canManage: boolean
}) {
  const queryClient = useQueryClient()
  const claimsQuery = useQuery({
    queryKey: ['claims', contractId],
    queryFn: () => listClaims({ contract_id: contractId }),
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [stage, setStage] = useState<ClaimStage>('in_work')
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<ClaimOutcome>('settled')
  const [resolution, setResolution] = useState('')
  const [error, setError] = useState<string | null>(null)

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['claims', contractId] })
    void queryClient.invalidateQueries({ queryKey: ['contract', contractId] })
    // Претензия двигает статус аукциона — список аукционов больше не актуален.
    void queryClient.invalidateQueries({ queryKey: ['auctions'] })
  }

  const createMutation = useMutation({ mutationFn: createClaim, onSuccess: invalidate })
  const resolveMutation = useMutation({
    mutationFn: ({ claimId, ...rest }: { claimId: string; outcome: ClaimOutcome; resolution: string }) =>
      resolveClaim(claimId, rest.outcome, rest.resolution),
    onSuccess: invalidate,
  })

  const claims = claimsQuery.data?.items ?? []

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    const amountMinor = toMinor(amount)
    if (reason.trim() === '') {
      setError('Укажите основание претензии.')
      return
    }
    if (amountMinor == null || amountMinor < 0) {
      setError('Сумма претензии — неотрицательное число.')
      return
    }
    try {
      await createMutation.mutateAsync({
        contract_id: contractId,
        stage,
        reason: reason.trim(),
        ...(description.trim() === '' ? {} : { description: description.trim() }),
        amount_minor: amountMinor,
      })
      setCreateOpen(false)
      setReason('')
      setDescription('')
      setAmount('')
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  async function handleResolve(claimId: string): Promise<void> {
    setError(null)
    try {
      await resolveMutation.mutateAsync({ claimId, outcome, resolution: resolution.trim() })
      setResolvingId(null)
      setResolution('')
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Претензии</h3>
        {canManage && !createOpen && (
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            Выставить претензию
          </Button>
        )}
      </div>

      {claimsQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">Загружаем претензии…</p>
      ) : claimsQuery.isError ? (
        <p className="text-destructive text-sm">
          Не удалось загрузить претензии: {apiErrorMessage(claimsQuery.error)}
        </p>
      ) : claims.length === 0 ? (
        <p className="text-muted-foreground text-sm">Претензий по договору нет.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Основание</TableHead>
              <TableHead>Стадия</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Выставлена</TableHead>
              {canManage && <TableHead className="text-right">Действия</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {claims.map((claim) => {
              const status = claim.status
              // Урегулировать можно только неразрешённую претензию: у остальных
              // переход уже выполнен, повтор вернул бы 409.
              const open = status === 'draft' || status === 'submitted'
              return (
                <TableRow key={claim.id}>
                  <TableCell className="max-w-64">
                    <div className="truncate font-medium">{claim.reason}</div>
                    {claim.description != null && (
                      <div className="text-muted-foreground truncate text-xs">
                        {claim.description}
                      </div>
                    )}
                    {claim.resolution != null && (
                      <div className="text-muted-foreground truncate text-xs">
                        Решение: {claim.resolution}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {claim.stage != null ? CLAIM_STAGE_LABELS[claim.stage] : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {claim.amount_minor != null ? formatMoney(claim.amount_minor) : '—'}
                  </TableCell>
                  <TableCell>
                    {status != null ? (
                      <Badge variant={CLAIM_STATUS_BADGE_VARIANTS[status] as BadgeVariant}>
                        {CLAIM_STATUS_LABELS[status]}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {claim.created_at != null ? formatDateTime(claim.created_at) : '—'}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      {open && claim.id != null && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setResolvingId(resolvingId === claim.id ? null : (claim.id ?? null))
                          }
                        >
                          Урегулировать
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {canManage && resolvingId != null && (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="text-sm font-medium">Урегулирование претензии</div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Исход</label>
              <Select value={outcome} onValueChange={(value) => setOutcome(value as ClaimOutcome)}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {CLAIM_OUTCOME_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-64 flex-1 space-y-1.5">
              <label htmlFor="claim-resolution" className="text-sm font-medium">
                Решение
              </label>
              <Input
                id="claim-resolution"
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                maxLength={2000}
                placeholder="Например: работы приняты с уменьшением суммы"
              />
            </div>
            <Button
              size="sm"
              disabled={resolveMutation.isPending}
              onClick={() => void handleResolve(resolvingId)}
            >
              {resolveMutation.isPending ? 'Сохраняем…' : 'Применить'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setResolvingId(null)}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {canManage && createOpen && (
        <form onSubmit={handleCreate} className="space-y-3 rounded-lg border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Стадия исполнения</label>
              <Select value={stage} onValueChange={(value) => setStage(value as ClaimStage)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {CLAIM_STAGE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Должна совпадать с текущей стадией — иначе площадка откажет.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="claim-amount" className="text-sm font-medium">
                Сумма претензии, ₽
              </label>
              <Input
                id="claim-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="150000"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="claim-reason" className="text-sm font-medium">
              Основание
            </label>
            <Input
              id="claim-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              placeholder="Просрочка этапа"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="claim-description" className="text-sm font-medium">
              Описание
            </label>
            <Textarea
              id="claim-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>

          <p className="text-muted-foreground text-xs">
            Работы будут приостановлены до урегулирования претензии.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Выставляем…' : 'Выставить'}
            </Button>
          </div>
        </form>
      )}

      {error != null && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
