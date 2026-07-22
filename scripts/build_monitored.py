# -*- coding: utf-8 -*-
"""สร้างชุด "โรงงานที่ตรวจก่อน-หลัง" (6 แห่ง ที่จุดเก็บน้ำกลุ่ม beforeafter คร่อมอยู่)
จับคู่พิกัดจริงจาก DIW (diw_gps_raw.json) ที่ใกล้จุดกึ่งกลาง before/after ที่สุด
fallback = factoriesHint ใน data.json → เขียนต่อท้าย factories.json (key `monitored`)"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)

def hav(a, b):
    R = 6371000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = math.radians(b[0]-a[0]); dl = math.radians(b[1]-a[1])
    return 2*R*math.asin(math.sqrt(math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2))

# โรงงานที่ตรวจ: key ชื่อ, คู่จุด before/after, ลำน้ำที่ตรวจ
MON = [
    ("เชียงใหม่โฟรเซ่น", "เชียงใหม่โฟรเซ่นฟูดส์", "KAB01", "KAB02", "คลองแม่ดู"),
    ("ธนภักดี",         "ธนภักดี",              "P13",   "P14",   "แม่น้ำปิง"),
    ("ฮั่วเพ้ง",         "สันติภาพ (ฮั่วเพ้ง 1958)", "PKH01", "PKH02", "คลองหนองหาร"),
    ("มาสเตอร์คลีน",    "มาสเตอร์คลีนลอนดรี้ แอนด์ เซอร์วิส", "PB09", "PB10", "แม่น้ำแม่ริม"),
    ("เส้นทิพย์",        "เส้นทิพย์",             "H01",   "H02",   "แม่น้ำโฮม"),
    ("แม่ปิงลอนดริ",     "แม่ปิงลอนดริ",          "PB05",  "PB06",  "ลำเหมืองพญาคำ"),
]

data = json.load(open(os.path.join(PROJ, "data.json"), encoding="utf-8"))
pts = {p["code"]: p for p in data["points"]}
hints = data.get("factoriesHint", [])
facs = json.load(open(os.path.join(HERE, "diw_gps_raw.json"), encoding="utf-8"))

def numclean(s):
    s = str(s).strip()
    if not s or s in ("nan", "0", "0.0"):
        return ""
    try:
        v = float(s); return str(int(v)) if v == int(v) else str(v)
    except ValueError:
        return s

out = []
for key, disp, cb, ca, river in MON:
    pb, pa = pts[cb], pts[ca]
    mid = ((pb["latitude"]+pa["latitude"])/2, (pb["longitude"]+pa["longitude"])/2)
    # หา DIW record ที่ชื่อ match + ใกล้ mid ที่สุด
    cands = [f for f in facs if key in (f.get("name") or "") or key in (f.get("operator") or "")]
    rec, src = None, None
    if cands:
        rec = min(cands, key=lambda f: hav(mid, (f["latitude"], f["longitude"])))
        src = "DIW"
    if rec and hav(mid, (rec["latitude"], rec["longitude"])) > 4000:
        rec = None  # ไกลเกิน ไม่น่าใช่ตัวเดียวกัน
    lat = lng = None
    entry = {"name": disp, "river": river, "beforeCode": cb, "afterCode": ca}
    if rec:
        lat, lng = rec["latitude"], rec["longitude"]
        JUNK = ("", "nan", "-", "0")
        ap = []
        if rec["addrno"] not in JUNK: ap.append(rec["addrno"])
        if rec["moo"] not in JUNK: ap.append("ม."+rec["moo"])
        if rec["road"] not in JUNK: ap.append("ถ."+rec["road"])
        if rec["tambon"] not in JUNK: ap.append("ต."+rec["tambon"])
        ap += ["อ."+rec["district"], "จ."+rec["province"]]
        addr = " ".join(ap)
        entry.update({
            "name": rec["name"] if rec["name"] not in ("", "-", "nan") else disp,
            "oldreg": rec["oldreg"], "fid": rec["fid"], "operator": rec["operator"],
            "business": rec["business"], "address": addr, "district": rec["district"],
            "capital": numclean(rec["capital"]), "workers": numclean(rec["workers"]), "hp": numclean(rec["hp"]),
            "source": "DIW",
        })
    else:
        # fallback: factoriesHint
        h = next((h for h in hints if key in h["name"] or h.get("source") in (cb, ca)), None)
        if h:
            lat, lng = h["latitude"], h["longitude"]
        entry.update({"business": "", "address": "", "source": "ตำแหน่งโดยประมาณ (factoriesHint)"})
    entry["latitude"], entry["longitude"] = round(lat, 6), round(lng, 6)
    d_river = round(hav((lat, lng), mid))
    entry["distMidM"] = d_river
    out.append(entry)
    print(f"{disp[:22]:24} {entry['source']:26} {lat:.5f},{lng:.5f}  midΔ={d_river}m")

# เขียนต่อเข้า factories.json
fj = json.load(open(os.path.join(PROJ, "factories.json"), encoding="utf-8"))
fj["monitored"] = out
fj["meta"]["monitoredCount"] = len(out)
json.dump(fj, open(os.path.join(PROJ, "factories.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nwrote {len(out)} monitored factories into factories.json")
