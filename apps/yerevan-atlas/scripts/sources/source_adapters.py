"""Public-source parsers/normalizers extracted from reviewed catalog adapters; no network side effects."""

import base64, datetime, json, re, urllib.parse

CHECKED=None

districts={}
devs={}

def balanced(text, start):
    depth = 0
    quoted = False
    escape = False
    for i in range(start, len(text)):
        c = text[i]
        if quoted:
            if escape:
                escape = False
            elif c == '\\':
                escape = True
            elif c == '"':
                quoted = False
        elif c == '"':
            quoted = True
        elif c in '[{':
            depth += 1
        elif c in ']}':
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    raise ValueError('Unbalanced data')

def js_array(text, marker):
    i = text.index(marker) + len(marker)
    a = balanced(text, i)
    a = re.sub('([{,])([A-Za-z_$][A-Za-z0-9_$]*):', '\\1"\\2":', a)
    return json.loads(a)

def flight(html):
    chunks = []
    for t in re.findall('<script[^>]*>(.*?)</script>', html, re.S):
        if t.startswith('self.__next_f.push('):
            try:
                a = json.loads(t[len('self.__next_f.push('):-1])
                chunks.extend([a[1]] if len(a) > 1 and isinstance(a[1], str) else [])
            except (ValueError, TypeError):
                pass
    return '\n'.join(chunks)

def detail_data(html):
    f = flight(html)
    i = f.find('"item":{')
    if i < 0:
        return (None, None)
    item = json.JSONDecoder(strict=False).raw_decode(f[i + len('"item":'):])[0]
    structured = []
    for t in re.findall('<script type="application/ld\\+json">(.*?)</script>', html, re.S):
        try:
            structured.append(json.loads(t))
        except ValueError:
            pass
    ld = next((x for x in structured if x.get('@type') == 'RealEstateListing'), {})
    return (item, ld)

def coords(url):
    u = urllib.parse.unquote(url or '')
    for enc in re.findall('!2z([^!]+)', u):
        try:
            s = base64.urlsafe_b64decode(enc + '=' * (-len(enc) % 4)).decode()
            m = re.search('(\\d+)°(\\d+)[\\\'′](\\d+(?:\\.\\d+)?)["″]\\s*([NS])\\s+(\\d+)°(\\d+)[\\\'′](\\d+(?:\\.\\d+)?)["″]\\s*([EW])', s)
            if m:
                d, mins, secs, ns, D, M, S, ew = m.groups()
                lat = (int(d) + int(mins) / 60 + float(secs) / 3600) * (1 if ns == 'N' else -1)
                lon = (int(D) + int(M) / 60 + float(S) / 3600) * (1 if ew == 'E' else -1)
                return ([round(lon, 7), round(lat, 7)], 'published_map_pin', 'Public map pin label: ' + s)
        except (ValueError, UnicodeDecodeError):
            pass
    pins = re.findall('!3d(-?\\d+(?:\\.\\d+)?)!4d(-?\\d+(?:\\.\\d+)?)', u)
    if pins:
        lat, lon = pins[-1]
        return ([float(lon), float(lat)], 'published_map_pin', 'Public map embed place coordinates')
    m = re.search('[?&](?:q|ll)=(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)', u)
    if m:
        return ([float(m[2]), float(m[1])], 'published_map_pin', 'Public map query coordinates')
    lon = re.search('!2d(-?\\d+(?:\\.\\d+)?)', u)
    lat = re.search('!3d(-?\\d+(?:\\.\\d+)?)', u)
    if lat and lon:
        return ([float(lon[1]), float(lat[1])], 'approximate_viewport', 'Public map viewport centre; exact pin not separately published')
    return (None, 'missing', 'No published coordinate found')

def numeric(x):
    if x in (None, ''):
        return None
    try:
        return float(str(x).replace(',', '.'))
    except (ValueError, TypeError):
        return None

def iso_date(x):
    try:
        return datetime.datetime.fromisoformat(x.replace('Z', '+00:00')).astimezone(datetime.timezone(datetime.timedelta(hours=4))).date().isoformat()
    except (ValueError, TypeError, AttributeError):
        return x or None

