/**
 * Ключи кэша TanStack Query — единственное место, где они пишутся.
 *
 * Ключ — это одновременно адрес кэша и адрес инвалидации: опечатка в литерале
 * (`'auction-state'` против `'auction_state'`) не ломает сборку, а молча
 * оставляет экран со старыми данными. Поэтому компоненты берут ключи отсюда.
 *
 * Иерархия `[сущность, ...уточнения]`: инвалидация по префиксу
 * (`queryKeys.tenders.all`) задевает все страницы и фильтры этой сущности.
 */
/**
 * Идентификатор в ключе. Пустой допустим: зависимый запрос строит ключ до того,
 * как id загрузился, и выключен через `enabled` — в кэш такой ключ не попадает.
 */
type Id = string | null | undefined

export const queryKeys = {
  // ---------- Тендеры ----------
  tenders: {
    all: ['tenders'] as const,
    /** Страница каталога: фильтры из URL + курсор (null — первая страница). */
    page: (filters: unknown, cursor: string | null) => ['tenders', filters, cursor] as const,
  },
  tender: (tenderId: Id) => ['tender', tenderId] as const,
  tenderAccess: (tenderId: Id) => ['tender-access', tenderId] as const,
  tenderStats: (dimension: string, from: string, to: string) =>
    ['tender-stats', dimension, from, to] as const,
  questions: (tenderId: Id) => ['questions', tenderId] as const,
  favorites: ['favorites'] as const,
  savedSearches: ['saved-searches'] as const,

  // ---------- Заявки ----------
  bids: {
    byTender: (tenderId: Id) => ['bids', tenderId] as const,
    page: (tenderId: Id, cursor: string | null) => ['bids', tenderId, cursor] as const,
  },

  // ---------- Аукционы ----------
  auctions: ['auctions'] as const,
  auctionsStream: ['auctions-stream'] as const,
  auctionState: (auctionId: Id) => ['auction-state', auctionId] as const,
  auctionBids: (auctionId: Id) => ['auction-bids', auctionId] as const,
  auctionStream: (auctionId: Id) => ['auction-stream', auctionId] as const,

  // ---------- Договоры ----------
  contracts: {
    all: ['contracts'] as const,
    page: (status: string, cursor: string | null) => ['contracts', status, cursor] as const,
    /** Договор процедуры (GET /contracts?tender_id=) — блок «Договор» на странице аукциона. */
    byTender: (tenderId: Id) => ['contracts', 'tender', tenderId] as const,
  },
  contract: (contractId: Id) => ['contract', contractId] as const,
  contractTypes: ['contract-types'] as const,
  claims: (contractId: Id) => ['claims', contractId] as const,
  securities: ['securities'] as const,

  // ---------- Документы ----------
  documents: (entityType: string, entityId: Id) =>
    ['documents', entityType, entityId] as const,
  documentTypes: ['document-types'] as const,

  // ---------- Компании ----------
  /** Своя компания актора — инвалидируется после PATCH /companies. */
  company: ['company'] as const,
  companySearch: (q: string) => ['company-search', q] as const,
  companies: {
    all: ['companies'] as const,
    page: (filtersKey: string, cursor: string | null) =>
      ['companies', filtersKey, cursor] as const,
  },
  supplier: (companyId: Id) => ['supplier', companyId] as const,
  supplierProfile: ['supplier-profile'] as const,
  usage: (period: string) => ['usage', period] as const,

  // ---------- Пользователи, планы, уведомления, аналитика ----------
  users: ['users'] as const,
  procurementPlans: ['procurement-plans'] as const,
  notificationSubscriptions: ['notification-subscriptions'] as const,
  dashboard: (period: string) => ['dashboard', period] as const,
  exportJob: (jobId: Id) => ['export', jobId] as const,

  // ---------- Настройки ----------
  apiKeys: ['api-keys'] as const,
  webhooks: ['webhooks'] as const,
  permissions: ['permissions'] as const,
  rolePermissions: ['role-permissions'] as const,
  platformTimezone: ['platform-timezone'] as const,
  rateLimits: ['rate-limits'] as const,
} as const
