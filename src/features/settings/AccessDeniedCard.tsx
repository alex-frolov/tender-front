import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Заглушка «нет доступа» для страниц настроек.
 *
 * Показывается и при прямом заходе по URL мимо меню, и когда API ответил 403:
 * права `webhooks.manage` / `api_keys.manage` настраиваемые, поэтому по одной
 * лишь роли фронт не может знать заранее, разрешено ли действие.
 */
export function AccessDeniedCard({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Нет доступа</CardTitle>
        <CardDescription>{children}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link to="/settings/security">К настройкам безопасности</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
