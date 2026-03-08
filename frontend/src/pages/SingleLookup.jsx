import { useState, useCallback, useRef, useEffect } from "react"
import { fetchPart, fetchSearch } from "../api"
import StockRow from "../components/StockRow"
import LastUpdated from "../components/LastUpdated"

export default function SingleLookup() {
  const [query, setQuery]         = useState("")
  const [result, setResult]       = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [showDrop, setShowDrop]   = useState(false)
  const timerRef  = useRef(null)
  const wrapRef   = useRef(null)

  // Close dropdown when tapping/clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setShowDrop(false)
      }
    }
    document.addEventListener("mousedown", handler)
    document.addEventListener("touchstart", handler)
    return () => {
      document.removeEventListener("mousedown", handler)
      document.removeEventListener("touchstart", handler)
    }
  }, [])

  const lookup = useCallback(async (val) => {
    const q = val.trim()
    if (!q) { setResult(null); setError(null); return }
    setLoading(true); setError(null); setShowDrop(false)
    try {
      const data = await fetchPart(q)
      setResult(data)
    } catch {
      setError("Could not reach the server. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSuggestions = useCallback(async (val) => {
    const q = val.trim()
    if (q.length < 2) { setSuggestions([]); setShowDrop(false); return }
    try {
      const data = await fetchSearch(q)
      setSuggestions(data || [])
      setShowDrop((data || []).length > 0)
    } catch {
      setSuggestions([]); setShowDrop(false)
    }
  }, [])

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fetchSuggestions(val), 300)
  }

  const isWildcard = (val) => val.includes("*")

  const handleKey = (e) => {
    if (e.key === "Enter") {
      clearTimeout(timerRef.current)
      if (isWildcard(query)) {
        // Wildcard pattern — show suggestions instead of exact lookup
        fetchSuggestions(query)
      } else {
        setShowDrop(false)
        lookup(query)
      }
    }
    if (e.key === "Escape") {
      setShowDrop(false)
    }
  }

  const handleSelect = (partNumber) => {
    setQuery(partNumber)
    setSuggestions([])
    setShowDrop(false)
    clearTimeout(timerRef.current)
    lookup(partNumber)
  }

  // Highlight the matched portion in the part number (skipped for wildcard queries)
  const highlight = (text, q) => {
    if (!q || isWildcard(q)) return text
    const idx = text.toUpperCase().indexOf(q.trim().toUpperCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark className="ac-mark">{text.slice(idx, idx + q.trim().length)}</mark>
        {text.slice(idx + q.trim().length)}
      </>
    )
  }

  const total = result?.found
    ? ["dibrugarh","jorhat","dimapur","dimapur_irs"].reduce((sum, loc) => {
        const v = result[loc]
        return sum + (v && v !== "-" && v !== "Out of Stock" ? Number(v) : 0)
      }, 0)
    : 0

  return (
    <div>
      <div className="search-wrap" ref={wrapRef}>
        <span className="search-icon">⌕</span>
        <input
          className="search-input"
          placeholder="Enter part number..."
          value={query}
          onChange={handleChange}
          onKeyDown={handleKey}
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
        <span className="search-label">Part No.</span>

        {showDrop && suggestions.length > 0 && (
          <div className="ac-dropdown">
            {suggestions.map((s, i) => (
              <div
                key={i}
                className="ac-item"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(s.part_number) }}
                onTouchEnd={(e) => { e.preventDefault(); handleSelect(s.part_number) }}
              >
                <span className="ac-part">{highlight(s.part_number, query)}</span>
                {s.description && (
                  <span className="ac-desc">{s.description}</span>
                )}
              </div>
            ))}
            <div className="ac-hint">{suggestions.length} result{suggestions.length !== 1 ? "s" : ""} — tap to select</div>
          </div>
        )}
      </div>

      {loading && (
        <div className="loading"><div className="spinner" />Looking up part...</div>
      )}

      {error && <div className="not-found">{error}</div>}

      {!loading && !error && result && !result.found && (
        <div className="not-found">
          No part found for <strong style={{color:"var(--white50)"}}>{result.part_number}</strong>
        </div>
      )}

      {!loading && !error && result?.found && (
        <div className="result-card">
          <div className="result-desc">{result.description || "—"}</div>

          <div className="result-meta">
            <span className="result-mrp">
              Rs.&nbsp;{Number(result.mrp).toLocaleString("en-IN", {maximumFractionDigits:0})}
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

          <div className="stock-label">Stock Availability</div>
          <div className="stock-rows">
            <StockRow label="DIB" stock={result.dibrugarh} transit={result.tr_dibrugarh} bins={result.dib_bins ? result.dib_bins.split(";") : []} />
            <StockRow label="JRH" stock={result.jorhat}    transit={result.tr_jorhat}    bins={result.jor_bins ? result.jor_bins.split(";") : []} />
            <StockRow label="DMU" stock={result.dimapur}   transit={result.tr_dimapur}   bins={result.dim_bins ? result.dim_bins.split(";") : []} />
            {result.dimapur_irs && result.dimapur_irs !== "-" && (
              <StockRow label="DMU IRS" stock={result.dimapur_irs} transit={null} bins={result.irs_bins ? result.irs_bins.split(";") : []} />
            )}
          </div>

          <div className="stock-total">
            <span>Total</span>
            <span className="stock-total-val">{total.toLocaleString()}</span>
          </div>

          {result.alt_availability && (
            <div className="alt-note">
              <div className="alt-note-label">Alternate Available</div>
              <div className="alt-alts">
                {result.alt_availability.split("|||").map((entry, i) => {
                  const parts = entry.split("|")
                  const partNum = parts[0]
                  const locs = parts.slice(1).map(l => {
                    const [wh, qty] = l.split(":")
                    return { wh, qty }
                  })
                  return (
                    <div key={i} className="alt-block">
                      <span className="alt-part-num">{partNum}</span>
                      <div className="alt-wh-row">
                        {locs.map((loc, j) => (
                          <div key={j} className="alt-wh-tag">
                            <span className="alt-wh-name">{loc.wh}</span>
                            <span className="alt-wh-qty">{Number(loc.qty).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <LastUpdated />
    </div>
  )
}
