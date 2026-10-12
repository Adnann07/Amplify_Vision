import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface MissionControlContext {
  mode: string
  mission: string
  objective: string
  destination: string
  phase: string
  spacecraft: string
  propulsion: string
  launchVehicle?: string
  massKg: number
  powerWatts: number
  deltaVKmPerSecond: number
  communicationPercent: number
  reliabilityPercent: number
  scienceInstruments: number
}

interface SourceReference {
  title: string
  description: string
  url: string
}

interface ConversationMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  sources?: SourceReference[]
  groundedInEarthdata?: boolean
}

const WELCOME_MESSAGE =
  'Welcome to Mission Control! Ask me about NASA Earth-science datasets, satellite observations, and scientific data that could help inform your mission.'

const SUGGESTED_QUESTIONS = [
  "Find NASA datasets about Earth's atmosphere.",
  'What NASA datasets are available for ocean temperature?',
  'Find satellite data related to rainfall.',
  'How could Earth-observation data support a research mission?',
]

let nextMessageId = 1

function isSourceReference(value: unknown): value is SourceReference {
  if (!value || typeof value !== 'object') return false
  const source = value as Record<string, unknown>
  if (typeof source.title !== 'string' || typeof source.description !== 'string' || typeof source.url !== 'string') {
    return false
  }
  try {
    const url = new URL(source.url)
    return isTrustedUrl(url)
  } catch {
    return false
  }
}

function isTrustedUrl(value: URL) {
  const trustedHost = ['nasa.gov', 'earthdata.nasa.gov', 'doi.org']
    .some((host) => value.hostname === host || value.hostname.endsWith(`.${host}`))
  return value.protocol === 'https:' && trustedHost && !value.username && !value.password
}

function contextRelevantToQuestion(question: string, context: MissionControlContext) {
  if (!/\b(my|our|this|these|current|selected)\b.{0,45}\b(mission|spacecraft|design|configuration|destination|telemetry|launch|vehicle|objective)\b|\b(my|our)\s+(mass|power|delta.?v|reliability|communication|instrument|propulsion)\b/i.test(question)) {
    return null
  }
  const relevant: Partial<MissionControlContext> = {}
  const add = (...keys: (keyof MissionControlContext)[]) => {
    for (const key of keys) {
      const value = context[key]
      if (value !== undefined) Object.assign(relevant, { [key]: value })
    }
  }
  if (/\b(mission|objective|goal)\b/i.test(question)) add('mode', 'mission', 'objective')
  if (/\b(destination|orbit|planet|moon|earth|mars|mercury|venus|jupiter|saturn|uranus|neptune)\b/i.test(question)) {
    add('destination')
  }
  if (/\b(spacecraft|vehicle|rocket|launch|design|configuration)\b/i.test(question)) {
    add('spacecraft')
    if (/\b(propulsion|engine|thrust)\b/i.test(question)) add('propulsion')
    if (/\b(launch|rocket|vehicle)\b/i.test(question)) add('launchVehicle')
  }
  if (/\b(phase|stage|launch)\b/i.test(question)) add('phase')
  if (/\b(mass|payload)\b/i.test(question)) add('massKg')
  if (/\b(power|solar panel|energy)\b/i.test(question)) add('powerWatts')
  if (/\b(delta.?v|propellant|fuel)\b/i.test(question)) add('deltaVKmPerSecond')
  if (/\b(communication|communications|antenna|signal)\b/i.test(question)) add('communicationPercent')
  if (/\b(reliability|risk)\b/i.test(question)) add('reliabilityPercent')
  if (/\b(science|instrument|camera|sensor)\b/i.test(question)) add('scienceInstruments')
  return Object.keys(relevant).length > 0 ? relevant : null
}

