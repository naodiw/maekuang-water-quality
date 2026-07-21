# HANDOFF — โปรเจกต์แผนที่คุณภาพน้ำแม่น้ำแม่กวง

> เอกสารส่งต่องาน อัปเดตทุกครั้งที่มีการเปลี่ยนแปลง — อ่านไฟล์นี้ก่อนทำงานต่อ

**อัปเดตล่าสุด:** 2026-07-21
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
| `rivers.geojson` | เส้นแม่น้ำกวง 1015 จุด เรียงต้นน้ำ→ปลายน้ำ | ✅ |
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
- ลูกศร: sample ทุก ~1/16 ของเส้น, หมุนด้วย `atan2(-(Δlat), Δlng·cosLat)` (east=0°, ตามเข็ม)
- ถ้าดึงแม่น้ำใหม่/แก้ order → ต้องรักษาลำดับต้นน้ำ→ปลายน้ำ ไม่งั้น animation ไหลกลับทิศ

### ดึงเส้นแม่น้ำใหม่ (ถ้าต้องการ)
```bash
# Overpass หลักมัก timeout — รันแบบ background, query เจาะจงชื่อเป๊ะ
curl -s --data-urlencode 'data=[out:json][timeout:120];way["waterway"="river"]["name"="แม่น้ำกวง"](18.35,98.80,18.95,99.20);out geom;' \
  https://overpass-api.de/api/interpreter -o osm_raw.json
# แล้ว merge ตาม order: 88686172(N) -> 307156063 -> 27892685 -> 104276387(S)
```

### Basemap
- ใช้ **CARTO light** (`light_all`) แทน OSM มาตรฐาน — สะอาดกว่า เห็นเส้นน้ำชัด
- (หมายเหตุ sandbox: OSM tiles ถูกบล็อก, CARTO โหลดได้ — แต่ online จริงใช้ได้ทั้งคู่)

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
