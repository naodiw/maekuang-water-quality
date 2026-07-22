# -*- coding: utf-8 -*-
"""ขั้นที่ 1 ของ pipeline โรงงาน DIW → พิกัด (ดู HANDOFF.md หัวข้อ "โรงงาน DIW ริมน้ำ")

STEP 0 (ทำก่อน รันสคริปต์นี้): โหลด .xls รายอำเภอลงโฟลเดอร์ scripts/diw_xls/
  POST https://userdb.diw.go.th/factoryPublic/results3.asp
       body: level0=2&level1={จังหวัด}&level2={อำเภอ}&level3=   (level3 ว่าง = ทั้งอำเภอ)
  จะ 302 → ดาวน์โหลด https://userdb.diw.go.th/factoryPublic/{จว}-{อำเภอ}-.xls
  โค้ดจังหวัด: เชียงใหม่=50, ลำพูน=51 ; อำเภอริมแม่กวง 50-1,50-5,50-13,50-14,50-19,50-23 / 51-1,51-2,51-6,51-7
  (ดูรายชื่อโค้ดได้จาก tumbol.asp — level0=2 คือภาคเหนือ)

STEP 1 (สคริปต์นี้): อ่านทุก .xls → แปลง "เลขทะเบียนเดิม" เป็น facreg → ดึงพิกัดทีละโรงงาน
  facreg = [prefix จ/ศ/ช่องว่าง][ประเภท 3หลัก][(x) 2หลัก][จำพวก 1][ลำดับ 3หลัก][ปี 2หลัก][รหัสจว 2ตัวอักษร]
  GET http://web-info.diw.go.th/googlemaps/up_gps.asp?facreg=<cp874-urlencoded>
      → หน้ามี "N18.713510  E99.044120"  (เป็น GPS จริงที่ทีมสำรวจ DIW ปักไว้)
  เขียนผล → scripts/diw_gps_raw.json   (ป้อนต่อให้ filter_1km.py)
"""
import pandas as pd, re, json, time, os, urllib.parse, urllib.request, glob, sys

DIST_NAME = {
    ('50','1'):'เมืองเชียงใหม่', ('50','5'):'ดอยสะเก็ด', ('50','13'):'สันกำแพง',
    ('50','14'):'สันทราย', ('50','19'):'สารภี', ('50','23'):'แม่ออน',
    ('51','1'):'เมืองลำพูน', ('51','2'):'แม่ทา', ('51','6'):'ป่าซาง', ('51','7'):'บ้านธิ',
}

def to_facreg(old):
    m = re.match(r'^([ก-ฮ]?)(\d)-(\d+)(?:\((\d+)\))?-(\d+)/(\d+)([ก-ฮ]{2})$', str(old).strip())
    if not m: return None
    pre = m.group(1) or ' '
    fam = m.group(2)
    typ = m.group(3).zfill(3)
    sub = (m.group(4) or '0').zfill(2)
    run = m.group(5)
    yr  = m.group(6).zfill(2)
    prov= m.group(7)
    if len(run) > 3: return None   # run เกิน 3 หลัก ไม่เข้าสูตร
    return f'{pre}{typ}{sub}{fam}{run.zfill(3)}{yr}{prov}'

def fetch_gps(facreg):
    b = urllib.parse.quote(facreg.encode('cp874'))
    url = f'http://web-info.diw.go.th/googlemaps/up_gps.asp?facreg={b}'
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            t = r.read().decode('cp874','replace')
    except Exception:
        return None, None
    nm = re.search(r'ชื่อโรงงาน\s*:\s*([^<\r\n]+)', t)
    co = re.search(r'N([0-9.]+)\s+E([0-9.]+)', t)
    if not co: return None, None
    try:
        lat, lng = float(co.group(1)), float(co.group(2))
    except ValueError:
        return None, None
    return (nm.group(1).strip() if nm else None), (lat, lng)

HERE = os.path.dirname(os.path.abspath(__file__))
rows = []
for path in sorted(glob.glob(os.path.join(HERE, 'diw_xls', '*.xls'))):
    m = re.search(r'(\d+)-(\d+)\.xls$', path)
    dist = DIST_NAME.get((m.group(1), m.group(2)), '?')
    x = pd.read_excel(path)
    x.columns = [str(c).strip() for c in x.columns]
    for _, r in x.iterrows():
        rows.append({
            'fid': str(r.get('เลขทะเบียนโรงงาน','')).strip(),
            'oldreg': str(r.get('เลขทะเบียนเดิม','')).strip(),
            'name': str(r.get('ชื่อโรงงาน','')).strip(),
            'operator': str(r.get('ผู้ประกอบการ','')).strip(),
            'business': str(r.get('ประกอบกิจการ','')).strip(),
            'addrno': str(r.get('เลขที่','')).strip(),
            'moo': str(r.get('หมู่','')).replace('.0','').strip(),
            'road': str(r.get('ถนน','')).strip(),
            'tambon': str(r.get('ตำบล','')).strip(),
            'district': dist,
            'province': str(r.get('จังหวัด','')).strip(),
            'zip': str(r.get('ไปรษณีย์', r.get('รหัสไปรษณีย์',''))).strip(),
            'phone': str(r.get('โทรศัพท์','')).strip(),
            'factype': str(r.get('ประเภท','')).strip(),
            'capital': str(r.get('เงินทุน','')).strip(),
            'workers': str(r.get('คนงาน','')).replace('.0','').strip(),
            'hp': str(r.get('แรงม้า','')).strip(),
        })

print(f'total factories in 10 districts: {len(rows)}', flush=True)

out, miss = [], 0
for i, r in enumerate(rows):
    f = to_facreg(r['oldreg'])
    if not f:
        miss += 1
        continue
    nm, co = fetch_gps(f)
    if co:
        r['latitude'], r['longitude'] = co
        r['gpsName'] = nm
        out.append(r)
    if (i+1) % 50 == 0:
        print(f'{i+1}/{len(rows)}  gps-hits={len(out)}  badreg={miss}', flush=True)
    time.sleep(0.25)

print(f'DONE: {len(out)} with coords / {len(rows)} total (badreg {miss})', flush=True)
with open(os.path.join(HERE, 'diw_gps_raw.json'), 'w', encoding='utf-8') as fp:
    json.dump(out, fp, ensure_ascii=False, indent=1)
