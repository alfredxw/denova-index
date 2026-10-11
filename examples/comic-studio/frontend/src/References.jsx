import { useEffect, useRef, useState } from 'react'
import { BookOpen, ImagePlus, Paperclip, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyHeader, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { client, useAsset } from './client'
import { libraryItems, savePage, StudioError } from '../../plugin/web/studio.mjs'

function Reference({ reference, t, remove, busy, onError }) {
  const url = useAsset(reference.asset, onError)
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border p-2" data-reference>
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
        {url ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <BookOpen className="size-4 text-muted-foreground" />
        )}
      </div>
      <span className="min-w-0 flex-1 truncate text-sm" title={reference.label}>
        {reference.label}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`${t('remove')} ${reference.label}`}
        disabled={busy}
        onClick={remove}
      >
        <X />
      </Button>
    </div>
  )
}

export function References({ open, onOpenChange, page, perform, refresh, busy, t, onError }) {
  const [library, setLibrary] = useState([])
  const [chosen, setChosen] = useState(new Set())
  const [query, setQuery] = useState('')
  const [loaded, setLoaded] = useState(false)
  const upload = useRef(null)
  useEffect(() => {
    if (!open) return
    let active = true
    setChosen(new Set(page?.data.references.filter((ref) => ref.libraryId).map((ref) => ref.libraryId)))
    setLoaded(false)
    void libraryItems(client)
      .then((items) => {
        if (active) {
          setLibrary(items)
          setLoaded(true)
        }
      })
      .catch((error) => {
        if (active) onError(error)
      })
    return () => {
      active = false
    }
  }, [open, page?.data.id, onError])
  const references = page?.data.references ?? []
  const items = library.filter((item) =>
    `${item.name} ${item.type} ${item.briefDescription}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  )
  const save = async (refs) => {
    if (refs.length > 12) throw new StudioError('LIMIT_EXCEEDED', 'Use at most 12 references')
    await savePage(client, page.data.id, { ...page, data: { ...page.data, references: refs } })
    refresh()
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('close')} className="max-h-[90dvh] gap-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('references')}</DialogTitle>
          <DialogDescription>{t('referenceHint')}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 max-h-[55dvh]">
          <div className="flex flex-col gap-5 pr-3">
            {!!references.filter((ref) => !ref.libraryId).length && (
              <div className="grid gap-2">
                {references
                  .filter((ref) => !ref.libraryId)
                  .map((reference, index) => (
                    <Reference
                      key={reference.asset?.path || index}
                      reference={reference}
                      t={t}
                      busy={busy}
                      onError={onError}
                      remove={() => void perform(() => save(references.filter((ref) => ref !== reference)))}
                    />
                  ))}
              </div>
            )}
            <Button
              variant="outline"
              className="h-16 border-dashed"
              disabled={!page || busy}
              onClick={() => upload.current?.click()}
            >
              <ImagePlus data-icon="inline-start" />
              {t('upload')}
            </Button>
            <input
              ref={upload}
              id="upload"
              type="file"
              className="sr-only"
              tabIndex={-1}
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files)
                event.target.value = ''
                void perform(async () => {
                  if (references.length + files.length > 12)
                    throw new StudioError('LIMIT_EXCEEDED', 'Use at most 12 references')
                  const refs = []
                  for (const file of files) {
                    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[
                      file.type
                    ]
                    if (!ext) throw new StudioError('UNSUPPORTED', 'Unsupported image')
                    const saved = await client.request(
                      `/project-content/assets?path=${encodeURIComponent(`comic/assets/references/${crypto.randomUUID()}.${ext}`)}`,
                      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file },
                    )
                    refs.push({ asset: saved.asset, label: file.name })
                  }
                  await save([...references, ...refs])
                })
              }}
            />
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{t('library')}</h3>
              <Badge variant="secondary">{t('shared')}</Badge>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t('search')}
                aria-label={t('search')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {items.length ? (
              <div className="grid gap-1">
                {items.map((item) => (
                  <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg p-3 hover:bg-muted">
                    <Checkbox
                      disabled={!page || busy}
                      checked={chosen.has(item.id)}
                      onCheckedChange={(checked) =>
                        setChosen((value) => {
                          const next = new Set(value)
                          checked ? next.add(item.id) : next.delete(item.id)
                          return next
                        })
                      }
                    />
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium break-words">{item.name}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {item.briefDescription}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <Empty className="px-2 py-4">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BookOpen />
                  </EmptyMedia>
                  <EmptyTitle>{loaded ? t('noReferences') : t('loading')}</EmptyTitle>
                  <EmptyDescription>{t('libraryEmpty')}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button
            disabled={!page || busy || !loaded}
            onClick={() =>
              void perform(async () => {
                await save([
                  ...references.filter((ref) => !ref.libraryId),
                  ...library
                    .filter((item) => chosen.has(item.id))
                    .map((item) => ({ libraryId: item.id, label: item.name })),
                ])
                onOpenChange(false)
              })
            }
          >
            <Paperclip data-icon="inline-start" />
            {t('useReferences')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