export function MissionControlChat({ context }: { context: MissionControlContext }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ConversationMessage[]>([
    { id: nextMessageId++, role: 'assistant', content: WELCOME_MESSAGE },
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading, open])

  useEffect(() => () => requestRef.current?.abort(), [])

  const requestAnswer = async (conversation: ConversationMessage[]) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/mission-control/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: conversation
            .filter(({ role }) => role === 'user' || role === 'assistant')
            .slice(-10)
            .map(({ role, content }) => ({ role, content })),
          context: contextRelevantToQuestion(conversation.at(-1)?.content ?? '', context),
        }),
      })
      const result: unknown = await response.json()
      if (!response.ok) {
        const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
          ? result.error
          : 'Mission Control could not answer. Please try again.'
        throw new Error(message)
      }
      if (!result || typeof result !== 'object' || !('answer' in result) || typeof result.answer !== 'string') {
        throw new Error('Mission Control returned an invalid response. Please retry.')
      }
      const answer = result.answer
      const sources = 'sources' in result && Array.isArray(result.sources)
        ? result.sources.filter(isSourceReference)
        : []
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId++,
          role: 'assistant',
          content: answer,
          sources,
          groundedInEarthdata: 'groundedInEarthdata' in result && result.groundedInEarthdata === true,
        },
      ])
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return
      setError(caught instanceof Error ? caught.message : 'Mission Control could not answer. Please retry.')
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }

  const sendMessage = (message: string) => {
    const content = message.trim()
    if (!content || loading) return
    const nextConversation = [...messages, { id: nextMessageId++, role: 'user' as const, content }]
    setMessages(nextConversation)
    setInput('')
    void requestAnswer(nextConversation)
    inputRef.current?.focus()
  }

  const retry = () => {
    if (messages.at(-1)?.role === 'user') void requestAnswer(messages)
  }

  const startNewConversation = () => {
    requestRef.current?.abort()
    requestRef.current = null
    setLoading(false)
    setError(null)
    setInput('')
    setMessages([{ id: nextMessageId++, role: 'assistant', content: WELCOME_MESSAGE }])
    inputRef.current?.focus()
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100]">
      {open && (
        <section
          aria-label="NASA Mission Control chat"
          aria-modal="false"
          className="fixed inset-x-3 bottom-3 flex h-[min(680px,calc(100dvh-24px))] flex-col overflow-hidden rounded-3xl border border-sky-200/15 bg-[#071321]/[.98] shadow-[0_28px_100px_rgba(0,0,0,.72)] backdrop-blur-2xl sm:inset-x-auto sm:bottom-24 sm:right-5 sm:h-[min(680px,calc(100dvh-128px))] sm:w-[min(440px,calc(100vw-40px))]"
          role="dialog"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
          }}
        >
          <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900/70 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-sky-300/20 bg-sky-300/10 text-sky-100" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                  <path d="M12 2.8 14.7 9l6.5 2.9-6.5 2.5-2.7 6.8-2.6-6.8L3 11.9 9.4 9 12 2.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  <path d="m19 2 .7 2.1L22 5l-2.3.8L19 8l-.8-2.2L16 5l2.2-.9L19 2Z" fill="currentColor" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">NASA Mission Control</p>
                <p className="text-[10px] uppercase tracking-[0.15em] text-sky-200/65">Earth science · Mission support</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={startNewConversation}
                className="rounded-lg px-2 py-2 text-[10px] font-semibold text-slate-400 transition hover:bg-white/5 hover:text-white"
                aria-label="Start a new conversation"
                title="Start a new conversation"
              >
                New chat
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
                aria-label="Close Mission Control"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                  <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite" aria-relevant="additions">
            {messages.map((message) => (
              <article key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-2xl px-3.5 py-3 ${
                  message.role === 'user'
                    ? 'rounded-br-md border border-sky-300/15 bg-sky-300/10 text-sky-50'
                    : 'rounded-bl-md border border-white/8 bg-slate-900/85 text-slate-200'
                }`}>
                  {message.role === 'assistant' && (
                    <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-sky-200/70">
                      {message.groundedInEarthdata ? 'NASA Earthdata results + explanation' : 'Mission Control · General explanation'}
                    </p>
                  )}
                  <div className="mission-control-answer break-words text-[13px] leading-relaxed">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        h1: ({ children }) => <h3 className="mb-2 mt-3 text-sm font-semibold text-white">{children}</h3>,
                        h2: ({ children }) => <h3 className="mb-2 mt-3 text-sm font-semibold text-white">{children}</h3>,
                        h3: ({ children }) => <h3 className="mb-2 mt-3 text-xs font-semibold text-white">{children}</h3>,
                        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
                        li: ({ children }) => <li>{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                        table: ({ children }) => (
                          <div className="my-3 overflow-x-auto rounded-lg border border-white/10">
                            <table className="w-full border-collapse text-left text-[11px]">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => <thead className="bg-white/5 text-sky-100">{children}</thead>,
                        th: ({ children }) => <th className="border-b border-white/10 px-2.5 py-2 font-semibold">{children}</th>,
                        td: ({ children }) => <td className="border-b border-white/5 px-2.5 py-2 align-top">{children}</td>,
                        a: ({ href, children }) => {
                          if (!href) return <span>{children}</span>
                          try {
                            const url = new URL(href)
                            const cameFromEarthdata = message.sources?.some((source) => source.url === url.href)
                            if (!isTrustedUrl(url) || !cameFromEarthdata) return <span>{children}</span>
                            return <a href={url.href} target="_blank" rel="noopener noreferrer" className="text-sky-200 underline decoration-sky-300/30 underline-offset-2">{children}</a>
                          } catch {
                            return <span>{children}</span>
                          }
                        },
                      }}
                    >
                      {message.content.replace(/<br\s*\/?>/gi, ' · ')}
                    </ReactMarkdown>
                  </div>
                  {!!message.sources?.length && (
                    <div className="mt-3 space-y-2 border-t border-white/10 pt-2.5">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-200/80">Retrieved sources</p>
                      {message.sources.map((source) => (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-xl border border-white/8 bg-black/15 p-2.5 transition hover:border-sky-200/25"
                        >
                          <span className="block text-xs font-medium text-sky-100 underline decoration-sky-300/30 underline-offset-2">
                            {source.title}
                          </span>
                          {source.description && <span className="mt-1 block text-[10px] leading-relaxed text-slate-400">{source.description}</span>}
                          <span className="mt-1 block truncate text-[9px] text-emerald-200/70">{source.url}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}

            {messages.length === 1 && (
              <div className="pt-1">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Suggested questions</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_QUESTIONS.map((question) => (
                    <button
                      key={question}
                      type="button"
                      disabled={loading}
                      onClick={() => sendMessage(question)}
                      className="rounded-xl border border-sky-200/10 bg-slate-900/60 px-3 py-2 text-left text-[10px] leading-relaxed text-slate-300 transition hover:border-sky-200/25 hover:text-white disabled:opacity-50"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-sky-100/75" role="status">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-200/20 border-t-sky-200" />
                Checking mission control and NASA Earthdata…
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-rose-300/20 bg-rose-400/5 p-3 text-xs text-rose-100" role="alert">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={retry}
                  disabled={loading || messages.at(-1)?.role !== 'user'}
                  className="mt-2 rounded-lg border border-rose-100/15 px-3 py-1.5 font-semibold transition hover:bg-rose-100/5 disabled:opacity-40"
                >
                  Retry
                </button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form
            className="border-t border-white/10 bg-slate-950/35 p-3"
            onSubmit={(event) => {
              event.preventDefault()
              sendMessage(input)
            }}
          >
            <label htmlFor="mission-control-message" className="sr-only">Ask Mission Control</label>
            <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-2 focus-within:border-sky-300/35">
              <textarea
                ref={inputRef}
                id="mission-control-message"
                value={input}
                maxLength={4000}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    sendMessage(input)
                  }
                }}
                rows={2}
                placeholder="Ask about Earth science data…"
                className="max-h-28 min-h-10 flex-1 resize-y bg-transparent px-2 py-2 text-xs leading-relaxed text-white outline-none placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-300 text-slate-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Send message"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                  <path d="M3 10h13m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-center text-[9px] leading-relaxed text-slate-500">
              Educational assistant, not an official NASA service. Earthdata search can’t calculate trajectories.
            </p>
          </form>
        </section>
      )}

      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((current) => !current)
          if (!open) window.setTimeout(() => inputRef.current?.focus(), 0)
        }}
        className="ml-auto flex items-center gap-2 rounded-full border border-sky-100/20 bg-sky-300 px-4 py-3 text-xs font-bold text-slate-950 shadow-[0_8px_40px_rgba(14,165,233,.34)] transition hover:-translate-y-0.5 hover:bg-sky-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-100"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <path d="M12 2.8 14.7 9l6.5 2.9-6.5 2.5-2.7 6.8-2.6-6.8L3 11.9 9.4 9 12 2.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        {open ? 'Close Mission Control' : 'Mission Control'}
      </button>
    </div>
  )
}
