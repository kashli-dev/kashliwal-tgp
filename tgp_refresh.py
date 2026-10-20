"""
tgp_refresh.py  —  Kashliwal Motors Parts Inventory Refresh
============================================================
Reads Siebel exports and pushes data to the PostgreSQL database.
Run this every morning after exporting files from Siebel.

FOLDER STRUCTURE EXPECTED:
  C:/TataExports/
    Inventory/
      dimapur_inventory.xlsx   (Excel export — preserves leading zeros)
      dibrugarh_inventory.xlsx
      jorhat_inventory.xlsx
    In transit/
      dimapur_transit.csv
      dibrugarh_transit.csv
      jorhat_transit.csv
    output__22_.HTML  (price list — must be HTML export; CSV not accepted)

BARRELS (TMGO oils):
  Siebel stores barrel quantities in millilitres and the price list gives MRP per ml.
  210,000 ml = 1 barrel. A part is a barrel if its number starts with TMGO and its
  price-list MRP is above 0 and below 10. Barrel MRPs come from the Barrel MRP Google
  Sheet (BARREL_SHEET_ID: part number in column A, MRP in column B, header row).
  The script stops before touching the database if a barrel is missing from the
  sheet or its sheet MRP no longer matches the Tata price list. Barrels that are in
  the NLS sheet are exempt from that check.

SETUP (one-time):
  pip install pandas openpyxl psycopg2-binary requests lxml
"""

import pandas as pd
import re
import os
import sys
import warnings
import psycopg2
import psycopg2.extras
from datetime import datetime
from pathlib import Path

# Suppress openpyxl 'no default style' warning from Siebel Excel exports
warnings.filterwarnings('ignore', category=UserWarning, module='openpyxl')

# ── CONFIG ────────────────────────────────────────────────────────────────────
# Paste your Neon PostgreSQL connection string here (the real one must never be committed to GitHub):
DATABASE_URL = "PASTE_YOUR_NEON_CONNECTION_STRING_HERE"

# Folder where your Siebel exports live:
EXPORT_FOLDER = r"C:\TataExports"

# Google Sheet ID for Alternate Part Numbers:
ALT_SHEET_ID = "16U-Mxf-rpsDe1VWstOihkO46tkvBOX0HE_nX6lPcL7Y"
# Google Sheet ID for NLS (No Longer Serviced) parts:
NLS_SHEET_ID = "1FwL6bSLZfHRgoX5FkEPxB_Z9r6DU8Q_nJ3QkdyuM_X4"
# Google Sheet ID for Barrel MRPs (TMGO barrels): col A = part number, col B = MRP, header row
BARREL_SHEET_ID = "1WCf2K8_wEl32nCNojVPSdMUdtI7xLod0aerbBLvE5_A"
# ──────────────────────────────────────────────────────────────────────────────


def log(msg): print(f"  {msg}")

def read_inv(path):
    # Excel export preserves leading zeros on part numbers
    df = pd.read_excel(path, dtype=str)
    df['Part #'] = df['Part #'].apply(lambda s: str(s).strip().strip('"').strip())
    # Only include rows that are On Hand and Good
    if 'Availability' in df.columns:
        df = df[df['Availability'].str.strip() == 'On Hand']
    if 'Status' in df.columns:
        df = df[df['Status'].str.strip() == 'Good']
    return df

def read_transit(path):
    with open(path,'rb') as f: raw = f.read(4)
    enc = 'utf-16' if raw[:2]==b'\xff\xfe' else 'latin1'
    df = pd.read_csv(path, encoding=enc, sep='\t', dtype=str)
    df['Part #'] = df['Part #'].apply(lambda s: str(s).strip().strip('"').strip())
    df['Recd Qty'] = pd.to_numeric(df['Recd Qty'], errors='coerce').fillna(0).astype(int)
    return df.groupby('Part #')['Recd Qty'].sum().to_dict()

def clean_qty(s):
    try: return max(0, int(float(str(s).strip().replace(',',''))))
    except: return 0

