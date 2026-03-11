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
                dim_last_received, dim_last_issue,
                dib_bins, jor_bins, dim_bins, irs_bins,
                is_nls
            FROM tgp_parts
            WHERE part_number = %s
        """, (normalize(part_number),))
        row = cur.fetchone()
        if not row:
            conn.close()
            return {"found": False, "part_number": part_number}
        result = dict(row)
        result["found"] = True

        # Fetch alt_details via part_alternates join
        cur.execute("""
            SELECT
                a.part_number, a.description, a.is_nls,
                a.dibrugarh, a.jorhat, a.dimapur,
                a.tr_dibrugarh, a.tr_jorhat, a.tr_dimapur,
                a.dib_last_received, a.jor_last_received, a.dim_last_received
            FROM part_alternates pa
            JOIN tgp_parts a ON a.part_number = pa.alt_part_number
            WHERE pa.part_number = %s
            ORDER BY a.part_number
        """, (normalize(part_number),))
        result["alt_details"] = [dict(r) for r in cur.fetchall()]

        conn.close()
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
                dim_last_received, dim_last_issue,
                dib_bins, jor_bins, dim_bins, irs_bins,
                is_nls
            FROM tgp_parts
            WHERE part_number = ANY(%s)
        """, (normalized,))
        rows = {r["part_number"]: dict(r) for r in cur.fetchall()}

        # Fetch alt_details for all found parts in one query
        found_parts = list(rows.keys())
        alt_details_map = {p: [] for p in found_parts}
        if found_parts:
            cur.execute("""
                SELECT
                    pa.part_number as lookup_pn,
                    a.part_number, a.description, a.is_nls,
                    a.dibrugarh, a.jorhat, a.dimapur,
                    a.tr_dibrugarh, a.tr_jorhat, a.tr_dimapur,
                    a.dib_last_received, a.jor_last_received, a.dim_last_received
                FROM part_alternates pa
                JOIN tgp_parts a ON a.part_number = pa.alt_part_number
                WHERE pa.part_number = ANY(%s)
                ORDER BY a.part_number
            """, (found_parts,))
            for r in cur.fetchall():
                d = dict(r)
                lookup_pn = d.pop("lookup_pn")
                alt_details_map[lookup_pn].append(d)

        conn.close()
        # Return in same order as input, mark not found
        result = []
        for p in normalized:
            if p in rows:
                result.append({**rows[p], "found": True, "alt_details": alt_details_map.get(p, [])})
            else:
                result.append({"part_number": p, "found": False})
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/search")
def search(q: str = Query(..., min_length=2)):
    """Search parts by part number — contains match or wildcard (*) — used for autocomplete"""
    try:
        conn = get_conn()
        cur = conn.cursor()
        nq = normalize(q)
        if "*" in nq:
            # Wildcard mode: * -> % for SQL ILIKE
            pattern = nq.replace("*", "%")
            cur.execute("""
                SELECT part_number, description
                FROM tgp_parts
                WHERE part_number ILIKE %s
                ORDER BY part_number
                LIMIT 10
            """, (pattern,))
        else:
            # Contains match, prefix results first
            cur.execute("""
                SELECT part_number, description
                FROM tgp_parts
                WHERE part_number ILIKE %s
                ORDER BY
                    CASE WHEN part_number ILIKE %s THEN 0 ELSE 1 END,
                    part_number
                LIMIT 10
            """, (f"%{nq}%", f"{nq}%"))
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
