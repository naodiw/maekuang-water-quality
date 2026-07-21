# HANDOFF — โปรเจกต์แผนที่คุณภาพน้ำแม่น้ำแม่กวง

> เอกสารส่งต่องาน อัปเดตทุกครั้งที่มีการเปลี่ยนแปลง — อ่านไฟล์นี้ก่อนทำงานต่อ

**อัปเดตล่าสุด:** 2026-07-21 (แม่น้ำอื่นชัดขึ้น weight 2.6 + hover ขึ้นชื่อสายน้ำ + ไฮไลต์ — ยืนยันแม่น้ำปิงอยู่ครบ)
**Live:** https://naodiw.github.io/maekuang-water-quality/
**Repo:** https://github.com/naodiw/maekuang-water-quality (branch `master`, public, GitHub Pages)

---

## สถานะปัจจุบัน

| # | ฟีเจอร์ | สถานะ |
|---|---------|-------|
| 1 | จุดเก็บตัวอย่างน้ำ 30 จุด (3 กลุ่ม) บนแผนที่ | ✅ เสร็จ |
| 2 | ตัวกรองกลุ่ม + รายการจุด + เลือกจุด (โชว์พิกัด/DMS/ลิงก์ Maps) | ✅ เสร็จ |
| 3 | เส้นแม่น้ำแม่กวงจาก OSM + animation ทิศการไหล + ลูกศรบอกทิศ | ✅ เสร็จ |
| 4 | ข้อมูลโรงงานรอบแม่น้ำ (กรมโรงงาน DIW ในรัศมี ~3 กม.) | ⬜ ยังไม่ทำ |
| 5 | ผลตรวจคุณภาพน้ำรายรอบ + สถานะ ผ่าน/เกินมาตรฐาน | ⬜ ยังไม่ทำ |
| 6 | รายงานสรุปเสนอผู้บริหาร (panel) | ⬜ ยังไม่ทำ |

---

## ไฟล์ในโปรเจกต์

| ไฟล์ | หน้าที่ | ขึ้น repo? |
|------|---------|-----------|
| `index.html` | โครงหน้า + legend + โหลด Leaflet | ✅ |
| `app.js` | โหลดข้อมูล, แม่น้ำ 4 ชั้น, marker, กรอง, เลือกจุด | ✅ |
| `styles.css` | สไตล์ + animation การไหล (`.river-flow`) | ✅ |
| `data.json` | 30 จุด + `factoriesHint` 6 แห่ง | ✅ |
| `rivers.geojson` | เส้นแม่น้ำกวง 1015 จุด เรียงต้นน้ำ→ปลายน้ำ (เด่น + animation) | ✅ |
| `rivers_other.geojson` | แม่น้ำอื่น 137 เส้น (ปิง/ขาน/แม่ทา/แม่ริม ฯลฯ) เส้นจาง ไม่ animate | ✅ |
| `parse_points.py` | แปลง xlsx (DMS→decimal) → data.json | ✅ |
| `พิกัดจุดเก็บน้ำ.xlsx` | Excel ต้นทาง | ❌ (gitignore) |
| `overpass.ql` / `osm_raw.json` | ไฟล์ทำงานตอนดึงแม่น้ำ | ❌ (ควร gitignore) |

---

## หมายเหตุทางเทคนิค (สำคัญต่อการทำงานต่อ)

### เส้นแม่น้ำ + ทิศการไหล
- ดึงจาก **OSM Overpass API**: `way["waterway"="river"]["name"="แม่น้ำกวง"]`
  ได้ 4 ways → เชื่อมเป็นเส้นเดียว 1015 จุด (ดู order ใน git log / คำสั่งด้านล่าง)
- **ทิศการไหล = เหนือ→ใต้** (ต้นน้ำ 18.80°N ดอยสะเก็ด → ปลายน้ำ 18.54°N ไหลลงแม่น้ำปิง)
- geojson เรียงพิกัด **ต้นน้ำ (index 0) → ปลายน้ำ (index สุดท้าย)** — สำคัญมาก
- Animation: CSS `stroke-dashoffset` ติดลบใน `@keyframes riverFlow` → เส้นประวิ่ง start→end = ตามน้ำ
  (เส้นประที่ไหลนี้บอกทิศในตัว — **ลูกศร chevron ถูกถอดออกแล้ว** ตาม feedback ผู้ใช้)
