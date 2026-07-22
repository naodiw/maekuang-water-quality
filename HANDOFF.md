# HANDOFF — โปรเจกต์แผนที่คุณภาพน้ำแม่น้ำแม่กวง

> เอกสารส่งต่องาน อัปเดตทุกครั้งที่มีการเปลี่ยนแปลง — อ่านไฟล์นี้ก่อนทำงานต่อ

**อัปเดตล่าสุด:** 2026-07-22 (โรงงาน DIW ริมน้ำ ≤1 กม. 119 แห่ง + คลิกเส้นน้ำ → popup fact)
**Live:** https://naodiw.github.io/maekuang-water-quality/
**Repo:** https://github.com/naodiw/maekuang-water-quality (branch `master`, public, GitHub Pages)

---

## สถานะปัจจุบัน

| # | ฟีเจอร์ | สถานะ |
|---|---------|-------|
| 1 | จุดเก็บตัวอย่างน้ำ 30 จุด (3 กลุ่ม) บนแผนที่ | ✅ เสร็จ |
| 2 | ตัวกรองกลุ่ม + รายการจุด + เลือกจุด (โชว์พิกัด/DMS/ลิงก์ Maps) | ✅ เสร็จ |
| 3 | เส้นแม่น้ำแม่กวงจาก OSM + animation ทิศการไหล + ลูกศรบอกทิศ | ✅ เสร็จ |
| 3.5 | คลิกเส้นน้ำ/อ่างเก็บน้ำ → popup การ์ด fact (แม่กวง/แม่ข่า/ปิง/ทา/ขาน/เขื่อน + minimal card สายอื่น) | ✅ เสร็จ |
| 4 | ข้อมูลโรงงานรอบแม่น้ำ (กรมโรงงาน DIW ในรัศมี ≤1 กม.) | ✅ เสร็จ (119 โรงงาน) |
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
| `maekha.geojson` | คลองแม่ข่า เส้นเดียว 516 จุด เหนือ→ลงปิง เด่นสีม่วง + animation | ✅ |
| `rivers_other.geojson` | แม่น้ำอื่น 137 เส้น (ปิง/ขาน/แม่ทา/แม่ริม ฯลฯ) เส้นจาง ไม่ animate | ✅ |
| `river_facts.json` | ข้อมูล fact สายน้ำสำหรับ click-popup (keyed by core name) | ✅ |
| `factories.json` | โรงงาน DIW 119 แห่ง ≤1 กม. จากแม่กวง/แม่ข่า (ชื่อ/กิจการ/ทุน/แรงม้า/คนงาน/พิกัด) | ✅ |
| `scripts/fetch_gps.py` | ขั้น 1: อ่าน .xls รายอำเภอ → ดึงพิกัด GPS จริงจาก DIW ต่อโรงงาน | ✅ |
| `scripts/filter_1km.py` | ขั้น 2: กรอง ≤1 กม. จากเส้นแม่น้ำ → เขียน factories.json | ✅ |
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

### คลองแม่ข่า (hero ที่ 2)
- OSM ตั้งชื่อ `คลองแม่ข่า` tag **`waterway=stream`** (ไม่ใช่ canal/river) → query filter ชื่อภาษาไทยตรง ๆ มัก**ว่าง** (regex Thai ผ่าน curl เพี้ยน) ให้ query waterway ทั้งหมดใน bbox รอบจุด MK แล้วกรองชื่อใน python แทน
- 8 ท่อน 523 จุด ต่อกันสนิท (ไม่ต้อง bridge) → `maekha.geojson` เส้นเดียว 516 จุด เรียง**เหนือ(18.843)→ใต้(18.739 ลงปิง)**
- เรนเดอร์ด้วย `addFlowRiver(geojson, MAEKHA, "คลองแม่ข่า", "maekha")` — ฟังก์ชัน generic เดียวกับแม่กวง (glow+body+flow animate) สีม่วง #7c3aed เข้ากับหมุด MK
- pane `maekha` zIndex 348 (ต่ำกว่าแม่กวง 350 นิดเดียว)
- **หมายเหตุ:** ถ้าจะเพิ่ม hero สายที่ 3 ใช้ `addFlowRiver` ได้เลย + สร้าง pane ใหม่ + สี const ใหม่

### โรงงาน DIW ริมน้ำ ≤1 กม. — ทำแล้ว (สำคัญ: วิธีได้พิกัด)
**ปัญหา:** ข้อมูลโรงงานสาธารณะของ DIW **ทุกชุดไม่มีพิกัด** (tumbol.asp .xls, CKAN diw-dataset, data.go.th — มีแค่ชื่อ/ที่อยู่/ทุน) ระบบ GIS ที่มีพิกัด (`gisweb.diw.go.th`) เป็น IP ภายในเข้าไม่ได้

