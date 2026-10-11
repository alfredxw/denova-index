import { useEffect, useState } from 'react'
import { ChevronDown, ImageIcon, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { client } from './client'

// The host supplies capabilities; the comic owns the choice and its location.
export function ImageModelPicker({ value, disabled, t, onChange, onError }) {
  const [models, setModels] = useState(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let active = true
    client.request('/images/models').then(items => {
      if (active) setModels(items)
    }).catch(error => { if (active) onError(error) })
    return () => { active = false }
  }, [open, onError])
  const selected = models?.find(model => model.id === value)
  const missing = models && value && !selected
  const label = selected?.name || value || t('selectImageModel')
  return <DropdownMenu open={open} onOpenChange={setOpen}>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" className="max-w-40 @max-[480px]/canvas:size-7 @max-[480px]/canvas:p-0" disabled={disabled}
        aria-label={t('imageModel')} title={missing ? t('imageModelMissing') : `${t('imageModel')}: ${label}`}>
        {missing ? <TriangleAlert data-icon="inline-start" className="text-destructive" /> : <ImageIcon data-icon="inline-start" />}
        <span className="truncate @max-[480px]/canvas:hidden">{label}</span>
        <ChevronDown data-icon="inline-end" className="@max-[480px]/canvas:hidden" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="max-w-80">
      <DropdownMenuLabel>{t('imageModel')}</DropdownMenuLabel>
      {missing && <p className="p-2 text-sm text-muted-foreground">{t('imageModelMissing')}</p>}
      <DropdownMenuRadioGroup value={value ?? ''} onValueChange={onChange}>
        {models?.map(model => <DropdownMenuRadioItem key={model.id} value={model.id}>
          <span className="min-w-0 break-words">{model.name || model.id}{!model.imageInput && <span className="block text-xs text-muted-foreground">{t('imageModelTextOnly')}</span>}</span>
        </DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
      {models?.length === 0 && <p className="p-2 text-sm text-muted-foreground">{t('imageModelsEmpty')}</p>}
    </DropdownMenuContent>
  </DropdownMenu>
}
