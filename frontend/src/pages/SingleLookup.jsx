import { useState, useCallback, useRef, useEffect } from "react"
import { fetchPart, fetchSearch, errorMessage } from "../api"
import StockRow from "../components/StockRow"
import LastUpdated from "../components/LastUpdated"
import { deadAge, cleanPart, hasStock } from "../utils"

export default function SingleLookup() {
  const [query, setQuery]         = useState("")
  const [result, setResult]       = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [retrying, setRetrying]   = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [showDrop, setShowDrop]   = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)   // keyboard/hover highlight in the suggestions list
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
    const q = cleanPart(val)
    if (!q) { setResult(null); setError(null); return }
    setLoading(true); setError(null); setRetrying(false); setShowDrop(false)
    try {
      const data = await fetchPart(q, () => setRetrying(true))
      setResult(data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
      setRetrying(false)
    }
  }, [])

  const fetchSuggestions = useCallback(async (val) => {
    const q = cleanPart(val)
    if (q.length < 2) { setSuggestions([]); setShowDrop(false); return }
    try {
      const data = await fetchSearch(q)
      if (data?.length === 1 && data[0].part_number.toUpperCase() === q.toUpperCase()) {
        setSuggestions([]); setShowDrop(false)
        lookup(data[0].part_number)
        return
      }
      setSuggestions(data || [])
      setActiveIdx(-1)
      setShowDrop((data || []).length > 0)
    } catch {
      setSuggestions([]); setShowDrop(false)
    }
  }, [])

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    setResult(null)
    setActiveIdx(-1)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fetchSuggestions(val), 300)
  }

  const isWildcard = (val) => val.includes("*")

  const handleKey = (e) => {
    const listOpen = showDrop && suggestions.length > 0
    if (e.key === "ArrowDown" && listOpen) {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1))
      return
    }
    if (e.key === "ArrowUp" && listOpen) {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, -1))
      return
    }
    if (e.key === "Enter") {
      clearTimeout(timerRef.current)
      if (listOpen && activeIdx >= 0 && suggestions[activeIdx]) {
        // A suggestion is highlighted — pick it
        handleSelect(suggestions[activeIdx].part_number)
        return
      }
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
      setActiveIdx(-1)
    }
  }

  const handleSelect = (partNumber) => {
    setQuery(partNumber)
    setSuggestions([])
    setActiveIdx(-1)
    setShowDrop(false)
    clearTimeout(timerRef.current)
    lookup(partNumber)
  }

  // Highlight the matched portion in the part number (skipped for wildcard queries)
  const highlight = (text, q) => {
    if (!q || isWildcard(q)) return text
    const cq = cleanPart(q)
    if (!cq) return text
    const idx = text.toUpperCase().indexOf(cq.toUpperCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark className="ac-mark">{text.slice(idx, idx + cq.length)}</mark>
        {text.slice(idx + cq.length)}
      </>
    )
  }

  const total = result?.found
    ? ["dibrugarh","jorhat","dimapur","dimapur_irs"].reduce((sum, loc) => {
        const v = result[loc]
        return sum + (v && v !== "-" && v !== "Out of Stock" ? Number(v) : 0)
      }, 0)
    : 0

  // Total in transit across DIB, JRH and DMU (IRS has no in-transit figure)
  const totalTransit = result?.found
    ? ["tr_dibrugarh","tr_jorhat","tr_dimapur"].reduce((sum, k) => sum + (hasStock(result[k]) ? Number(result[k]) : 0), 0)
    : 0
  const fmtNum = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })

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
                className={`ac-item${i === activeIdx ? " active" : ""}`}
                onMouseMove={() => { if (i !== activeIdx) setActiveIdx(i) }}
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
        <div className="loading"><div className="spinner" />{retrying ? "Server waking up, please wait…" : "Looking up part..."}</div>
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
            { wh: "DMU IRS", qty: a.dimapur_irs,  date: null, forceDead: true },
          ].filter(w => w.qty && w.qty !== "-" && w.qty !== "0" && Number(w.qty) > 0)
           .map(w => ({ wh: w.wh, age: w.forceDead ? "dead" : deadAge(w.date) }))
           .filter(w => w.age != null)
           .sort((a, b) => parseFloat(b.age) - parseFloat(a.age))
          return {
            partNum:  a.part_number,
            isNls:    a.is_nls,
            isDead:   altDeadWh.length > 0,
            deadWhs:  new Map(altDeadWh.map(w => [w.wh, w.age])),   // warehouse → "1.5 yr" (or "dead" for IRS)
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
            {altEntries.filter(e => e.isNls || e.isDead).map((e, i) => {
              const label = [e.isNls && "NLS", e.isDead && "Dead Stock"].filter(Boolean).join(", ")
              return (
                <div key={i} className={`alt-flag-banner${e.isDead ? "" : " nls-only"}`}>
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
                {result.mrp ? <>Rs.&nbsp;{Number(result.mrp).toLocaleString("en-IN", {maximumFractionDigits:0})}</> : "\u2014"}
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
              {hasStock(result.dimapur_irs) && (
                <StockRow label="DMU IRS" stock={result.dimapur_irs} transit={null} bins={result.irs_bins ? result.irs_bins.split(";") : []} lastReceived={null} forceDead />
              )}
            </div>

            <div className="stock-total">
              <span>Total</span>
              <span className="stock-total-right">
                <span className="stock-total-val">{fmtNum(total)}</span>
                {totalTransit > 0 && <span className="stock-transit">+ {fmtNum(totalTransit)} In Transit</span>}
              </span>
            </div>

            {altEntries.length > 0 && (
              <div className="alt-note">
                <div className="alt-note-inner">
                  <div className="alt-note-label">Alternate Available</div>
                  <div className="alt-alts">
                    {altEntries.map((entry, i) => (
                      <div key={i} className="alt-block">
                        <span className={`alt-part-num${entry.isNls ? " nls-alt" : ""}`}>
                          {entry.partNum}
                        </span>
                        {entry.isNls && <span className="alt-nls-badge">NLS</span>}
                        <div className="alt-wh-row">
                          {entry.locs.map((loc, j) => {
                            const deadAgeStr = entry.deadWhs.get(loc.wh)   // undefined when not dead
                            const qty = Number(loc.qty).toLocaleString()
                            if (deadAgeStr === undefined) {
                              return (
                                <div key={j} className="alt-wh-tag">
                                  <span className="alt-wh-name">{loc.wh}</span>
                                  <span className="alt-wh-qty">{qty}</span>
                                </div>
                              )
                            }
                            return (
                              <div key={j} className="alt-wh-tag dead-alt-tag">
                                <span className="alt-dead-label">{deadAgeStr === "dead" ? "Dead" : `Dead ${deadAgeStr}`}</span>
                                <span className="alt-wh-body">
                                  <span className="alt-wh-name">{loc.wh}</span>
                                  <span className="alt-wh-qty">{qty}</span>
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
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
