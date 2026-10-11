import { useEffect, useState } from 'react'
import { connect } from '../../plugin/web/client.mjs'

const lifetime = new AbortController()
export const viewSignal = lifetime.signal
export const client = await connect()
const request = client.request
client.request = (path, options = {}) =>
  request(path, {
    ...options,
    signal: options.signal ? AbortSignal.any([lifetime.signal, options.signal]) : lifetime.signal,
  })
const assets = new Map()
window.addEventListener('pagehide', () => {
  lifetime.abort()
  for (const pending of assets.values()) void pending.then(URL.revokeObjectURL, () => {})
})

// One immutable asset URL per document, shared by thumbnails and the canvas.
export function assetURL(asset) {
  const key = `${asset.kind}/${asset.path}`
  if (!assets.has(key))
    assets.set(
      key,
      client
        .request(`/assets/content?kind=${asset.kind}&path=${encodeURIComponent(asset.path)}`, {
          responseType: 'stream',
        })
        .then((response) => response.blob())
        .then(URL.createObjectURL)
        .catch((error) => {
          assets.delete(key)
          throw error
        }),
    )
  return assets.get(key)
}

export function useAsset(asset, onError) {
  const [url, setURL] = useState('')
  useEffect(() => {
    let active = true
    setURL('')
    if (asset)
      void assetURL(asset)
        .then((url) => {
          if (active) setURL(url)
        })
        .catch((error) => {
          if (active) onError(error)
        })
    return () => {
      active = false
    }
  }, [asset?.kind, asset?.path, onError])
  return url
}
