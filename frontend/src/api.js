const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000"

export async function fetchPart(partNumber) {
  const res = await fetch(`${BASE}/part/${encodeURIComponent(partNumber.trim())}`)
  if (!res.ok) throw new Error("API error")
  return res.json()
}

export async function fetchBulk(partNumbers) {
  const res = await fetch(`${BASE}/parts/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partNumbers),
  })
  if (!res.ok) throw new Error("API error")
  return res.json()
}

export async function fetchMeta() {
  const res = await fetch(`${BASE}/meta`)
  if (!res.ok) return null
  return res.json()
}
