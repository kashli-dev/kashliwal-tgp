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

function exportToExcel(results) {
  const rows = results.map((row, i) => {
    if (!row.found) return {
      "#": i + 1,
      "Part Number": row.part_number,
      "Description": "Not found",
      "MRP (Rs.)": "", "Dibrugarh": "", "Jorhat": "", "Dimapur": "",
      "Dib Transit": "", "Jor Transit": "", "Dim Transit": "",
      "Alt. Availability": "",
      "Last Received Date": "", "Last Issue Date": ""
    }

    const stockNum = (v) => {
      if (!v || v === "-" || v === "--") return ""
      if (v === "Out of Stock" || v === "0") return 0
      return Number(v)
    }
    const trNum = (v) => {
      if (!v || v === "-" || v === "--") return ""
      const n = Number(v)
      return n > 0 ? n : ""
    }

    return {
      "#": i + 1,
      "Part Number": row.part_number,
      "Description": row.description || "",
      "MRP (Rs.)": row.mrp ? Number(row.mrp) : "",
      "Dibrugarh": stockNum(row.dibrugarh),
      "Jorhat":    stockNum(row.jorhat),
      "Dimapur":   stockNum(row.dimapur),
      "Dib Transit": trNum(row.tr_dibrugarh),
      "Jor Transit": trNum(row.tr_jorhat),
      "Dim Transit": trNum(row.tr_dimapur),
      "Alt. Availability": row.alt_availability || "",
      "Last Received Date": row.last_received_date || "",
      "Last Issue Date":    row.last_issue_date    || "",
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)

  // Column widths
  ws["!cols"] = [
    { wch: 4 },   // #
    { wch: 18 },  // Part Number
    { wch: 42 },  // Description
    { wch: 12 },  // MRP
    { wch: 12 },  // Dibrugarh
    { wch: 10 },  // Jorhat
    { wch: 10 },  // Dimapur
    { wch: 12 },  // Dib Transit
    { wch: 12 },  // Jor Transit
    { wch: 12 },  // Dim Transit
    { wch: 48 },  // Alt Availability
    { wch: 22 },  // Last Received Date
    { wch: 22 },  // Last Issue Date
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
            <button className="btn-export" onClick={() => exportToExcel(results)}>
              Export .xlsx
            </button>
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

      {results && !loading && (
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
                  <th className="col-stock">Dibrugarh</th>
                  <th className="col-stock">Jorhat</th>
                  <th className="col-stock">Dimapur</th>
                  <th className="col-transit transit">Dib Transit</th>
                  <th className="col-transit transit">Jor Transit</th>
                  <th className="col-transit transit">Dim Transit</th>
                  <th className="col-alt">Alt. Availability</th>
                  <th className="col-date">Dib Received</th>
                  <th className="col-date">Dib Issue</th>
                  <th className="col-date">Jor Received</th>
                  <th className="col-date">Jor Issue</th>
                  <th className="col-date">Dim Received</th>
                  <th className="col-date">Dim Issue</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row, i) => {
                  if (!row.found) return (
                    <tr key={i} className="row-notfound">
                      <td className="td-idx">{i + 1}</td>
                      <td className="td-part">{row.part_number}</td>
                      <td colSpan={9} className="td-notfound">Not found in database</td>
                    </tr>
                  )
                  const dib = stockVal(row.dibrugarh)
                  const jor = stockVal(row.jorhat)
                  const dim = stockVal(row.dimapur)
                  return (
                    <tr key={i}>
                      <td className="td-idx">{i + 1}</td>
                      <td className="td-part">{row.part_number}</td>
                      <td className="td-desc">{row.description || "—"}</td>
                      <td className="td-mrp">
                        {row.mrp ? `Rs. ${Number(row.mrp).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className={`td-stock ${dib.cls}`}>{dib.text}</td>
                      <td className={`td-stock ${jor.cls}`}>{jor.text}</td>
                      <td className={`td-stock ${dim.cls}`}>{dim.text}</td>
                      <td className="td-transit">{transitVal(row.tr_dibrugarh)}</td>
                      <td className="td-transit">{transitVal(row.tr_jorhat)}</td>
                      <td className="td-transit">{transitVal(row.tr_dimapur)}</td>
                      <td className="td-alt">{row.alt_availability || ""}</td>
                      <td className="td-date">{row.dib_last_received || ""}</td>
                      <td className="td-date">{row.dib_last_issue    || ""}</td>
                      <td className="td-date">{row.jor_last_received || ""}</td>
                      <td className="td-date">{row.jor_last_issue    || ""}</td>
                      <td className="td-date">{row.dim_last_received || ""}</td>
                      <td className="td-date">{row.dim_last_issue    || ""}</td>
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