def parse_mrp(s):
    nums = re.sub(r'[^\d.]','',str(s)).replace(',','')
    parts = nums.split('.')
    if len(parts)<=2:
        try: return float(nums)
        except: return 0.0
    else:
        try: return float(parts[-2]+'.'+parts[-1])
        except: return 0.0

def find_price_list(folder):
    # HTML export only — preserves leading zeros; CSV is not accepted
    for ext in ['*.htm', '*.html', '*.HTM', '*.HTML']:
        for f in Path(folder).glob(ext):
            if any(k in f.name.lower() for k in ['output','price']):
                return str(f)
    raise FileNotFoundError(
        f"No HTML price list found in {folder}\n"
        f"   Export the price list as HTML from Siebel (not CSV)."
    )


# ── BARREL HELPERS ────────────────────────────────────────────────────────────
BARREL_ML         = 210000   # 1 barrel = 210,000 ml
BARREL_PREFIX     = "TMGO"
BARREL_MRP_BELOW  = 10       # barrel = TMGO part with price-list MRP above 0 and below this (per-ml price)

class BarrelPriceError(Exception):
    pass

def is_barrel(part, mrp):
    return (str(part).upper().startswith(BARREL_PREFIX)
            and mrp is not None and 0 < mrp < BARREL_MRP_BELOW)

def to_barrels(ml):
    """Millilitres -> barrels (2 decimals). A non-zero quantity never rounds down to 0."""
    if ml <= 0:
        return 0
    return max(round(ml / BARREL_ML, 2), 0.01)

def fmt_qty(q):
    """Whole numbers as-is; barrel fractions without trailing zeros (2, 0.24, 1.5)."""
    if isinstance(q, float):
        return f"{q:.2f}".rstrip('0').rstrip('.')
    return str(q)

def parse_sheet_mrp(v):
    """Barrel sheet MRP as a positive float, or None if it is not a valid number."""
    s = re.sub(r'(?i)^rs\.?', '', str(v).strip()).replace('\u20b9', '').replace(',', '').strip()
    try:
        n = float(s)
    except ValueError:
        return None
    return n if n > 0 and n == n and n != float('inf') else None

