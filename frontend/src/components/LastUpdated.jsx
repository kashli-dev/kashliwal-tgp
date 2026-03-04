import { useEffect, useState } from "react"
import { fetchMeta } from "../api"

export default function LastUpdated() {
  const [ts, setTs] = useState(null)

  useEffect(() => {
    fetchMeta().then(d => d && setTs(d.last_updated)).catch(() => {})
  }, [])

  if (!ts) return null

  const d = new Date(ts)
  const formatted = d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  })

  return (
    <p className="last-updated">Data last updated: <span>{formatted}</span></p>
  )
}
