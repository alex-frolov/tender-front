import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Paperclip } from 'lucide-react'
import { attachBidDocuments, type Bid } from '@/api/bids'
import { listDocuments } from '@/api/documents'
import { Button } from '@/components/ui/button'
import { DocumentsCard } from '@/features/documents/DocumentsCard'
import { apiErrorMessage } from '@/lib/errors'

/**
 * Часть 2 заявки — приложенные документы.
 *
 * Порядок именно такой, и он продиктован API: документ прикладывается к сущности
 * `bid`, поэтому появиться раньше заявки не может. Сначала заявка подаётся,
 * затем к ней загружаются файлы, и отдельным вызовом
 * (`POST /bids/{bidId}/documents`) задаётся состав части 2.
 *
 * Повторная подача заявки для этого не годится: она заменяет содержимое
 * целиком, а прочитать своё содержимое до вскрытия нельзя — оно зашифровано.
 *
 * Кнопка привязки нужна отдельно от загрузки: загруженный файл ещё не значит
 * «включён в заявку», и заказчик после вскрытия увидит ровно то, что было
 * привязано.
 */
export function BidDocuments({ bid, canEdit }: { bid: Bid; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const bidId = bid.id ?? ''
  const [error, setError] = useState<string | null>(null)
  const [attached, setAttached] = useState(false)

  const documentsQuery = useQuery({
    queryKey: ['documents', 'bid', bidId],
    queryFn: () => listDocuments('bid', bidId),
    enabled: bidId !== '',
  })

  const attachMutation = useMutation({
    mutationFn: (documentIds: string[]) => attachBidDocuments(bidId, documentIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bids', bid.tender_id] })
    },
  })

  const documents = documentsQuery.data ?? []

  async function handleAttach(): Promise<void> {
    setError(null)
    setAttached(false)
    try {
      await attachMutation.mutateAsync(
        documents.map((document) => document.id ?? '').filter((id) => id !== ''),
      )
      setAttached(true)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-2">
      <DocumentsCard
        entityType="bid"
        entityId={bidId}
        canUpload={canEdit}
        title="Часть 2: документы заявки"
        description="Файлы загружаются к заявке, затем включаются в её состав отдельным действием."
      />

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={attachMutation.isPending || documents.length === 0}
            onClick={() => void handleAttach()}
            title={
              documents.length === 0
                ? 'Сначала загрузите файлы к заявке'
                : 'Включить загруженные файлы в состав части 2'
            }
          >
            <Paperclip className="size-4" />
            {attachMutation.isPending
              ? 'Включаем…'
              : `Включить в заявку (${documents.length})`}
          </Button>
          {attached && (
            <span className="text-sm text-emerald-600">
              Состав части 2 обновлён.
            </span>
          )}
          {error != null && <span className="text-destructive text-sm">{error}</span>}
        </div>
      )}
    </div>
  )
}
