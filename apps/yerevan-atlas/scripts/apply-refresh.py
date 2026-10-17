#!/usr/bin/env python3
"""Apply reviewed public-source refresh outputs, preserving geometry and source identity.
Use: python scripts/apply-refresh.py --catalogue DIR --units DIR --official DIR
A catalogue patch must be based on the current projects.json hash. Review additions,
source changes, removals and failure reports before applying. No network calls.
"""
from pathlib import Path
import argparse,json,hashlib,copy,datetime
from refresh_guard import validate_refresh,write_bundle
root=Path(__file__).resolve().parents[1]
a=argparse.ArgumentParser(description=__doc__)
a.add_argument('--catalogue',type=Path,required=True);a.add_argument('--units',type=Path,required=True);a.add_argument('--official',type=Path,required=True);a.add_argument('--apply',action='store_true',help='Apply a reviewed snapshot to public/data after validation');a.add_argument('--dry-run',action='store_true',help='Validate and stage only (the default)');a.add_argument('--output',type=Path,help='Staging directory; cannot be combined with --apply');args=a.parse_args()
if args.apply and (args.dry_run or args.output):a.error('--apply cannot be combined with --dry-run or --output')
def read(p):return json.loads(p.read_text())
def save(p,d):p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n')
path=root/'public/data/projects.json';raw=path.read_bytes();data=json.loads(raw);patch=read(args.catalogue/'catalogue-patch.json');units=read(args.units/'offers-by-project.json');official=read(args.official/'normalized-patches.json')
validate_refresh(raw,patch,units)
previous_offers={o['id']:copy.deepcopy(o) for p in data['projects'] for o in p.get('offers',[])}
byid={p['id']:p for p in data['projects']};aliases=data['metadata']['reviewedCrossSourceMerges']
for p in read(args.catalogue/'new-projects.json')['projects']:
 if p['id'] not in byid:
  p.pop('verification',None);p['offers']=[];data['projects'].append(p);byid[p['id']]=p
comparison_keys=['sourceRecordId','sourceId','provider','sourceUrl','checkedAt','price','priceUpdatedAt','area','floors','floorRangePublished','completion','completionPrecision','handover','status','soldOut','availableApartments','apartmentsCount','minimumApartmentPrice','publishedDate','createdDate']
for change in patch['patches']:
 p=byid[change['canonicalProjectId']];p.update(change['safeDirectFieldUpdates'])
 p.setdefault('sourceListings',{})[change['sourceRecordId']]={'status':'listed','checkedAt':change['checkedAt'],'url':change['sourceUrl']}
 if change['sourceRecordId']==p['id']:p.pop('catalogueListing',None)
 p['catalogueCheckedAt']=max(p.get('catalogueCheckedAt',''),change['checkedAt']);p['catalogueRefresh']={'status':'success','checkedAt':p['catalogueCheckedAt']}
 comparisons=[c for c in p.get('sourceComparisons',[]) if c.get('sourceUrl')!=change['sourceUrl']]
 c={k:v for k,v in change['upsertSourceComparison'].items() if k in comparison_keys};c['evidenceSha256']=change['sourceRecord']['verification']['evidenceSha256'];comparisons.append(c);p['sourceComparisons']=comparisons
 for source in p['sources']:
  if source['url']==change['sourceUrl']:source['checkedAt']=change['checkedAt']
 for key in ['availableApartments','apartmentsCount']:
  if change['sourceRecordId']==p['id'] and change['sourceRecord'].get(key) is not None:p[key]=change['sourceRecord'][key]
for failure in patch.get('failures',[]):
 sid=failure.get('sourceRecordId');p=byid.get(aliases.get(sid,sid))
 if p:p['catalogueRefresh']={'status':'failed','attemptedAt':failure.get('attemptedAt'),'checkedAt':p.get('catalogueCheckedAt')}
for removed in patch['metadata'].get('removedSourceRecords',[]):
 sid=removed['sourceRecordId'];p=byid.get(removed['canonicalProjectId'])
 if not p:continue
 evidence={'status':'unlisted','checkedAt':removed['catalogueCheckedAt'],'sourceRecordId':sid}
 p.setdefault('sourceListings',{})[sid]=evidence
 if p['id']==sid:p['catalogueListing']=evidence
 for offer in p.get('offers',[]):
  if offer.get('sourceProjectId')==sid or offer['id'].startswith(sid+'-'):offer['sourceListed']=False
