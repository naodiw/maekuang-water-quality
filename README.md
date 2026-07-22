# แผนที่จุดเก็บตัวอย่างน้ำแม่น้ำแม่กวง

แผนที่เว็บแสดงตำแหน่งจุดเก็บตัวอย่างน้ำในลุ่มน้ำแม่กวง คลองแม่ข่า และจุดตรวจก่อน-หลังโรงงานอุตสาหกรรม

**Live site:** https://naodiw.github.io/maekuang-water-quality/

> 📌 เวอร์ชันเริ่มต้น แสดงเฉพาะ **จุดเก็บตัวอย่างน้ำ** ก่อน — ขั้นถัดไปจะเพิ่มข้อมูลโรงงานรอบแม่น้ำ (กรมโรงงานอุตสาหกรรม) และผลตรวจคุณภาพน้ำแต่ละรอบ

---

## ข้อมูลที่แสดงในแผนที่

| ชั้นข้อมูล | รายละเอียด | ไฟล์ต้นทาง |
|---|---|---|
| แม่น้ำกวง | 10 จุด (KG02–KG19) อ.สารภี → อ.เมืองลำพูน | `data.json → points` |
| คลองแม่ข่า | 8 จุด (MK01–MK08) | `data.json → points` |
| จุดก่อน-หลังโรงงาน | 12 จุด (KAB, P13/14, PKH, PB, H) | `data.json → points` |
| พิกัดโรงงาน (สำรองไว้) | 6 แห่งที่ฝังในคำอธิบายจุดก่อน-หลัง | `data.json → factoriesHint` |
| โรงงาน DIW ริมน้ำ | 119 แห่งในระยะ ≤1 กม. จากแม่กวง/แม่ข่า (พิกัดจริงจากกรมโรงงานฯ) | `factories.json` |

พิกัดต้นทางเป็นรูปแบบ DMS (เช่น `18°43'12.3"N 99°04'18.1"E`) แปลงเป็น decimal ด้วย `parse_points.py`

---

## รันในเครื่องเพื่อดูหรือแก้ไข

ต้องการแค่ Python (มาพร้อม Windows/Mac/Linux อยู่แล้ว) ไม่ต้องติดตั้งอะไรเพิ่ม

```powershell
# 1. Clone repo (ครั้งแรกครั้งเดียว)
git clone https://github.com/naodiw/maekuang-water-quality.git
cd maekuang-water-quality

# 2. เปิด local server
python -m http.server 8765

# 3. เปิด browser ไปที่
#    http://localhost:8765
```

> ต้องเปิดผ่าน local server เพราะหน้าเว็บใช้ `fetch("data.json")` ซึ่ง `file://` ทำไม่ได้

---

## แก้ไขข้อมูลจุดเก็บน้ำ

ข้อมูลจุดทั้งหมดมาจากไฟล์ Excel `พิกัดจุดเก็บน้ำ.xlsx` (ไม่ได้ push ขึ้น repo)

หากแก้ไข Excel แล้วต้องการอัปเดตเว็บ ให้รันสคริปต์แปลงใหม่:

```powershell
python parse_points.py   # อ่าน xlsx → เขียน data.json ใหม่
```

---

## วิธี Deploy (GitHub Pages)

เว็บนี้ใช้ **GitHub Pages** — ทุกครั้งที่ push ขึ้น `master` จะ deploy อัตโนมัติภายใน ~1 นาที ไม่ต้องทำอะไรเพิ่ม

### ตั้งค่า GitHub Pages ครั้งแรก (เจ้าของ repo เท่านั้น)

1. ไปที่ repo → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `master` / `/ (root)`
4. Save

### ขั้นตอน deploy ทุกครั้งที่แก้ไข

```powershell
git add <ไฟล์ที่แก้>
git commit -m "อธิบายว่าแก้อะไร"
git push origin master
```

---

## โครงสร้างไฟล์

```
index.html          โครงหน้า + โหลด Leaflet
app.js              โหลดจุด วาง marker กรองกลุ่ม เลือกจุด
styles.css          สไตล์ (แผนที่ + panel ด้านขวา)
data.json           ข้อมูลจุด 30 จุด (แปลง DMS → decimal แล้ว)
parse_points.py     สคริปต์แปลง xlsx → data.json
```

แหล่งข้อมูล: จุดเก็บตัวอย่างน้ำภาคสนาม · แผนที่ฐาน OpenStreetMap
