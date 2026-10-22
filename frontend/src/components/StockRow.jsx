import { useState } from "react"
import { deadAge } from "../utils"

// Bins are cleaned in tgp_refresh.py; this only guards against empty values
function isValidBin(val) {
  return !!val && val.trim() !== ""
}

export default function StockRow({ label, stock, transit, bins, lastReceived, forceDead }) {
  const [open, setOpen] = useState(false)

  const stockNum = (!stock || stock === "-" || stock === "Out of Stock") ? null : Number(stock)
  const isNA  = stock === "-" || stock === null
  const isOOS = !isNA && (stock === "Out of Stock" || stock === "0" || (stockNum !== null && stockNum <= 0))

  let qtyClass = "in-stock"
  let qtyText  = (!isOOS && !isNA) ? stockNum.toLocaleString() : ""
  if (isOOS) { qtyClass = "out-stock"; qtyText = "0" }
  if (isNA)  { qtyClass = "not-ord";   qtyText = "—" }

  const trQty = transit && transit !== "-" && Number(transit) > 0
    ? Number(transit) : null

  const validBins = (bins || []).filter(isValidBin)
  const hasChevron = !isNA && validBins.length > 0

  const age = (!isNA && !isOOS) ? (forceDead || deadAge(lastReceived)) : null

  // Dead stock quantity is red (zero stays grey, via .out-stock)
  if (age) qtyClass = "dead-stock"

  const handleClick = () => { if (hasChevron) setOpen(o => !o) }

  // border class: dead if age exists (or forceDead), neutral otherwise
  const borderClass = age ? "dead-row" : "fresh-row"

  return (
    <div className="stock-row-wrap">
      <div
        className={`stock-row ${borderClass}${open ? " expanded" : ""}${!hasChevron ? " no-expand" : ""}`}
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
