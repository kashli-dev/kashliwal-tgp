import { useState } from "react"
import SingleLookup from "./pages/SingleLookup"
import BulkLookup from "./pages/BulkLookup"
import Login, { isAuthed } from "./pages/Login"
import "./App.css"
import kmplLogo from "./kmpl-logo.png"

export default function App() {
  const [tab, setTab] = useState("single")
  const [authed, setAuthed] = useState(isAuthed)

  if (!authed) return <Login onSuccess={() => setAuthed(true)} />

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <img src={kmplLogo} alt="Kashliwal Motors" className="brand-logo" />
            <div className="brand-text">
              <span className="brand-name">Kashliwal Motors</span>
              <span className="brand-sub">Authorised Distributor · Tata Genuine Parts</span>
            </div>
          </div>
          <nav className="nav">
            <button
              className={`nav-btn ${tab === "single" ? "active" : ""}`}
              onClick={() => setTab("single")}
            >
              Part Lookup
            </button>
            <button
              className={`nav-btn ${tab === "bulk" ? "active" : ""}`}
              onClick={() => setTab("bulk")}
            >
              Bulk Lookup
            </button>
          </nav>
        </div>
      </header>

      <main className={`main${tab === "bulk" ? " bulk" : ""}`}>
        {tab === "single" ? <SingleLookup /> : <BulkLookup />}
      </main>
    </div>
  )
}
