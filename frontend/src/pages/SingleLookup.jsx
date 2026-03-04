import { useState, useCallback, useRef } from "react"
import { fetchPart } from "../api"
import StockRow from "../components/StockRow"
import LastUpdated from "../components/LastUpdated"

export default function SingleLookup() {
  const [query, setQuery]   = useState("")
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)
  const timerRef = useRef(null)

  const lookup = useCallback(async (val) => {
    const q = val.trim()
    if (!q) { setResult(null); setError(null); return }
    setLoading(true); setError(null)
    try {
      const data = await fetchPart(q)
      setResult(data)
    } catch {
      setError("Could not reach the server. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => lookup(val), 400)
  }

  const handleKey = (e) => {
    if (e.key === "Enter") {
      clearTimeout(timerRef.current)
      lookup(query)
    }
  }

  // Compute total stock
  const total = result?.found
    ? ["dibrugarh","jorhat","dimapur"].reduce((sum, loc) => {
        const v = result[loc]
        return sum + (v && v !== "-" && v !== "Out of Stock" ? Number(v) : 0)
      }, 0)
    : 0

  return (
    <div>
      {/* Search */}
      <div className="search-wrap">
        <span className="search-icon">⌕</span>
        <input
          className="search-input"
          placeholder="Enter part number..."
          value={query}
          onChange={handleChange}
          onKeyDown={handleKey}
          autoFocus
          spellCheck={false}
        />
        <span className="search-label">Part No.</span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="loading">
          <div className="spinner" />
          Looking up part...
        </div>
      )}

      {/* Error */}
      {error && <div className="not-found">{error}</div>}

      {/* Not found */}
      {!loading && !error && result && !result.found && (
        <div className="not-found">
          No part found for <strong style={{color:"var(--white50)"}}>{result.part_number}</strong>
        </div>
      )}

      {/* Result */}
      {!loading && !error && result?.found && (
        <div className="result-card">

          {/* Description */}
          <div className="result-desc">{result.description || "—"}</div>

          {/* MRP + DC + Alternates */}
          <div className="result-meta">
            <span className="result-mrp">
              Rs.&nbsp;{Number(result.mrp).toLocaleString("en-IN", {minimumFractionDigits:2})}
            </span>
            {result.discount_code && result.discount_code !== "--" && (
              <span className="result-dc">{result.discount_code}</span>
            )}
          </div>
          {result.alternate_parts && result.alternate_parts !== "-" && result.alternate_parts !== "--" && (
            <div className="result-alt-parts" style={{marginBottom:20}}>
              Alt: {result.alternate_parts}
            </div>
          )}

          {/* Stock */}
          <div className="stock-label">Stock Availability</div>
          <div className="stock-rows">
            <StockRow label="Dibrugarh" stock={result.dibrugarh} transit={result.tr_dibrugarh} />
            <StockRow label="Jorhat"    stock={result.jorhat}    transit={result.tr_jorhat} />
            <StockRow label="Dimapur"   stock={result.dimapur}   transit={result.tr_dimapur} />
            {result.dimapur_irs && result.dimapur_irs !== "-" &&
             result.dimapur_irs !== "Out of Stock" && Number(result.dimapur_irs) > 0 && (
              <StockRow label="Dimapur IRS" stock={result.dimapur_irs} transit={null} />
            )}
          </div>

          {/* Total */}
          <div className="stock-total">
            <span>Total (Dibrugarh + Jorhat + Dimapur)</span>
            <span className="stock-total-val">{total.toLocaleString()} units</span>
          </div>

          {/* Alt availability note */}
          {result.alt_availability && (
            <div className="alt-note">
              <div className="alt-note-label">Alternate Available</div>
              <div className="alt-note-text">{result.alt_availability}</div>
            </div>
          )}
        </div>
      )}

      <LastUpdated />
    </div>
  )
}