- ถ้าดึงแม่น้ำใหม่/แก้ order → ต้องรักษาลำดับต้นน้ำ→ปลายน้ำ ไม่งั้น animation ไหลกลับทิศ

### แม่น้ำอื่น (background layer)
- `rivers_other.geojson` = 137 เส้น จาก Overpass `way["waterway"="river"](18.45,98.78,19.15,99.15)`
- **ตัดชื่อ `แม่น้ำกวง`, `น้ำแม่กวง` ออก** (แสดงเด่นแยกใน rivers.geojson แล้ว)
- render ใน pane `riverOther` (zIndex 340, ใต้ pane `river` 350) **ไม่มี animation**:
  - **base line**: สี #2f88c2 weight 2.6 opacity 0.85 (interactive:false)
  - **hit layer**: เส้นโปร่งใส weight 12 ทับ base → hover ง่าย, mouseover โชว์ tooltip ชื่อสายน้ำ (`.river-tip`) + ไฮไลต์ opacity 0.9
  - แม่น้ำปิง = 11 ways (แยกท่อน) อยู่ครบ lat 18.43–19.15 — **อย่านึกว่าหลุด** ถ้าจางเกินให้เพิ่ม weight/opacity ที่ `base`
- ถ้าจะปรับความชัด/สี แก้ที่ฟังก์ชัน `addOtherRivers()` ใน app.js
- แม่น้ำกวง (body) ก็มี tooltip "แม่น้ำกวง" ตอน hover เช่นกัน

### ดึงเส้นแม่น้ำใหม่ (ถ้าต้องการ)
- Overpass bbox กว้างมัก **504** — ใช้ bbox แคบ + ลอง mirror หลายตัว (private.coffee, osm.jp) แบบ background
```bash
# Overpass หลักมัก timeout — รันแบบ background, query เจาะจงชื่อเป๊ะ
curl -s --data-urlencode 'data=[out:json][timeout:120];way["waterway"="river"]["name"="แม่น้ำกวง"](18.35,98.80,18.95,99.20);out geom;' \
  https://overpass-api.de/api/interpreter -o osm_raw.json
# แล้ว merge ตาม order: 88686172(N) -> 307156063 -> 27892685 -> 104276387(S)
```

### Basemap
- ใช้ **OSM มาตรฐาน** (`tile.openstreetmap.org`) — ผู้ใช้ต้องการแผนที่สีสดใส (เคยลอง CARTO light แล้วผู้ใช้ไม่ชอบ ให้กลับมา OSM)
- (หมายเหตุ sandbox: OSM tiles ถูกบล็อกในเบราว์เซอร์ทดสอบของ Claude แต่ online จริง/เครื่องผู้ใช้แสดงปกติ)

### พิกัดโรงงานที่มีอยู่แล้ว (`data.json → factoriesHint`)
6 แห่ง ฝังในคำอธิบายจุดก่อน-หลัง: เชียงใหม่โฟรเซ่นฟูดส์, ธนภักดี, สันติภาพ(ฮั่วเพ้ง 1958),
มาสเตอร์คลีนลอนดรี้, เส้นทิพย์, แม่ปิงลอนดริ — ใช้เป็นจุดเริ่มของ layer โรงงาน (ข้อ 4)

---

## Deploy
push ขึ้น `master` → GitHub Pages เด้งเองใน ~1 นาที
เวลาแก้ front-end ให้ **bump `?v=` ใน index.html** (styles/app) เพื่อ bust cache

## ข้อควรระวัง
- `data.json` / `rivers.geojson` โหลดผ่าน `fetch` → ต้องรันผ่าน http server เสมอ (`file://` ไม่ได้)
- อย่า push `พิกัดจุดเก็บน้ำ.xlsx` (มีใน .gitignore แล้ว)

## ขั้นถัดไปที่แนะนำ
**ข้อ 4 — โรงงานรอบแม่น้ำ**: ดึง DIW/OSM industrial ในรัศมีจากเส้น `rivers.geojson`
คำนวณระยะจุด→เส้นแม่น้ำ (มีสูตร haversine + project-on-segment อ้างอิงได้จาก repo แม่น้ำกก)