def check_barrel_sheet(price_map, nls_set, sheet_df):
    """
    Verify the Barrel MRP sheet against the Tata price list.
    Returns {barrel part: barrel MRP (None for an NLS barrel that is not in the sheet)}.
    Raises BarrelPriceError listing EVERY problem found.
    """
    problems = []   # (part, message)
    sheet = {}      # part -> MRP (None = invalid value)
    rows_seen = {}  # part -> list of raw MRP values, to catch duplicates

    if sheet_df.shape[1] < 2:
        raise BarrelPriceError(
            "\u274c BARREL PRICE CHECK FAILED \u2014 nothing was written to the database.\n\n"
            "The Barrel MRP sheet needs two columns: part number (A) and MRP (B).")

    for _, row in sheet_df.iterrows():
        raw_pn, raw_mrp = row.iloc[0], row.iloc[1]
        if pd.isna(raw_pn) and pd.isna(raw_mrp):
            continue
        pn = re.sub(r'\s+', '', str(raw_pn)).upper() if pd.notna(raw_pn) else ''
        if not pn:
            problems.append(("", f"a sheet row has an MRP ({raw_mrp}) but no part number."))
            continue
        rows_seen.setdefault(pn, []).append(raw_mrp)
        sheet[pn] = parse_sheet_mrp(raw_mrp) if pd.notna(raw_mrp) else None
        if sheet[pn] is None:
            shown = "blank" if pd.isna(raw_mrp) else f"'{raw_mrp}'"
            problems.append((pn, f"MRP in the sheet is not a valid number ({shown})."))

    for pn, vals in rows_seen.items():
        if len(vals) > 1:
            problems.append((pn, f"listed {len(vals)} times in the sheet ({', '.join(str(v) for v in vals)}). Keep one row."))

    candidates = {p: v['MRP'] for p, v in price_map.items() if is_barrel(p, v['MRP'])}
    result, skipped_nls = {}, 0

    for p, per_ml in sorted(candidates.items()):
        is_nls = p in nls_set
        if is_nls:
            skipped_nls += 1
        if p not in sheet:
            if not is_nls:
                problems.append((p, "not in the Barrel MRP sheet. Add its barrel MRP."))
            result[p] = None
            continue
        value = sheet[p]
        result[p] = value
        if value is None or is_nls:
            continue
        if abs(value / BARREL_ML - per_ml) > 0.005 + 1e-9:
            lo, hi = (per_ml - 0.005) * BARREL_ML, (per_ml + 0.005) * BARREL_ML
            problems.append((p,
                f"sheet says Rs. {value:,.0f} (Rs. {value / BARREL_ML:.4f}/ml) but the Tata price list says "
                f"Rs. {per_ml:.2f}/ml (a barrel MRP of about Rs. {lo:,.0f} to {hi:,.0f}). Update the sheet."))

    for pn in sorted(sheet):
        if pn not in candidates:
            problems.append((pn, "is in the sheet but is not a barrel in the Tata price list "
                                 "(TMGO part with a per-ml MRP). Check the part number or remove the row."))

    if problems:
        problems.sort(key=lambda x: x[0])
        width = max(len(p) for p, _ in problems)
        lines = [f"{i:>2}. {p.ljust(width)}  \u2014 {msg}" if p else f"{i:>2}. {msg}"
                 for i, (p, msg) in enumerate(problems, 1)]
        raise BarrelPriceError(
            "\u274c BARREL PRICE CHECK FAILED \u2014 nothing was written to the database.\n\n"
            + "\n".join(lines)
            + "\n\nFix the Barrel MRP Google Sheet, then run the script again.")

    log(f"Barrel MRP check passed: {len(candidates)} barrel parts ({skipped_nls} NLS, not checked)")
    return result