def normalize_karu(x, ld=None):
    id = x['id']
    source = 'https://karucapatoxic.am/' + id
    dist = districts.get(x.get('district'), {})
    dev = devs.get(x.get('developer'), {})
    c, accuracy, coordSource = coords(x.get('googleMap', ''))
    p = x.get('price') or {}
    f = x.get('floors')
    floor_nums = re.findall('\\d+', str(f)) if f else []
    fs = list(map(int, floor_nums))
    floors = max(fs) if fs else None
    price = {'min': numeric(p.get('min')), 'max': numeric(p.get('max')), 'currency': p.get('currency') or None, 'basis': 'per_m2'}
    sources = [{'title': 'Karucapatoxic project listing', 'url': source, 'type': 'directory', 'checkedAt': CHECKED}]
    website = x.get('link') or dev.get('link')
    if website:
        sources.append({'title': dev.get('name', 'Developer') + ' official website', 'url': website, 'type': 'developer_link', 'checkedAt': None})
    status = 'completed' if x.get('completed') is True else 'unknown'
    return {'id': 'karu-' + id, 'sourceId': id, 'name': (x.get('title_en') or x.get('title_am') or x.get('address_en') or x.get('address_am') or '').strip(), 'nameHy': (x.get('title_am') or x.get('address_am') or '').strip(), 'nameRu': (x.get('title_ru') or x.get('address_ru') or '').strip(), 'address': (x.get('address_en') or x.get('address_am') or '').strip(), 'addressHy': (x.get('address_am') or x.get('address') or '').strip(), 'district': dist.get('en', 'Unknown'), 'districtHy': dist.get('am', ''), 'region': dist.get('region', 'Unknown'), 'inYerevan': dist.get('region') == 'Yerevan', 'developer': dev.get('name') or (ld or {}).get('provider', {}).get('name') or None, 'coordinates': c, 'coordinateAccuracy': accuracy, 'coordinateSource': coordSource, 'coordinateSourceUrl': source, 'price': price, 'priceUpdatedAt': iso_date(x.get('priceUpdated')), 'minimumApartmentPrice': numeric(x.get('minApartmentPrice')), 'area': {'min': numeric(x.get('minSquare') or x.get('minApartmentPriceSquare')), 'max': None}, 'floors': floors, 'floorRangePublished': f or None, 'completion': iso_date(x.get('endDate')), 'completionIsTarget': True, 'completionPrecision': 'year' if x.get('endDateFormat') == 'YYYY' else 'month', 'startDate': iso_date(x.get('startDate')), 'sourceUrl': source, 'sources': sources, 'status': status, 'statusNote': 'Directory listing; current construction and handover status requires confirmation. Target date is not proof of completion.', 'soldOut': x.get('soldOut') is True, 'images': [], 'imageSourceUrls': x.get('images') or [], 'website': website or None, 'contacts': {'phones': [str(phone).strip() for phone in x.get('phones') or []], 'email': (x.get('email') or '').strip() or None, 'facebook': x.get('facebook') or None, 'instagram': x.get('instagram') or None}, 'incomeTaxRefundClaim': x.get('incomeTaxRefund') or None, 'propertyType': 'apartments' if str(x.get('type')) == '1' else 'townhouses_or_other', 'checkedAt': CHECKED}

def text(o, lang='eng'):
    return (o or {}).get(lang, '').strip() if isinstance(o, dict) else str(o).strip() if o else ''

def date(s):
    if not s:
        return None
    if re.match('^\\d{2}/\\d{4}$', s):
        m, y = s.split('/')
        return f'{y}-{m}'
    return s[:10]

def num(x):
    return x if isinstance(x, (int, float)) and x > 0 else None

