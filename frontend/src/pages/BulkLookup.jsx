import { useState } from "react"
import { fetchBulk } from "../api"
import LastUpdated from "../components/LastUpdated"
import * as XLSX from "xlsx"
import { deadAge } from "../utils"

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

// Parse "yyyy-mm-dd" string into a local Date (no timezone shift)
function parseDate(s) {
  if (!s) return ""
  const parts = s.split("-")
  if (parts.length !== 3 || parts[0].length !== 4) return ""
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  return isNaN(d.getTime()) ? "" : d
}

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
      "Part Number": /^\d+$/.test(row.part_number) && row.part_number[0] !== "0" ? Number(row.part_number) : row.part_number,
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
      "Part Number":        /^\d+$/.test(row.part_number) && row.part_number[0] !== "0" ? Number(row.part_number) : row.part_number,
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
            { wh: "DIB",     qty: a.dibrugarh,   date: a.dib_last_received },
            { wh: "JRH",     qty: a.jorhat,       date: a.jor_last_received },
            { wh: "DMU",     qty: a.dimapur,      date: a.dim_last_received },
            { wh: "DMU IRS", qty: a.dimapur_irs,  date: null, forceDead: true },
          ].filter(w => w.qty && w.qty !== "-" && Number(w.qty) > 0)
           .map(w => ({ wh: w.wh, age: w.forceDead ? "Dead" : deadAge(w.date) }))
           .filter(w => w.age != null)
           .sort((a, b) => parseFloat(b.age) - parseFloat(a.age))
          const age = altDeadWh.length > 0
            ? altDeadWh.filter(w => w.age !== "Dead").map(w => `${w.wh}:${w.age}`).join(" ") || "Dead Stock"
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
      "DIB Bins":           bins(row.dib_bins),
      "JRH Bins":           bins(row.jor_bins),
      "DMU Bins":           bins(row.dim_bins),
      "DIB Received":       parseDate(row.dib_last_received),
      "DIB Issue":          parseDate(row.dib_last_issue),
      "JRH Received":       parseDate(row.jor_last_received),
      "JRH Issue":          parseDate(row.jor_last_issue),
      "DMU Received":       parseDate(row.dim_last_received),
      "DMU Issue":          parseDate(row.dim_last_issue),
      "NLS":                row.is_nls ? "Yes" : "",
    }
  }

  const found    = results.filter(r => r.found)
  const notFound = results.filter(r => !r.found)
  const sorted   = [...found, ...notFound]
  const rows     = sorted.map((row, i) => makeRow(row, i))

  const ws = XLSX.utils.json_to_sheet(rows, { cellDates: true })
  ws["!cols"] = [
    { wch: 4  }, { wch: 18 }, { wch: 42 }, { wch: 12 },
    { wch: 8  }, { wch: 12 }, { wch: 8  }, { wch: 12 },
    { wch: 8  }, { wch: 12 }, { wch: 8  }, { wch: 52 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 6  },
  ]

  // Stamp dd-mm-yyyy format on all date columns (P through U), skipping header row
  const dateCols = ["P", "Q", "R", "S", "T", "U"]
  const totalRows = rows.length + 1 // +1 for header
  dateCols.forEach(col => {
    for (let r = 2; r <= totalRows; r++) {
      const addr = `${col}${r}`
      if (ws[addr] && ws[addr].t === "d") {
        ws[addr].z = "dd-mm-yyyy"
      }
    }
  })

  ws["!freeze"] = { xSplit: 2, ySplit: 1, topLeftCell: "C2", activePane: "bottomRight" }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Bulk Lookup")
  const now = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }).replace(/\//g, "-")
  XLSX.writeFile(wb, `TGP_Bulk_Lookup_${now}.xlsx`)
}

