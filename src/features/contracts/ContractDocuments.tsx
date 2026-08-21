import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileSignature } from 'lucide-react'
import { uploadContractScan } from '@/api/documents'
import { Button } from '@/components/ui/button'
import { DocumentsCard } from '@/features/documents/DocumentsCard'
import { apiErrorMessage } from '@/lib/errors'

/**
 * Документы договора: общий список плюс отдельная кнопка скана
 * (POST /contracts/{id}/scan).
 *
 * Скан — не просто ещё один документ: у него свой эндпоинт, который сам
 * подбирает тип и привязывает файл к договору, поэтому тип выбирать не нужно.
 * Прикладывает любая сторона договора.
 */
export function ContractDocuments({
  contractId,
  isParty,
}: {
  contractId: string
  isParty: boolean
}) {
  const queryClient = useQueryClient()
  const scanInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const scanMutation = useMutation({
    mutationFn: (file: File) => uploadContractScan(contractId, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', 'contract', contractId] })
      void queryClient.invalidateQueries({ queryKey: ['contract', contractId] })
    },
  })

  async function handleScan(file: File | undefined): Promise<void> {
    if (file == null) return
    setError(null)
    try {
      await scanMutation.mutateAsync(file)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      if (scanInputRef.current != null) scanInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <DocumentsCard
        entityType="contract"
        entityId={contractId}
        canUpload={isParty}
        title="Документы договора"
        description="Приложения и сканы. Видимость приватных документов ограничена компанией-владельцем."
      />

      {isParty && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={scanInputRef}
            type="file"
            className="hidden"
            onChange={(event) => void handleScan(event.target.files?.[0])}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={scanMutation.isPending}
            onClick={() => scanInputRef.current?.click()}
          >
            <FileSignature className="size-4" />
            {scanMutation.isPending ? 'Загружаем скан…' : 'Приложить скан договора'}
          </Button>
          {error != null && <span className="text-destructive text-sm">{error}</span>}
        </div>
      )}
    </div>
  )
}
