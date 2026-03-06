import { useState } from "react"

function isValidBin(val) {
  if (!val || val.trim() === "") return false
  const v = val.trim()
  if (v.includes(":")) return false
  if (/^\d+$/.test(v)) return false
  return true
}

export default function StockRow({ label, stock, transit, bins }) {
  const [open, setOpen] = useState(false)

  const isOOS = stock === "Out of Stock" || stock === "0"
  const isNA  = stock === "-" || stock === null

  let qtyClass = "in-stock"
  let qtyText  = (!isOOS && !isNA) ? Number(stock).toLocaleString() : ""
  if (isOOS) { qtyClass = "out-stock"; qtyText = "0" }
  if (isNA)  { qtyClass = "not-ord";   qtyText = "—" }

  const trQty = transit && transit !== "-" && Number(transit) > 0
    ? Number(transit) : null

  const validBins = (bins || []).filter(isValidBin)
  const hasChevron = !isNA && validBins.length > 0

  const handleClick = () => { if (hasChevron) setOpen(o => !o) }

  return (
    <div className="stock-row-wrap">
      <div
        className={`stock-row${open ? " expanded" : ""}${!hasChevron ? " no-expand" : ""}`}
        onClick={handleClick}
      >
        <span className="stock-wh">{label}</span>
        <span className={`stock-qty ${qtyClass}`}>{qtyText}</span>
        {trQty && <span className="stock-transit">+ {trQty.toLocaleString()} in transit</span>}
        {hasChevron && <span className="stock-chevron">▼</span>}
      </div>
      {hasChevron && (
        <div className={`stock-bins${open ? " open" : ""}`}>
          <div className="stock-bins-inner">
            <span className="bin-label">Bins</span>
            {validBins.map((b, i) => <span key={i} className="bin-tag">{b}</span>)}
          </div>
        </div>
      )}
    </div>
  )
}
