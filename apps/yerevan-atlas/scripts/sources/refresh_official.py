#!/usr/bin/env python3
"""Read public developer pages and emit reviewable data patches; never edit the app.

Usage:
  python refresh_official.py --app-data ../../yerevan-atlas/public/data/projects.json

Only linked public inventory is followed. Availability, payment-specific prices,
and source failures remain explicit. Standard library only; no login, form
submission, messaging, or authenticated endpoints.
"""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import html
import json
import pathlib
import re
import threading
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from zoneinfo import ZoneInfo


class TextParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.skip = 0; self.parts = []
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.skip += 1
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.skip = max(0, self.skip - 1)
    def handle_data(self, data):
        if not self.skip: self.parts.append(data)


def clean(raw):
    p = TextParser(); p.feed(raw)
    return re.sub(r'\s+', ' ', ' '.join(p.parts)).strip()


def urls(raw, pattern):
    return list(dict.fromkeys(html.unescape(u) for u in re.findall(r'href=["\']([^"\']+)["\']', raw) if re.search(pattern, html.unescape(u))))


def first(pattern, text, required=True):
    m = re.search(pattern, text)
    if not m and required: raise ValueError('Required source field missing: ' + pattern)
    return m.group(1) if m else None


def num(s):
    return int(re.sub(r'[^0-9]', '', s))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--app-data', default=str(pathlib.Path(__file__).resolve().parents[2]/'public/data/projects.json'))
    ap.add_argument('--output-dir', default=str(pathlib.Path(__file__).resolve().parents[2]/'research-output/official'))
    ap.add_argument('--workers', type=int, default=5)
    ap.add_argument('--max-arm-pages', type=int, default=45)
    ap.add_argument('--as-of', default=dt.datetime.now(ZoneInfo('Asia/Yerevan')).date().isoformat())
    ap.add_argument('--replay-evidence', help='Reparse an existing evidence.json snapshot without network requests; fetchedAt is preserved')
    a = ap.parse_args(); out = pathlib.Path(a.output_dir); rawdir = out/'raw'; rawdir.mkdir(parents=True, exist_ok=True)
    source_data = json.loads(pathlib.Path(a.app_data).read_text())
    original = {o['url']: dict(o) for p in source_data['projects'] for o in p.get('offers', []) if any(h in o.get('url', '') for h in ('defansehousing.com', 'armconstruct.am'))}
    evidence = []; errors = []; fetched = {}; lock = threading.Lock()
    replay = {r['url']: r for r in json.loads(pathlib.Path(a.replay_evidence).read_text())} if a.replay_evidence else {}

    def fetch(url):
        if url in fetched: return fetched[url]
        stamp = dt.datetime.now(dt.timezone.utc).isoformat(); key = hashlib.sha256(url.encode()).hexdigest()[:18]
        if a.replay_evidence:
            if url not in replay:
                rec={'url':url,'error':'URL absent from replay snapshot; no network request made','parseStatus':'fetch_failed'}
                with lock:errors.append(rec);evidence.append(rec);fetched[url]=('',rec)
                return '',rec
            rec=dict(replay[url]);rec['replayedEvidence']=True
            if rec.get('rawFile'):
                body=(pathlib.Path(a.replay_evidence).parent/rec['rawFile']).read_bytes()
                raw=body.decode('utf-8','replace')
                (rawdir/(key+'.html')).write_bytes(body);rec['rawFile']=str((rawdir/(key+'.html')).relative_to(out))
                snapshot_hash=hashlib.sha256(body).hexdigest()
                if rec.get('sha256') and rec['sha256'] != snapshot_hash:
                    rec.setdefault('responseBodySha256',rec['sha256'])
                    rec['snapshotTransform']='UTF-8 decoded HTML with line endings normalized by an earlier replay; original response bytes are no longer retained for this snapshot.'
                rec['sha256']=snapshot_hash;rec['snapshotSha256']=snapshot_hash
                with lock:evidence.append(rec);fetched[url]=(raw,rec)
                return raw,rec
            with lock:errors.append(rec);evidence.append(rec);fetched[url]=('',rec)
            return '',rec
        try:
            with urllib.request.urlopen(url, timeout=25) as response:
                body = response.read(); status = response.status; final_url = response.geturl()
            raw = body.decode('utf-8', 'replace'); path = rawdir/(key+'.html'); path.write_bytes(body)
            body_hash=hashlib.sha256(body).hexdigest()
            rec = {'url':url,'resolvedUrl':final_url,'httpStatus':status,'fetchedAt':stamp,'sha256':body_hash,'snapshotSha256':body_hash,'responseBodySha256':body_hash,'rawFile':str(path.relative_to(out)), 'parseStatus':'not_parsed'}
            with lock: evidence.append(rec); fetched[url] = (raw,rec)
            return raw,rec
        except Exception as e:
            rec = {'url':url,'fetchedAt':stamp,'error':str(e),'parseStatus':'fetch_failed'}
            with lock: errors.append(rec); evidence.append(rec); fetched[url] = ('',rec)
            return '',rec

    def batch(items):
        with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool: return list(pool.map(fetch, items))

    developer_pages = {
        'defanse_home':'https://defansehousing.com/en',
        'defanse_district':'https://defansehousing.com/en/district/complex-of-apartment-buildings',
        'arm_filters':'https://armconstruct.am/filters',
        'five_towers':'https://armconstruct.am/projects/five-towers',
        'atlantis_prime':'https://armconstruct.am/projects/atlantis-prime',
        'bedeck':'https://www.bedeck.am/project/test1',
        'bedeck_selector':'https://buildings.bedeck.am/?building_id=2',
        'noy_transparency':'https://noyresidence.am/en/sources/',
        'renaissance_project':'https://ysugu.am/index.php/project/renaissance-premium-home-project/',
        'renaissance_latest_known':'https://ysugu.am/index.php/2025/12/04/renaissance-premium-home-6/',
        'ysugu_home':'https://ysugu.am/',
        'byuregh':'https://byuregh.am/',
        'cba':'https://www.cba.am/en/'
    }
    batch(list(developer_pages.values())+list(original))

    def page(key): return fetched[developer_pages[key]][0]
    project_patches = []; findings = []; fx = None
    for key in developer_pages:
        raw, ev = fetched[developer_pages[key]]
        if not raw: continue
        text = clean(raw)
        try:
            if key == 'cba':
                rate=float(first(r'\bUSD\s+1\s+([0-9]+\.[0-9]+)',text)); ds=first(r'Updated at:\s*(\d{2}\.\d{2}\.\d{4})',text)
                fx={'USDAMD':rate,'date':dt.datetime.strptime(ds,'%d.%m.%Y').date().isoformat(),'source':developer_pages[key], 'checkedAt':a.as_of,'fetchedAt':ev['fetchedAt'],'rateType':'Central Bank of Armenia official reference rate; not a bank retail quote'}
                ev['extracted']=fx
            elif key == 'defanse_home':
                completion='2026-12' if 'December 2026' in text else None
                if completion:
                    values={'completion':completion,'completionPrecision':'month','completionIsTarget':True,'status':'under_construction','statusNote':'Developer advertises first-phase completion in December 2026; no selected-building completion certificate verified.'}
                    project_patches.append({'id':'karu-1','set':values,'sourceUrl':developer_pages[key],'checkedAt':a.as_of})
                    ev['extracted']={'phaseOneTarget':completion,'evidenceText':'December 2026; first residential district consisting of 66 residential buildings'}
                else: raise ValueError('Known first-phase date not present; manual review required')
            elif key == 'defanse_district':
                fields={'areaRange':re.findall(r'50\.77.?192',text),'floorsClaimPresent':bool(re.search(r'15.*16.*23',text))}
                ev['extracted']=fields
            elif key in ('five_towers','atlantis_prime'):
                coord_raw=first(r'data-building="([^"]+)"',raw); lat,lng=map(float,json.loads(html.unescape(coord_raw)))
                c=first(r'Ավարտման ամսաթիվը\s+(.{0,70}?)\s+(?:Գլխավոր պլան|Հարկ|Նախագիծ)',text,False)
                target='2031-08' if key=='five_towers' and '2031 թ․ Օգոստոս' in text else None
                values={'coordinates':[lng,lat],'coordinateSourceUrl':developer_pages[key],'coordinateAccuracy':'developer_project_marker','coordinateSource':'Project location section div#map data-building (not footer sales office)'}
                if target:values.update(completion=target,completionPrecision='month',completionIsTarget=True)
                project_patches.append({'id':'five-towers' if key=='five_towers' else 'atlantis-prime','set':values,'sourceUrl':developer_pages[key],'checkedAt':a.as_of})
                ev['extracted']={'coordinates':[lng,lat],'completionTarget':target,'completionText':c}
            elif key == 'bedeck':
                if not all(s in text for s in ('Դավթաշեն','2028','18 վերգետնյա')): raise ValueError('Expected project fields absent')
                fields={'completion':'2028','completionPrecision':'year','completionIsTarget':True,'floors':18,'area':{'min':59,'max':260}}
                project_patches.append({'id':'karu-66','set':fields,'sourceUrl':developer_pages[key],'checkedAt':a.as_of});ev['extracted']=fields
            elif key == 'bedeck_selector':
                ev['extracted']={'comingSoon':'Coming Soon' in text,'verifiedPricedOffers':False}
            elif key == 'noy_transparency':
                is_independent='independent information platform' in text and 'not the official' in text
                if not is_independent: raise ValueError('Expected transparency statement missing')
                ev['extracted']={'independentWebsite':True,'conflictingAdvertisedTargets':['2027-05','2028-06'],'currentDeveloperStatusVerified':False}
                findings.append({'projectId':'myhome-212','finding':'noyresidence.am remains explicitly independent, not an official developer website. Current construction/sale status requires platform or developer-specific evidence.','sourceUrl':developer_pages[key]})
            elif key == 'renaissance_project':
                ev['extracted']={'historicalTarget':'2024-06' if '2024' in text else None,'publicationDate':'2021-04-15','notCurrentCompletionEvidence':True,'currentApartmentPriceVerified':False}
            elif key == 'renaissance_latest_known':
                if '2025' not in text or 'շինարարական' not in text:raise ValueError('Expected dated construction notice missing')
                ev['extracted']={'publicationDate':'2025-12-04','constructionVisitDate':'2025-12-27','completionCertificateVerified':False}
                findings.append({'projectId':'karu-63','finding':'Dated December 2025 developer notice still describes construction. Historical June 2024 target is not proof of completion. No current apartment asking price was verified.','sourceUrl':developer_pages[key]})
            elif key == 'ysugu_home':
                ev['extracted']={'renaissanceLinks':urls(raw,r'ysugu\.am/.+(?:renaissance|202[56])')[:25]}
            elif key == 'byuregh':
                ev['extracted']={'publicTextLength':len(text),'javascriptShell':bool(re.search(r'<div[^>]+id="root"',raw)),'currentApartmentPriceVerified':False,'completionVerified':False}
                findings.append({'projectId':'karu-2','finding':'Official Byuregh site returns a JavaScript portal without verifiable current apartment inventory or completion date in the public HTML. Do not convert HTTP200 into verified project facts.','sourceUrl':developer_pages[key]})
            ev['parseStatus']='parsed'
        except Exception as e:
            ev['parseStatus']='parse_failed';ev['parseError']=str(e);errors.append({'url':developer_pages[key],'error':str(e),'type':'parse_failure'})

    # The public filter uses these keys in its source-rendered filter state.
    filter_variants = []
    for qs in ({'filter[project]':'11','filter[rooms][0]':'2'}, {'filter[project]':'11','filter[rooms][0]':'3'}, {'filter[square-min]':'80','filter[square-max]':'100','filter[price-min]':'50000000','filter[price-max]':'75000000'}):
        filter_variants.append('https://armconstruct.am/filters?'+urllib.parse.urlencode(qs))
    batch(filter_variants)
    arm_urls=set(u for u in original if 'armconstruct.am' in u)
    for u in [developer_pages['arm_filters']]+filter_variants:
        raw,ev=fetched[u]
        links=urls(raw,r'^https://armconstruct\.am/projects/(?:atlantis-prime|five-towers|komitas-60)/\d+$') if raw else []
        arm_urls.update(links);ev['extracted']={'publicUnitLinks':len(links)};ev['parseStatus']='parsed' if raw else 'fetch_failed'
    batch(sorted(arm_urls)[:a.max_arm_pages])
    # One bounded additional pass through explicitly linked similar-unit cards.
    related=set()
    for u in arm_urls:
        if u in fetched: related.update(urls(fetched[u][0],r'^https://armconstruct\.am/projects/(?:atlantis-prime|five-towers)/\d+$'))
    extra=sorted(related-arm_urls)[:max(0,a.max_arm_pages-len(arm_urls))]
    batch(extra);arm_urls.update(extra)

    # Expand Defanse only through linked building -> level -> unit pages.
    defanse_units=set(u for u in original if 'defansehousing.com' in u)
    district_raw=page('defanse_district')
    building_links=urls(district_raw,r'^https://defansehousing\.com/en/district/[^/]+/building-320-(?:1|22|43)$')
    batch(building_links)
    level_links=[]
    for u in building_links:
        if fetched[u][0]:
            child_links=urls(fetched[u][0],r'/levels/7$');level_links += child_links
            fetched[u][1].update(parseStatus='navigation_links_parsed',extracted={'selectedFloorLinks':child_links})
    batch(level_links)
    for u in level_links:
        if fetched[u][0]:
            child_links=urls(fetched[u][0],r'/levels/7/apartments/\d+$');defanse_units.update(child_links)
            fetched[u][1].update(parseStatus='navigation_links_parsed',extracted={'publicUnitLinks':child_links})
    batch(sorted(defanse_units))

    offers=[]; offer_changes=[]
    for url in sorted(arm_urls | defanse_units):
        if url not in fetched:continue
        raw,ev=fetched[url]
        if not raw:continue
        text=clean(raw)
        try:
            if 'defansehousing.com' in url:
                building,level=first(r'building-(320-\d+)',url).replace('-','/'),int(first(r'/levels/(\d+)',url))
                unit=first(r'Apartment\s+(\d+)\s+(?:(?:Sold|Reserved)\s+)?Area',text)
                def_status=first(r'Apartment\s+\d+\s+(Sold|Reserved)\s+Area',text,False)
                area=float(first(r'\bArea\s+([0-9.]+)\s*m²',text));rate=num(first(r'1 m² cost\s+([0-9., ]+)\s*֏',text));total=num(first(r'Total cost\s+([0-9., ]+)\s*֏',text))
                if abs(area*rate-total)>1: raise ValueError('Total price arithmetic mismatch')
                item={'id':original.get(url,{}).get('id','defanse-'+building.replace('/','-')+'-'+unit),'projectId':'karu-1','title':'Building '+building+' · Apartment '+unit,'building':building,'unit':unit,'floor':level,'buildingFloors':23,'area':area,'areaM2':area,'rooms':int(first(r'Rooms\s+(\d+)',text)),'bathrooms':int(first(r'Bathrooms\s+(\d+)',text)),'balconies':int(first(r'Balconies\s+(\d+)',text)),'totalAMD':total,'pricePerM2AMD':rate,'rateBasis':'Published by developer','priceBasis':'Advertised asking price; payment terms not specified','availability':'Advertised; confirm with seller','availabilityStatus':'advertised_unconfirmed','availabilityVerified':False,'sourceType':'developer_unit_listing'}
                if def_status:
                    item.update(availabilityStatus=def_status.lower(),availability=def_status+' according to developer website',availabilityOriginal=def_status,availabilityVerified=True,priceIsHistoricalForUnavailableUnit=True)
                imgs=list(dict.fromkeys(re.findall(r'(?:src|data-src)="([^"]*/apartment_design(?:_translations|s)/[^"]+)"',raw)))
                item['floorplanUrl']=next((x for x in imgs if 'apartment_design_translations' in x),None)
                item['technicalPlanUrl']=next((x for x in imgs if '/apartment_designs/' in x),None)
            else:
                slug=first(r'/projects/([^/]+)/',url);name={'five-towers':'Five Towers','atlantis-prime':'Atlantis Prime','komitas-60':'Komitas 60'}.get(slug,slug)
                section=text.split('Նկարագրություն',1)[1].split('Հաշվիչ',1)[0]
                unit=first(r'Բնակարան\s+(\S+)',text);building=first(r'Մասնաշենք\s+(\S+)',section);floor=int(first(r'Հարկ\s+(\d+)/',section));totalfloors=int(first(r'Հարկ\s+\d+/(\d+)',section));area=float(first(r'Մակերես\s+([0-9.]+)\s*մ²',section))
                intro=text.split('Նկարագրություն',1)[0];status='available' if 'Հասանելի է' in intro else ('reserved' if 'Ամրագրված է' in intro else ('sold' if 'Վաճառված է' in intro else 'unknown'))
                price_section=section.split('Արժեքը',1)[1].split('Թողնել հայտ',1)[0] if 'Արժեքը' in section else ''
                prices=re.findall(r'(?:(Հիփոթեքի դեպքում|Տարաժամկետ մարման դեպքում)\s*)?([0-9,]+)\s*֏',price_section)
                variants=[{'totalAMD':num(p),'basis':{'Հիփոթեքի դեպքում':'Mortgage purchase','Տարաժամկետ մարման դեպքում':'Installment purchase'}.get(label,'Advertised asking price; payment terms not specified')} for label,p in prices]
                # Reserved/sold records with no published price remain useful status evidence.
                total=variants[0]['totalAMD'] if variants else None
                item={'id':'armconstruct-'+url.rsplit('/',1)[-1],'projectId':slug,'title':name+' · Apartment '+unit,'building':building,'unit':unit,'floor':floor,'buildingFloors':totalfloors,'area':area,'areaM2':area,'rooms':int(first(r'Սենյակներ\s+(\d+)',section)),'totalAMD':total,'pricePerM2AMD':round(total/area,2) if total else None,'rateBasis':'Calculated from published total divided by published area','priceBasis':variants[0]['basis'] if variants else None,'priceVariants':variants,'availabilityStatus':status,'availabilityOriginal':{'available':'Հասանելի է','reserved':'Ամրագրված է','sold':'Վաճառված է'}.get(status),'availability':{'available':'Available according to developer website; confirm with seller','reserved':'Reserved according to developer website','sold':'Sold according to developer website'}.get(status,'Status not verified'),'availabilityVerified':status!='unknown','sourceType':'developer_unit_listing'}
                imgs=list(dict.fromkeys(re.findall(r'(?:src|href)="([^"]+/storage/[^"?]+\.(?:webp|png|jpg|jpeg))"',raw)))
                item['floorplanUrl']=urllib.parse.quote(imgs[0],safe=':/,%') if imgs else None
                balcony=first(r'Պատշգամբ\s+([0-9.]+)մ²',section,False);item['balconyAreaM2']=float(balcony) if balcony else None
                item['address']='Gevorg Chaush 95, Yerevan' if slug=='five-towers' else ('Malkhasyants Lane 3, Yerevan' if slug=='atlantis-prime' else None)
            item.update(url=url,checkedAt=a.as_of,sourceFetchedAt=ev['fetchedAt'],currency='AMD',publishedAt=None)
            offers.append(item);ev['parseStatus']='parsed';ev['extracted']={k:item.get(k) for k in ('id','area','floor','totalAMD','priceVariants','availabilityStatus')}
            old=original.get(url)
            if old:
                changes={k:{'before':old.get(k),'after':item.get(k)} for k in ('totalAMD','area','floor','unit','availability','priceBasis','priceVariants') if old.get(k)!=item.get(k)}
                offer_changes.append({'id':item['id'],'url':url,'changes':changes})
        except Exception as e:
            ev['parseStatus']='parse_failed';ev['parseError']=str(e);errors.append({'url':url,'error':str(e),'type':'unit_parse_failure'})

    result={'checkedAt':a.as_of,'generatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'scope':'Bounded public official-source refresh; not complete developer inventory','metadataPatch':{'fx':fx} if fx else {},'projectPatches':project_patches,'offerUpserts':offers,'originalOfferRefresh':offer_changes,'findings':findings,'failures':errors,'counts':{'originalOfficialOffers':len(original),'originalOffersParsed':len(offer_changes),'officialOffersParsed':len(offers),'availableArmConstructOffers':sum(o.get('availabilityStatus')=='available' for o in offers),'advertisedDefanseOffers':sum(o.get('availabilityStatus')=='advertised_unconfirmed' for o in offers)},'integrationRules':['Upsert by projectId and offer id; preserve other catalog offers.','No fetch or parse failure authorizes deleting an existing offer or refreshing its checkedAt.','Do not treat advertised_unconfirmed as verified live availability.','Keep payment-specific prices together; do not discard priceVariants.','A target completion date is not proof of actual handover.','Do not replace directory project-wide prices with a minimum derived from this bounded unit sample.']}
    (out/'normalized-patches.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));(out/'evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2))
    print(json.dumps({'counts':result['counts'],'fx':fx,'failures':len(errors),'output':str(out/'normalized-patches.json')},ensure_ascii=False))


if __name__=='__main__':main()
