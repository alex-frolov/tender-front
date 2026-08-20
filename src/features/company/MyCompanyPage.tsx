import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { updateCompany } from '@/api/endpoints'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FullPageSpinner } from '@/components/auth/ProtectedRoute'
import { useAuth } from '@/features/auth/AuthContext'
import { COMPANY_QUERY_KEY, useCompanyQuery, type Company } from '@/features/company/useCompany'
import {
  COMPANY_STATUS_BADGE_VARIANTS,
  COMPANY_STATUS_LABELS,
  COMPANY_TYPE_LABELS,
} from '@/lib/company'
import { apiErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { CompanyUsageCard } from './CompanyUsageCard'
import { SupplierProfileCard } from './SupplierProfileCard'

/** Пара «ключ — значение» для редактора контактов (contacts — свободный словарь строк). */
interface ContactRow {
  key: string
  value: string
}

function contactsToRows(contacts: Company['contacts']): ContactRow[] {
  if (contacts == null) return []
  return Object.entries(contacts).map(([key, value]) => ({ key, value: String(value ?? '') }))
}

/** Строка «подпись: значение» карточки реквизитов. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-sm">{value || '—'}</div>
    </div>
  )
}

/**
 * Моя компания (/my-company): реквизиты из GET /companies и форма правки
 * PATCH /companies. Правка — только admin (иначе бэкенд вернёт 403), поэтому
 * для остальных ролей форма скрыта. ИНН, тип и статус верификации
 * не редактируются (их нет в CompanyUpdate).
 *
 * Ниже реквизитов — профиль поставщика (для компаний, которые продают) и
 * потребление лимитов (только admin: бэкенд считает его биллинговыми данными).
 */
export function MyCompanyPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const companyQuery = useCompanyQuery()
  const company = companyQuery.data ?? null

  const [editOpen, setEditOpen] = useState(false)
  const [legalName, setLegalName] = useState('')
  const [kpp, setKpp] = useState('')
  const [ogrn, setOgrn] = useState('')
  const [address, setAddress] = useState('')
  const [contactRows, setContactRows] = useState<ContactRow[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Форма наполняется из ответа API (и после сохранения — свежими значениями).
  // При открытой форме синхронизацию выключаем: фоновый рефетч (фокус окна,
  // инвалидация ['company'] из админки) иначе затирает незавершённый ввод.
  useEffect(() => {
    if (company == null || editOpen) return
    setLegalName(company.legal_name ?? '')
    setKpp(company.kpp ?? '')
    setOgrn(company.ogrn ?? '')
    setAddress(company.address ?? '')
    setContactRows(contactsToRows(company.contacts))
  }, [company, editOpen])

  const updateMutation = useMutation({
    mutationFn: updateCompany,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COMPANY_QUERY_KEY })
    },
  })

  if (companyQuery.isLoading) {
    return <FullPageSpinner />
  }

  if (companyQuery.isError) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <p className="text-destructive text-sm">
            Не удалось загрузить компанию: {apiErrorMessage(companyQuery.error)}
          </p>
          <Button variant="outline" onClick={() => void companyQuery.refetch()}>
            Повторить
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (company == null) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-muted-foreground text-sm">Компания не привязана к профилю.</p>
        </CardContent>
      </Card>
    )
  }

  const canEdit = user?.role === 'admin'
  const status = company.verification_status

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setFormError(null)
    setSaved(false)

    // Пустой ключ — строку игнорируем; пустой словарь очищает контакты (empty_data=null).
    const contacts: Record<string, unknown> = {}
    for (const row of contactRows) {
      const key = row.key.trim()
      if (key === '') continue
      contacts[key] = row.value.trim()
    }

    try {
      await updateMutation.mutateAsync({
        legal_name: legalName.trim(),
        kpp: kpp.trim(),
        ogrn: ogrn.trim(),
        address: address.trim(),
        contacts,
      })
      setEditOpen(false)
      setSaved(true)
    } catch (err) {
      setFormError(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Моя компания</h1>
          <p className="text-muted-foreground text-sm">
            Реквизиты организации и статус верификации на площадке.
          </p>
        </div>
        {canEdit && !editOpen && (
          <Button onClick={() => setEditOpen(true)}>Редактировать реквизиты</Button>
        )}
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl">{company.legal_name || 'Без названия'}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {status != null && (
              <Badge variant={COMPANY_STATUS_BADGE_VARIANTS[status] ?? 'neutral'}>
                {COMPANY_STATUS_LABELS[status] ?? status}
              </Badge>
            )}
            {company.type != null && (
              <Badge variant="secondary">{COMPANY_TYPE_LABELS[company.type]}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="ИНН" value={company.inn ?? ''} />
          <Field label="КПП" value={company.kpp ?? ''} />
          <Field label="ОГРН" value={company.ogrn ?? ''} />
          <Field label="Адрес" value={company.address ?? ''} />
          <Field
            label="Верифицирована"
            value={company.verified_at != null ? formatDateTime(company.verified_at) : ''}
          />
          <Field
            label="Зарегистрирована"
            value={company.created_at != null ? formatDateTime(company.created_at) : ''}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Контакты</CardTitle>
        </CardHeader>
        <CardContent>
          {contactsToRows(company.contacts).length === 0 ? (
            <p className="text-muted-foreground text-sm">Контакты не заполнены.</p>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {contactsToRows(company.contacts).map((row) => (
                <div key={row.key} className="space-y-0.5">
                  <dt className="text-muted-foreground text-xs">{row.key}</dt>
                  <dd className="text-sm">{row.value || '—'}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Профиль поставщика имеет смысл только для продающей стороны: у чистого
          заказчика он всегда пустой и лишь путает. */}
      {(company.type === 'supplier' || company.type === 'both') && (
        <SupplierProfileCard canEdit={canEdit} />
      )}

      {canEdit && <CompanyUsageCard />}

      {saved && (
        <p className="text-sm text-green-700 dark:text-green-400">Реквизиты сохранены.</p>
      )}

      {canEdit && editOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Правка реквизитов</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="company-legal-name" className="text-sm font-medium">
                    Наименование
                  </label>
                  <Input
                    id="company-legal-name"
                    value={legalName}
                    onChange={(event) => setLegalName(event.target.value)}
                    maxLength={300}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="company-address" className="text-sm font-medium">
                    Адрес
                  </label>
                  <Input
                    id="company-address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    maxLength={500}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="company-kpp" className="text-sm font-medium">
                    КПП
                  </label>
                  <Input
                    id="company-kpp"
                    value={kpp}
                    onChange={(event) => setKpp(event.target.value)}
                    maxLength={12}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="company-ogrn" className="text-sm font-medium">
                    ОГРН
                  </label>
                  <Input
                    id="company-ogrn"
                    value={ogrn}
                    onChange={(event) => setOgrn(event.target.value)}
                    maxLength={20}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Контакты</div>
                {contactRows.map((row, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <Input
                      value={row.key}
                      onChange={(event) =>
                        setContactRows((rows) =>
                          rows.map((item, i) =>
                            i === index ? { ...item, key: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="phone"
                      className="w-40"
                      aria-label="Название контакта"
                    />
                    <Input
                      value={row.value}
                      onChange={(event) =>
                        setContactRows((rows) =>
                          rows.map((item, i) =>
                            i === index ? { ...item, value: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="+7 999 000-00-00"
                      className="w-64"
                      aria-label="Значение контакта"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setContactRows((rows) => rows.filter((_, i) => i !== index))
                      }
                      aria-label="Удалить контакт"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setContactRows((rows) => [...rows, { key: '', value: '' }])}
                >
                  <Plus className="size-4" />
                  Добавить контакт
                </Button>
              </div>

              {formError != null && <p className="text-destructive text-sm">{formError}</p>}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Сохраняем…' : 'Сохранить'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