def normalize_myhome(row, d=None):
    d = d or {}
    a = d.get('address') or row.get('address') or {}
    city = text(a.get('city'))
    district = text(a.get('district')) or city
    districtHy = text(a.get('district'), 'arm') or text(a.get('city'), 'arm')
    region = 'Yerevan' if city == 'Yerevan' else text(a.get('region')) or 'Outside Yerevan'
    b = d.get('builder') or {}
    builder = text(b.get('builderBrandName')) or text(row.get('builder'))
    id = row['id']
    url = 'https://myhome.am/en/building/' + str(id)
    api = 'https://myhome.am/API/v1/buildings/' + str(id)
    lng = num(d.get('longitude') or a.get('lng'))
    lat = num(d.get('latitude') or a.get('lat'))
    coords = [lng, lat] if lng and lat else None
    sources = [{'title': 'MyHome / Ameriabank project listing', 'url': url, 'type': 'bank_directory', 'checkedAt': CHECKED}]
    site = b.get('builderWebSite')
    if site:
        sources.append({'title': builder + ' developer website', 'url': site, 'type': 'developer_link', 'checkedAt': None})
    facets = [{'category': text(c.get('name')), 'name': text(o.get('name')), 'nameHy': text(o.get('name'), 'arm'), 'nameRu': text(o.get('name'), 'rus')} for c in d.get('categories', []) for o in c.get('options', [])]
    name = text(row.get('name'))
    nameHy = text(row.get('name'), 'arm')
    nameRu = text(row.get('name'), 'rus')
    adr = ' '.join(filter(None, [text(a.get('street')), str(a.get('buildingNumber') or '')]))
    adrHy = ' '.join(filter(None, [text(a.get('street'), 'arm'), str(a.get('buildingNumber') or '')]))
    return {'id': 'myhome-' + str(id), 'sourceId': str(id), 'name': name or adr, 'nameHy': nameHy or adrHy, 'nameRu': nameRu, 'address': adr, 'addressHy': adrHy, 'district': district, 'districtHy': districtHy, 'city': city, 'region': region, 'inYerevan': city == 'Yerevan', 'developer': builder or None, 'coordinates': coords, 'coordinateAccuracy': 'published_map_pin' if coords else 'missing', 'coordinateSource': 'Public MyHome building address coordinates', 'coordinateSourceUrl': url, 'price': {'min': num(d.get('areaPriceStartingAt') or row.get('areaPriceStartingAt')), 'max': None, 'currency': 'AMD', 'basis': 'per_m2'}, 'priceUpdatedAt': None, 'minimumApartmentPrice': num(d.get('apartmentPriceStartingAt') or row.get('apartmentPriceStartingAt')), 'area': {'min': num(d.get('minAreaOfApartments')), 'max': num(d.get('maxAreaOfApartments'))}, 'floors': num(d.get('floorsCount')), 'floorRangePublished': str(d['floorsCount']) if d.get('floorsCount') else None, 'completion': date(d.get('completionDate') or row.get('completionDate')), 'completionIsTarget': not row.get('isBuilt', False), 'completionPrecision': 'month', 'handover': date(d.get('exploitationDate') or row.get('exploitationDate')), 'handoverNote': 'Source distinguishes exploitation/commissioning date from completion date; verify contract date.', 'sourceUrl': url, 'sources': sources, 'status': 'completed' if row.get('isBuilt') else 'under_construction', 'statusNote': 'Directory marks Built' if row.get('isBuilt') else 'Directory marks Construction phase; current site stage requires confirmation.', 'soldOut': bool(row.get('isSoldOut')), 'availableApartments': d.get('availableForSale', row.get('availableApartments')), 'apartmentsCount': d.get('apartmentsCount'), 'images': [], 'imageSourceUrls': list(dict.fromkeys(([d['mainImage']] if d.get('mainImage') else [row['imagePath']] if row.get('imagePath') else []) + (d.get('images') or []))), 'website': site, 'contacts': {'phones': [v for v in [b.get('builderMobilePhoneNumber'), b.get('builderPhoneNumber')] if v], 'email': b.get('builderEmail')}, 'incomeTaxRefundClaim': 'yes' if row.get('isWithIncomeTax') else 'no', 'propertyType': 'townhouses' if d.get('isTownHouse') else 'apartments_or_houses', 'constructionType': text(d.get('typeOfWall')) or None, 'floorHeightSourceValue': num(d.get('floorheight')), 'floorHeightSourceUnit': 'Not consistently specified in source', 'facilities': facets, 'interiorConditions': [text(x) for x in d.get('stateApartments', [])], 'progressUpdates': [{'name': text(x.get('name')), 'createdDate': x.get('createdDate'), 'updatedDate': x.get('updatedDate'), 'imageSourceUrls': x.get('images') or []} for x in d.get('buildingProgresses', [])], 'publishedDate': row.get('publishedDate'), 'createdDate': row.get('createdDate'), 'checkedAt': CHECKED}
