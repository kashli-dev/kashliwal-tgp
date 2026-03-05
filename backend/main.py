from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import psycopg2
import psycopg2.extras
import os
import re

app = FastAPI(title="Kashliwal Motors — TGP Parts API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.environ.get("DATABASE_URL", "")

def get_conn():
    url = DATABASE_URL
    # Render gives postgres:// but psycopg2 needs postgresql://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)

def normalize(part: str) -> str:
    return part.strip().upper()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/meta")
def meta():
    """Returns last updated timestamp"""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT refreshed_at FROM tgp_meta ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        conn.close()
        return {"last_updated": str(row["refreshed_at"]) if row else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/part/{part_number}")
def get_part(part_number: str):
    """Single part lookup"""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT
                part_number, description, mrp, discount_code,
                dibrugarh, jorhat, dimapur,
                alternate_parts, dimapur_irs,
                alt_availability,
                tr_dibrugarh, tr_jorhat, tr_dimapur,
                dib_last_received, dib_last_issue,
                jor_last_received, jor_last_issue,
                dim_last_received, dim_last_issue
            FROM tgp_parts
            WHERE part_number = %s
        """, (normalize(part_number),))
        row = cur.fetchone()
        conn.close()
        if not row:
            return {"found": False, "part_number": part_number}
        result = dict(row)
        result["found"] = True
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/parts/bulk")
def bulk_lookup(part_numbers: List[str]):
    """Bulk part lookup — accepts list of part numbers"""
    if len(part_numbers) > 500:
        raise HTTPException(status_code=400, detail="Max 500 parts per request")
    try:
        conn = get_conn()
        cur = conn.cursor()
        normalized = [normalize(p) for p in part_numbers if p.strip()]
        if not normalized:
            return []
        cur.execute("""
            SELECT
                part_number, description, mrp, discount_code,
                dibrugarh, jorhat, dimapur,
                alternate_parts, dimapur_irs,
                alt_availability,
                tr_dibrugarh, tr_jorhat, tr_dimapur,
                dib_last_received, dib_last_issue,
                jor_last_received, jor_last_issue,
                dim_last_received, dim_last_issue
            FROM tgp_parts
            WHERE part_number = ANY(%s)
        """, (normalized,))
        rows = {r["part_number"]: dict(r) for r in cur.fetchall()}
        conn.close()
        # Return in same order as input, mark not found
        result = []
        for p in normalized:
            if p in rows:
                result.append({**rows[p], "found": True})
            else:
                result.append({"part_number": p, "found": False})
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/search")
def search(q: str = Query(..., min_length=2)):
    """Search parts by number prefix or description keyword"""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT part_number, description, mrp,
                   dibrugarh, jorhat, dimapur,
                   tr_dibrugarh, tr_jorhat, tr_dimapur,
                dib_last_received, dib_last_issue,
                jor_last_received, jor_last_issue,
                dim_last_received, dim_last_issue
            FROM tgp_parts
            WHERE part_number ILIKE %s OR description ILIKE %s
            LIMIT 20
        """, (f"{q}%", f"%{q}%"))
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))