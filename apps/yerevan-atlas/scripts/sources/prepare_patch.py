#!/usr/bin/env python3
"""Add import-ready new projects, native locales and source-quality flags.

Uses only already retrieved, successfully parsed evidence from a completed refresh.
Does not fetch sources, change verification dates, or write application files.
"""
from pathlib import Path
import argparse, copy, json

HERE=Path(__file__).resolve().parent

def read(path):return json.loads(Path(path).read_text())
def write(path,obj):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n');temp.replace(path)
def text(obj,lang):return (obj or {}).get(lang,'').strip() if isinstance(obj,dict) else str(obj or '').strip()
def address(a,lang):return ' '.join(filter(None,[text(a.get('street'),lang),str(a.get('buildingNumber') or '').strip()]))

def native_locale(row,detail):
 a=detail.get('address') or row.get('address') or {}
 builder=(detail.get('builder') or {}).get('builderBrandName') or row.get('builder') or {}
 return {
  'nameHy':text(row.get('name'),'arm') or address(a,'arm'),
  'nameRu':text(row.get('name'),'rus') or address(a,'rus'),
  'addressHy':address(a,'arm'),'addressRu':address(a,'rus'),
  'developerHy':text(builder,'arm') or None,'developerRu':text(builder,'rus') or None,
 }

def price_quality(project):
 price=project.get('price') or {};currency=price.get('currency');per_m2=price.get('min');total=project.get('minimumApartmentPrice')
 # Conservative review thresholds, not a proposed correction or valuation.
 suspicious=(currency=='AMD' and isinstance(per_m2,(int,float)) and 0<per_m2<10000) or (currency=='AMD' and isinstance(total,(int,float)) and 0<total<1000000)
 if not suspicious:return None
 return {'status':'review_required','reason':'implausible_published_price','raw':{'price':copy.deepcopy(project.get('price')),'minimumApartmentPrice':total},'sourceRecordId':project['id'],'sourceUrl':project['sourceUrl'],'checkedAt':project['checkedAt']}

