export default function StockRow({ label, stock, transit }) {
  const isNum   = stock !== "-" && stock !== "Out of Stock" && stock !== null
  const isOOS   = stock === "Out of Stock" || stock === "0"
  const isNA    = stock === "-" || stock === null

  let qtyClass = "in-stock"
  let qtyText  = isNum ? `${Number(stock).toLocaleString()}` : ""
  if (isOOS) { qtyClass = "out-stock"; qtyText = "Out of Stock" }
  if (isNA)  { qtyClass = "not-ord";   qtyText = "—" }

  const trQty = transit && transit !== "-" && Number(transit) > 0
    ? Number(transit) : null

  return (
    <div className="stock-row">
      <span className="stock-wh">{label}</span>
      <span className={`stock-qty ${qtyClass}`}>{qtyText}</span>
      {trQty && (
        <span className="stock-transit">+ {trQty.toLocaleString()} in transit</span>
      )}
    </div>
  )
}
