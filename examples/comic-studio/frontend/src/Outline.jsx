import { useEffect, useState } from 'react'
import { ChevronRight, ChevronDown, Plus, ImageIcon, BookMarked, Ellipsis, Pencil, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { OutlineSorting, SortableOutlineItem } from './OutlineSorting'
import { client, useAsset } from './client'
import { readPage } from '../../plugin/web/studio.mjs'
import { inspectEpisode } from '../../plugin/web/episode.mjs'

function Thumbnail({ pageId, snapshot, t, onError }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (snapshot) return
    let active = true
    void readPage(client, pageId)
      .then((value) => {
        if (active) setData(value.data)
      })
      .catch((error) => {
        if (active) onError(error)
      })
    return () => {
      active = false
    }
  }, [pageId, snapshot, onError])
  const content = snapshot?.data ?? data
  const result = content?.results.find((item) => item.id === content.currentId) ?? content?.results.at(-1)
  const url = useAsset(result?.asset, onError)
  return (
    <span className="comic-thumbnail">
      {url ? (
        <img src={url} alt="" draggable={false} />
      ) : (
        <ImageIcon aria-label={t('blankPage')} className="size-5 text-muted-foreground/50" />
      )}
    </span>
  )
}

function ItemMenu({ label, busy, t, onRename, onDelete }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon-xs" disabled={busy} aria-label={`${t('more')} · ${label}`}><Ellipsis /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuGroup>
        {onRename && <DropdownMenuItem onSelect={onRename}><Pencil />{t('renameEpisode')}</DropdownMenuItem>}
        <DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 />{t('delete')}</DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}

