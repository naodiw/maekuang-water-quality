# -*- coding: utf-8 -*-
"""ขั้นที่ 2 ของ pipeline โรงงาน (ดู scripts/fetch_gps.py ขั้นที่ 1):
กรอง diw_gps_raw.json ให้เหลือโรงงานในระยะ ≤1 กม. จากแม่น้ำกวง (rivers.geojson)
หรือคลองแม่ข่า (maekha.geojson) แล้วเขียน ../factories.json
ระยะ = min point-to-segment (equirectangular ประมาณ แม่นพอที่สเกลนี้)
รันจากโฟลเดอร์ scripts/ (ที่มี diw_gps_raw.json จากขั้นที่ 1 วางอยู่)"""
import json, math, os

PROJ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # โฟลเดอร์ repo
MAX_M = 1000.0

def load_lines(path):
    with open(path, encoding='utf-8') as f:
        gj = json.load(f)
    lines = []
    for ft in gj['features']:
        g = ft.get('geometry') or {}
        if g.get('type') == 'LineString':
            lines.append([(lat, lng) for lng, lat in g['coordinates']])
    return lines

def pt_seg_m(plat, plng, alat, alng, blat, blng):
    # equirectangular projection around point
    kx = 111320.0 * math.cos(math.radians(plat))
    ky = 110540.0
    ax, ay = (alng-plng)*kx, (alat-plat)*ky
    bx, by = (blng-plng)*kx, (blat-plat)*ky
    dx, dy = bx-ax, by-ay
    if dx == dy == 0:
        return math.hypot(ax, ay)
    t = max(0.0, min(1.0, -(ax*dx+ay*dy)/(dx*dx+dy*dy)))
    return math.hypot(ax+t*dx, ay+t*dy)

def dist_to_lines(lat, lng, lines):
    best = 1e18
    for line in lines:
        for i in range(len(line)-1):
            d = pt_seg_m(lat, lng, line[i][0], line[i][1], line[i+1][0], line[i+1][1])
            if d < best: best = d
    return best

kuang = load_lines(os.path.join(PROJ, 'rivers.geojson'))
maekha = load_lines(os.path.join(PROJ, 'maekha.geojson'))
print('kuang lines', len(kuang), '| maekha lines', len(maekha))

with open(os.path.join(os.path.dirname(__file__), 'diw_gps_raw.json'), encoding='utf-8') as f:
    facs = json.load(f)
print('factories with coords:', len(facs))

def numclean(s):
    s = str(s).strip()
    if not s or s in ('nan', '0', '0.0'):
        return ''
    try:
        v = float(s); return str(int(v)) if v == int(v) else str(v)
    except ValueError:
        return s

out = []
for r in facs:
    lat, lng = r['latitude'], r['longitude']
    if not (17.9 < lat < 19.6 and 98.4 < lng < 99.7):
        continue  # ตัดพิกัดเพี้ยน (นอกภูมิภาค)
    dk = dist_to_lines(lat, lng, kuang)
    dm = dist_to_lines(lat, lng, maekha)
    d, near = (dk, 'kuang') if dk <= dm else (dm, 'maekha')
    if d <= MAX_M:
        zipc = numclean(r['zip'])
        JUNK = ('', 'nan', '-', '0')
        ap = []
        if r['addrno'] not in JUNK: ap.append(r['addrno'])
        if r['moo'] not in JUNK: ap.append('ม.'+r['moo'])
        if r['road'] not in JUNK: ap.append('ถ.'+r['road'])
        if r['tambon'] not in JUNK: ap.append('ต.'+r['tambon'])
        ap += ['อ.'+r['district'], 'จ.'+r['province']]
        if zipc: ap.append(zipc)
        addr = ' '.join(ap)
        nm = r['name'] if r['name'] not in ('', '-', 'nan') else (r.get('gpsName') or r['operator'])
        out.append({
            'fid': r['fid'], 'oldreg': r['oldreg'], 'name': nm,
            'operator': r['operator'], 'business': r['business'], 'address': addr,
            'district': r['district'], 'province': r['province'],
            'phone': '' if r['phone'] == 'nan' else r['phone'], 'factype': numclean(r['factype']),
            'capital': numclean(r['capital']), 'workers': numclean(r['workers']), 'hp': numclean(r['hp']),
            'nearRiver': near, 'distanceM': round(d, 1),
            'latitude': round(r['latitude'], 6), 'longitude': round(r['longitude'], 6),
        })

out.sort(key=lambda x: x['distanceM'])
print('within 1 km:', len(out))
import collections, datetime
print(collections.Counter((r['nearRiver'], r['district']) for r in out).most_common())

result = {
    'meta': {
        'source': 'กรมโรงงานอุตสาหกรรม (DIW) — รายชื่อจาก userdb.diw.go.th/factoryPublic, พิกัดจาก web-info.diw.go.th/googlemaps',
        'note': 'โรงงานจำพวก 3 ในระยะ ≤1 กม. จากแม่น้ำกวง/คลองแม่ข่า (ช่วงในเขตอำเภอที่แม่น้ำไหลผ่าน)',
        'generated': datetime.date.today().isoformat(),
        'count': len(out),
    },
    'factories': out,
}
with open(os.path.join(PROJ, 'factories.json'), 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=1)
print('wrote', os.path.join(PROJ, 'factories.json'))
with open('factories_1km.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