def prepare(run,output=None):
 run=Path(run);output=Path(output or run.parent);patch=read(run/'catalogue-patch.json');summary=patch['metadata'];new_ids=set(summary['addedSourceRecords'])
 rows={str(x['id']):x for x in read(run/'myhome-live-catalogue.json')['records']} if (run/'myhome-live-catalogue.json').exists() else {}
 details=read(run/'myhome-details-parsed.json') if (run/'myhome-details-parsed.json').exists() else {}
 new=[];locales={};quality=[];availability=[];new_source_facts=[]
 for p in patch['patches']:
  source=p['sourceRecord'];sid=p['sourceRecordId'];canonical=p['canonicalProjectId'];q=price_quality(source)
  if q:
   qp={'sourceRecordId':sid,'canonicalProjectId':canonical,'priceQuality':q,'recommendedDisplayUpdates':{'price':None,'minimumApartmentPrice':None,'priceQuality':q},'applyInstruction':'Retain exactly published numeric values in source comparison and priceQuality.raw. Exclude this source price from affordability filters, estimates, sorting and ranking until independently corrected.'}
   quality.append(qp);p['priceQuality']=q
   # Never allow an implausible refreshed price through a safe direct update.
   for field in ('price','minimumApartmentPrice'):p['safeDirectFieldUpdates'].pop(field,None)
  if sid.startswith('myhome-'):
   row=rows.get(source['sourceId'],{});detail=details.get(source['sourceId'],{})
   ca=row.get('availableApartments');de=detail.get('availableForSale')
   if ca is not None and de is not None and ca!=de:
    availability.append({'sourceRecordId':sid,'catalogueAvailableApartments':ca,'detailAvailableForSale':de,'selectedProjectSummaryCount':source.get('availableApartments'),'selectedEvidence':'building_detail','checkedAt':source['checkedAt'],'meaning':'Different published source surfaces/scopes; not reconciled. Neither headline alone guarantees matching unit inventory.'})
  if sid not in new_ids:continue
  n=copy.deepcopy(source)
  n.update({'official':False,'notes':[],'offers':[],'sourceComparisons':[]})
  n['geometryStatus']='unverified';n['footprint']=None
  if sid.startswith('myhome-'):
   locale=native_locale(rows.get(source['sourceId'],{}),details.get(source['sourceId'],{}));locales[sid]=locale
   n.update(locale)
  if q:n.update({'price':None,'minimumApartmentPrice':None,'priceQuality':q})
  new.append(n)
  new_source_facts.append({'id':sid,'inYerevan':n['inYerevan'],'district':n['district'],'checkedAt':n['checkedAt'],'sourceUrl':n['sourceUrl'],'sourceApiUrl':n['verification']['sourceApiUrl'],'publishedDate':n.get('publishedDate'),'createdDate':n.get('createdDate'),'priceReviewRequired':bool(q),'sourcePriceUnmodified':source.get('price')})
 supplements={'newProjectCount':len(new),'newYerevanProjectCount':sum(x['inYerevan'] for x in new),'newProjects':new_source_facts,'priceQualityReviewCount':len(quality),'catalogueDetailCountDifferences':len(availability),'geometryPolicy':'Existing geometry and coordinates unchanged. New projects have published source pins, no verified footprint or model.','localizationPolicy':'Native source strings retained, including mixed-language building numbers. No inferred developer names.','primaryOverrideClarification':'Bedeck Davtashen developer 2028 completion and 18 floors remain protected; previous 830,300 AMD/m2 headline was a cached MyHome unit price, not developer-confirmed. Prefer block-specific live MyHome price/inventory and retain attribution.'}
 summary['supplements']=supplements
 for filename,obj in [('catalogue-patch.json',patch),('summary.json',summary),('new-projects.json',{'metadata':supplements,'projects':new}),('new-project-locales.json',locales),('price-quality-patches.json',quality),('availability-disagreements.json',availability)]:
  write(run/filename,obj);write(output/filename,obj)
 instructions='''# Public catalogue refresh application notes\n\nAll JSON outputs are evidence/patch artifacts. No application file was modified.\n\n1. Read `summary.json` and `failures.json`. Use successful per-source `checkedAt` values only. A successful HTTP response must also parse and match the requested source ID. A failed source retains its previous timestamp. These dates verify source content retrieval, not sales availability or physical construction.\n2. Match `catalogue-patch.json` by canonicalProjectId and sourceRecordId. The reviewed aliases in metadata remain authoritative; never reconstruct identity from proximity. Upsert the corresponding source comparison using its published price/status/dates and retrieval timestamp. Do not mark an unvisited developer link checked.\n3. Apply safeDirectFieldUpdates only if the base application values still match the patch assumptions. Preserve primary developer facts, reviewed names, coordinates, geometry, merged identities, translations, notes and official-source attribution. In particular, preserve Defanse developer facts, Renaissance's unknown completion, the Five Towers/Atlantis Prime official markers, and the unresolved Bedeck pin conflict.\n4. Bedeck's old 830,300 AMD/m² project headline was a cached MyHome unit value, not a developer-confirmed project-wide price. Keep developer 2028/18-floor facts; use each live MyHome block's own attributed price and inventory. Do not propagate one block's rate to another.\n5. Append full objects from `new-projects.json` after checking their IDs are absent. Apply `new-project-locales.json` to the locale dictionary. They retain published native strings. Both new project objects contain source pins but no verified geometry; do not generate a precise-looking footprint without evidence.\n6. Apply `price-quality-patches.json`. MyHome 361 publishes 34 AMD/m² and a 2,000 AMD apartment total. The raw source values are preserved; display prices are null and the structured review flag must exclude these figures from affordability estimates/ranking. Do not invent replacement prices.\n7. Treat isBuilt as the source's construction status; never infer completion because a target date has passed. Publisher priceUpdatedAt/publishedDate/createdDate are distinct from retrieval checkedAt. Completion and commissioning dates can conflict; display their source labels and do not reinterpret them as confirmed handover.\n8. The catalogue availableApartments and detail availableForSale fields differ in 118 current records, recorded in availability-disagreements.json. These are different published source surfaces/scopes and are not reconciled. Refreshed project summary objects use the building-detail availableForSale field. Independently collected units can also have different counts; display their own count and timestamp separately. Do not assume the difference is solely reserved units or newer data, and do not equate reserved units with available units.\n9. A removed source ID means unlisted on that source only, never permission to delete a project. Do not promise exhaustive city coverage from these directories.\n10. Recalculate metadata counts/district facets/source counts after applying new records. Raw catalogue source records total 283 (150 Karucapatoxic + 133 MyHome); canonical application counts differ because reviewed aliases and independent developer projects are preserved.\n\n## Re-run\n\n`python research/refresh-catalogue/refresh_public_catalogues.py`\n\nThe script fetches the full public catalogues and detail records with bounded concurrency and writes a new timestamped research run. It then prepares new-project/localization/quality artifacts. It does not mutate the application. Existing baseline imports remain available for comparison.\n'''
 (run/'APPLY.md').write_text(instructions);(output/'APPLY.md').write_text(instructions)
 return supplements

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('run',nargs='?');parser.add_argument('--output');args=parser.parse_args()
 run=Path(args.run) if args.run else Path(read(HERE/'latest-run.json')['runDirectory'])
 print(json.dumps(prepare(run,args.output),ensure_ascii=False,indent=2))
