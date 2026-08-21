import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Search, X } from 'lucide-react'
import { searchCompanies, type CompanyBrief } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiErrorMessage } from '@/lib/errors'
import { COMPANY_TYPE_LABELS } from '@/lib/company'

/** Минимальная длина запроса — та же, что требует бэкенд. */
const MIN_QUERY = 2

/**
 * Выбор компании-контрагента по названию или ИНН (GET /companies/search).
 *
 * Раньше в такие поля приходилось вводить uuid: поиска компаний в API не было,
 * реестр доступен только суперадмину. Теперь идентификатор подставляется
 * выбором из подсказки, а показывается человекочитаемое название.
 *
 * Подсказка запрашивается с задержкой в 300 мс: поиск идёт по подстроке, и
 * запрос на каждое нажатие клавиши бил бы по API без всякой пользы.
 */
export function CompanyPicker({
  value,
  onChange,
  label,
  hint,
}: {
  value: string
  onChange: (companyId: string, company: CompanyBrief | null) => void
  label: string
  hint?: string
}) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState<CompanyBrief | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const searchQuery = useQuery({
    queryKey: ['company-search', debounced],
    queryFn: () => searchCompanies(debounced),
    enabled: debounced.length >= MIN_QUERY && selected == null,
    staleTime: 60_000,
  })

  const results = searchQuery.data ?? []

  function pick(company: CompanyBrief): void {
    setSelected(company)
    setQuery('')
    setDebounced('')
    onChange(company.id ?? '', company)
  }

  function clear(): void {
    setSelected(null)
    onChange('', null)
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>

      {selected != null || value !== '' ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Check className="size-4 text-emerald-600" />
          <span className="font-medium">{selected?.legal_name ?? value}</span>
          {selected?.inn != null && (
            <span className="text-muted-foreground text-xs">ИНН {selected.inn}</span>
          )}
          {selected?.type != null && (
            <span className="text-muted-foreground text-xs">
              {COMPANY_TYPE_LABELS[selected.type]}
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto size-7 p-0"
            onClick={clear}
            aria-label="Выбрать другую компанию"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Название или ИНН"
            className="pl-8"
          />
          {debounced.length >= MIN_QUERY && (
            <div className="bg-popover absolute z-20 mt-1 w-full rounded-md border shadow-md">
              {searchQuery.isLoading ? (
                <p className="text-muted-foreground p-3 text-sm">Ищем…</p>
              ) : searchQuery.isError ? (
                <p className="text-destructive p-3 text-sm">
                  {apiErrorMessage(searchQuery.error)}
                </p>
              ) : results.length === 0 ? (
                <p className="text-muted-foreground p-3 text-sm">
                  Ничего не найдено. Ищутся только подтверждённые компании.
                </p>
              ) : (
                <ul className="max-h-64 overflow-auto py-1">
                  {results.map((company) => (
                    <li key={company.id}>
                      <button
                        type="button"
                        className="hover:bg-accent flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm"
                        onClick={() => pick(company)}
                      >
                        <span className="font-medium">{company.legal_name}</span>
                        <span className="text-muted-foreground text-xs">
                          ИНН {company.inn}
                        </span>
                        {company.type != null && (
                          <span className="text-muted-foreground ml-auto text-xs">
                            {COMPANY_TYPE_LABELS[company.type]}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {hint != null && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}
