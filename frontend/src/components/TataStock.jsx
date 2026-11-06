import { useState } from "react"

// Tata's own stock for the searched part. Hidden until the section label is clicked.
// data = { available: bool, rows: [{ plant, qty }] } from the API (tata_stock).
export default function TataStock({ data }) {
  const [open, setOpen] = useState(false)
  if (!data) return null   // API has no Tata stock info (e.g. backend not updated yet)

  return (
    <div className="tata-wrap">
      <button
        type="button"
        className={`tata-toggle${open ? " open" : ""}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span>Tata Stock</span>
        <span className="tata-chev">▼</span>
      </button>

      {open && (
        <div className="tata-panel">
          <div className="tata-head">Tata Stock · All India</div>
          {!data.available ? (
            <div className="tata-warn">Latest All India Stock is not available</div>
          ) : data.rows.length === 0 ? (
            <div className="tata-none">No stock available with Tata</div>
          ) : (
            data.rows.map(r => (
              <div key={r.plant} className="tata-row">
                <span className="tata-loc">{r.plant}</span>
                <span className="tata-qty">{Number(r.qty).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