export function Outline({ comic, page, selectedId, busy, t, notify, onAddEpisode, onAddPage, onSelect, onChange }) {
  const [renaming, setRenaming] = useState(null)
  const [title, setTitle] = useState('')
  const [trashOpen, setTrashOpen] = useState(false)
  const [episodeDetails, setEpisodeDetails] = useState({})
  useEffect(() => {
    let active = true
    void Promise.all((comic?.data.episodes ?? []).map(async (episode) => [episode.id, await inspectEpisode(client, episode.id, { detail: 'summary' })]))
      .then((entries) => { if (active) setEpisodeDetails(Object.fromEntries(entries)) })
      .catch((error) => { if (active) notify(error) })
    return () => { active = false }
  }, [comic, page, notify])
  const episodeLabel = (episode, index) => `${t('episodePrefix')}${index + 1}${t('episodeSuffix')}${episode.title ? ` · ${episode.title}` : ''}`
  const pageLabel = (index) => `${t('pagePrefix')}${index + 1}${t('pageSuffix')}`
  const episodes = comic?.data.episodes ?? []
  const trash = comic?.data.trash ?? []
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center border-b px-2">
        <Button variant="ghost" className="w-full justify-start gap-2 font-normal" onClick={() => client.openTab('lore')}>
          <BookMarked data-icon="inline-start" />{t('loreTab')}
        </Button>
      </div>
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
        <h2 className="text-sm font-medium">{t('episodes')}</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('addEpisode')} disabled={busy || !comic} onClick={onAddEpisode}><Plus /></Button>
          </TooltipTrigger>
          <TooltipContent>{t('addEpisode')}</TooltipContent>
        </Tooltip>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <nav className="flex flex-col gap-3 p-2 pt-3" aria-label={t('episodes')}>
          <OutlineSorting items={episodes.map((item, index) => ({ id: item.id, label: episodeLabel(item, index) }))}
            t={t} onMove={(id, overId) => onChange({ type: 'move', id, overId })}>
            {episodes.map((episode, index) => {
              const label = episodeLabel(episode, index)
              const detail = episodeDetails[episode.id]
              return <SortableOutlineItem key={episode.id} id={episode.id} disabled={busy} t={t}>
                {(dragProps) => <Collapsible defaultOpen>
                  <div className="flex items-center gap-0.5">
                    <CollapsibleTrigger asChild>
                      <Button {...dragProps} variant="ghost" className="group h-10 min-w-0 flex-1 cursor-default touch-pan-y justify-start gap-1 px-2 font-normal">
                        <ChevronRight className="group-data-[state=open]:hidden" />
                        <ChevronDown className="hidden group-data-[state=open]:block" />
                        <span className="min-w-0 flex-1 truncate text-left" title={label}>{label}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{episode.pages.length} {t('pages')}</span>
                      </Button>
                    </CollapsibleTrigger>
                    <ItemMenu label={label} busy={busy} t={t}
                      onRename={() => { setRenaming({ episodeId: episode.id, snapshot: comic }); setTitle(episode.title) }}
                      onDelete={() => onChange({ type: 'delete', id: episode.id })} />
                  </div>
                  <CollapsibleContent>
                    <div className="flex flex-col gap-1 py-1">
                      {detail && <p className="px-3 pb-1 text-xs text-muted-foreground" role="status" aria-label={`${label} · ${t('episodeProgress')}`}>
                        {t('generatedCount')} {detail.progress.generated}/{detail.progress.total} · {t('adoptedCount')} {detail.progress.adopted}/{detail.progress.total}
                        {detail.progress.running > 0 && ` · ${t('generatingCount')} ${detail.progress.running}`}
                        {detail.progress.failed + detail.progress.interrupted > 0 && ` · ${t('incompleteCount')} ${detail.progress.failed + detail.progress.interrupted}`}
                      </p>}
                      <OutlineSorting items={episode.pages.map((item, index) => ({ id: item.id, label: pageLabel(index) }))}
                        t={t} onMove={(id, overId) => onChange({ type: 'move', episodeId: episode.id, id, overId })}>
                        {episode.pages.map((item, index) => <SortableOutlineItem key={item.id} id={item.id} disabled={busy} t={t}>
                          {(dragProps) => <div className="relative">
                            <Button {...dragProps} variant={selectedId === item.id ? 'secondary' : 'ghost'} className="h-auto w-full min-w-0 cursor-default touch-pan-y justify-start gap-3 py-1.5 pl-3 pr-10 font-normal"
                              aria-label={pageLabel(index)} aria-current={selectedId === item.id ? 'page' : undefined}
                              disabled={busy} onClick={() => onSelect(item.id)}>
                              <Thumbnail pageId={item.id} snapshot={page?.data.id === item.id ? page : detail ? { data: { currentId: null, results: [detail.pages.find((entry) => entry.id === item.id)?.image].filter(Boolean) } } : null} t={t} onError={notify} />
                              <span className="min-w-0 truncate text-left">{pageLabel(index)}</span>
                            </Button>
                            <div className="absolute inset-y-0 right-2 flex items-center">
                              <ItemMenu label={pageLabel(index)} busy={busy} t={t}
                                onDelete={() => onChange({ type: 'delete', episodeId: episode.id, id: item.id })} />
                            </div>
                          </div>}
                        </SortableOutlineItem>)}
                      </OutlineSorting>
                      <Button variant="ghost" size="sm" className="justify-start px-3 text-xs font-normal text-muted-foreground"
                        disabled={busy} onClick={() => onAddPage(episode.id)}><Plus data-icon="inline-start" />{t('addPage')}</Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>}
              </SortableOutlineItem>
            })}
          </OutlineSorting>
          {episodes.length === 0 && <p className="px-2 py-4 text-xs leading-relaxed text-muted-foreground">{t('outlineEmpty')}</p>}
        </nav>
      </ScrollArea>
      <footer className="flex shrink-0 flex-col px-4 py-3 text-xs text-muted-foreground">
        <Button variant="ghost" size="sm" className="justify-start px-0 font-normal" onClick={() => setTrashOpen(true)}>
          <Trash2 data-icon="inline-start" />{t('trash')}{trash.length > 0 && ` (${trash.length})`}
        </Button>
      </footer>
      <Dialog open={!!renaming} onOpenChange={open => { if (!open && !busy) setRenaming(null) }}>
        <DialogContent closeLabel={t('close')}>
          <DialogHeader><DialogTitle>{t('renameEpisode')}</DialogTitle><DialogDescription>{t('renameHint')}</DialogDescription></DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={async event => {
            event.preventDefault()
            if (await onChange({ type: 'rename', episodeId: renaming.episodeId, title }, renaming.snapshot)) setRenaming(null)
          }}>
            <FieldGroup><Field><FieldLabel htmlFor="episode-title">{t('name')}</FieldLabel>
              <Input id="episode-title" value={title} onChange={event => setTitle(event.target.value)} disabled={busy} autoFocus />
            </Field></FieldGroup>
            <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setRenaming(null)}>{t('cancel')}</Button>
              <Button type="submit" disabled={busy}>{t('save')}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={trashOpen} onOpenChange={setTrashOpen}>
        <DialogContent closeLabel={t('close')}>
          <DialogHeader><DialogTitle>{t('trash')}</DialogTitle><DialogDescription>{t('trashHint')}</DialogDescription></DialogHeader>
          <ScrollArea className="max-h-[55vh]">
            <div className="flex flex-col gap-2">
              {trash.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t('trashEmpty')}</p>}
              {[...trash].reverse().map(entry => {
                const parent = episodes.find(item => item.id === entry.episodeId)
                const parentIndex = episodes.indexOf(parent)
                const label = entry.kind === 'episode' ? episodeLabel(entry.item, entry.index) : pageLabel(entry.index)
                const blocked = entry.kind === 'page' && !parent
                return <div key={entry.id} data-trash-id={entry.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm" title={label}>{label}</p>
                    <p className="text-xs text-muted-foreground">{entry.kind === 'episode' ? `${entry.item.pages.length} ${t('pages')}` : parent ? episodeLabel(parent, parentIndex) : t('restoreParent')}</p>
                  </div>
                  <Button size="sm" variant="outline" disabled={busy || blocked} onClick={() => onChange({ type: 'restore', id: entry.id })}>
                    <Undo2 data-icon="inline-start" />{t('restore')}
                  </Button>
                </div>
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
