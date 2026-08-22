import { DocumentsCard } from '@/features/documents/DocumentsCard'
import type { AuctionStatus } from './auctionStatus'

/** Стадии, где документы исполнения имеют смысл: от начала работ и дальше. */
const EXECUTION_STATUSES: readonly AuctionStatus[] = [
  'approve',
  'in_work',
  'done_by_performer',
  'claim',
  'done',
  'done_by_claim',
]

/**
 * Документы исполнения по лоту: акты, накладные, фотоотчёты.
 *
 * Отметка «Работы выполнены» (`POST /auctions/{id}/mark-done`) файлов не
 * принимает и принимать не должна — документ живёт своей сущностью и своими
 * версиями. Поэтому порядок такой: исполнитель прикладывает акты сюда, затем
 * отмечает выполнение, а заказчик видит те же файлы перед подтверждением.
 *
 * Сущность привязки — **лот** (`entity_type=lot`), а не аукцион: аукциона в
 * справочнике сущностей документа нет, а лот — то, что реально исполняется,
 * и он остаётся при лоте после закрытия процедуры. Право на загрузку бэкенд
 * проверяет видимостью процедуры, а не тенантом, — иначе исполнитель не мог
 * бы приложить акт к чужому по тенанту лоту.
 *
 * Видимость по умолчанию — публичная: приватный документ видит только своя
 * компания, и приватный акт не дошёл бы до второй стороны вовсе.
 */
export function ExecutionDocuments({
  lotId,
  status,
  isParty,
}: {
  lotId: string | undefined
  status: AuctionStatus | undefined
  isParty: boolean
}) {
  if (lotId == null || lotId === '') return null
  if (status == null || !EXECUTION_STATUSES.includes(status)) return null

  return (
    <DocumentsCard
      entityType="lot"
      entityId={lotId}
      canUpload={isParty}
      defaultVisibility="public"
      title="Документы исполнения"
      description="Акты, накладные и фотоотчёты по лоту. Приложите их до отметки о выполнении — заказчик видит их перед подтверждением."
      uploadHint="Видимость «Приватный» скроет документ от второй стороны — для акта приёмки оставьте «Публичный»."
    />
  )
}
