// Remove every blank from a part number — spaces, tabs, non-breaking and zero-width
// spaces that sneak in when copy-pasting. Real Tata part numbers never contain blanks.
export function cleanPart(s) {
  return (s || "").replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, "")
}

// True when a stock value is a real quantity above zero ("-" and "Out of Stock" are not)
export function hasStock(v) {
  return !!v && v !== "-" && v !== "Out of Stock" && Number(v) > 0
}

// Convert yyyy-mm-dd → dd-mm-yyyy for display
export function fmtDate(s) {
  if (!s) return ""
  const parts = s.split("-")
  if (parts.length === 3 && parts[0].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return s
}

// Returns age string like "1 yr", "1.5 yr", "2 yr" if date is >= 1 year old, else null
export function deadAge(s) {
  if (!s) return null
  const parts = s.split("-")
  if (parts.length !== 3 || parts[0].length !== 4) return null
  const received = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`)
  if (isNaN(received)) return null
  const diffMs = Date.now() - received.getTime()
  const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25)
  if (diffYears < 1) return null
  // Round to nearest 0.5
  const rounded = Math.round(diffYears * 2) / 2
  return `${rounded} yr`
}