export default function BulkLookup() {
  const [input, setInput]       = useState("")
  const [results, setResults]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [retrying, setRetrying] = useState(false)
  const [showBins, setShowBins] = useState(false)

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

  const handleClear   = () => { setInput(""); setResults(null); setError(null) }
  const handleKeyDown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleLookup() }

  // found first (input order preserved), not-found sunk to bottom
  const sorted = results
    ? [...results.filter(r => r.found), ...results.filter(r => !r.found)]
    : null

  const showIrs = sorted
    ? sorted.some(r => r.found && r.dimapur_irs && r.dimapur_irs !== "-")
    : false

  return (
    <div className="bulk-page">
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
            <table className="bulk-table">
              <thead>
                <tr>
                  <th className="col-idx">#</th>
                  <th className="col-part">Part Number</th>
                  <th className="col-desc">Description</th>
                  <th className="col-mrp grp-end">MRP</th>
                  <th className="col-stock">DIB</th>
                  <th className={`col-transit transit${showBins ? "" : " grp-end"}`}>DIB Transit</th>
                  <th className={`bins-col dib-bins col-transit grp-end${showBins ? " visible" : ""}`} style={{fontStyle:"italic"}}>DIB Bins</th>
                  <th className="col-stock">JRH</th>
                  <th className={`col-transit transit${showBins ? "" : " grp-end"}`}>JRH Transit</th>
                  <th className={`bins-col jrh-bins col-transit grp-end${showBins ? " visible" : ""}`} style={{fontStyle:"italic"}}>JRH Bins</th>
                  <th className="col-stock">DMU</th>
                  <th className={`col-transit transit${showBins ? "" : " grp-end"}`}>DMU Transit</th>
                  <th className={`bins-col dmu-bins col-transit grp-end${showBins ? " visible" : ""}`} style={{fontStyle:"italic"}}>DMU Bins</th>
                  {showIrs && <th className="col-irs grp-end">DMU IRS</th>}
                  <th className="col-alt">Alt. Availability</th>
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
                      <td colSpan={showIrs ? (showBins ? 13 : 10) : (showBins ? 12 : 9)} className="td-notfound">Invalid part number</td>
                    </tr>
                  )
                  const dib = stockVal(row.dibrugarh)
                  const jor = stockVal(row.jorhat)
                  const dim = stockVal(row.dimapur)
                  const irs = stockVal(row.dimapur_irs)
                  const altDetails = (row.alt_details || []).filter(a =>
                    [a.dibrugarh, a.jorhat, a.dimapur, a.dimapur_irs].some(v => v && v !== "-" && Number(v) > 0)
                  )
                  return (
                    <tr key={i}>
                      <td className="td-idx">{i + 1}</td>
                      <td className="td-part">{row.part_number}</td>
                      <td className="td-desc">{row.description || "—"}</td>
                      <td className="td-mrp grp-end">{formatMrp(row.mrp)}</td>
                      <td className={`td-stock ${dib.cls}`}>{dib.text}</td>
                      <td className={`td-transit${showBins ? "" : " grp-end"}`}>{transitVal(row.tr_dibrugarh)}</td>
                      <td className={`td-bins bins-col dib-bins grp-end${showBins ? " visible" : ""}`}>{row.dib_bins || "—"}</td>
                      <td className={`td-stock ${jor.cls}`}>{jor.text}</td>
                      <td className={`td-transit${showBins ? "" : " grp-end"}`}>{transitVal(row.tr_jorhat)}</td>
                      <td className={`td-bins bins-col jrh-bins grp-end${showBins ? " visible" : ""}`}>{row.jor_bins || "—"}</td>
                      <td className={`td-stock ${dim.cls}`}>{dim.text}</td>
                      <td className={`td-transit${showBins ? "" : " grp-end"}`}>{transitVal(row.tr_dimapur)}</td>
                      <td className={`td-bins bins-col dmu-bins grp-end${showBins ? " visible" : ""}`}>{row.dim_bins || "—"}</td>
                      {showIrs && <td className={`td-stock grp-end ${irs.cls}`}>{irs.text}</td>}
                      <td className="td-alt">
                        {altDetails.length > 0
                          ? <div className="bulk-alt-cell">
                              {altDetails.map((a, j) => {
                                const locs = [
                                  { wh: "DIB",     qty: a.dibrugarh,   date: a.dib_last_received },
                                  { wh: "JRH",     qty: a.jorhat,       date: a.jor_last_received },
                                  { wh: "DMU",     qty: a.dimapur,      date: a.dim_last_received },
                                  { wh: "DMU IRS", qty: a.dimapur_irs,  date: null, forceDead: true },
                                ].filter(l => l.qty && l.qty !== "-" && Number(l.qty) > 0)
                                 .map(l => ({ ...l, age: l.forceDead ? "dead" : deadAge(l.date) }))
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