**ทางออกที่เจอ (pipeline 2 ขั้น ใน `scripts/`):**
1. **รายชื่อโรงงานรายอำเภอ** — POST `userdb.diw.go.th/factoryPublic/results3.asp` (body `level0=2&level1={จว}&level2={อำเภอ}&level3=`) → 302 → โหลด `{จว}-{อำเภอ}-.xls` (จว: เชียงใหม่=50, ลำพูน=51 · encoding cp874 · ต้องใช้ `xlrd>=2.0.1` อ่าน .xls เก่า)
2. **พิกัด GPS จริงต่อโรงงาน** — GET `web-info.diw.go.th/googlemaps/up_gps.asp?facreg=<cp874-urlencoded>` → หน้ามี `N18.713510  E99.044120` (พิกัดที่ทีมสำรวจ DIW ปักไว้จริง — แม่นระดับอาคาร)
   - **facreg = `[prefix จ/ศ/ช่องว่าง][ประเภท 3][( ) 2][จำพวก 1][ลำดับ 3][ปี 2][รหัสจว 2ตัวอักษร]`** สร้างจากคอลัมน์ "เลขทะเบียนเดิม" (เช่น `จ3-10(1)-9/60ชม` → `จ01001300960ชม`) — ดูสูตรใน `to_facreg()`
   - prefix (จ/ศ) สำคัญมาก ถ้าผิด/ใส่ช่องว่างแทนจะ miss ; ถ้าลำดับเกิน 3 หลัก (บางโรงงานเก่า) จะเข้าสูตรไม่ได้ (badreg ~10%)
   - hit rate ~90% (697/879 โรงงานใน 10 อำเภอริมแม่กวง)
3. กรอง ≤1 กม. จากเส้น `rivers.geojson`/`maekha.geojson` (point-to-segment) → **119 โรงงาน** (แม่กวง 73 · แม่ข่า 46)

**อัปเดตปีหน้า/เพิ่มอำเภอ:** โหลด .xls ใหม่ลง `scripts/diw_xls/` (STEP 0 ใน fetch_gps.py) → `python scripts/fetch_gps.py` → `python scripts/filter_1km.py` (เขียน factories.json ให้เอง)
**ข้อจำกัด:** คลองแม่ข่าดึงโรงงานเฉพาะช่วง **อ.เมืองเชียงใหม่** (ยังไม่รวม แม่ริม/หางดง ต้น-ปลายคลอง) · โรงงานจำพวก 1-2 ยังไม่รวม (เอาเฉพาะจำพวก 3)

**render (app.js):** `addFactories()` → marker divIcon ไอคอนโรงงาน (สีน้ำตาลแม่กวง / ม่วงแม่ข่า) pane `factories` zIndex 335 · คลิก → popup ใช้ `buildRiverPopup()` (การ์ดพับได้ตัวเดียวกับสายน้ำ) · toggle เปิด/ปิดที่ `#factoryToggle` (checkbox ในพาเนล คุมทั้งโรงงาน ≤1กม. และตรวจก่อน-หลัง)

**โรงงานที่ตรวจน้ำก่อน-หลัง (6 แห่ง):** จุดเก็บน้ำกลุ่ม `beforeafter` (KAB/P13-14/PKH/PB/H) คร่อมโรงงานที่ตรวจอยู่ 6 แห่ง — `scripts/build_monitored.py` จับคู่ชื่อกับพิกัดจริงจาก DIW (`diw_gps_raw.json`) ที่ใกล้จุดกึ่งกลาง before/after ที่สุด (5/6 เจอใน DIW, มาสเตอร์คลีนลอนดรี้อยู่ อ.แม่ริมไม่ได้ scrape → ใช้ factoriesHint), เขียนต่อเข้า `factories.json → monitored`. render ด้วย `addMonitoredFactories()` หมุดส้มเด่น (`.fm-monitored`) popup โชว์ "จุดตรวจ {before}→{after}" + ลำน้ำที่ตรวจ · รันซ้ำ: `python scripts/build_monitored.py` (ต้องมี diw_gps_raw.json)

