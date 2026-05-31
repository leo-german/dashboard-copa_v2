import json
import os
import sys
import time

try:
    import gspread
    import pandas as pd
    from google.oauth2 import service_account
    from google.auth.exceptions import GoogleAuthError
except ImportError as e:
    print(f"[ERROR] Missing dependency: {e}")
    sys.exit(1)

SHEET_ID = "1ggeuKuCFZsUpDfRl2wPLOqWD2in7uL9Y3yHTaui_A0w"
SHEET_NAMES = ["base de datos", "Expedientes", "Rendición VEP_SCIT", "Capital financiero"]
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "data", "metrics.json")


def load_credentials():
    env_json = os.environ.get("GOOGLE_CREDENTIALS")
    if env_json:
        try:
            creds_dict = json.loads(env_json)
            return service_account.Credentials.from_service_account_info(creds_dict)
        except (json.JSONDecodeError, GoogleAuthError, ValueError) as e:
            print(f"[WARN] Failed to parse GOOGLE_CREDENTIALS env var: {e}")

    local_path = os.path.join(os.path.dirname(__file__), "..", "credentials.json")
    if os.path.exists(local_path):
        try:
            return service_account.Credentials.from_service_account_file(local_path)
        except GoogleAuthError as e:
            print(f"[WARN] Failed to load local credentials.json: {e}")

    print("[ERROR] No valid credentials found. Set GOOGLE_CREDENTIALS env var or place credentials.json in project root.")
    sys.exit(1)


def fetch_sheet(gc, sheet_name):
    for attempt in range(3):
        try:
            sheet = gc.open_by_key(SHEET_ID)
            ws = sheet.worksheet(sheet_name)
            rows = ws.get_all_records()
            return rows
        except Exception as e:
            if "429" in str(e) and attempt < 2:
                wait = 2 ** attempt
                print(f"[WARN] Rate limited. Retrying in {wait}s...")
                time.sleep(wait)
                continue
            print(f"[ERROR] Failed to fetch sheet '{sheet_name}': {e}")
            return []


def clean_base_datos(rows):
    df = pd.DataFrame(rows)
    if df.empty:
        return []
    for col in df.columns:
        if "fecha" in col.lower() or "date" in col.lower():
            df[col] = pd.to_datetime(df[col], errors="coerce")
        if any(kw in col.lower() for kw in ["monto", "importe", "total", "monto $"]):
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    return df.to_dict(orient="records")


def clean_expedientes(rows):
    df = pd.DataFrame(rows)
    if df.empty:
        return []
    for col in df.columns:
        if "fecha" in col.lower() or "date" in col.lower():
            df[col] = pd.to_datetime(df[col], errors="coerce")
    return df.to_dict(orient="records")


def clean_rendicion_vep_scit(rows):
    df = pd.DataFrame(rows)
    if df.empty:
        return []
    for col in df.columns:
        if "fecha" in col.lower() or "date" in col.lower():
            df[col] = pd.to_datetime(df[col], errors="coerce")
        if any(kw in col.lower() for kw in ["monto", "importe", "total", "ingreso", "egreso"]):
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    return df.to_dict(orient="records")


def clean_capital_financiero(rows):
    df = pd.DataFrame(rows)
    if df.empty:
        return []
    for col in df.columns:
        if "fecha" in col.lower() or "date" in col.lower():
            df[col] = pd.to_datetime(df[col], errors="coerce")
        if any(kw in col.lower() for kw in ["monto", "importe", "total", "valor"]):
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    return df.to_dict(orient="records")


def serialize(obj):
    if isinstance(obj, pd.Timestamp):
        return obj.isoformat()
    if isinstance(obj, pd.Timestamp):
        return str(obj)
    return obj


def main():
    print("[INFO] Loading credentials...")
    creds = load_credentials()
    gc = gspread.authorize(creds)

    all_data = {}
    total_rows = 0

    cleaners = {
        "base de datos": clean_base_datos,
        "Expedientes": clean_expedientes,
        "Rendición VEP_SCIT": clean_rendicion_vep_scit,
        "Capital financiero": clean_capital_financiero,
    }

    for name in SHEET_NAMES:
        raw = fetch_sheet(gc, name)
        cleaner = cleaners.get(name, clean_base_datos)
        clean = cleaner(raw)
        key = name.lower().replace(" ", "_").replace("í", "i").replace("ó", "o")
        all_data[key] = clean
        total_rows += len(clean)
        print(f"[INFO] '{name}': {len(clean)} rows")

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2, default=serialize)

    print(f"\n[SUCCESS] Sync completed. {total_rows} rows parsed -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
