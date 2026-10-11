import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAsset } from './client'

function Version({ result, index, selected, current, choose, t, onError }) {
  const url = useAsset(result.asset, onError)
  return (
    <Button
      variant={selected ? 'secondary' : 'ghost'}
      className="h-auto w-full justify-start gap-3 p-3 text-left font-normal"
      onClick={choose}
      data-version
    >
      <img src={url || undefined} alt="" className="h-24 w-16 shrink-0 rounded-sm bg-muted object-contain" />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex items-center gap-2 font-medium">
          {t('version')} {index + 1}
          {current && <Badge variant="outline">{t('adopted')}</Badge>}
        </span>
        <span className="line-clamp-3 whitespace-normal break-words text-xs leading-relaxed text-muted-foreground">
          {result.prompt}
        </span>
      </span>
    </Button>
  )
}

export function HistoryPanel({ open, onOpenChange, page, displayId, onSelect, t, onError }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent closeLabel={t('close')} className="w-[min(90vw,24rem)]">
        <SheetHeader>
          <SheetTitle>{t('history')}</SheetTitle>
          <SheetDescription>{t('historyHint')}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-2 px-3 pb-4">
            {page?.data.results
              .map((result, index) => (
                <Version
                  key={result.id}
                  result={result}
                  index={index}
                  selected={displayId === result.id}
                  current={page.data.currentId === result.id}
                  t={t}
                  onError={onError}
                  choose={() => onSelect(result.id)}
                />
              ))
              .reverse()}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