### Popup ข้อมูล fact (คลิกเส้นน้ำ) — ทำแล้ว
- **พฤติกรรม: คลิกเส้น → popup เล็ก (หัวการ์ด 208px) → กด "ดูข้อมูลเพิ่มเติม" ขยายเป็น 250px + โชว์ blurb/สถิติ/note**
- โครง HTML: `.rpop > details.rpop-more > (summary[หัว+.rpop-toggle] + .rpop-body)` ; สายไม่มี fact = `.rpop.rpop-compact` (หัวอย่างเดียว ไม่มีปุ่ม)
- ⚠️ **ห้ามใช้ `popup.update()`** ตอนขยาย — มัน re-render HTML string ใหม่ทำให้ `<details>` เด้งกลับเป็นปิด ให้ใช้ `_updateLayout()` + `_updatePosition()` + `_adjustPan()` (ปรับขนาด/ตำแหน่งโดยไม่แตะเนื้อหา) — อยู่ใน handler `map.on("popupopen")` ที่ setupMap
- ⚠️ **ห้ามพึ่ง UA `<details>` ซ่อน body หรือ `:has()`** — in-app browser ทดสอบเพี้ยนทั้งคู่ จึงคุมด้วย **class `.is-open`** (JS สลับใน toggle handler) → CSS คุม `width` + `.rpop-body{display}` เอง
- ป้ายปุ่มสลับด้วย CSS: `.rpop-toggle{font-size:0}` + `::after` content ("ดูข้อมูลเพิ่มเติม ▾" / เปิด = "ย่อข้อมูล ▴" ผ่าน `.rpop-more[open]`)
- ไฟล์ `river_facts.json`: `rivers` keyed ด้วย **core name** (ตัด prefix แล้ว) + `reservoir` (เขื่อน)
- `coreName()` ใน app.js ตัดคำนำหน้า `ลำน้ำแม่/คลองแม่/ห้วยแม่/แม่น้ำ/น้ำแม่/ลำน้ำ/คลอง/ห้วย/น้ำ/แม่` → เหลือ token หลัก
  เช่น `แม่น้ำกวง`→`กวง`, `ลำน้ำแม่ทา`→`ทา`, `คลองแม่ข่า`→`ข่า` (ทั้ง alias ชี้ fact เดียว)
- **เพิ่ม fact สายใหม่**: ใส่ entry ใน `river_facts.json → rivers[<core>]` `{kind,title,subtitle,accent,blurb,stats[[k,v]...],note}` — ไม่ต้องแตะ app.js
- เส้น hero (แม่กวง/แม่ข่า) เดิม glow+body+flow ตอนนี้ตั้ง `interactive:false` แล้วมี **เส้น hit โปร่งใส weight 16** ทับบนสุดถือ tooltip+popup (กันเส้น flow แย่งคลิก)
- แม่น้ำอื่น: hit layer (weight 12) `bindRiverPopup()` — สายมีชื่อที่ไม่มี fact แสดง **การ์ด minimal** ("ลำน้ำในพื้นที่ลุ่มน้ำปิง"), สายไม่มีชื่อ = ไม่มี popup
- อ่างเก็บน้ำ (polygon) คลิก → fact เขื่อนแม่กวงอุดมธารา
- CSS การ์ด: `.river-popup` / `.rpop*` ใน styles.css (header สี `--accent` ต่อ fact, stats เป็น dl 2 คอลัมน์)
- ⚠️ `state` เป็น top-level `const` → **ไม่ผูกกับ `window`** (debug ใช้ `state` ตรงๆ ไม่ใช่ `window.state`)

### การเย็บแม่น้ำที่ขาด (stitching) — ทำแล้ว
- OSM แบ่งแม่น้ำเป็นหลาย way + บางท่วงขาด (ไม่มีชื่อ/ยังไม่ mapped) ทำให้เส้นบนแผนที่ดูขาดเป็นช่วง
- สคริปต์ `stitch_rivers.py` (local, ไม่ push): จัดกลุ่มตามชื่อ → **ดูดเส้นไม่มีชื่อที่ปลายทั้งสองแตะปลายท่อนของแม่น้ำชื่อเดียวกัน (≤300ม.)** → merge ท่อนที่ปลายห่างกัน ≤2.5กม. เรียงทิศให้ถูก
- ผลลัพธ์: ทุกสายหลักเป็นเส้นเดียว — **ปิง 1918 จุด เต็มสาย 18.43–19.15** (เดิมขาดช่วงสารภี ~2.5กม. จริง ๆ มีเส้นไม่มีชื่อ 65 จุดพาดอยู่ ถูกดูดเข้าปิงแล้ว), ขาน/แม่ริม/แม่คาว/แม่ออน/ปูคา/แม่ร้อง/ห้วยโจ้ ฯลฯ ต่อครบ
- ท่อนสั้นที่เหลือของปิง 3 อัน = แขนงคู่ขนาน (braid) ของจริง ไม่ใช่รอยขาด
- 137 features → 94 features ใน rivers_other.geojson

### UI
- **ห้ามมีกรอบดำตอน click เส้น/หมุด** — จัดการแล้วใน styles.css (`.leaflet-container :focus { outline:none }`) ผู้ใช้ไม่ชอบ
- **Responsive/มือถือ**: `<= 820px` → layout คอลัมน์เดียว (map 55vh + panel ล่าง). legend เป็น `<details id="legend">`:
  - มือถือ: แสดง summary "คำอธิบายสัญลักษณ์" ยุบไว้ default (ไม่งั้นบังแผนที่ ~40%), แตะขยาย, ตอนเปิด max-height 40vh scroll ได้
  - เดสก์ท็อป (>820px): `setupLegend()` เซ็ต `legend.open=true` + CSS ซ่อน summary → เปิดเต็มเหมือนเดิม
  - resync ตอน resize. ทดสอบแล้วทั้ง 375px และ 1280px

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
