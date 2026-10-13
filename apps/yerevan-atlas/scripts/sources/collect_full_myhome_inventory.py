#!/usr/bin/env python3
"""Snapshot the public MyHome inventory, without preference restrictions.

Read-only public website endpoints; no authenticated requests or booking actions.
Raw successful responses are cached for resumption. A new output directory starts
a fresh snapshot. Default: all catalog records and their complete list pages.
Optional details are resumable separately (--details all|yerevan|none).
"""
from __future__ import annotations
import argparse
import concurrent.futures
import datetime as dt
import functools
import json
import math
from pathlib import Path
import threading
import time
import urllib.error
import urllib.request

API = 'https://myhome.am/API/v1'
ROOT = Path(__file__).resolve().parent
PARENT = ROOT.parent
LOCK = threading.Lock()


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')
    tmp.replace(path)


def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else None


def integer(value):
    n = number(value)
    return int(n) if n is not None and int(n) == n else None


def load_projects(path):
    payload = json.loads(path.read_text())
    items = payload if isinstance(payload, list) else payload.get('projects', payload.get('items', payload.get('records', [])))
    result = {}
    for item in items:
        source_id = item.get('sourceId', item.get('id'))
        if isinstance(source_id, str) and source_id.startswith('myhome-'):
            source_id = source_id.removeprefix('myhome-')
        if str(source_id).isdigit():
            result[int(source_id)] = dict(item)
    if not result:
        raise ValueError(f'No MyHome building IDs in {path}')
    return result


@functools.lru_cache(maxsize=4)
def read_project_detail_index(path):
    return json.loads(Path(path).read_text())


def public_json(url, payload, dest, retries=2, timeout=25):
    if dest.exists():
        cached = json.loads(dest.read_text())
        if cached.get('success') is True:
            return cached
    headers = {'Accept': 'application/json'}
    data = None
    if payload is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(payload).encode()
    request = urllib.request.Request(url, data=data, headers=headers, method='POST' if data else 'GET')
    errors = []
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read()
                content = json.loads(raw)
                pagination_raw = response.headers.get('x-pagination')
                result = {
                    'success': True, 'url': url, 'method': request.method,
                    'request': payload, 'checkedAt': now(), 'httpStatus': response.status,
                    'pagination': json.loads(pagination_raw) if pagination_raw else None,
                    'data': content, 'transientErrors': errors,
                }
                write_json(dest, result)
                return result
        except urllib.error.HTTPError as exc:
            errors.append({'at': now(), 'error': f'HTTP {exc.code}', 'attempt': attempt + 1})
            # Do not retry denied/not-found requests or change access paths.
            if exc.code in (401, 403, 404):
                break
            if exc.code == 429:
                # Save the failure and let a later run resume; no rate-limit bypass.
                errors[-1]['retryAfter'] = exc.headers.get('Retry-After')
                break
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            errors.append({'at': now(), 'error': f'{type(exc).__name__}: {exc}', 'attempt': attempt + 1})
        if attempt < retries:
            time.sleep(min(2 ** attempt, 4))
    result = {'success': False, 'url': url, 'method': request.method, 'request': payload,
              'checkedAt': now(), 'errors': errors}
    write_json(dest, result)
    return result


