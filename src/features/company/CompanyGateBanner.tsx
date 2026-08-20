import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { companyGateHint, type CompanyGate } from '@/features/company/useCompanyGate'

/**
 * Баннер над экранами, где действия заблокированы org_pending-ограничением
 * (FR-1.5.7). Ничего не рисует, пока статус компании грузится или компания
 * подтверждена: пустой экран лучше мигающего предупреждения.
 */
export function CompanyGateBanner({ gate }: { gate: CompanyGate }) {
  if (gate.isLoading || gate.canAct) return null

  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
      <CardContent className="flex items-start gap-3 p-4">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">{companyGateHint(gate.status)}</p>
          <p className="text-muted-foreground">
            Компанию подтверждает администратор платформы. Статус и реквизиты —{' '}
            <Link to="/my-company" className="underline underline-offset-4">
              Моя компания
            </Link>
            . Просмотр тендеров и аукционов доступен без подтверждения.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
