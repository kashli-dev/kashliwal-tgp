import { useState } from "react"
import SingleLookup from "./pages/SingleLookup"
import BulkLookup from "./pages/BulkLookup"
import "./App.css"

export default function App() {
  const [tab, setTab] = useState("single")

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-name">Kashliwal Motors</span>
            <span className="brand-sub">Authorised Distributor · Tata Genuine Parts</span>
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

      <main className="main">
        {tab === "single" ? <SingleLookup /> : <BulkLookup />}
      </main>
    </div>
  )
}
