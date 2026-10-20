# Kashliwal Motors — TGP Parts Lookup
## Setup & Refresh Guide

Stack: React + Vite (frontend, Render static site) · FastAPI (backend, Render web service) · Neon PostgreSQL (database).

---

## STEP 1 — Push code to GitHub

1. Create a repository called `kashliwal-tgp`
2. Upload the `backend/` and `frontend/` folders to it

---

## STEP 2 — Create the Neon database

1. Sign up at neon.tech and create a project
2. Copy the **connection string** (it starts with `postgresql://`) — you need it for the backend and the refresh script
3. Open the Neon SQL editor and run the contents of `backend/schema.sql`
   (`schema.sql` is for fresh setups only — it is not a migration script)

---

## STEP 3 — Deploy the backend (API)

1. In Render → New → Web Service, connect the GitHub repo
2. Settings:
   - Name: `kashliwal-tgp-api`
   - Root Directory: `backend`
   - Runtime: Python
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Environment Variables → add `DATABASE_URL` = the Neon connection string
4. Deploy, then test `https://kashliwal-tgp-api.onrender.com/health` — you should see `{"status":"ok"}`

---

## STEP 4 — Deploy the frontend

1. In Render → New → Static Site, connect the same repo
2. Settings:
   - Name: `kashliwal-tgp`
   - Root Directory: `frontend`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`
3. Environment Variables → add `VITE_API_URL` = `https://kashliwal-tgp-api.onrender.com`
4. Live at `https://kashliwal-tgp.onrender.com`

---

## STEP 5 — Configure the refresh script (one-time)

1. `pip install pandas openpyxl psycopg2-binary requests lxml`
2. Open `tgp_refresh.py` and set:
   - `DATABASE_URL` — the Neon connection string
   - `EXPORT_FOLDER` — where the Tata exports are saved (default `C:\TataExports`)
3. The three Google Sheets (`ALT_SHEET_ID` for alternate parts, `NLS_SHEET_ID` for No Longer Serviced parts,
   `BARREL_SHEET_ID` for barrel MRPs) are read directly by the script. They must stay shareable by link
   ("Anyone with the link can view").

---

## REFRESH (whenever new Tata data is received)

Put the files in `EXPORT_FOLDER` exactly like this:

```
TataExports/
  Inventory/
    dibrugarh_inventory.xlsx
    dimapur_inventory.xlsx
    jorhat_inventory.xlsx
  In transit/
    dibrugarh_transit.csv
    dimapur_transit.csv
    jorhat_transit.csv
  price_list.HTML      (HTML export; the file name must contain "price" or "output")
```

Then double-click `tgp_refresh.py` and wait for "REFRESH COMPLETE" (a few minutes).
The script rebuilds `tgp_parts` and `part_alternates` from scratch and adds a row to `tgp_meta`.
While it runs, lookups wait until it finishes, then show the new data.

---

## BARRELS (TMGO oils)

Siebel stores barrel quantities in millilitres and the Tata price list gives their MRP per ml. The refresh
script converts them so the site shows barrels:

- **Which parts:** part number starts with `TMGO` and the price-list MRP is above 0 and below 10.
- **Quantity:** stock and in-transit are divided by 210,000 (so 420,000 ml shows as 2; partial barrels show
  up to 2 decimals, e.g. 0.24).
- **MRP:** the true barrel MRP from the **Barrel MRP sheet** (`BARREL_SHEET_ID`) — header row, part number in
  column A, barrel MRP in column B. There is no calculated fallback.
- **Checks:** before touching the database, the script stops with a numbered list of problems if
  - a barrel part is not in the sheet,
  - a sheet MRP no longer matches the Tata price list (sheet MRP ÷ 210,000 must equal the price list's per-ml
    MRP to 2 decimals — this catches a price update you forgot to copy into the sheet),
  - a part is listed twice, has a non-numeric MRP, or is not a barrel in the price list (usually a typo).

  Fix the sheet and run the script again. Nothing is written to the database when the check fails.
- **No longer serviced:** a barrel that is in the NLS sheet is exempt from the checks. It shows the sheet MRP
  if the Barrel sheet has one, otherwise a dash.
- **Limit:** the price list rounds per-ml prices to 2 decimals, so a barrel price change smaller than about
  Rs. 1,050 cannot be detected.

---

## NOTES

- **Cold starts:** Render's free web service sleeps after 15 minutes idle. The app retries automatically
  and shows "Server waking up…". Upgrading to Render Starter ($7/month) removes this — no code changes needed.
- **Deploy order:** backend first, then frontend. CSS/JSX changes only need a frontend deploy.
- **Custom domain:** Render → frontend service → Settings → Custom Domain, then add the CNAME record.