for q in read(args.catalogue/'price-quality-patches.json'):byid[q['canonicalProjectId']].update(q['recommendedDisplayUpdates'])
# Withdraw a cached single-unit rate previously (incorrectly) used as the entire complex's rate.
p=byid['karu-66'];p['price']=None;p['priceNote']='No current project-wide price was verified. See the separately listed blocks for their own published prices.'
for source_id,context in units['projectContexts'].items():
 p=byid[aliases.get(source_id,source_id)];report=next(r for r in units['metadata']['reports'] if r['sourceProjectId']==source_id)
 p['offers']=[o for o in p.get('offers',[]) if not o['id'].startswith('myhome-')]
 p['inventoryRefresh']={'status':'success' if report['complete'] else 'failed','checkedAt':report['finishedAt'],'sourceUrl':context['sourceUrl'],'scope':'all_public_list_pages','pages':report['pagesRead'],'captured':report['uniqueUnits'],'unitKind':context['unitKind']}
 p['inventoryCounts']={'catalogue':context.get('reportedAvailableApartments'),'projectDetail':context.get('reportedDetailAvailableForSale'),'unitList':report['uniqueUnits'],'sourceUrl':context['sourceUrl'],'checkedAt':report['finishedAt']}
 if len(set(v for k,v in p['inventoryCounts'].items() if k in ['catalogue','projectDetail','unitList'] and v is not None))>1:p.setdefault('dataQuality',{}).setdefault('conflicts',[]).append('inventory_count_scope_difference')
keys=['id','projectId','sourceProjectId','unitId','unit','unitKind','floor','buildingFloors','buildingFloorsSource','area','currency','totalAMD','pricePerM2AMD','priceQuality','priceBasis','pricingConditionId','rooms','isStudio','isFreePlanning','isPenthouse','balconies','balconyAreas','bathrooms','bedrooms','orientation','isBooked','sourceIsActive','sourceIsActiveForBooking','availability','floorplanUrl','sourceCreatedAt','checkedAt','listCheckedAt','detailCheckedAt','detailStatus']
finish={5:'Renovated',6:'Not renovated',7:'Partially renovated'}
for sid,offers in units['offersByProject'].items():
 p=byid[aliases.get(sid,sid)]
 for rawoffer in offers:
  o={k:v for k,v in rawoffer.items() if k in keys and v is not None};o['projectId']=p['id'];o['url']=rawoffer['sourceUrl'];o['priceBasis']=finish.get(rawoffer.get('pricingConditionId'),'Published minimum unit price')
  o['priceVariants']=[{k:v for k,v in row.items() if k in ['conditionId','totalAMD','basis','basisHy','basisRu','currency','priceQuality']} for row in rawoffer.get('priceVariants',[])]
  p['offers'].append(o)
for q in official['projectPatches']:
 p=byid[q['id']]
 # Existing spatial corrections stay in the separate geometry evidence file.
 p.update(q['set'])
 for source in p['sources']:
  if source['url']==q['sourceUrl']:source['checkedAt']=q['checkedAt']
 if not p.get('catalogueCheckedAt'):p['catalogueCheckedAt']=official['generatedAt'];p['catalogueRefresh']={'status':'success','checkedAt':official['generatedAt']}
for rawoffer in official['offerUpserts']:
 p=byid[rawoffer['projectId']];o={k:v for k,v in rawoffer.items() if k not in ['address','rateBasis','availabilityOriginal','availabilityVerified']};o['checkedAt']=o.get('sourceFetchedAt') or o['checkedAt'];o['unitKind']='apartment'
 if o.get('availabilityStatus')=='sold':o['isBooked']=True;o['availability']='sold'
 p['offers']=[old for old in p['offers'] if old['id']!=o['id']]+[o]
 p['inventoryRefresh']={'status':'success','checkedAt':official['generatedAt'],'scope':'selected_public_developer_units','sourceUrl':p.get('website') or p['sourceUrl'],'captured':len(p['offers'])}
 for source in p['sources']:
  if source['url']==o['url']:source['checkedAt']=o['checkedAt']
