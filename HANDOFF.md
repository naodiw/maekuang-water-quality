# HANDOFF — โปรเจกต์แผนที่คุณภาพน้ำแม่น้ำแม่กวง

> เอกสารส่งต่องาน อัปเดตทุกครั้งที่มีการเปลี่ยนแปลง — อ่านไฟล์นี้ก่อนทำงานต่อ

**อัปเดตล่าสุด:** 2026-07-21 (trace เส้นจริงใต้เขื่อน 23 กม. จาก OSM streams แทนเส้นประ schematic — แม่กวงต่อเนื่องเต็มสาย)
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
| `rivers.geojson` | แม่กวง 3 ท่อน: upper (ต้นน้ำ 628จุด) + middle (ใต้เขื่อน 652จุด/23กม.) + lower (1015จุด) เด่น + animation | ✅ |
| `reservoir.geojson` | polygon อ่างเก็บน้ำแม่กวง (OSM relation 193489) | ✅ |
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

### แม่กวงเต็มระบบ (source → mouth) — ข้อเท็จจริงสำคัญ
แม่น้ำกวง = ลำน้ำสาขาใหญ่ของแม่น้ำปิง ต้นน้ำอยู่เทือกเขา **อ.ดอยสะเก็ด** เชียงใหม่ ลำดับสายน้ำจริง:
1. **ต้นน้ำ (ดอยสะเก็ด)** ~19.02°N,99.31°E — OSM way `315124167` (เดิมชื่อ "น้ำแม่กวง" เคยถูกจัดผิดเป็นแม่น้ำอื่น) → ดึงกลับมาเป็น rivers.geojson part=upper
2. **อ่างเก็บน้ำแม่กวง** (relation 193489) lat 18.924–18.968 → `reservoir.geojson`
3. **เขื่อนแม่กวงอุดมธารา** (สันเขื่อน `waterway=dam` name=แม่กวง) ~18.926°N,99.115°E → landmark ใน data.json
4. **ช่วงใต้เขื่อน (part=middle, 23 กม.)**: แม่น้ำไหลต่อเนื่องจริง (Google Maps ยืนยันป้าย "Mae Kuang" ตลอดทาง) — ใน OSM เป็น **stream/canal หลายท่อน ส่วนใหญ่ไม่มีชื่อ** (มีท่อนชื่อ "แม่น้ำกวง" way 144053727 ยืนยันเส้นทาง) ผม trace ด้วย graph search (Dijkstra) จากใต้เขื่อน→จุดเริ่มช่วงล่าง เชื่อมช่วง OSM ขาดด้วย bridge สั้น ๆ
   ⚠️ เคยเข้าใจผิดว่า "น้ำหายลงคลองส่งน้ำ" แล้วใช้เส้นประ schematic — **ผิด อย่าทำซ้ำ** (`connectors.geojson` ถูกลบแล้ว)
5. **ช่วงล่าง** 18.80→18.54°N → ลงแม่น้ำปิง (rivers.geojson part=lower)

**วิธี re-trace ช่วง middle** (ถ้าต้องทำใหม่): สคริปต์ `trace_gap.py` (local, ไม่ push) — โหลด waterway ทั้งหมด (river|stream|canal) ใน bbox ใต้เขื่อน, สร้าง graph (node=พิกัด 4 ตำแหน่ง), Dijkstra จากเขื่อน→จุดเริ่ม lower โดย: stream/river cost x1, canal x3, ชื่อมี "กวง" x0.3, bridge ข้ามช่วงขาด ≤400ม. (ใกล้เขื่อน ≤1400ม.) cost x5

landmarks เก็บใน `data.json → landmarks` [{type:source|dam, name, lat, lng}] เรนเดอร์เป็น emoji divIcon (🏔️/🏞️) ใน `addLandmarks()`
panes zIndex: reservoir 330 < riverOther 340 < connector 345 < river 350

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
