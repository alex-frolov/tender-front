import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, ShieldAlert } from 'lucide-react'
import {
  answerQuestion,
  askQuestion,
  fileComplaint,
  listComplaints,
  listQuestions,
} from '@/api/engagement'
import type { components } from '@/api/schema'
import { Badge } from '@/components/ui/badge'
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
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/AuthContext'
import { COMPLAINT_STATUS_BADGE_VARIANTS, COMPLAINT_STATUS_LABELS } from '@/lib/enums'
import { apiErrorMessage, isApiError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { isTenderCustomer } from '@/lib/tenderAccess'

type Tender = components['schemas']['Tender']

/** Значение «по всему тендеру» в выборе лота: пустая строка Select не принимает. */
const WHOLE_TENDER = 'all'

/**
 * Вопросы по тендеру и жалоба на процедуру
 * (GET/POST /tenders/{id}/questions, POST /tenders/{id}/complaints).
 *
 * Право `tenders.qa` настраиваемое (admin — всегда, manager и agent — по
 * настройке площадки), поэтому 403 объясняем текстом, а не красной ошибкой.
 *
 * Отвечает на вопросы только заказчик процедуры — форма ответа показывается
 * ему, остальным виден сам ответ. Жалобы видят обе стороны разбирательства:
 * и подавший, и заказчик.
 *
 * Кнопка подачи жалобы скрыта у заказчика по смыслу, а не по правам: API
 * принимает жалобу и от него (проверено — 201), но жаловаться на собственную
 * процедуру незачем.
 */
export function TenderQuestions({ tender }: { tender: Tender }) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const tenderId = tender.id ?? ''
  const isCustomer = isTenderCustomer(tender, user)

  const questionsQuery = useQuery({
    queryKey: ['questions', tenderId],
    queryFn: () => listQuestions(tenderId),
    enabled: tenderId !== '',
  })

  const [text, setText] = useState('')
  const [lotId, setLotId] = useState<string>(WHOLE_TENDER)
  const [askError, setAskError] = useState<string | null>(null)

  const [complaintOpen, setComplaintOpen] = useState(false)
  const [ground, setGround] = useState('')
  const [complaintText, setComplaintText] = useState('')
  const [complaintError, setComplaintError] = useState<string | null>(null)

  const [answeringId, setAnsweringId] = useState<string | null>(null)
  const [answerText, setAnswerText] = useState('')

  const askMutation = useMutation({
    mutationFn: (input: { text: string; lot_id?: string }) => askQuestion(tenderId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['questions', tenderId] })
    },
  })
  const complaintMutation = useMutation({
    mutationFn: (input: { text: string; ground: string; lot_id?: string }) =>
      fileComplaint(tenderId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['complaints', tenderId] })
    },
  })
  const answerMutation = useMutation({
    mutationFn: ({ questionId, answer }: { questionId: string; answer: string }) =>
      answerQuestion(tenderId, questionId, answer),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['questions', tenderId] })
    },
  })

  // Жалобы по этому тендеру: список видят обе стороны разбирательства.
  const complaintsQuery = useQuery({
    queryKey: ['complaints', tenderId],
    queryFn: () => listComplaints({ tender_id: tenderId }),
    enabled: tenderId !== '',
  })
  const complaints = complaintsQuery.data?.items ?? []

  const lots = tender.lots ?? []
  const questions = questionsQuery.data ?? []
  const forbidden =
    isApiError(questionsQuery.error) && questionsQuery.error.code === 'forbidden'

  async function handleAsk(event: FormEvent): Promise<void> {
    event.preventDefault()
    setAskError(null)
    if (text.trim() === '') {
      setAskError('Введите текст вопроса.')
      return
    }
    try {
      await askMutation.mutateAsync({
        text: text.trim(),
        ...(lotId === WHOLE_TENDER ? {} : { lot_id: lotId }),
      })
      setText('')
    } catch (err) {
      setAskError(apiErrorMessage(err))
    }
  }

  async function handleComplaint(event: FormEvent): Promise<void> {
    event.preventDefault()
    setComplaintError(null)
    if (ground.trim() === '' || complaintText.trim() === '') {
      setComplaintError('Заполните основание и описание.')
      return
    }
    try {
      await complaintMutation.mutateAsync({
        ground: ground.trim(),
        text: complaintText.trim(),
        ...(lotId === WHOLE_TENDER ? {} : { lot_id: lotId }),
      })
      setComplaintOpen(false)
      setGround('')
      setComplaintText('')
    } catch (err) {
      setComplaintError(apiErrorMessage(err))
    }
  }

  async function handleAnswer(questionId: string): Promise<void> {
    setAskError(null)
    if (answerText.trim() === '') {
      setAskError('Введите текст ответа.')
      return
    }
    try {
      await answerMutation.mutateAsync({ questionId, answer: answerText.trim() })
      setAnsweringId(null)
      setAnswerText('')
    } catch (err) {
      setAskError(apiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="size-4" />
            Вопросы по процедуре
          </CardTitle>
          <CardDescription>
            Разъяснения документации: вопросы и ответы видны всем участникам.
          </CardDescription>
        </div>
        {!isCustomer && !complaintOpen && (
          <Button variant="outline" size="sm" onClick={() => setComplaintOpen(true)}>
            <ShieldAlert className="size-4" />
            Подать жалобу
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {questionsQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">Загружаем вопросы…</p>
        ) : forbidden ? (
          <p className="text-muted-foreground text-sm">
            Нет права на раздел вопросов — оно выдаётся ролью («tenders.qa»).
          </p>
        ) : questionsQuery.isError ? (
          <p className="text-destructive text-sm">
            Не удалось загрузить вопросы: {apiErrorMessage(questionsQuery.error)}
          </p>
        ) : questions.length === 0 ? (
          <p className="text-muted-foreground text-sm">Вопросов пока нет.</p>
        ) : (
          <ul className="space-y-3">
            {questions.map((question) => (
              <li key={question.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm">{question.text}</p>
                  {question.lot_id != null && (
                    <Badge variant="secondary">
                      лот {question.lot_id.slice(0, 8)}
                    </Badge>
                  )}
                </div>
                {question.answer != null && question.answer !== '' ? (
                  <div className="bg-muted/50 rounded-md p-2 text-sm">
                    <div className="text-muted-foreground mb-1 text-xs">Ответ заказчика</div>
                    {question.answer}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">Ответа пока нет.</p>
                )}

                {isCustomer && question.id != null && answeringId !== question.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAnsweringId(question.id ?? null)
                      // Правка разъяснения начинается с текущего текста —
                      // повторный ответ допустим и чаще всего это уточнение.
                      setAnswerText(question.answer ?? '')
                    }}
                  >
                    {question.answer != null && question.answer !== ''
                      ? 'Уточнить ответ'
                      : 'Ответить'}
                  </Button>
                )}

                {isCustomer && answeringId === question.id && (
                  <div className="space-y-2">
                    <Textarea
                      value={answerText}
                      onChange={(event) => setAnswerText(event.target.value)}
                      maxLength={4000}
                      rows={3}
                      aria-label="Текст ответа"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={answerMutation.isPending}
                        onClick={() => void handleAnswer(question.id ?? '')}
                      >
                        {answerMutation.isPending ? 'Публикуем…' : 'Опубликовать ответ'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAnsweringId(null)
                          setAnswerText('')
                        }}
                      >
                        Отмена
                      </Button>
                    </div>
                  </div>
                )}
                {question.published_at != null && (
                  <div className="text-muted-foreground text-xs">
                    Опубликован {formatDateTime(question.published_at)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {!forbidden && (
          <form onSubmit={handleAsk} className="space-y-3 border-t pt-4">
            <div className="space-y-1.5">
              <label htmlFor="question-text" className="text-sm font-medium">
                Задать вопрос
              </label>
              <Textarea
                id="question-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={4000}
                rows={3}
                placeholder="Например: какие требования к сроку поставки?"
              />
            </div>

            {lots.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">К чему относится</label>
                <Select value={lotId} onValueChange={setLotId}>
                  <SelectTrigger className="w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={WHOLE_TENDER}>Весь тендер</SelectItem>
                    {lots.map((lot) => (
                      <SelectItem key={lot.id} value={lot.id ?? ''}>
                        Лот {lot.number}: {lot.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {askError != null && <p className="text-destructive text-sm">{askError}</p>}

            <Button type="submit" size="sm" disabled={askMutation.isPending}>
              {askMutation.isPending ? 'Отправляем…' : 'Отправить вопрос'}
            </Button>
          </form>
        )}

        {complaints.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldAlert className="size-4" />
              Жалобы по процедуре
            </div>
            {complaints.map((complaint) => (
              <div key={complaint.id} className="space-y-1 rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="text-sm font-medium">{complaint.ground}</span>
                  {complaint.status != null && (
                    <Badge variant={COMPLAINT_STATUS_BADGE_VARIANTS[complaint.status]}>
                      {COMPLAINT_STATUS_LABELS[complaint.status]}
                    </Badge>
                  )}
                </div>
                <p className="text-sm">{complaint.text}</p>
                {complaint.resolution != null && complaint.resolution !== '' && (
                  <p className="text-muted-foreground text-xs">
                    Решение: {complaint.resolution}
                  </p>
                )}
                {complaint.created_at != null && (
                  <div className="text-muted-foreground text-xs">
                    Подана {formatDateTime(complaint.created_at)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {complaintOpen && (
          <form onSubmit={handleComplaint} className="space-y-3 border-t pt-4">
            <div className="space-y-1.5">
              <label htmlFor="complaint-ground" className="text-sm font-medium">
                Основание
              </label>
              <Input
                id="complaint-ground"
                value={ground}
                onChange={(event) => setGround(event.target.value)}
                placeholder="Например: нарушение сроков размещения документации"
              />
              <p className="text-muted-foreground text-xs">
                По основанию жалоба разбирается — описание его не заменяет.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="complaint-text" className="text-sm font-medium">
                Описание
              </label>
              <Textarea
                id="complaint-text"
                value={complaintText}
                onChange={(event) => setComplaintText(event.target.value)}
                rows={4}
              />
            </div>

            {complaintError != null && (
              <p className="text-destructive text-sm">{complaintError}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setComplaintOpen(false)}
              >
                Отмена
              </Button>
              <Button type="submit" size="sm" disabled={complaintMutation.isPending}>
                {complaintMutation.isPending ? 'Отправляем…' : 'Подать жалобу'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
