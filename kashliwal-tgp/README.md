# Kashliwal Motors — Parts Lookup App
## Deployment Guide

---

## STEP 1 — Push code to GitHub

1. Create a free account at github.com if you don't have one
2. Create a new repository called `kashliwal-tgp`
3. Upload the `backend/` and `frontend/` folders to it

---

## STEP 2 — Create Render account

Sign up at render.com (free)

---

## STEP 3 — Create the PostgreSQL database

1. In Render dashboard → New → PostgreSQL
2. Name: `kashliwal-tgp-db`
3. Plan: Free
4. Click Create
5. Once created, copy the **External Database URL** — you'll need it twice

---

## STEP 4 — Set up the database schema

1. Install psql on your PC, OR use any PostgreSQL client (e.g. DBeaver, free)
2. Connect using the External Database URL from Step 3
3. Run the contents of `backend/schema.sql`

---

## STEP 5 — Deploy the backend (API)

1. In Render → New → Web Service
2. Connect your GitHub repo
3. Settings:
   - Name: `kashliwal-tgp-api`
   - Root Directory: `backend`
   - Runtime: Python
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Plan: Free
4. Environment Variables → Add:
   - Key: `DATABASE_URL`
   - Value: paste the Internal Database URL from Step 3
5. Click Deploy
6. Wait ~2 min. Test by visiting: `https://kashliwal-tgp-api.onrender.com/health`
   You should see: `{"status":"ok"}`

---

## STEP 6 — Deploy the frontend

1. In Render → New → Static Site
2. Connect the same GitHub repo
3. Settings:
   - Name: `kashliwal-tgp`
   - Root Directory: `frontend`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`
4. Environment Variables → Add:
   - Key: `VITE_API_URL`
   - Value: `https://kashliwal-tgp-api.onrender.com`
5. Click Deploy
6. Your app will be live at: `https://kashliwal-tgp.onrender.com`

---

## STEP 7 — Configure the refresh script

1. Open `tgp_refresh.py` in any text editor
2. Paste your **External Database URL** into the `DATABASE_URL` line
3. Set `EXPORT_FOLDER` to wherever your Siebel CSVs are saved
4. Save the file

---

## DAILY REFRESH (every morning)

1. Export 6 CSVs from Siebel (3 inventory + 3 transit) + price list
2. Save them in the correct subfolders (see folder structure in script)
3. Double-click `tgp_refresh.py`
4. Wait ~30 seconds for ✅ REFRESH COMPLETE
5. All DSRs see fresh data immediately

**To run on a different PC:** copy `tgp_refresh.py` + `Alternate_Part_Numbers.xlsx`
to that machine. Python + `pip install pandas openpyxl psycopg2-binary` required.

---

## UPGRADING TO PAID (when ready)

- In Render dashboard, click your web service → Settings → Change Plan → Starter ($7/month)
- No code changes needed. Zero downtime upgrade.

## CUSTOM DOMAIN (when ready)

- Buy domain (e.g. Namecheap, ~₹800/year)
- In Render → your frontend service → Settings → Custom Domain
- Add a CNAME record pointing to Render — takes 5 minutes
