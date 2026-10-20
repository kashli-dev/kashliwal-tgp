const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000"

const RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 5000

// Error shown to the user. HTTP errors are tagged kind="server";
// anything else (fetch failing outright) is treated as a connection problem.
export function errorMessage(err) {
  if (err && err.kind === "server") {
    return "The server ran into a problem. Please try again in a moment."
  }
  return "Can't reach the server. Check your internet connection and try again."
}

function serverError(status) {
  const err = new Error("API error")
  err.kind = "server"
  err.status = status
  return err
}

async function withRetry(fn, onRetry) {
  for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === RETRY_ATTEMPTS) throw err
      if (onRetry) onRetry(attempt + 1)
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
    }
  }
}

export async function fetchPart(partNumber, onRetry) {
  return withRetry(async () => {
    const res = await fetch(`${BASE}/part/${encodeURIComponent(partNumber.trim())}`)
    if (!res.ok) throw serverError(res.status)
    return res.json()
  }, onRetry)
}

export async function fetchBulk(partNumbers, onRetry) {
  return withRetry(async () => {
    const res = await fetch(`${BASE}/parts/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partNumbers),
    })
    if (!res.ok) throw serverError(res.status)
    return res.json()
  }, onRetry)
}

export async function fetchMeta() {
  try {
    const res = await fetch(`${BASE}/meta`)
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export async function fetchSearch(q) {
  try {
    const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q.trim())}`)
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}
