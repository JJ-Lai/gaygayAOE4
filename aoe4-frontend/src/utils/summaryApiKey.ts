/**
 * Accept either a raw apiKey or a full Overlay URL and return the key.
 * Example URL:
 * https://overlay.aoe4world.com/profile/10861747/bar?theme=top&apiKey=xxxx
 */
export function extractSummaryApiKey(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    const fromCamel = url.searchParams.get('apiKey')
    if (fromCamel?.trim()) return fromCamel.trim()
    const fromSnake = url.searchParams.get('api_key')
    if (fromSnake?.trim()) return fromSnake.trim()
  } catch {
    // not a URL — treat as raw key
  }

  // Ignore obvious non-key pasted text (full sentences)
  if (/\s/.test(trimmed) && !trimmed.includes('apiKey=')) {
    return null
  }

  const embedded = trimmed.match(/[?&]apiKey=([^&\s#]+)/i) ?? trimmed.match(/[?&]api_key=([^&\s#]+)/i)
  if (embedded?.[1]) {
    try {
      return decodeURIComponent(embedded[1])
    } catch {
      return embedded[1]
    }
  }

  return trimmed
}
