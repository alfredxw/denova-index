import assert from 'node:assert/strict'

// Transport failures must not turn an unavailable registry into a smaller catalog.
export class MetadataRequestError extends Error {
  constructor(url, status, cause) {
    super(`Metadata request failed: ${status || 'network'} ${url}`, { cause })
    this.status = status
  }
}

export async function fetchJSON(url, token) {
  let response
  const chunks = []
  try {
    response = await fetch(url, {
      redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: token ? { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } : {},
    })
    if (!response.ok) throw new MetadataRequestError(url, response.status)
    let length = 0
    for await (const chunk of response.body) {
      length += chunk.length
      assert(length <= 4 * 1024 * 1024, 'Metadata response exceeds 4 MiB')
      chunks.push(chunk)
    }
  } catch (error) {
    if (error instanceof MetadataRequestError || error instanceof assert.AssertionError) throw error
    throw new MetadataRequestError(url, 0, error)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
