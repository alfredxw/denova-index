import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, Check, Columns2, Download, Ellipsis, History, PanelLeftClose, PanelLeftOpen, Plus, Scan, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { client, assetURL, viewSignal } from './client'
import {
  readComic,
  readPage,
  saveDocument,
  createEpisode,
  createPage,
  updateOutline,
  recoverJob,
  adoptResult,
} from '../../plugin/web/studio.mjs'
import zh from '../../plugin/web/locales/zh-CN.json'
import en from '../../plugin/web/locales/en-US.json'
import { Canvas } from './Canvas'
import { References } from './References'
import { Outline } from './Outline'
import { ImageModelPicker } from './ImageModelPicker'
import { HistoryPanel } from './History'

const selectionKey = `denova.comic.page.${client.context.scope.projectId}`

export default function App() {
  const [locale, setLocale] = useState(client.context.locale)
  const t = useCallback((key) => (locale.startsWith('zh') ? zh : en)[key] ?? key, [locale])
  const [comic, setComic] = useState(null)
  const [page, setPage] = useState(null)
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(selectionKey) ?? '')
  const [displayId, setDisplayId] = useState('')
  const [revision, setRevision] = useState(0)
  const [region, setRegion] = useState(null)
  const [selecting, setSelecting] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [outlineVisible, setOutlineVisible] = useState(true)
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 640px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)')
    const update = () => { setCompact(query.matches); setOutlineOpen(false) }
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const [referencesOpen, setReferencesOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const busyRef = useRef(false)
  const pageRef = useRef(null)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  const notify = useCallback(
    (error) => {
      if (viewSignal.aborted) return
      console.error('Comic view operation failed:', error.code || 'RUNTIME_FAILED', error.message)
      setError(t(`errors.${error.code || 'RUNTIME_FAILED'}`))
    },
    [t],
  )
  useEffect(() => {
    if (selectedId) localStorage.setItem(selectionKey, selectedId)
    else localStorage.removeItem(selectionKey)
  }, [selectedId])
  useEffect(() => {
    const appearance = () => {
      setLocale(client.context.locale)
      document.documentElement.dataset.theme = client.context.theme
      document.documentElement.lang = client.context.locale
    }
    const action = (event) => {
      if (event.detail.id === 'references') setReferencesOpen(true)
    }
    const visibility = () => {
      if (client.context.visible) refresh()
    }
    appearance()
    window.addEventListener('denova:appearance', appearance)
    window.addEventListener('denova:refresh', refresh)
    window.addEventListener('denova:visibility', visibility)
    window.addEventListener('denova:page-action', action)
    return () => {
      window.removeEventListener('denova:appearance', appearance)
      window.removeEventListener('denova:refresh', refresh)
      window.removeEventListener('denova:visibility', visibility)
      window.removeEventListener('denova:page-action', action)
    }
  }, [refresh])
  useEffect(() => {
    let active = true
    void (async () => {
      const next = await readComic(client)
      if (!active) return
      setComic(next)
      const target =
        next.data.episodes.flatMap((episode) => episode.pages).find((item) => item.id === selectedId)?.id ??
        next.data.episodes.flatMap((episode) => episode.pages)[0]?.id ??
        ''
      if (target !== selectedId) {
        setSelectedId(target)
        return
      }
      const nextPage = target ? await readPage(client, target) : null
      if (!active) return
      const previous = pageRef.current
      setPage(nextPage)
      pageRef.current = nextPage
      if (previous?.data.id !== nextPage?.data.id) {
        setRegion(null)
        setComparing(false)
        setSelecting(false)
      }
      const newResult = previous?.data.id === target && nextPage?.data.results.length > previous.data.results.length
      if (newResult) setRegion(null)
      setDisplayId((current) => {
        if (!nextPage) return ''
        const { results, currentId } = nextPage.data
        if (newResult) return results.at(-1)?.id ?? ''
        return results.some((item) => item.id === current) ? current : currentId || results.at(-1)?.id || ''
      })
    })().catch((error) => {
      if (active) notify(error)
    })
    return () => {
      active = false
    }
  }, [revision, selectedId, notify])
  const result = page?.data.results.find((item) => item.id === displayId)
  const original = page?.data.results.find((item) => item.id === result?.sourceId)
  const episodeIndex =
    comic?.data.episodes.findIndex((episode) => episode.pages.some((item) => item.id === selectedId)) ?? -1
  const episode = comic?.data.episodes[episodeIndex]
  const pageNumber = (episode?.pages.findIndex((item) => item.id === selectedId) ?? -1) + 1
  const pageLabel = `${t('pagePrefix')}${pageNumber}${t('pageSuffix')}`
  const location = `${t('episodePrefix')}${episodeIndex + 1}${t('episodeSuffix')} / ${pageLabel}`
  const candidate = !!result && result.id !== page?.data.currentId
  useEffect(() => {
    try {
      client.setContext({
        pageId: page?.data.id ?? null,
        episodeId: episode?.id ?? null,
        imageModelId: comic?.data.imageModelId ?? null,
        episodeNumber: episodeIndex + 1,
        pageNumber,
        sourceId: result?.id ?? null,
        selection: region,
        // Full reference text stays in artwork and image requests. The composer
        // only needs compact identity/role hints within its 32 KiB context limit.
        references: (page?.data.references ?? []).map(({ content, libraryId, ...reference }) => content === undefined ? { ...reference, ...(libraryId ? { libraryId } : {}) } : reference),
      })
      client.setPresentation({
        contextLabel: page ? `${pageLabel} · ${region ? t('selection') : t('currentPage')}` : t('emptyTitle'),
        referenceCount: page?.data.references.length ?? 0,
        actions: page ? [{ id: 'references', label: t('attach') }] : [],
        suggestions: result
          ? [
              { label: t('changeDialogue'), prompt: t('dialoguePrompt') },
              { label: t('changeCharacter'), prompt: t('characterPrompt') },
            ]
          : [
              { label: t('generate'), prompt: t('generatePrompt') },
              { label: t('plan'), prompt: t('planPrompt') },
            ],
      })
    } catch (error) {
      notify(error)
    }
  }, [comic, page, episodeIndex, pageNumber, pageLabel, result, region, t, notify])
  async function perform(action) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    client.setState({ busy: true })
    try {
      await action()
      return true
    } catch (error) {
      notify(error)
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
      client.setState({ busy: false })
    }
  }
  function addEpisode() {
    void perform(async () => {
      await createEpisode(client)
      refresh()
    })
  }
  function addPage(episodeId) {
    void perform(async () => {
      const created = await createPage(client, episodeId)
      setSelectedId(created.id)
      setOutlineOpen(false)
      refresh()
    })
  }
  const outline = (
    <Outline
      comic={comic}
      page={page}
      selectedId={selectedId}
      busy={busy}
      t={t}
      notify={notify}
      onAddEpisode={addEpisode}
      onAddPage={addPage}
      onChange={(change, snapshot = comic) => perform(async () => {
        try {
          const saved = await updateOutline(client, snapshot, change)
          setComic(saved)
        } finally {
          refresh()
        }
      })}
      onSelect={(id) => {
        setSelectedId(id)
        setOutlineOpen(false)
      }}
    />
  )
  return (
    <div className="comic-workspace" data-outline-visible={outlineVisible}>
      <aside className="comic-outline" inert={compact || !outlineVisible}>{outline}</aside>
      <main className="@container/canvas flex min-h-0 min-w-0 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b pl-3 pr-12">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t(!compact && outlineVisible ? 'hideOutline' : 'showOutline')}
              aria-expanded={compact ? outlineOpen : outlineVisible}
              onClick={() => compact ? setOutlineOpen(true) : setOutlineVisible(value => !value)}
            >
              {!compact && outlineVisible ? <PanelLeftClose /> : <PanelLeftOpen />}
            </Button>
            <h2 className="truncate text-sm font-medium" title={page ? location : t('page.title')}>
              {page ? location : t('page.title')}
            </h2>
          </div>
          <span className="sr-only shrink-0 text-xs text-muted-foreground @min-[600px]/canvas:not-sr-only">{busy ? t('saving') : t('saved')}</span>
          <ImageModelPicker value={comic?.data.imageModelId} disabled={!comic || busy} t={t} onError={notify}
            onChange={imageModelId => void perform(async () => {
              const saved = await saveDocument(client, 'comic/comic.json', { ...comic, data: { ...comic.data, imageModelId } })
              setComic(saved)
            })} />
          {page && (
            <div className="flex shrink-0 items-center gap-1">
              <div className="flex items-center gap-1">
                <Button
                  variant={selecting ? 'secondary' : 'ghost'}
                  size="sm"
                  className="@max-[600px]/canvas:size-7 @max-[600px]/canvas:p-0"
                  disabled={!result || busy}
                  aria-label={t('select')}
                  title={t('select')}
                  aria-pressed={selecting}
                  onClick={() => setSelecting((value) => !value)}
                >
                  <Scan data-icon="inline-start" />
                  <span className="hidden @min-[600px]/canvas:inline">{t('select')}</span>
                </Button>
                {region && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('clearSelection')}
                    onClick={() => setRegion(null)}
                  >
                    <X />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant={comparing ? 'secondary' : 'ghost'}
                  size="sm"
                  className="@max-[600px]/canvas:size-7 @max-[600px]/canvas:p-0"
                  disabled={!original || busy}
                  aria-label={t('compare')}
                  title={t('compare')}
                  aria-pressed={comparing}
                  onClick={() => setComparing((value) => !value)}
                >
                  <Columns2 data-icon="inline-start" />
                  <span className="hidden @min-[600px]/canvas:inline">{t('compare')}</span>
                </Button>
                <Button variant="ghost" size="sm" className="@max-[600px]/canvas:size-7 @max-[600px]/canvas:p-0"
                  aria-label={t('history')} title={t('history')} disabled={!result || busy} onClick={() => setHistoryOpen(true)}>
                  <History data-icon="inline-start" />
                  <span className="hidden @min-[600px]/canvas:inline">{t('history')}</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={t('more')}>
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        disabled={!result || busy}
                        onSelect={() =>
                          void perform(async () => {
                            const link = document.createElement('a')
                            link.href = await assetURL(result.asset)
                            link.download = result.asset.path.split('/').at(-1)
                            link.click()
                          })
                        }
                      >
                        <Download />
                        {t('download')}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
        </header>
        {error && (
          <Alert variant="destructive" className="m-3 w-auto shrink-0">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!page ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookOpen />
              </EmptyMedia>
              <EmptyTitle>{t('emptyTitle')}</EmptyTitle>
              <EmptyDescription>{t('emptyHint')}</EmptyDescription>
            </EmptyHeader>
            <Button
              disabled={!comic || busy}
              onClick={() => (comic.data.episodes.length ? addPage(comic.data.episodes[0].id) : addEpisode())}
            >
              <Plus data-icon="inline-start" />
              {t(comic?.data.episodes.length ? 'addPage' : 'addEpisode')}
            </Button>
          </Empty>
        ) : (
          <>
            <Canvas
              result={result}
              original={comparing ? original : null}
              region={region}
              setRegion={setRegion}
              selecting={selecting}
              busy={busy}
              t={t}
              onError={notify}
            />
            <footer className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-t px-4 py-2 text-xs">
              <span className="truncate text-muted-foreground">
                {candidate ? t('candidate') : region ? t('regionHint') : t('currentPage')}
              </span>
              {candidate ? (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await adoptResult(client, page.data.id, page, displayId)
                      refresh()
                    })
                  }
                >
                  <Check data-icon="inline-start" />
                  {t('adopt')}
                </Button>
              ) : page.data.jobs.some((job) => job.status === 'running') ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      for (const job of page.data.jobs.filter((job) => job.status === 'running'))
                        await recoverJob(client, page.data.id, job)
                      refresh()
                    })
                  }
                >
                  {t('recover')}
                </Button>
              ) : (
                <span className="shrink-0 text-muted-foreground">{t('wholePage')}</span>
              )}
            </footer>
          </>
        )}
      </main>
      <Sheet open={outlineOpen} onOpenChange={setOutlineOpen}>
        <SheetContent closeLabel={t('close')} side="left" className="w-[min(85vw,20rem)] gap-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{t('episodes')}</SheetTitle>
            <SheetDescription>{t('outlineEmpty')}</SheetDescription>
          </SheetHeader>
          {outline}
        </SheetContent>
      </Sheet>
      <HistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        page={page}
        displayId={displayId}
        t={t}
        onError={notify}
        onSelect={(id) => {
          setDisplayId(id)
          setRegion(null)
          setComparing(false)
          setHistoryOpen(false)
        }}
      />
      <References
        open={referencesOpen}
        onOpenChange={setReferencesOpen}
        page={page}
        perform={perform}
        refresh={refresh}
        busy={busy}
        t={t}
        onError={notify}
      />
    </div>
  )
}
