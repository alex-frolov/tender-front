import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/features/auth/AuthContext'
import { apiErrorMessage } from '@/lib/errors'

const ORG_TYPE_LABELS = {
  customer: 'Заказчик',
  supplier: 'Поставщик',
  both: 'Заказчик и поставщик',
} as const

export function RegisterPage() {
  const { register } = useAuth()

  const [companyName, setCompanyName] = useState('')
  const [inn, setInn] = useState('')
  const [orgType, setOrgType] = useState<'customer' | 'supplier' | 'both'>('customer')
  const [userName, setUserName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [locale, setLocale] = useState<'ru' | 'en'>('ru')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await register({
        company_name: companyName,
        inn,
        org_type: orgType,
        email,
        password,
        user_name: userName,
        locale,
      })
      setSuccess(true)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Регистрация завершена</CardTitle>
            <CardDescription>
              Подтвердите email по ссылке из письма, отправленного на адрес <b>{email}</b>.
              После подтверждения вы сможете войти в систему.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/login">На логин</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Регистрация</CardTitle>
          <CardDescription>
            Создайте компанию и первый аккаунт администратора. Мы отправим письмо для подтверждения email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="reg-company" className="text-sm font-medium">
                Название компании
              </label>
              <Input
                id="reg-company"
                required
                maxLength={300}
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="ООО «Пример»"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reg-inn" className="text-sm font-medium">
                ИНН
              </label>
              <Input
                id="reg-inn"
                required
                pattern="\d{10}(\d{2})?"
                maxLength={12}
                value={inn}
                onChange={(event) => setInn(event.target.value.replace(/\D/g, ''))}
                placeholder="10 цифр для юрлица, 12 — для ИП"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium">Тип организации</span>
              <Select value={orgType} onValueChange={(value) => setOrgType(value as typeof orgType)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Выберите тип" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ORG_TYPE_LABELS) as Array<keyof typeof ORG_TYPE_LABELS>).map(
                    (key) => (
                      <SelectItem key={key} value={key}>
                        {ORG_TYPE_LABELS[key]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reg-name" className="text-sm font-medium">
                Ваше имя
              </label>
              <Input
                id="reg-name"
                required
                maxLength={200}
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
                placeholder="Иван Петров"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reg-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.ru"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reg-password" className="text-sm font-medium">
                Пароль
              </label>
              <Input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Минимум 8 символов"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium">Язык интерфейса</span>
              <Select value={locale} onValueChange={(value) => setLocale(value as typeof locale)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Выберите язык" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ru">Русский</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error != null && <p className="text-destructive text-sm">{error}</p>}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Регистрируем…' : 'Зарегистрироваться'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Уже есть аккаунт?{' '}
            <Link to="/login" className="text-primary underline-offset-4 hover:underline">
              Войти
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}