import type { components } from '@/api/schema'
import type { BadgeVariant } from '@/components/ui/badge'

/**
 * Статусы тендера — единственная мапа (тип берётся из сгенерированных схем,
 * компилятор не даст опечататься). Значения строго из спеки TenderStatus.
 */
export type TenderStatus = components['schemas']['TenderStatus']

export const TENDER_STATUS_LABELS: Record<TenderStatus, string> = {
  draft: 'Черновик',
  published: 'Опубликован',
  withdrawn: 'Отозван',
  accepting_bids: 'Приём заявок',
  bidding: 'Торги',
  evaluation: 'Рассмотрение заявок',
  awarding: 'Определение победителя',
  contract: 'Заключение контракта',
  closed: 'Завершён',
  cancelled: 'Отменён',
}

/** Порядок статусов в фильтре — по жизненному циклу тендера. */
export const TENDER_STATUSES: readonly TenderStatus[] = [
  'draft',
  'published',
  'withdrawn',
  'accepting_bids',
  'bidding',
  'evaluation',
  'awarding',
  'contract',
  'closed',
  'cancelled',
]

/**
 * Цвет бейджа для каждого статуса (семантическая палитра
 * дизайн-набросков: зелёный — завершено, янтарный — торги,
 * красный — отменён, синий — инфо/приём заявок, фиолетовый — выбор
 * победителя, серый — нейтральный/черновик).
 */
export const TENDER_STATUS_BADGE_VARIANTS: Record<TenderStatus, BadgeVariant> = {
  draft: 'neutral',
  published: 'info',
  withdrawn: 'neutral',
  accepting_bids: 'info',
  bidding: 'warning',
  evaluation: 'info',
  awarding: 'violet',
  contract: 'info',
  closed: 'success',
  cancelled: 'danger',
}

/** Закон/регулирование процедуры (параметр LawType). */
export type LawType = components['parameters']['LawType']

export const LAW_TYPE_LABELS: Record<LawType, string> = {
  fz44: '44-ФЗ',
  fz223: '223-ФЗ',
  commercial: 'Коммерческий',
}

export const LAW_TYPES: readonly LawType[] = ['fz44', 'fz223', 'commercial']

/** Тип доступа к тендеру (параметр AccessType). */
export type AccessType = components['parameters']['AccessType']

export const ACCESS_TYPE_LABELS: Record<AccessType, string> = {
  open: 'Открытая',
  contract_holders: 'Держатели контрактов',
}

export const ACCESS_TYPES: readonly AccessType[] = ['open', 'contract_holders']

/**
 * Тип процедуры (TenderCreate.procedure_type). В ответе Tender это свободная
 * строка, поэтому при выводе в UI нужен fallback на исходное значение.
 */
export type ProcedureType = components['schemas']['TenderCreate']['procedure_type']

export const PROCEDURE_TYPE_LABELS: Record<ProcedureType, string> = {
  auction: 'Электронный аукцион',
  competition: 'Конкурс',
  rfq: 'Запрос котировок',
  rfp: 'Запрос предложений',
  direct: 'Закупка у единственного поставщика',
}

/**
 * Базис сравнения цены (PriceBasis): по контракту цена лота/ставки трактуется
 * либо без НДС, либо с НДС — от этого зависит сравнение ставок на аукционе.
 */
export type PriceBasis = components['schemas']['PriceBasis']

export const PRICE_BASIS_LABELS: Record<PriceBasis, string> = {
  net: 'Без НДС',
  gross: 'С НДС',
}

/**
 * Ключи Tender.timeline (свободная мапа «ключ → дата», FR-1.1.4). Порядок
 * записей задаёт порядок вывода сроков в карточке; ключ, которого здесь нет
 * (например, добавленный плагином), выводится как есть и уходит в конец.
 */
export const TIMELINE_LABELS: Record<string, string> = {
  bids_start: 'Начало приёма заявок',
  bids_end: 'Окончание приёма заявок',
  opening: 'Вскрытие заявок',
  auction_start: 'Начало торгов',
  evaluation_end: 'Окончание рассмотрения',
}
