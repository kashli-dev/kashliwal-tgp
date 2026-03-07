import { useState } from "react"
import { fetchBulk } from "../api"
import LastUpdated from "../components/LastUpdated"
import * as XLSX from "xlsx"

function stockVal(val) {
  if (!val || val === "-" || val === "--") return { text: "—", cls: "na" }
  if (val === "Out of Stock" || val === "0") return { text: "0", cls: "oos" }
  return { text: Number(val).toLocaleString(), cls: "in" }
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

function exportToExcel(results) {
  const stockNum = (v) => {
    if (!v || v === "-" || v === "--") return ""
    if (v === "Out of Stock" || v === "0") return 0
    return Number(v)
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
      "Alternate Part No.": "",
      "Alt. Availability": "",
      "DIB Received": "", "DIB Issue": "",
      "JRH Received": "", "JRH Issue": "",
      "DMU Received": "", "DMU Issue": "",
    }
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
      "Alternate Part No.": row.alternate_parts && row.alternate_parts !== "-" ? row.alternate_parts.replace(/;/g, ",") : "",
      "Alt. Availability":  row.alt_availability || "",
      "DIB Received":       row.dib_last_received || "",
      "DIB Issue":          row.dib_last_issue    || "",
      "JRH Received":       row.jor_last_received || "",
      "JRH Issue":          row.jor_last_issue    || "",
      "DMU Received":       row.dim_last_received || "",
      "DMU Issue":          row.dim_last_issue    || "",
    }
  }

  // found first, not-found at bottom
  const found    = results.filter(r => r.found)
  const notFound = results.filter(r => !r.found)
  const sorted   = [...found, ...notFound]
  const rows     = sorted.map((row, i) => makeRow(row, i))

  const ws = XLSX.utils.json_to_sheet(rows)
  ws["!cols"] = [
    { wch: 4  },  // #
    { wch: 18 },  // Part Number
    { wch: 42 },  // Description
    { wch: 12 },  // MRP
    { wch: 8  },  // DIB
    { wch: 12 },  // DIB Transit
    { wch: 8  },  // JRH
    { wch: 12 },  // JRH Transit
    { wch: 8  },  // DMU
    { wch: 12 },  // DMU Transit
    { wch: 8  },  // DMU IRS
    { wch: 28 },  // Alternate Part No.
    { wch: 52 },  // Alt. Availability
    { wch: 14 },  // DIB Received
    { wch: 14 },  // DIB Issue
    { wch: 14 },  // JRH Received
    { wch: 14 },  // JRH Issue
    { wch: 14 },  // DMU Received
    { wch: 14 },  // DMU Issue
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Bulk Lookup")
  const now = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }).replace(/\//g, "-")
  XLSX.writeFile(wb, `TGP_Bulk_Lookup_${now}.xlsx`)
}

export default function BulkLookup() {
  const [input, setInput]     = useState("")
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const partList = input.split(/[\n,]+/).map(p => p.trim()).filter(Boolean)

  const handleLookup = async () => {
    if (!partList.length) return
    setLoading(true); setError(null)
    try {
      const data = await fetchBulk(partList)
      setResults(data)
    } catch {
      setError("Could not reach the server. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => { setInput(""); setResults(null); setError(null) }
  const handleKeyDown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleLookup() }

  // sort: found first, not-found at bottom
  const sorted = results
    ? [...results.filter(r => r.found), ...results.filter(r => !r.found)]
    : null

  // only show DMU IRS column if at least one result has IRS data
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
          Looking up {partList.length} part{partList.length !== 1 ? "s" : ""}...
        </div>
      )}

      {sorted && !loading && (
        <>
          <div className="bulk-summary">
            <span>{results.length} results</span>
            <span className="bulk-summary-found">{results.filter(r => r.found).length} found</span>
            <span className="bulk-summary-notfound">{results.filter(r => !r.found).length} not found</span>
          </div>

          <div className="bulk-table-wrap">
            <table className="bulk-table">
              <thead>
                <tr>
                  <th className="col-idx">#</th>
                  <th className="col-part">Part Number</th>
                  <th className="col-desc">Description</th>
                  <th className="col-mrp">MRP</th>
                  <th className="col-stock grp-start">DIB</th>
                  <th className="col-transit transit">DIB Transit</th>
                  <th className="col-stock grp-start">JRH</th>
                  <th className="col-transit transit">JRH Transit</th>
                  <th className="col-stock grp-start">DMU</th>
                  <th className="col-transit transit">DMU Transit</th>
                  {showIrs && <th className="col-irs grp-start">DMU IRS</th>}
                  <th className="col-altno grp-start">Alt. Part No.</th>
                  <th className="col-alt">Alt. Availability</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => {
                  if (!row.found) return (
                    <tr key={i} className="row-notfound">
                      <td className="td-idx">{i + 1}</td>
                      <td className="td-part">{row.part_number}</td>
                      <td colSpan={showIrs ? 11 : 10} className="td-notfound">Not found in database</td>
                    </tr>
                  )
                  const dib = stockVal(row.dibrugarh)
                  const jor = stockVal(row.jorhat)
                  const dim = stockVal(row.dimapur)
                  const irs = stockVal(row.dimapur_irs)
                  const altParts = row.alternate_parts && row.alternate_parts !== "-"
                    ? row.alternate_parts.replace(/;/g, ", ")
                    : ""
                  return (
                    <tr key={i}>
                      <td className="td-idx">{i + 1}</td>
                      <td className="td-part">{row.part_number}</td>
                      <td className="td-desc">{row.description || "—"}</td>
                      <td className="td-mrp">{formatMrp(row.mrp)}</td>
                      <td className={`td-stock grp-start ${dib.cls}`}>{dib.text}</td>
                      <td className="td-transit">{transitVal(row.tr_dibrugarh)}</td>
                      <td className={`td-stock grp-start ${jor.cls}`}>{jor.text}</td>
                      <td className="td-transit">{transitVal(row.tr_jorhat)}</td>
                      <td className={`td-stock grp-start ${dim.cls}`}>{dim.text}</td>
                      <td className="td-transit">{transitVal(row.tr_dimapur)}</td>
                      {showIrs && <td className={`td-stock grp-start ${irs.cls}`}>{irs.text}</td>}
                      <td className="td-altno grp-start">{altParts}</td>
                      <td className="td-alt">{row.alt_availability || ""}</td>
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
