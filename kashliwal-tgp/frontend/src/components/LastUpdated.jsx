import { useEffect, useState } from "react"
import { fetchMeta } from "../api"

export default function LastUpdated() {
  const [ts, setTs] = useState(null)

  useEffect(() => {
    fetchMeta().then(d => d && setTs(d.last_updated)).catch(() => {})
  }, [])

  if (!ts) return null

  // Render stores timestamps in UTC — ensure Z suffix so JS parses as UTC
  const normalized = /Z|[+-]\d{2}:?\d{2}$/.test(ts) ? ts : ts + "Z"
  const d = new Date(normalized)

  const formatted = d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: "Asia/Kolkata",
  }) + " IST"

  return (
    <p className="last-updated">Data last updated: <span>{formatted}</span></p>
  )
}