def main():
    print("\n" + "="*55)
    print("  KASHLIWAL MOTORS — TGP PARTS INVENTORY REFRESH")
    print("="*55)

    export = Path(EXPORT_FOLDER)
    inv_folder = export / "Inventory"
    tr_folder  = export / "In transit"

    # ── Load inventory Excel files (xlsx preserves leading zeros)
    log("Loading inventory files...")
    dib = read_inv(inv_folder / "dibrugarh_inventory.xlsx")
    dim = read_inv(inv_folder / "dimapur_inventory.xlsx")
    jor = read_inv(inv_folder / "jorhat_inventory.xlsx")

    # ── Load transit CSVs
    log("Loading transit files...")
    tr_dib = read_transit(tr_folder / "dibrugarh_transit.csv")
    tr_dim = read_transit(tr_folder / "dimapur_transit.csv")
    tr_jor = read_transit(tr_folder / "jorhat_transit.csv")

    # ── Load price list
    log("Loading price list...")
    pl_path = find_price_list(EXPORT_FOLDER)
    log(f"  (HTML: {Path(pl_path).name})")
    pl = pd.read_html(pl_path, encoding='utf-16', flavor='lxml')[0]
    pl.columns = pl.columns.str.strip()
    pl = pl[pl['UMRP'].notna() & pl['UMRP'].str.contains('Rs', na=False)].copy()
    pl['Part #'] = pl['Part #'].apply(lambda s: str(s).strip().strip('"').strip())
    pl['MRP'] = pl['UMRP'].apply(parse_mrp)

    # ── Load alternate parts from Google Sheet
    log("Loading alternate parts from Google Sheet...")
    import requests, io
    alt_url = f"https://docs.google.com/spreadsheets/d/{ALT_SHEET_ID}/export?format=xlsx"
    alt_resp = requests.get(alt_url, timeout=30)
    alt_resp.raise_for_status()
    alt_df = pd.read_excel(io.BytesIO(alt_resp.content), dtype=str)
    # Build raw pairs first
    raw_pairs = []
    for _, row in alt_df.iterrows():
        if pd.notna(row.iloc[0]) and pd.notna(row.iloc[1]):
            a, b = str(row.iloc[0]).strip(), str(row.iloc[1]).strip()
            raw_pairs.append((a, b))

    # Union-Find to group all parts that are alternates of each other
    parent = {}
    def find(x):
        parent.setdefault(x, x)
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]
    def union(x, y):
        parent[find(x)] = find(y)

    for a, b in raw_pairs:
        union(a, b)

    # Group all parts by their root
    groups = {}
    for x in parent:
        root = find(x)
        groups.setdefault(root, set()).add(x)

    # Build fully cross-linked alt_map — every member lists all others in its group
    # Sorted alphabetically so alternate_parts and alt_availability are in consistent order
    alt_map = {}
    for group in groups.values():
        for part in group:
            others = sorted(p for p in group if p != part)
            if others:
                alt_map[part] = others

    # ── Load NLS list from Google Sheet
    log("Loading NLS list from Google Sheet...")
    nls_url = f"https://docs.google.com/spreadsheets/d/{NLS_SHEET_ID}/export?format=xlsx"
    nls_resp = requests.get(nls_url, timeout=30)
    nls_resp.raise_for_status()
    nls_df = pd.read_excel(io.BytesIO(nls_resp.content), dtype=str)
    # Single column, has header — take first column, skip header
    nls_set = set(str(v).strip() for v in nls_df.iloc[:, 0].dropna() if str(v).strip())
    log(f"  {len(nls_set):,} NLS parts loaded")

    # ── Build maps
    price_map = {}
    for _, r in pl.iterrows():
        p = r['Part #']
        if p not in price_map:
            dc = str(r.get('Discount Code (CVBU)','') or '').strip()
            price_map[p] = {'Desc': str(r['Part Description']).strip(), 'MRP': r['MRP'], 'DC': dc}

    # ── Barrels: check the Barrel MRP sheet against the price list, then use the sheet MRPs.
    # Runs before anything is written to the database; stops with a clear message on any problem.
    log("Loading barrel MRP sheet...")
    barrel_url = f"https://docs.google.com/spreadsheets/d/{BARREL_SHEET_ID}/export?format=xlsx"
    barrel_resp = requests.get(barrel_url, timeout=30)
    barrel_resp.raise_for_status()
    barrel_df = pd.read_excel(io.BytesIO(barrel_resp.content), dtype=str)
    barrel_mrp = check_barrel_sheet(price_map, nls_set, barrel_df)
    for p, mrp in barrel_mrp.items():
        price_map[p]['MRP'] = mrp      # None (NLS barrel not in the sheet) shows as a dash
    barrel_parts = set(barrel_mrp)

    def desc_map(df):
        d = {}
        for _, r in df.iterrows():
            p = r['Part #']
            if p not in d: d[p] = str(r.get('Description','')).strip()
        return d
    dm_d = desc_map(dim); dib_d = desc_map(dib); jor_d = desc_map(jor)

    def inv_map(df):
        d = {}
        for _, r in df.iterrows():
            p = r['Part #']; q = clean_qty(r.get('Qty',0))
            d[p] = d.get(p,0) + q
        return d

    def date_map(df, col):
        """Returns dict of part# -> date string (date only, no time)"""
        d = {}
        for _, r in df.iterrows():
            p = r['Part #']
            v = str(r.get(col, '') or '').strip()
            if v and v != 'nan':
                # Strip time — keep only the date part (before first space)
                d[p] = v.split(' ')[0]
        return d

    map_dib = inv_map(dib)
    dim_irs = dim[dim['Inventory Location']=='DIMAPUR'].copy()
    dim_reg = dim[dim['Inventory Location']!='DIMAPUR'].copy()
    map_dim = inv_map(dim_reg)
    map_irs = inv_map(dim_irs)
    map_jor = inv_map(jor)

    # Barrels: Siebel quantities are in ml -> convert stock and in-transit to barrels
    for qty_map in (map_dib, map_dim, map_irs, map_jor, tr_dib, tr_dim, tr_jor):
        for p in barrel_parts:
            if p in qty_map:
                qty_map[p] = to_barrels(qty_map[p])
    log(f"{len(barrel_parts)} barrel parts: MRP from sheet, quantities converted to barrels")

    recv_dib = date_map(dib,     'Last Received Date')
    recv_jor = date_map(jor,     'Last Received Date')
    recv_dim = date_map(dim_reg, 'Last Received Date')
    iss_dib  = date_map(dib,     'Last Issue Date')
    iss_jor  = date_map(jor,     'Last Issue Date')
    iss_dim  = date_map(dim_reg, 'Last Issue Date')

    def bins_map(df):
        """Returns dict of part# -> semicolon-separated unique bin locations.
        Skips any location value containing ':' (used as a hack for alternate part notes)."""
        d = {}
        for _, r in df.iterrows():
            p = r['Part #']
            locs = []
            for col in ['Location 1', 'Location 2', 'Location 3']:
                v = str(r.get(col, '') or '').strip()
                if v and v != 'nan' and ':' not in v:
                    locs.append(v)
            if locs:
                existing = d.get(p, [])
                for loc in locs:
                    if loc not in existing:
                        existing.append(loc)
                d[p] = existing
        return {k: ';'.join(v) for k, v in d.items()}

    bins_dib = bins_map(dib)
    bins_jor = bins_map(jor)
    bins_dim = bins_map(dim_reg)
    bins_irs = bins_map(dim_irs)

    parts_in_dib = set(dib['Part #'])
    parts_in_jor = set(jor['Part #'])
    parts_in_dim = set(dim_reg['Part #'])
    parts_in_irs = set(dim_irs['Part #'])
    irs_set      = set(dim_irs['Part #'])

    def stock_label(part, qty_map, parts_in_loc):
        if part not in parts_in_loc: return '-'
        return 'Out of Stock' if qty_map.get(part,0)==0 else fmt_qty(qty_map.get(part,0))

    def transit_label(part, tr_map):
        qty = tr_map.get(part, 0)
        return fmt_qty(qty) if qty > 0 else '-'

    def alt_stock_note(part):
        available = []
        for alt in sorted(alt_map.get(part, [])):
            q_dib = map_dib.get(alt,0)
            q_jor = map_jor.get(alt,0)
            q_dim = map_dim.get(alt,0)
            q_irs = map_irs.get(alt,0)
            locs = []
            if q_dib>0: locs.append(f'DIB:{fmt_qty(q_dib)}')
            if q_jor>0: locs.append(f'JRH:{fmt_qty(q_jor)}')
            if q_dim>0: locs.append(f'DMU:{fmt_qty(q_dim)}')
            if q_irs>0: locs.append(f'DMU IRS:{fmt_qty(q_irs)}')
            # Only show in alt box if the alternate has stock (NLS or not)
            if not locs:
                continue
            prefix = "NLS:" if alt in nls_set else ""
            available.append(f"{prefix}{alt}|" + "|".join(locs))
        return '|||'.join(available)

    # Include ALL parts from price list so alternate lookups work even for
    # parts with no inventory. Inventory-only parts (not in price list) also included.
    all_parts = sorted(set(
        list(price_map)
        +list(map_dib)+list(map_dim)+list(map_irs)+list(map_jor)
        +list(tr_dib)+list(tr_dim)+list(tr_jor)))

    log(f"Building {len(all_parts):,} parts...")

    rows = []
    for p in all_parts:
        pi   = price_map.get(p, {})
        desc = pi.get('Desc') or dm_d.get(p) or dib_d.get(p) or jor_d.get(p,'')
        # Alt line rule: non-NLS alts always show; NLS alts only if they have stock
        alt_line_parts = []
        for alt in sorted(alt_map.get(p, [])):
            if alt in nls_set:
                has_stock = any([
                    map_dib.get(alt, 0) > 0,
                    map_jor.get(alt, 0) > 0,
                    map_dim.get(alt, 0) > 0,
                    map_irs.get(alt, 0) > 0,
                ])
                if has_stock:
                    alt_line_parts.append(alt)
            else:
                alt_line_parts.append(alt)
        alts = '; '.join(alt_line_parts) or '-'
        rows.append((
            str(p), desc, pi.get('MRP', None), pi.get('DC',''),
            stock_label(p, map_dib, parts_in_dib),
            stock_label(p, map_jor, parts_in_jor),
            stock_label(p, map_dim, parts_in_dim),
            alts,
            stock_label(p, map_irs, parts_in_irs),
            alt_stock_note(p),
            transit_label(p, tr_dib),
            transit_label(p, tr_jor),
            transit_label(p, tr_dim),
            recv_dib.get(p, ''),
            iss_dib.get(p, ''),
            recv_jor.get(p, ''),
            iss_jor.get(p, ''),
            recv_dim.get(p, ''),
            iss_dim.get(p, ''),
            bins_dib.get(p, ''),
            bins_jor.get(p, ''),
            bins_dim.get(p, ''),
            bins_irs.get(p, ''),
            p in nls_set,
        ))

    # ── Push to database
    log("Connecting to database...")
    db_url = DATABASE_URL
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://","postgresql://",1)
    conn = psycopg2.connect(db_url)
    cur  = conn.cursor()

    log("Clearing old data...")
    cur.execute("TRUNCATE TABLE tgp_parts CASCADE")

    log("Inserting new data...")
    BATCH = 500
    total  = len(rows)
    for i in range(0, total, BATCH):
        batch = rows[i:i+BATCH]
        psycopg2.extras.execute_values(cur, """
            INSERT INTO tgp_parts (
                part_number, description, mrp, discount_code,
                dibrugarh, jorhat, dimapur, alternate_parts,
                dimapur_irs, alt_availability,
                tr_dibrugarh, tr_jorhat, tr_dimapur,
                dib_last_received, dib_last_issue,
                jor_last_received, jor_last_issue,
                dim_last_received, dim_last_issue,
                dib_bins, jor_bins, dim_bins, irs_bins,
                is_nls
            ) VALUES %s
        """, batch, page_size=BATCH)
        done = min(i + BATCH, total)
        print(f"  Inserted {done:,} / {total:,} parts...", end='\r')
    print()  # newline after progress line

    log("Inserting part_alternates...")
    known_parts = {row[0] for row in rows}  # part_number is first element of each row tuple
    alt_pairs = []
    for part, alts in alt_map.items():
        if part not in known_parts:
            continue
        for alt in alts:
            if alt not in known_parts:
                continue
            alt_pairs.append((part, alt))
    for i in range(0, len(alt_pairs), BATCH):
        psycopg2.extras.execute_values(cur, """
            INSERT INTO part_alternates (part_number, alt_part_number)
            VALUES %s
            ON CONFLICT DO NOTHING
        """, alt_pairs[i:i+BATCH], page_size=BATCH)
    print(f"  {len(alt_pairs):,} alternate pairs written.")

    cur.execute("INSERT INTO tgp_meta DEFAULT VALUES")
    conn.commit()
    conn.close()

    print()
    print("="*55)
    print(f"  ✅ REFRESH COMPLETE")
    print(f"     {len(rows):,} parts loaded at {datetime.now().strftime('%d-%b-%Y %H:%M')}")
    print("="*55 + "\n")
    input("Press Enter to close...")


if __name__ == "__main__":
    try:
        main()
    except BarrelPriceError as e:
        print(f"\n{e}")
        input("\nPress Enter to close...")
        sys.exit(1)
    except FileNotFoundError as e:
        print(f"\n❌ FILE NOT FOUND: {e}")
        input("\nPress Enter to close...")
        sys.exit(1)
    except psycopg2.OperationalError as e:
        print(f"\n❌ DATABASE CONNECTION FAILED: {e}")
        print("   Check the DATABASE_URL in this script.")
        input("\nPress Enter to close...")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        input("\nPress Enter to close...")
        sys.exit(1)
