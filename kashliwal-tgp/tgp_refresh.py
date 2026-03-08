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
# Paste your Render PostgreSQL connection string here:
DATABASE_URL = "postgresql://user:password@host/dbname"

# Folder where your Siebel exports live:
EXPORT_FOLDER = r"C:\TataExports"

# Google Sheet ID for Alternate Part Numbers:
ALT_SHEET_ID = "16U-Mxf-rpsDe1VWstOihkO46tkvBOX0HE_nX6lPcL7Y"
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
    try: return int(float(str(s).strip().replace(',','')))
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

    # ── Build maps
    price_map = {}
    for _, r in pl.iterrows():
        p = r['Part #']
        if p not in price_map:
            dc = str(r.get('Discount Code (CVBU)','') or '').strip()
            price_map[p] = {'Desc': str(r['Part Description']).strip(), 'MRP': r['MRP'], 'DC': dc}

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

    recv_dib = date_map(dib,     'Last Received Date')
    recv_jor = date_map(jor,     'Last Received Date')
    recv_dim = date_map(dim_reg, 'Last Received Date')
    iss_dib  = date_map(dib,     'Last Issue Date')
    iss_jor  = date_map(jor,     'Last Issue Date')
    iss_dim  = date_map(dim_reg, 'Last Issue Date')

    def bins_map(df):
        """Returns dict of part# -> semicolon-separated unique bin locations"""
        d = {}
        for _, r in df.iterrows():
            p = r['Part #']
            locs = []
            for col in ['Location 1', 'Location 2', 'Location 3']:
                v = str(r.get(col, '') or '').strip()
                if v and v != 'nan':
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
        return 'Out of Stock' if qty_map.get(part,0)==0 else str(qty_map.get(part,0))

    def transit_label(part, tr_map):
        qty = tr_map.get(part, 0)
        return str(qty) if qty > 0 else '-'

    def alt_stock_note(part):
        available = []
        for alt in sorted(alt_map.get(part, [])):
            locs = []
            q_dib = map_dib.get(alt,0)
            q_jor = map_jor.get(alt,0)
            q_dim = map_dim.get(alt,0)
            q_irs = map_irs.get(alt,0)
            if q_dib>0: locs.append(f'DIB:{q_dib}')
            if q_jor>0: locs.append(f'JRH:{q_jor}')
            if q_dim>0: locs.append(f'DMU:{q_dim}')
            if q_irs>0: locs.append(f'DMU IRS:{q_irs}')
            if locs: available.append(f"{alt}|" + "|".join(locs))
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
        alts = '; '.join(alt_map.get(p,[])) or '-'
        rows.append((
            str(p), desc, pi.get('MRP', None), pi.get('DC',''),
            stock_label(p, map_dib, parts_in_dib),
            stock_label(p, map_jor, parts_in_jor),
            stock_label(p, map_dim, parts_in_dim),
            alts,
            stock_label(p, map_irs, parts_in_irs),
            'YES' if p in irs_set else 'NO',
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
        ))

    # ── Push to database
    log("Connecting to database...")
    db_url = DATABASE_URL
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://","postgresql://",1)
    conn = psycopg2.connect(db_url)
    cur  = conn.cursor()

    log("Clearing old data...")
    cur.execute("TRUNCATE TABLE tgp_parts")

    log("Inserting new data...")
    BATCH = 500
    total  = len(rows)
    for i in range(0, total, BATCH):
        batch = rows[i:i+BATCH]
        psycopg2.extras.execute_values(cur, """
            INSERT INTO tgp_parts (
                part_number, description, mrp, discount_code,
                dibrugarh, jorhat, dimapur, alternate_parts,
                dimapur_irs, is_irs, alt_availability,
                tr_dibrugarh, tr_jorhat, tr_dimapur,
                dib_last_received, dib_last_issue,
                jor_last_received, jor_last_issue,
                dim_last_received, dim_last_issue,
                dib_bins, jor_bins, dim_bins, irs_bins
            ) VALUES %s
        """, batch, page_size=BATCH)
        done = min(i + BATCH, total)
        print(f"  Inserted {done:,} / {total:,} parts...", end='\r')
    print()  # newline after progress line

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