for p in data['projects']:
 p['sourceFailures']=[{'url':failure['url'],'attemptedAt':failure.get('fetchedAt'),'status':'failed'} for failure in official.get('failures',[]) if any(s['url']==failure['url'] for s in p.get('sources',[])) or failure['url']==p.get('website')]
 for offer in p['offers']:
  old=previous_offers.get(offer['id'],{})
  if old.get('priceQuality',{}).get('status')=='review_required' and offer.get('priceQuality',{}).get('status')!='review_required':
   offer['priceHistory']=old.get('priceHistory',[])+[{'totalAMD':old.get('totalAMD'),'priceQuality':old['priceQuality'],'checkedAt':old.get('checkedAt')}]
 p['offers'].sort(key=lambda o:o['id'])
 if p.get('dataQuality',{}).get('conflicts'):p['dataQuality']['conflicts']=sorted(set(p['dataQuality']['conflicts']))
# The source-specific date is stored separately from the date this file was assembled.
meta=data['metadata'];meta.update(official['metadataPatch']);meta['checkedAt']=datetime.datetime.now(datetime.timezone.utc).date().isoformat();meta['snapshotAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();meta['sourceRecords']={'Karucapatoxic':patch['metadata']['catalogues']['karu']['liveRecordCount'],'MyHome':patch['metadata']['catalogues']['myhome']['liveRecordCount']};meta['total']=len(data['projects']);ys=[p for p in data['projects'] if p['inYerevan']];meta['yerevan']=len(ys);meta['mappedYerevan']=sum(bool(p.get('coordinates')) for p in ys);meta['outsideYerevan']=len(data['projects'])-len(ys);meta['offers']=sum(len(p['offers']) for p in data['projects']);meta['districts']=sorted(set(p['district'] for p in ys));meta['offerSearchScope']={'type':'public_source_inventory','priceFilter':None,'areaFilter':None,'myhomePages':units['metadata']['pagesRead'],'myhomeRecords':units['metadata']['projectsComplete'],'myhomeApartments':units['metadata']['apartmentUnits'],'houseTownhousesExcluded':units['metadata']['houseTownhouseUnits'],'officialUnits':len(official['offerUpserts'])};meta['offerBuildingsChecked']=units['metadata']['projectsComplete'];meta.pop('notBookedMatchingMyHomeOffers',None);meta['geometry']='Source-matched OSM footprints and explicitly estimated heights; unmatched projects remain points.';meta['refresh']={'catalogueSuccesses':len(patch['patches']),'catalogueFailures':len(patch['failures']),'unitListComplete':True,'sourceCheckedAtMin':units['metadata']['sourceCheckedAtMin'],'sourceCheckedAtMax':units['metadata']['sourceCheckedAtMax'],'unitDetailsRead':units['metadata']['unitDetailsRead'],'allUnitDetailsComplete':False,'officialDirectFetchFailures':len(official['failures']),'priceReviewUnits':units['metadata']['priceReviewRequiredCount'],'inventoryCountDisagreements':sum('inventory_count_scope_difference' in p.get('dataQuality',{}).get('conflicts',[]) for p in data['projects'])}
if len(byid)!=len(data['projects']) or len({o['id'] for p in data['projects'] for o in p['offers']})!=meta['offers']:raise ValueError('Duplicate project or offer identity')
localepath=root/'public/data/project-locales.json';locales=read(localepath);locales.update(read(args.catalogue/'new-project-locales.json'))
# A compact audit travels with the site; raw page captures remain research inputs.
audit={'snapshotAt':meta['snapshotAt'],'catalogues':patch['metadata']['catalogues'],'sourceFieldChanges':read(args.catalogue/'changes.json'),'unitCoverage':{k:v for k,v in units['metadata'].items() if k not in ['reports','buildingIds','sourceProjectFile']},'officialCoverage':official['counts'],'officialFailures':official['failures'],'quality':meta['refresh'],'sourceWithdrawals':patch['metadata'].get('removedSourceRecords',[])}
output=root/'public/data' if args.apply else args.output or root/'research-output/prepared'/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
if args.apply and path.read_bytes()!=raw:raise ValueError('App data changed during preparation; nothing was applied')
write_bundle(output,{'projects.json':data,'project-locales.json':locales,'refresh-audit.json':audit})
print(json.dumps({'applied':args.apply,'output':str(output),'projects':meta['total'],'yerevan':meta['yerevan'],'apartments':meta['offers'],'fx':meta['fx'],'refresh':meta['refresh']},ensure_ascii=False,indent=2))
