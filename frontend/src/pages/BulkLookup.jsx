import { useState } from "react"
import { fetchBulk } from "../api"
import LastUpdated from "../components/LastUpdated"

function stockCell(val) {
  if (!val || val === "-" || val === "--") return { text: "", cls: "na" }
  if (val === "Out of Stock" || val === "0") return { text: "0", cls: "oos" }
  return { text: Number(val).toLocaleString(), cls: "in" }
}

function transitCell(val) {
  if (!val || val === "-" || val === "--") return ""
  const n = Number(val)
  return n > 0 ? n.toLocaleString() : ""
}

export default function BulkLookup() {
  const [input, setInput]   = useState("")
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  const handleLookup = async () => {
    const parts = input
      .split(/[\n,]+/)
      .map(p => p.trim())
      .filter(Boolean)
    if (!parts.length) return

    setLoading(true); setError(null)
    try {
      const data = await fetchBulk(parts)
      setResults(data)
    } catch {
      setError("Could not reach the server. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setInput(""); setResults(null); setError(null)
  }

  const partCount = input.split(/[\n,]+/).filter(p => p.trim()).length

  return (
    <div>
      <textarea
        className="bulk-input"
        placeholder={"Paste part numbers here, one per line or comma-separated.\n\nE.g.\n272635100401\n886399000043\n253414110417"}
        value={input}
        onChange={e => setInput(e.target.value)}
        spellCheck={false}
      />

      <div className="bulk-actions">
        <button className="btn-primary" onClick={handleLookup} disabled={loading || !partCount}>
          {loading ? "Looking up..." : "Look Up Parts"}
        </button>
        <button className="btn-clear" onClick={handleClear}>Clear</button>
        {partCount > 0 && (
          <span className="bulk-count">{partCount} part{partCount !== 1 ? "s" : ""} entered</span>
        )}
      </div>

      {error && <div className="not-found">{error}</div>}

      {loading && (
        <div className="loading">
          <div className="spinner" />
          Looking up {partCount} parts...
        </div>
      )}

      {results && !loading && (
        <div className="bulk-table-wrap">
          <table className="bulk-table">
            <thead>
              <tr>
                <th>Part Number</th>
                <th>Description</th>
                <th>MRP</th>
                <th style={{textAlign:"center"}}>Dibrugarh</th>
                <th style={{textAlign:"center"}}>Jorhat</th>
                <th style={{textAlign:"center"}}>Dimapur</th>
                <th className="transit" style={{textAlign:"center"}}>Dib Transit</th>
                <th className="transit" style={{textAlign:"center"}}>Jor Transit</th>
                <th className="transit" style={{textAlign:"center"}}>Dim Transit</th>
                <th>Alt. Availability</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row, i) => {
                if (!row.found) return (
                  <tr key={i} className="not-found">
                    <td className="td-part">{row.part_number}</td>
                    <td colSpan={9} style={{color:"var(--white25)",fontSize:11}}>Not found</td>
                  </tr>
                )
                const dib = stockCell(row.dibrugarh)
                const jor = stockCell(row.jorhat)
                const dim = stockCell(row.dimapur)
                return (
                  <tr key={i}>
                    <td className="td-part">{row.part_number}</td>
                    <td className="td-desc">{row.description}</td>
                    <td className="td-mrp">
                      {row.mrp ? `Rs. ${Number(row.mrp).toLocaleString("en-IN",{minimumFractionDigits:2})}` : "—"}
                    </td>
                    <td className={`td-stock ${dib.cls}`}>{dib.text}</td>
                    <td className={`td-stock ${jor.cls}`}>{jor.text}</td>
                    <td className={`td-stock ${dim.cls}`}>{dim.text}</td>
                    <td className="td-transit">{transitCell(row.tr_dibrugarh)}</td>
                    <td className="td-transit">{transitCell(row.tr_jorhat)}</td>
                    <td className="td-transit">{transitCell(row.tr_dimapur)}</td>
                    <td className="td-alt">{row.alt_availability || ""}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <LastUpdated />
    </div>
  )
}