def project_context(project, building_id, detail_dir):
    # Only use actual building metadata, never guessed maxima from a complex.
    candidates = [detail_dir / f'{building_id}.json', detail_dir / f'myhome-detail-{building_id}.json',
                  PARENT / f'myhome-detail-{building_id}.json']
    detail = read_project_detail_index(str(detail_dir)).get(str(building_id), {}) if detail_dir.is_file() else {}
    if not detail:
        for path in candidates:
            if path.exists():
                value = json.loads(path.read_text())
                detail = value.get('data', value) if isinstance(value, dict) else {}
                if isinstance(detail, dict) and detail.get('id') == building_id:
                    break
                detail = {}
    source_types = project.get('typeOfProperties') or []
    building_type = project.get('buildingType', detail.get('type'))
    if source_types == [1] or (not source_types and building_type == 1):
        kind = 'apartment'
    elif source_types == [3] or (building_type == 3 and detail.get('isTownHouse') is True):
        kind = 'townhouse'
    elif source_types == [2] or building_type == 3:
        kind = 'house'
    elif source_types == [5]:
        kind = 'commercial'
    else:
        kind = 'unknown'
    address = detail.get('address') or project.get('address') or {}
    city = (address.get('city') or {}).get('eng') if isinstance(address, dict) else project.get('city')
    district = (address.get('district') or {}).get('eng') if isinstance(address, dict) else project.get('district')
    in_yerevan = project.get('inYerevan') if isinstance(project.get('inYerevan'), bool) else city == 'Yerevan'
    return {
        'sourceProjectId': f'myhome-{building_id}', 'buildingId': building_id,
        'name': project.get('name'), 'inYerevan': in_yerevan, 'city': city, 'district': district,
        'unitKind': kind, 'sourceTypeOfProperties': source_types,
        'sourceBuildingType': building_type,
        'classificationBasis': 'Public catalog typeOfProperties and frontend TYPE_OF_PROPERTIES mapping; buildingType fallback from public building record.',
        'sourceUrl': f'https://myhome.am/en/building/{building_id}',
        'reportedAvailableApartments': project.get('availableApartments', project.get('availableForSale')),
        'reportedDetailAvailableForSale': detail.get('availableForSale'),
        'reportedDetailApartmentsCount': detail.get('apartmentsCount'),
        'sourceProjectFloorCount': detail.get('floorsCount'),
        'projectFloorCountNotUsedForUnitTopFloor': True,
    }


def collect_pages(building_id, context, args):
    by_id = {}
    report = {'sourceProjectId': f'myhome-{building_id}', 'buildingId': building_id,
              'startedAt': now(), 'pages': [], 'errors': [], 'warnings': [],
              'duplicateUnitIds': [], 'complete': False, **context}
    expected = None
    raw_count = 0
    prior_signature = None
    for page in range(1, args.max_pages + 1):
        payload = {
            'buildingId': building_id, 'roomsCount': None,
            'minPrice': None, 'maxPrice': None, 'minArea': None, 'maxArea': None,
            'sortBy': '4', 'sortAscending': True, 'pageSize': args.page_size, 'pageNumber': page,
        }
        dest = args.output / 'raw-list-pages' / f'{building_id}-page-{page}.json'
        response = public_json(f'{API}/apartments/filter', payload, dest, timeout=args.timeout)
        if not response['success']:
            report['errors'].append({'page': page, 'errors': response['errors']})
            break
        data = response['data']
        items = data.get('apartments') if isinstance(data, dict) else None
        pagination = response.get('pagination')
        if not isinstance(items, list):
            report['errors'].append({'page': page, 'error': 'Response missing apartments array'})
            break
        raw_count += len(items)
        report['pages'].append({'page': page, 'checkedAt': response['checkedAt'], 'count': len(items),
                                'pagination': pagination, 'path': str(dest.relative_to(args.output))})
        if not isinstance(pagination, dict):
            report['errors'].append({'page': page, 'error': 'Missing x-pagination; cannot prove completeness'})
            break
        reported = pagination.get('FilteredCount', pagination.get('TotalCount'))
        if expected is None:
            expected = reported
        elif reported != expected:
            report['warnings'].append({'page': page, 'error': 'Reported count changed during snapshot', 'before': expected, 'after': reported})
        signature = tuple(item.get('apartmentId') for item in items)
        if page > 1 and signature and signature == prior_signature:
            report['errors'].append({'page': page, 'error': 'Repeated page signature; pagination cannot be trusted'})
            break
        prior_signature = signature
        for item in items:
            unit_id = item.get('apartmentId')
            if not isinstance(unit_id, int):
                report['errors'].append({'page': page, 'error': 'Missing numeric apartmentId', 'record': item})
                continue
            if unit_id in by_id:
                report['duplicateUnitIds'].append(unit_id)
            by_id[unit_id] = {'source': item, 'checkedAt': response['checkedAt'], 'page': page}
        if pagination.get('HasNext') is False:
            report['complete'] = (expected == len(by_id) and not report['errors'] and not report['warnings'])
            break
        if not items:
            report['errors'].append({'page': page, 'error': 'Empty page while HasNext is true'})
            break
        time.sleep(args.pause)
    else:
        report['errors'].append({'error': f'Maximum {args.max_pages} pages reached'})
    report.update({'finishedAt': now(), 'expectedUnits': expected, 'rawUnitsRead': raw_count,
                   'uniqueUnits': len(by_id), 'pagesRead': len(report['pages'])})
    if expected is not None and expected != len(by_id):
        report['errors'].append({'error': 'Unique unit count differs from source pagination count',
                                 'expected': expected, 'received': len(by_id)})
    write_json(args.output / 'building-inventories' / f'{building_id}.json', {'report': report, 'units': by_id})
    return report, by_id


