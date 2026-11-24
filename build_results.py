"""ดึงผลตรวจคุณภาพน้ำจาก Google Sheet (ศวภ.น.) -> results.json

ใช้:  python build_results.py
Sheet ต้องแชร์แบบ "ทุกคนที่มีลิงก์ดูได้" เพื่อให้ export CSV ได้
"""
import csv
import io
import json
import re
import urllib.request
from datetime import datetime

SHEET_ID = "1_uynbnvTZD6svwrThHLZs7RaQ_TNlAsQjdh1wfSISpE"
TABS = {          # group -> gid ของแท็บใน sheet
    "kuang": 0,   # แท็บ "แม่น้ำกวง"
}
PARAMS = ["pH", "Turb", "Cond", "Sal", "DO", "Temp", "BOD", "COD", "SS", "TDS"]


def fetch_csv(gid):
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={gid}"
    with urllib.request.urlopen(url, timeout=30) as r:
        return list(csv.reader(io.StringIO(r.read().decode("utf-8"))))


def parse_value(raw):
    """'7.8' -> 7.8 ; '<1.0' -> {'lt': 1.0} ; '' -> None"""
    s = (raw or "").strip()
    if not s:
        return None
    m = re.fullmatch(r"<\s*([\d.]+)", s)
    if m:
        return {"lt": float(m.group(1))}
    try:
        return float(s)
    except ValueError:
        return s


def main():
    out = {"source": "ผลของแม่น้ำกวง คลองแม่ข่า ก่อนหลัง ปี 69 (ของศวภ.น.)",
           "params": PARAMS, "results": {}}
    for group, gid in TABS.items():
        rows = fetch_csv(gid)
        header_idx = next(i for i, r in enumerate(rows) if r[3:4] == ["pH"])
        units = rows[header_idx + 1][3:3 + len(PARAMS)]
        out["units"] = dict(zip(PARAMS, units))
        for r in rows[header_idx + 2:]:
            code = (r[0] if r else "").strip()
            if not code:
                continue
            date = datetime.strptime(r[2].strip(), "%d/%m/%Y").strftime("%Y-%m-%d")
            vals = {p: parse_value(v) for p, v in zip(PARAMS, r[3:3 + len(PARAMS)])}
            out["results"].setdefault(code, []).append({"date": date, **vals})
    for code in out["results"]:
        out["results"][code].sort(key=lambda x: x["date"])
    with open("results.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    n = sum(len(v) for v in out["results"].values())
    print(f"results.json: {len(out['results'])} จุด, {n} รายการ")


if __name__ == "__main__":
    main()
