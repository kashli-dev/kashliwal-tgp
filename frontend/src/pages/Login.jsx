import { useState } from "react"
import kmplLogo from "../kmpl-logo.png"

// ── Change this to your chosen password ──────────────────────────────────────
const APP_PASSWORD = "kashliwal2024"
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "tgp_auth_date"

export function isAuthed() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return false
    const today = new Date().toISOString().slice(0, 10)
    return stored === today
  } catch { return false }
}

export function setAuthed() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem(STORAGE_KEY, today)
  } catch {}
}

export default function Login({ onSuccess }) {
  const [value, setValue]   = useState("")
  const [error, setError]   = useState(false)
  const [shake, setShake]   = useState(false)

  const attempt = () => {
    if (value === APP_PASSWORD) {
      setAuthed()
      onSuccess()
    } else {
      setError(true)
      setShake(true)
      setValue("")
      setTimeout(() => setShake(false), 500)
    }
  }

  const handleKey = (e) => {
    if (e.key === "Enter") attempt()
    if (error) setError(false)
  }

  return (
    <div className="login-page">
      <div className={`login-box${shake ? " shake" : ""}`}>
        <div className="login-brand">
          <img src={kmplLogo} alt="Kashliwal Motors" className="login-logo" />
          <span className="login-brand-name">Kashliwal Motors</span>
          <span className="login-brand-sub">TGP Parts Lookup</span>
        </div>

        <div className="login-field">
          <label className="login-label">Password</label>
          <input
            className={`login-input${error ? " error" : ""}`}
            type="password"
            placeholder="Enter password"
            value={value}
            onChange={e => { setValue(e.target.value); setError(false) }}
            onKeyDown={handleKey}
            autoFocus
            autoComplete="current-password"
          />
          {error && <div className="login-error">Incorrect password. Try again.</div>}
        </div>

        <button className="login-btn" onClick={attempt}>Enter</button>

        <span className="login-hint">Access restricted to authorised staff.</span>
      </div>
    </div>
  )
}
