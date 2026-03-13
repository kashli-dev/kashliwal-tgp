import { useState, useCallback, useRef, useEffect } from "react"
import { fetchPart, fetchSearch } from "../api"
import StockRow from "../components/StockRow"
import LastUpdated from "../components/LastUpdated"
import { deadAge } from "../utils"

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
      if (data?.length === 1 && data[0].part_number.toUpperCase() === q.toUpperCase()) {
        setSuggestions([]); setShowDrop(false)
        lookup(data[0].part_number)
        return
      }
      setSuggestions(data || [])
      setShowDrop((data || []).length > 0)
    } catch {
      setSuggestions([]); setShowDrop(false)
    }
  }, [])

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    setResult(null)
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
          Invalid part number: <strong style={{color:"var(--white50)"}}>{result.part_number}</strong>
        </div>
      )}

      {!loading && !error && result?.found && (() => {
        // ── Dead stock helpers ──
        const warehouseDates = [
          { label: "DIB", stock: result.dibrugarh, date: result.dib_last_received },
          { label: "JRH", stock: result.jorhat,    date: result.jor_last_received },
          { label: "DMU", stock: result.dimapur,   date: result.dim_last_received },
        ]
        const deadWarehouses = warehouseDates.filter(w => {
          const hasStock = w.stock && w.stock !== "-" && w.stock !== "Out of Stock" && Number(w.stock) > 0
          return hasStock && deadAge(w.date) !== null
        })
        const isDeadPart = deadWarehouses.length > 0

        // ── Alt entries from structured alt_details ──
        const altEntries = (result.alt_details || []).map(a => {
          const locs = [
            { wh: "DIB",     qty: a.dibrugarh,   transit: a.tr_dibrugarh },
            { wh: "JRH",     qty: a.jorhat,       transit: a.tr_jorhat    },
            { wh: "DMU",     qty: a.dimapur,      transit: a.tr_dimapur   },
            { wh: "DMU IRS", qty: a.dimapur_irs,  transit: null           },
          ].filter(l => l.qty && l.qty !== "-" && l.qty !== "0" && Number(l.qty) > 0)
          const altDeadWh = [
            { wh: "DIB",     qty: a.dibrugarh,   date: a.dib_last_received },
            { wh: "JRH",     qty: a.jorhat,       date: a.jor_last_received },
            { wh: "DMU",     qty: a.dimapur,      date: a.dim_last_received },
            { wh: "DMU IRS", qty: a.dimapur_irs,  date: null                },
          ].filter(w => w.qty && w.qty !== "-" && w.qty !== "0" && Number(w.qty) > 0)
           .map(w => ({ wh: w.wh, age: deadAge(w.date) }))
           .filter(w => w.age != null)
           .sort((a, b) => parseFloat(b.age) - parseFloat(a.age))
          const altAge = altDeadWh.length > 0
            ? altDeadWh.map(w => `${w.wh}:${w.age}`).join(" ")
            : null
          return {
            partNum:  a.part_number,
            isNls:    a.is_nls,
            age:      altAge,
            locs,
          }
        }).filter(e => e.locs.length > 0) // only show alts that have stock

        return (
          <div className="result-card">
            {/* NLS banner for searched part */}
            {result.is_nls && (
              <div className="nls-banner">
                <div className="nls-banner-icon">⚠</div>
                <div className="nls-banner-text">
                  <div className="nls-banner-title">No Longer Serviced</div>
                  {total > 0 && (
                    <div className="nls-banner-body">This part cannot be reordered from Tata. Liquidate existing warehouse stock before fulfilling from alternates.</div>
                  )}
                </div>
              </div>
            )}

            {/* Dead stock banner for searched part */}
            {isDeadPart && (
              <div className="dead-banner">
                <div className="dead-banner-icon">⚠</div>
                <div>
                  <div className="dead-banner-title">Dead Stock — Prioritise When Selling</div>
                  <div className="dead-pills">
                    {deadWarehouses.map((w, i) => (
                      <span key={i} className="dead-pill">
                        {w.label} <span className="dead-pill-age">· {deadAge(w.date)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Alt flag banners — one per flagged alternate */}
            {altEntries.filter(e => e.isNls || e.age).map((e, i) => {
              const label = [e.isNls && "NLS", e.age && "Dead Stock"].filter(Boolean).join(", ")
              return (
                <div key={i} className="alt-flag-banner">
                  <div className="alt-flag-banner-icon">⚠</div>
                  <div>
                    <div className="alt-flag-banner-title">
                      Alternate Part <span className="alt-flag-banner-pn">{e.partNum}</span> — {label}
                    </div>
                    <div className="alt-flag-banner-body">Sell alternate <strong>{e.partNum}</strong> instead.</div>
                  </div>
                </div>
              )
            })}

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
              <StockRow label="DIB" stock={result.dibrugarh} transit={result.tr_dibrugarh} bins={result.dib_bins ? result.dib_bins.split(";") : []} lastReceived={result.dib_last_received} />
              <StockRow label="JRH" stock={result.jorhat}    transit={result.tr_jorhat}    bins={result.jor_bins ? result.jor_bins.split(";") : []} lastReceived={result.jor_last_received} />
              <StockRow label="DMU" stock={result.dimapur}   transit={result.tr_dimapur}   bins={result.dim_bins ? result.dim_bins.split(";") : []} lastReceived={result.dim_last_received} />
              {result.dimapur_irs && result.dimapur_irs !== "-" && (
                <StockRow label="DMU IRS" stock={result.dimapur_irs} transit={null} bins={result.irs_bins ? result.irs_bins.split(";") : []} lastReceived={null} />
              )}
            </div>

            <div className="stock-total">
              <span>Total</span>
              <span className="stock-total-val">{total.toLocaleString()}</span>
            </div>

            {altEntries.length > 0 && (
              <div className="alt-note">
                <div className="alt-note-inner">
                  <div className="alt-note-label">Alternate Available</div>
                  <div className="alt-alts">
                    {altEntries.map((entry, i) => {
                      const isFlagged = entry.isNls || entry.age
                      return (
                        <div key={i} className="alt-block">
                          <span className={`alt-part-num${isFlagged ? " dead-alt" : ""}`}>
                            {entry.partNum}
                          </span>
                          {entry.isNls && <span className="alt-nls-badge">NLS</span>}
                          {entry.age   && <span className="alt-dead-badge">DEAD · {entry.age}</span>}
                          <div className="alt-wh-row">
                            {entry.locs.map((loc, j) => (
                              <div key={j} className={`alt-wh-tag${isFlagged ? " dead-alt-tag" : ""}`}>
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
              </div>
            )}
          </div>
        )
      })()}

      <LastUpdated />
    </div>
  )
}