def normalize_unit(building_id, item, context, detail_response=None):
    u = item['source']
    d = detail_response['data'] if detail_response and detail_response.get('success') else {}
    if d and d.get('apartmentId') != u['apartmentId']:
        raise ValueError('Unit-detail identity mismatch')
    if d and d.get('buildingId') != building_id:
        raise ValueError('Unit-detail building identity mismatch')
    unit_id = u['apartmentId']
    unit_kind = context['unitKind']
    booked = d.get('isBooked', u.get('isBooked'))
    if not isinstance(booked, bool):
        booked = None
    area = number(d.get('apartmentArea')) if unit_kind == 'apartment' else number(d.get('houseArea'))
    if area is None:
        area = number(u.get('area'))
    variants = []
    for p in d.get('conditionPrices') or []:
        state = p.get('state') or {}
        variants.append({
            'conditionId': p.get('conditionId'), 'totalAMD': number(p.get('apartmentPrice')),
            'totalUSD': number(p.get('apartmentPriceUSD')), 'pricePerM2AMD': number(p.get('areaPrice')),
            'currency': 'AMD', 'basis': state.get('eng'), 'basisHy': state.get('arm'), 'basisRu': state.get('rus'),
            'conditionLabel': state, 'conditionType': 'finish_state_as_published',
            'paymentMethod': None, 'paymentCondition': None,
            'isWithIncomeTax': p.get('isWithIncomeTax'), 'sourceFields': p,
        })
    total = number(u.get('minApartmentPrice'))
    rate = number(u.get('minAreaPrice'))
    suspicious_price = unit_kind in ('apartment', 'house', 'townhouse') and (
        (total is not None and 0 < total < 1_000_000)
        or (rate is not None and 0 < rate < 10_000))
    unit_floor = integer(d.get('floor', u.get('floor')))
    building_floors = integer(d.get('buildingMaxFloor')) if d else None
    if building_floors is not None and building_floors <= 0:
        building_floors = None
    published_top = unit_floor == building_floors if unit_floor is not None and building_floors is not None else None
    position = d.get('position') or {}
    source_url = f'https://myhome.am/en/building/{building_id}/apartment/{unit_id}'
    return {
        'id': f'myhome-{building_id}-{unit_id}', 'projectId': f'myhome-{building_id}',
        'sourceProjectId': f'myhome-{building_id}', 'buildingId': building_id, 'unitId': unit_id,
        'unit': d.get('number', u.get('number')) or u.get('code') or str(unit_id),
        'sourceCode': d.get('apartmentCode', u.get('code')),
        'unitKind': unit_kind, 'unitKindBasis': context['classificationBasis'],
        'sourceApartmentType': d.get('apartmentType'), 'sourceBuildingType': d.get('buildingType', u.get('buildingType')),
        'inYerevan': context['inYerevan'], 'floor': unit_floor, 'floorDisplay': u.get('floorDataForFront'),
        'buildingFloors': building_floors, 'buildingFloorsSource': 'unit_detail.buildingMaxFloor' if building_floors is not None else None,
        'isTopFloor': published_top, 'isTopFloorBasis': 'unit floor equals unit-detail buildingMaxFloor' if published_top is not None else None,
        'isGroundFloor': None, 'groundFloorMeaning': 'Not established in reviewed public source; floor=0/1 is not automatically labeled ground floor.',
        'area': area, 'currency': 'AMD', 'totalAMD': total, 'pricePerM2AMD': rate,
        'hasPositivePublishedPrice': total is not None and total > 0,
        'priceQuality': {'status': 'review_required', 'reason': 'implausible_published_price'} if suspicious_price else None,
        'priceBasis': 'minimum_published_unit_price',
        'pricingConditionId': u.get('conditionIdWhenMinPrice'),
        'pricingConditionType': 'finish_state' if variants else 'source_condition_id_only',
        'priceVariants': variants, 'paymentMethod': None,
        'priceNote': 'Minimum list price and finish variants are published source values. Payment conditions are not inferred from a finish condition ID.',
        'rooms': integer(d.get('roomsCount', u.get('roomsCount'))),
        'isStudio': d.get('isStudio', u.get('isStudio')), 'isFreePlanning': d.get('isFreePlaning', u.get('isFreePlaning')),
        'isPenthouse': d.get('isPentHouse') if d else None,
        'balconies': integer(d.get('balconyCount')) if d else None,
        'balconyAreas': d.get('balconiesAreas') if d else None,
        'bathrooms': integer(d.get('bathroomCount')) if d else None,
        'bedrooms': integer(d.get('bedroomCount')) if d else None,
        'orientation': position.get('name'), 'orientationSourceId': position.get('id'),
        'isBooked': booked,
        'sourceIsActive': d.get('isActive') if d else None,
        'sourceIsActiveForBooking': d.get('isActiveForBooking') if d else None,
        'availability': 'booked' if booked is True else 'not_booked' if booked is False else 'unknown',
        'availabilityNote': 'Published booking flag at snapshot time; not real-time confirmation of availability. Confirm with seller.',
        'sourceUrl': source_url, 'sourceURL': source_url,
        'floorplanUrl': (d.get('images') or u.get('images') or [None])[0],
        'floorplanSourceUrls': d.get('images') or u.get('images') or [],
        'sourceCreatedAt': u.get('createdDate'),
        'checkedAt': detail_response['checkedAt'] if d else item['checkedAt'],
        'listCheckedAt': item['checkedAt'], 'detailCheckedAt': detail_response['checkedAt'] if d else None,
        'detailStatus': 'complete' if d else 'not_collected',
        'sourceFloorCount': u.get('floorCount'), 'sourceUnitFields': u,
        'sourceDetailFields': d or None,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--projects', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parents[1]/'research-output/units')
    parser.add_argument('--building-details', type=Path, default=PARENT)
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--page-size', type=int, default=50)
    parser.add_argument('--max-pages', type=int, default=1000)
    parser.add_argument('--timeout', type=float, default=25)
    parser.add_argument('--pause', type=float, default=.15)
    parser.add_argument('--details', choices=['none', 'yerevan', 'all'], default='none')
    parser.add_argument('--detail-limit', type=int, default=0, help='0 means no limit; incomplete enrichment is explicitly reported')
    parser.add_argument('--detail-strategy', choices=['all', 'default-preferences'], default='all')
    parser.add_argument('--skip-list-fetch', action='store_true', help='Use saved building-inventory files only')
    args = parser.parse_args()
    args.workers = max(1, min(args.workers, 5))
    args.output.mkdir(parents=True, exist_ok=True)
    started = now()
    projects = load_projects(args.projects)
    contexts = {bid: project_context(p, bid, args.building_details) for bid, p in projects.items()}
    reports, raw_by_building = [], {}
    if args.skip_list_fetch:
        for bid in projects:
            path = args.output / 'building-inventories' / f'{bid}.json'
            if path.exists():
                data = json.loads(path.read_text()); report = {**data['report'], **contexts[bid]}
                reports.append(report); raw_by_building[bid] = data['units']
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            future_map = {pool.submit(collect_pages, bid, contexts[bid], args): bid for bid in projects}
            for future in concurrent.futures.as_completed(future_map):
                bid = future_map[future]
                try:
                    report, items = future.result()
                except Exception as exc:
                    report, items = {'buildingId': bid, 'sourceProjectId': f'myhome-{bid}', 'complete': False, 'errors': [str(exc)], 'pagesRead': 0}, {}
                reports.append(report); raw_by_building[bid] = items
                write_json(args.output / 'list-collection-status.json', {
                    'startedAt': started, 'updatedAt': now(), 'projectsInScope': len(projects),
                    'projectsRead': len(reports), 'units': sum(len(x) for x in raw_by_building.values()),
                    'reports': sorted(reports, key=lambda x: x['buildingId'])})
                print(f"List {len(reports)}/{len(projects)} building {bid}: {len(items)} units, {report.get('pagesRead', 0)} pages, complete={report['complete']}", flush=True)
    detail_errors, details = [], {}
    candidates = []
    for bid, items in raw_by_building.items():
        for _, item in items.items():
            uid = item['source']['apartmentId']
            cached = args.output / 'raw-unit-details' / f'{uid}.json'
            if cached.exists():
                response = json.loads(cached.read_text())
                if response.get('success'):
                    details[uid] = response
            preferred = (number(item['source'].get('area')) is not None and 80 <= item['source']['area'] <= 100
                         and number(item['source'].get('minApartmentPrice')) is not None
                         and 50_000_000 <= item['source']['minApartmentPrice'] <= 75_000_000)
            if args.details != 'none' and (args.details == 'all' or contexts[bid]['inYerevan']) and (args.detail_strategy == 'all' or preferred):
                candidates.append((bid, uid))
    # Detail limits are explicit and never presented as complete enrichment.
    candidates.sort(key=lambda x: (not contexts[x[0]]['inYerevan'], x[0], x[1]))
    if args.detail_limit:
        candidates = candidates[:args.detail_limit]
    if candidates:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {pool.submit(public_json, f'{API}/apartments/{uid}', None,
                                   args.output / 'raw-unit-details' / f'{uid}.json', 2, args.timeout): (bid, uid)
                       for bid, uid in candidates if uid not in details}
            completed = len(details)
            for future in concurrent.futures.as_completed(futures):
                bid, uid = futures[future]
                try:
                    response = future.result()
                except Exception as exc:
                    response = {'success': False, 'errors': [str(exc)], 'checkedAt': now()}
                if response.get('success'):
                    details[uid] = response
                else:
                    detail_errors.append({'buildingId': bid, 'unitId': uid, **response})
                completed += 1
                if completed % 25 == 0 or not response.get('success'):
                    write_json(args.output / 'detail-collection-status.json', {
                        'updatedAt': now(), 'requestedDetails': len(candidates), 'readDetails': len(details), 'errors': detail_errors})
                    print(f'Details {completed}/{len(candidates)}, successful={len(details)}, failed={len(detail_errors)}', flush=True)
    offers_by_project, house_by_project, unknown_by_project, commercial_by_project = {}, {}, {}, {}
    no_price_ids = []
    all_units = []
    condition_labels = {}
    for bid, items in sorted(raw_by_building.items()):
        normalized = []
        for item in items.values():
            uid = item['source']['apartmentId']
            unit = normalize_unit(bid, item, contexts[bid], details.get(uid))
            normalized.append(unit); all_units.append(unit)
            for variant in unit['priceVariants']:
                condition_key = str(variant['conditionId'])
                label = variant['conditionLabel']
                group = condition_labels.setdefault(condition_key, {'observedLabels': [], 'unitExamples': []})
                if label not in group['observedLabels']:
                    group['observedLabels'].append(label)
                if len(group['unitExamples']) < 5:
                    group['unitExamples'].append({'unitId': unit['unitId'], 'sourceUrl': unit['sourceUrl'], 'checkedAt': unit['detailCheckedAt']})
            if not unit['hasPositivePublishedPrice']:
                no_price_ids.append(unit['id'])
        normalized.sort(key=lambda x: x['unitId'])
        kind = contexts[bid]['unitKind']
        destination = offers_by_project if kind == 'apartment' else house_by_project if kind in ('house', 'townhouse') else commercial_by_project if kind == 'commercial' else unknown_by_project
        destination[f'myhome-{bid}'] = normalized
    metadata = {
        'source': 'https://myhome.am/en/buildings', 'startedAt': started, 'finishedAt': now(),
        'sourceProjectFile': str(args.projects), 'buildingIds': sorted(projects),
        'preferenceFiltersApplied': False, 'listFilters': {'roomsCount': None, 'minPrice': None, 'maxPrice': None, 'minArea': None, 'maxArea': None},
        'projectsInScope': len(projects), 'projectsRead': len(reports),
        'projectsComplete': sum(r.get('complete') is True for r in reports),
        'allListPagesComplete': len(reports) == len(projects) and all(r.get('complete') for r in reports),
        'pagesRead': sum(r.get('pagesRead', 0) for r in reports),
        'sourceCheckedAtMin': min((p['checkedAt'] for r in reports for p in r.get('pages', [])), default=None),
        'sourceCheckedAtMax': max((p['checkedAt'] for r in reports for p in r.get('pages', [])), default=None),
        'totalUnits': len(all_units), 'apartmentUnits': sum(len(v) for v in offers_by_project.values()),
        'houseTownhouseUnits': sum(len(v) for v in house_by_project.values()),
        'commercialUnits': sum(len(v) for v in commercial_by_project.values()),
        'unknownKindUnits': sum(len(v) for v in unknown_by_project.values()),
        'yerevanUnits': sum(u['inYerevan'] for u in all_units),
        'booked': sum(u['isBooked'] is True for u in all_units),
        'notBooked': sum(u['isBooked'] is False for u in all_units),
        'availabilityUnknown': sum(u['isBooked'] is None for u in all_units),
        'noPositivePriceCount': len(no_price_ids), 'noPositivePriceUnitIds': no_price_ids,
        'priceReviewRequiredCount': sum(bool(u.get('priceQuality')) for u in all_units),
        'priceReviewRule': 'Review required for positive residential unit total below AMD1,000,000 or positive per-m2 rate below AMD10,000; raw values are preserved and never corrected.',
        'detailsRequestedMode': args.details, 'detailsRequestedLimit': args.detail_limit or None,
        'detailStrategy': args.detail_strategy,
        'detailPreferenceScope': {'areaMinM2': 80, 'areaMaxM2': 100, 'totalMinAMD': 50_000_000, 'totalMaxAMD': 75_000_000} if args.detail_strategy == 'default-preferences' else None,
        'unitDetailsRead': sum(u['detailStatus'] == 'complete' for u in all_units),
        'detailsWithExactBuildingFloors': sum(u['buildingFloors'] is not None for u in all_units),
        'observedConditionLabels': condition_labels,
        'observedConditionLabelsScope': 'Finish labels observed for these condition IDs in the enriched unit details counted by unitDetailsRead; not a claim that all price variants of unenriched units were fetched.',
        'allUnitDetailsComplete': bool(all_units) and all(u['detailStatus'] == 'complete' for u in all_units),
        'detailFailures': detail_errors, 'reports': sorted(reports, key=lambda x: x['buildingId']),
        'limitations': [
            'Public active inventory returned by MyHome, not all physical/sold/unpublished apartments.',
            'Booking flags are published snapshot data, not real-time confirmation or reservation guarantees.',
            'Catalog availableApartments, building-detail availableForSale, and the units endpoint count have different unreconciled scopes. Pagination counts determine fetched list completeness; no discrepancy is automatically attributed to booked or sold units.',
            'All currencies marked AMD follow the public frontend unit-price display; USD detail variants are retained separately.',
            'conditionPrices state describes finish condition. It is not a mortgage/cash/installment label.',
            'Only unit-detail buildingMaxFloor is used for buildingFloors/top-floor derivation. Source project floor maxima are not substituted.',
            'Ground-floor numbering semantics were not published in the inspected frontend; isGroundFloor remains unknown.',
            'Missing/non-positive price units are retained and separately indexed, never silently dropped.',
            'Successful raw responses are cached for resumption. Use a new output directory for a fresh snapshot.',
        ],
    }
    write_json(args.output / 'offers-by-project.json', {
        'metadata': metadata, 'offersByProject': offers_by_project,
        'houseTownhouseUnitsByProject': house_by_project,
        'unknownKindUnitsByProject': unknown_by_project, 'commercialUnitsByProject': commercial_by_project,
        'projectContexts': {f'myhome-{bid}': context for bid, context in contexts.items()},
    })
    write_json(args.output / 'metadata.json', metadata)
    write_json(args.output / 'failures.json', {
        'incompleteProjects': [r for r in reports if not r.get('complete')], 'unitDetailFailures': detail_errors,
    })
    print(json.dumps({k: metadata[k] for k in ['projectsInScope', 'projectsRead', 'projectsComplete', 'pagesRead', 'totalUnits', 'apartmentUnits', 'yerevanUnits', 'unitDetailsRead', 'allListPagesComplete', 'allUnitDetailsComplete']}, indent=2), flush=True)


if __name__ == '__main__':
    main()
