// Incremental SSE decoding handles UTF-8 and CRLF split across network chunks.
export async function consumeEvents(response, onEvent) {
  if (!response.body) throw new Error('Missing event stream');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', event = 'message', data = [];
  function line(value) {
    if (!value) {
      if (data.length) { const result = onEvent(event, JSON.parse(data.join('\n'))); event = 'message'; data = []; return result; }
      event = 'message'; return false;
    }
    if (value.startsWith('event:')) event = value.slice(6).trim();
    if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''));
    return false;
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary;
      while ((boundary = buffer.indexOf('\n')) >= 0) {
        const raw = buffer.slice(0, boundary).replace(/\r$/, '');
        buffer = buffer.slice(boundary + 1);
        if (line(raw)) return;
      }
      if (done) {
        if (buffer) line(buffer.replace(/\r$/, ''));
        if (line('')) return;
        throw new Error('Stream ended before a terminal result');
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
