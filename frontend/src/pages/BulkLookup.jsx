import { useState, useEffect, useRef } from "react"
import { fetchBulk } from "../api"
import LastUpdated from "../components/LastUpdated"
import * as XLSX from "xlsx"
import { fmtDate, deadAge } from "../utils"

function stockVal(val) {
  if (!val || val === "-" || val === "--") return { text: "—", cls: "na" }
  if (val === "Out of Stock" || val === "0") return { text: "0", cls: "oos" }
  const n = Number(val)
  if (n <= 0) return { text: "0", cls: "oos" }
  return { text: n.toLocaleString(), cls: "in" }
}

function transitVal(val) {
  if (!val || val === "-" || val === "--") return ""
  const n = Number(val)
  return n > 0 ? n.toLocaleString() : ""
}

function formatMrp(mrp) {
  if (!mrp) return "—"
  return `Rs. ${Number(mrp).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

// ── Column definitions ──────────────────────────────────────────────────────
// align: "left" | "center"
// bins: true = hidden unless showBins
// grpEnd: carries a right border when visible (may shift to transit col when bins hidden)
const ALL_COLS = [
  { key: "desc",     label: "Description",       align: "left",   bins: false, grpEnd: false },
  { key: "mrp",      label: "MRP",               align: "left",   bins: false, grpEnd: true  },
  { key: "dib",      label: "DIB",               align: "center", bins: false, grpEnd: false },
  { key: "tr_dib",   label: "DIB Transit",       align: "center", bins: false, grpEnd: false },
  { key: "dib_bins", label: "DIB Bins",          align: "center", bins: true,  grpEnd: true  },
  { key: "jrh",      label: "JRH",               align: "center", bins: false, grpEnd: false },
  { key: "tr_jrh",   label: "JRH Transit",       align: "center", bins: false, grpEnd: false },
  { key: "jrh_bins", label: "JRH Bins",          align: "center", bins: true,  grpEnd: true  },
  { key: "dmu",      label: "DMU",               align: "center", bins: false, grpEnd: false },
  { key: "tr_dmu",   label: "DMU Transit",       align: "center", bins: false, grpEnd: false },
  { key: "dmu_bins", label: "DMU Bins",          align: "center", bins: true,  grpEnd: true  },
  { key: "irs",      label: "DMU IRS",           align: "center", bins: false, grpEnd: true  },
  { key: "alt",      label: "Alt. Availability", align: "left",   bins: false, grpEnd: false },
]

const DEFAULT_ORDER = ALL_COLS.map(c => c.key)

function colDef(key) { return ALL_COLS.find(c => c.key === key) }

// When bins are hidden, grpEnd shifts from the bins col to its preceding transit col
function isGrpEnd(key, showBins) {
  if (!showBins) {
    if (key === "tr_dib" || key === "tr_jrh" || key === "tr_dmu") return true
    if (key === "dib_bins" || key === "jrh_bins" || key === "dmu_bins") return false
  }
  return colDef(key).grpEnd
}

function GripIcon() {
  return (
    <svg width="8" height="12" viewBox="0 0 8 12" style={{ display: "block" }}>
      <circle cx="2" cy="2"  r="1.5" fill="rgba(255,255,255,0.6)" />
      <circle cx="6" cy="2"  r="1.5" fill="rgba(255,255,255,0.6)" />
      <circle cx="2" cy="6"  r="1.5" fill="rgba(255,255,255,0.6)" />
      <circle cx="6" cy="6"  r="1.5" fill="rgba(255,255,255,0.6)" />
      <circle cx="2" cy="10" r="1.5" fill="rgba(255,255,255,0.6)" />
      <circle cx="6" cy="10" r="1.5" fill="rgba(255,255,255,0.6)" />
    </svg>
  )
}

// ── Excel export ────────────────────────────────────────────────────────────
function exportToExcel(results) {
  const stockNum = (v) => {
    if (!v || v === "-" || v === "--") return ""
    if (v === "Out of Stock" || v === "0") return 0
    const n = Number(v)
    return n <= 0 ? 0 : n
  }
  const trNum = (v) => {
    if (!v || v === "-" || v === "--") return ""
    const n = Number(v); return n > 0 ? n : ""
  }

  const makeRow = (row, i) => {
    if (!row.found) return {
      "#": i + 1,
      "Part Number": row.part_number,
      "Description": "Not found",
      "MRP (Rs.)": "",
      "DIB": "", "DIB Transit": "",
      "JRH": "", "JRH Transit": "",
      "DMU": "", "DMU Transit": "",
      "DMU IRS": "",
      "Alt. Availability": "",
      "DIB Bins": "", "JRH Bins": "", "DMU Bins": "",
      "DIB Received": "", "DIB Issue": "",
      "JRH Received": "", "JRH Issue": "",
      "DMU Received": "", "DMU Issue": "",
    }
    const bins = (v) => v ? v.replace(/;/g, ", ") : ""
    return {
      "#":                  i + 1,
      "Part Number":        row.part_number,
      "Description":        row.description || "",
      "MRP (Rs.)":          row.mrp ? Math.round(Number(row.mrp)) : "",
      "DIB":                stockNum(row.dibrugarh),
      "DIB Transit":        trNum(row.tr_dibrugarh),
      "JRH":                stockNum(row.jorhat),
      "JRH Transit":        trNum(row.tr_jorhat),
      "DMU":                stockNum(row.dimapur),
      "DMU Transit":        trNum(row.tr_dimapur),
      "DMU IRS":            stockNum(row.dimapur_irs),
      "Alt. Availability":  (row.alt_details || []).filter(a =>
          [a.dibrugarh, a.jorhat, a.dimapur, a.dimapur_irs].some(v => v && v !== "-" && Number(v) > 0)
        ).map(a => {
          const altDeadWh = [
            { wh: "DIB",     qty: a.dibrugarh,  date: a.dib_last_received },
            { wh: "JRH",     qty: a.jorhat,      date: a.jor_last_received },
            { wh: "DMU",     qty: a.dimapur,     date: a.dim_last_received },
            { wh: "DMU IRS", qty: a.dimapur_irs, date: null                },
          ].filter(w => w.qty && w.qty !== "-" && Number(w.qty) > 0)
           .map(w => ({ wh: w.wh, age: deadAge(w.date) }))
           .filter(w => w.age != null)
           .sort((a, b) => parseFloat(b.age) - parseFloat(a.age))
          const age = altDeadWh.length > 0
            ? altDeadWh.map(w => `${w.wh}:${w.age}`).join(" ")
            : null
          const locs = [
            { wh: "DIB",     val: a.dibrugarh   },
            { wh: "JRH",     val: a.jorhat       },
            { wh: "DMU",     val: a.dimapur      },
            { wh: "DMU IRS", val: a.dimapur_irs  },
          ].filter(l => l.val && l.val !== "-" && Number(l.val) > 0)
            .map(l => `${l.wh}:${Number(l.val).toLocaleString()}`)
            .join(" ")
          let label = `${a.part_number} ${locs}`
          if (a.is_nls) label += " (NLS)"
          if (age) label += ` (DEAD · ${age})`
          return label
        }).join(", "),
      "DIB Bins":    bins(row.dib_bins),
      "JRH Bins":    bins(row.jor_bins),
      "DMU Bins":    bins(row.dim_bins),
      "DIB Received": fmtDate(row.dib_last_received),
      "DIB Issue":    fmtDate(row.dib_last_issue),
      "JRH Received": fmtDate(row.jor_last_received),
      "JRH Issue":    fmtDate(row.jor_last_issue),
      "DMU Received": fmtDate(row.dim_last_received),
      "DMU Issue":    fmtDate(row.dim_last_issue),
      "NLS":          row.is_nls ? "Yes" : "",
    }
  }

  const found    = results.filter(r => r.found)
  const notFound = results.filter(r => !r.found)
  const sorted   = [...found, ...notFound]
  const rows     = sorted.map((row, i) => makeRow(row, i))

  const ws = XLSX.utils.json_to_sheet(rows)
  ws["!cols"] = [
    { wch: 4  }, { wch: 18 }, { wch: 42 }, { wch: 12 },
    { wch: 8  }, { wch: 12 }, { wch: 8  }, { wch: 12 },
    { wch: 8  }, { wch: 12 }, { wch: 8  }, { wch: 52 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 6  },
  ]
  ws["!freeze"] = { xSplit: 2, ySplit: 1, topLeftCell: "C2", activePane: "bottomRight" }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Bulk Lookup")
  const now = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }).replace(/\//g, "-")
  XLSX.writeFile(wb, `TGP_Bulk_Lookup_${now}.xlsx`)
}

// ── Main component ──────────────────────────────────────────────────────────
export default function BulkLookup() {
  const [input, setInput]       = useState("")
  const [results, setResults]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [retrying, setRetrying] = useState(false)
  const [showBins, setShowBins] = useState(false)
  const [colOrder, setColOrder] = useState(DEFAULT_ORDER)

  const drag    = useRef({ active: false, key: null, moved: false, startX: 0 })
  const ghostRef = useRef(null)

  const partList = input.split(/[\n,]+/).map(p => p.trim()).filter(Boolean)

  const handleLookup = async () => {
    if (!partList.length) return
    setLoading(true); setError(null); setRetrying(false)
    try {
      const data = await fetchBulk(partList, () => setRetrying(true))
      setResults(data)
    } catch {
      setError("Could not reach the server. Please try again.")
    } finally {
      setLoading(false)
      setRetrying(false)
    }
  }

  const handleClear  = () => { setInput(""); setResults(null); setError(null) }
  const handleKeyDown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleLookup() }

  // found first (input order preserved), not-found sunk to bottom
  const sorted = results
    ? [...results.filter(r => r.found), ...results.filter(r => !r.found)]
    : null

  const showIrs = sorted
    ? sorted.some(r => r.found && r.dimapur_irs && r.dimapur_irs !== "-")
    : false

  const visibleCols = colOrder
    .map(colDef)
    .filter(c => {
      if (!c) return false
      if (c.bins && !showBins) return false
      if (c.key === "irs" && !showIrs) return false
      return true
    })

  // ── Pointer drag ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (window.innerWidth <= 768) return

    const ghost = ghostRef.current

    const clearIndicators = () => {
      document.querySelectorAll(".drag-drop-left, .drag-drop-right").forEach(el => {
        el.classList.remove("drag-drop-left", "drag-drop-right")
      })
    }

    const onPointerDown = (e) => {
      const handle = e.target.closest("[data-drag-handle]")
      if (!handle) return
      e.preventDefault()
      const key = handle.dataset.dragHandle
      drag.current = { active: true, key, moved: false, startX: e.clientX }
      if (ghost) {
        ghost.textContent = colDef(key)?.label || ""
        ghost.style.display = "block"
        ghost.style.left = e.clientX + 14 + "px"
        ghost.style.top  = e.clientY - 14 + "px"
      }
      document.querySelector(`th[data-col-key="${key}"]`)?.classList.add("drag-src")
      document.body.style.cursor = "grabbing"
    }

    const onPointerMove = (e) => {
      if (!drag.current.active) return
      if (ghost) {
        ghost.style.left = e.clientX + 14 + "px"
        ghost.style.top  = e.clientY - 14 + "px"
      }
      if (Math.abs(e.clientX - drag.current.startX) > 3) drag.current.moved = true
      clearIndicators()
      const th = document.elementFromPoint(e.clientX, e.clientY)?.closest("th[data-col-key]")
      if (th && th.dataset.colKey !== drag.current.key) {
        const r = th.getBoundingClientRect()
        th.classList.add(e.clientX < r.left + r.width / 2 ? "drag-drop-left" : "drag-drop-right")
      }
    }

    const onPointerUp = (e) => {
      if (!drag.current.active) return
      if (ghost) ghost.style.display = "none"
      document.body.style.cursor = ""
      document.querySelector(`th[data-col-key="${drag.current.key}"]`)?.classList.remove("drag-src")

      if (drag.current.moved) {
        const th = document.elementFromPoint(e.clientX, e.clientY)?.closest("th[data-col-key]")
        if (th && th.dataset.colKey !== drag.current.key) {
          const r      = th.getBoundingClientRect()
          const after  = e.clientX > r.left + r.width / 2
          const srcKey = drag.current.key
          const tgtKey = th.dataset.colKey
          setColOrder(prev => {
            const next = [...prev]
            const si   = next.indexOf(srcKey)
            next.splice(si, 1)
            const ti   = next.indexOf(tgtKey)
            next.splice(after ? ti + 1 : ti, 0, srcKey)
            return next
          })
        }
      }

      clearIndicators()
      drag.current.active = false
    }

    document.addEventListener("pointerdown", onPointerDown, { passive: false })
    document.addEventListener("pointermove", onPointerMove)
    document.addEventListener("pointerup",   onPointerUp)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("pointermove", onPointerMove)
      document.removeEventListener("pointerup",   onPointerUp)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render a th ──────────────────────────────────────────────────────────
  function renderTh(col) {
    const grpEnd   = isGrpEnd(col.key, showBins)
    const isCentre = col.align === "center"
    const thClass  = [
      grpEnd   ? "grp-end"    : "",
      isCentre ? "col-center" : "",
      (col.key === "tr_dib" || col.key === "tr_jrh" || col.key === "tr_dmu") ? "transit" : "",
    ].filter(Boolean).join(" ") || undefined

    return (
      <th key={col.key} className={thClass} data-col-key={col.key}>
        <div className="th-inner">
          <span className="drag-handle" data-drag-handle={col.key}><GripIcon /></span>
          <span>{col.label}</span>
          {isCentre && <span className="drag-spacer" />}
        </div>
      </th>
    )
  }

  // ── Render a td ──────────────────────────────────────────────────────────
  function renderTd(col, row) {
    const ge = isGrpEnd(col.key, showBins) ? " grp-end" : ""
    switch (col.key) {
      case "desc":
        return <td key={col.key} className={`td-desc${ge}`}>{row.description || "—"}</td>
      case "mrp":
        return <td key={col.key} className={`td-mrp${ge}`}>{formatMrp(row.mrp)}</td>
      case "dib": { const v = stockVal(row.dibrugarh);  return <td key={col.key} className={`td-stock ${v.cls}${ge}`}>{v.text}</td> }
      case "jrh": { const v = stockVal(row.jorhat);     return <td key={col.key} className={`td-stock ${v.cls}${ge}`}>{v.text}</td> }
      case "dmu": { const v = stockVal(row.dimapur);    return <td key={col.key} className={`td-stock ${v.cls}${ge}`}>{v.text}</td> }
      case "irs": { const v = stockVal(row.dimapur_irs);return <td key={col.key} className={`td-stock ${v.cls}${ge}`}>{v.text}</td> }
      case "tr_dib":  return <td key={col.key} className={`td-transit${ge}`}>{transitVal(row.tr_dibrugarh)}</td>
      case "tr_jrh":  return <td key={col.key} className={`td-transit${ge}`}>{transitVal(row.tr_jorhat)}</td>
      case "tr_dmu":  return <td key={col.key} className={`td-transit${ge}`}>{transitVal(row.tr_dimapur)}</td>
      case "dib_bins":return <td key={col.key} className={`td-bins${ge}`}>{row.dib_bins || "—"}</td>
      case "jrh_bins":return <td key={col.key} className={`td-bins${ge}`}>{row.jor_bins || "—"}</td>
      case "dmu_bins":return <td key={col.key} className={`td-bins${ge}`}>{row.dim_bins || "—"}</td>
      case "alt": {
        const altDetails = (row.alt_details || []).filter(a =>
          [a.dibrugarh, a.jorhat, a.dimapur, a.dimapur_irs].some(v => v && v !== "-" && Number(v) > 0)
        )
        return (
          <td key={col.key} className={`td-alt${ge}`}>
            {altDetails.length > 0
              ? <div className="bulk-alt-cell">
                  {altDetails.map((a, j) => {
                    const locs = [
                      { wh: "DIB",     qty: a.dibrugarh,   date: a.dib_last_received },
                      { wh: "JRH",     qty: a.jorhat,       date: a.jor_last_received },
                      { wh: "DMU",     qty: a.dimapur,      date: a.dim_last_received },
                      { wh: "DMU IRS", qty: a.dimapur_irs,  date: null                },
                    ].filter(l => l.qty && l.qty !== "-" && Number(l.qty) > 0)
                     .map(l => ({ ...l, age: deadAge(l.date) }))
                    const isDead   = locs.some(l => l.age)
                    const pnClass  = (a.is_nls || isDead) ? "bulk-alt-pn-nls" : "bulk-alt-pn"
                    return (
                      <div key={j} className="bulk-alt-entry">
                        <span className={pnClass}>{a.part_number}</span>
                        {a.is_nls && <span className="bulk-alt-badge-nls">NLS</span>}
                        {locs.map((l, k) => l.age
                          ? <span key={k} className="bulk-alt-tag-dead">DEAD·{l.wh}:{Number(l.qty).toLocaleString()}</span>
                          : <span key={k} className="bulk-alt-tag">{l.wh}:{Number(l.qty).toLocaleString()}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              : ""}
          </td>
        )
      }
      default: return <td key={col.key} className={ge.trim() || undefined}></td>
    }
  }

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="bulk-page">
      <div className="col-drag-ghost" ref={ghostRef} />

      <div className="bulk-top">
        <div className="bulk-input-wrap">
          <textarea
            className="bulk-input"
            placeholder="Part numbers — one per line or comma-separated"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            rows={4}
          />
          <div className="bulk-input-hint">Ctrl+Enter to search</div>
        </div>
        <div className="bulk-controls">
          <button className="btn-primary" onClick={handleLookup} disabled={loading || !partList.length}>
            {loading ? "Looking up..." : "Look Up"}
          </button>
          <button className="btn-clear" onClick={handleClear}>Clear</button>
          {results && (
            <button className="btn-export" onClick={() => exportToExcel(results)}>↓ Export .xlsx</button>
          )}
          {partList.length > 0 && (
            <span className="bulk-count">{partList.length} part{partList.length !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {error && <div className="not-found">{error}</div>}

      {loading && (
        <div className="loading">
          <div className="spinner" />
          {retrying ? "Server waking up, please wait…" : `Looking up ${partList.length} part${partList.length !== 1 ? "s" : ""}...`}
        </div>
      )}

      {sorted && !loading && (
        <>
          <div className="bulk-summary">
            <span>{results.length} results</span>
            <span className="bulk-summary-found">{results.filter(r => r.found).length} found</span>
            <span className="bulk-summary-notfound">{results.filter(r => !r.found).length} not found</span>
            <label className={`bins-toggle${showBins ? " checked" : ""}`} onClick={() => setShowBins(v => !v)}>
              <div className="chk-box"><span className="chk-tick">✓</span></div>
              <span className="chk-label">Bin Locations</span>
            </label>
          </div>

          <div className="bulk-table-wrap">
            <table className="bulk-table" style={{ tableLayout: "auto", width: "max-content", minWidth: "100%" }}>
              <thead>
                <tr>
                  <th className="col-idx">
                    <div className="th-inner" style={{ padding: "10px 12px" }}>#</div>
                  </th>
                  <th className="col-part">
                    <div className="th-inner" style={{ padding: "10px 12px" }}>Part Number</div>
                  </th>
                  {visibleCols.map(renderTh)}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => {
                  if (!row.found) return (
                    <tr key={i} className="row-notfound">
                      <td className="td-idx">{i + 1}</td>
                      <td className="td-part">
                        {row.part_number}
                        {row.is_nls && <span className="nls-badge-sm">NLS</span>}
                      </td>
                      <td colSpan={visibleCols.length} className="td-notfound">Invalid part number</td>
                    </tr>
                  )
                  return (
                    <tr key={i}>
                      <td className="td-idx">{i + 1}</td>
                      <td className="td-part">{row.part_number}</td>
                      {visibleCols.map(col => renderTd(col, row))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <LastUpdated />
    </div>
  )
}
