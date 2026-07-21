# -*- coding: utf-8 -*-
import re, json, sys
import openpyxl

wb = openpyxl.load_workbook('พิกัดจุดเก็บน้ำ.xlsx', data_only=True)
ws = wb.active
rows = [[c for c in r] for r in ws.iter_rows(values_only=True)]

def dms_to_dec(dms):
    # e.g. 18°43'12.3"N 99°04'18.1"E  -> (lat, lng)
    m = re.findall(r"(\d+)[°º]\s*(\d+)'\s*([\d.]+)\"?\s*([NSEW])", dms)
    coords = {}
    for deg, mn, sec, hemi in m:
        val = float(deg) + float(mn)/60 + float(sec)/3600
        if hemi in ('S','W'): val = -val
        coords[hemi] = val
    lat = coords.get('N', coords.get('S'))
    lng = coords.get('E', coords.get('W'))
    return lat, lng

GROUPS = {'แม่น้ำกวง':'kuang', 'แม่ข่า':'maekha', 'น้ำก่อน-หลัง':'beforeafter'}
GROUP_LABEL = {'kuang':'แม่น้ำกวง', 'maekha':'คลองแม่ข่า', 'beforeafter':'จุดก่อน-หลังโรงงาน'}

points = []
factories = []  # embedded factory coords in before/after descriptions
group = None
pending = None  # (code, name)

for r in rows:
    a = (str(r[0]).strip() if r[0] is not None else '')
    b = (str(r[1]).strip() if r[1] is not None else '')
    if a in GROUPS:
        group = GROUPS[a]; pending=None; continue
    if a.replace(' ','') == 'รหัสจุดเก็บ':  # header row
        continue
    # code row
    if a and re.match(r'^[A-Z]{1,4}\d', a):
        pending = {'code': a, 'name': b}
        # extract embedded factory coords from name (before/after group)
        for fm in re.finditer(r'(บริษัท[^()]*?|ห้างหุ้นส่วน[^()]*?|โรงงาน[^()]*?)\((\d+[°º][^)]*?[EW])\)', b):
            fname = fm.group(1).strip()
            flat, flng = dms_to_dec(fm.group(2))
            if flat and flng:
                factories.append({'name': fname, 'latitude': round(flat,6), 'longitude': round(flng,6), 'source': a})
        continue
    # coordinate row (col B has DMS, col A empty)
    if not a and b and '°' in b and pending:
        lat, lng = dms_to_dec(b)
        clean_name = re.sub(r'\s+', ' ', pending['name']).strip()
        points.append({
            'code': pending['code'],
            'name': clean_name,
            'group': group,
            'groupLabel': GROUP_LABEL.get(group, group),
            'latitude': round(lat,6) if lat else None,
            'longitude': round(lng,6) if lng else None,
            'dms': b,
        })
        pending = None

data = {'points': points, 'factoriesHint': factories}
with open('data.json','w',encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print('points:', len(points), '| factory hints:', len(factories))
for p in points:
    print(f"  {p['code']:6} {p['group']:12} {p['latitude']},{p['longitude']}  {p['name'][:40]}")
