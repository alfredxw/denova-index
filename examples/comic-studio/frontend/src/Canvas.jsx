import { useRef, useState } from 'react'
import { ImageIcon, Scan } from 'lucide-react'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useAsset } from './client'

export function Canvas({ result, original, region, setRegion, selecting, busy, t, onError }) {
  const url = useAsset(result?.asset, onError)
  const originalURL = useAsset(original?.asset, onError)
  const image = useRef(null)
  const drag = useRef(null)
  const [ratio, setRatio] = useState(210 / 285)
  function point(event) {
    const rect = image.current.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    }
  }
  return (
    <div className="comic-stage" data-comparing={!!original}>
      {!result ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImageIcon />
            </EmptyMedia>
            <EmptyTitle>{t('blankPage')}</EmptyTitle>
            <EmptyDescription>{t('imageEmpty')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {original && (
            <div className="comic-sheet-slot">
              <img className="comic-image" src={originalURL || undefined} alt={t('source')} />
              <span className="comic-image-label">{t('source')}</span>
            </div>
          )}
          <div className="comic-sheet-slot">
            <div
              className="comic-sheet"
              style={{ '--page-ratio': ratio }}
              data-selecting={selecting}
              onPointerDown={(event) => {
                if (!selecting || busy || !url) return
                event.preventDefault()
                drag.current = point(event)
                event.currentTarget.setPointerCapture(event.pointerId)
                setRegion(null)
              }}
              onPointerMove={(event) => {
                if (!drag.current) return
                const end = point(event),
                  start = drag.current
                const x = Math.min(start.x, end.x),
                  y = Math.min(start.y, end.y)
                setRegion({
                  x,
                  y,
                  width: Math.min(1 - x, Math.abs(start.x - end.x)),
                  height: Math.min(1 - y, Math.abs(start.y - end.y)),
                })
              }}
              onPointerUp={() => {
                drag.current = null
                if (region && (region.width < 0.005 || region.height < 0.005)) setRegion(null)
              }}
              onPointerCancel={() => {
                drag.current = null
                setRegion(null)
              }}
            >
              <img
                ref={image}
                id="pageImage"
                src={url || undefined}
                alt={t('pageImage')}
                draggable={false}
                onLoad={(event) => setRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)}
              />
              {region && (
                <div
                  className="comic-selection"
                  style={{
                    left: `${region.x * 100}%`,
                    top: `${region.y * 100}%`,
                    width: `${region.width * 100}%`,
                    height: `${region.height * 100}%`,
                  }}
                >
                  <span>
                    <Scan className="size-3" />
                    {t('selection')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
