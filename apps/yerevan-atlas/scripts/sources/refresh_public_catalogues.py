#!/usr/bin/env python3
"""Refresh public Karucapatoxic/MyHome facts into a reviewable source patch.

Reads app data for identity/override protection only. Never writes app files.
Source-specific checkedAt advances only after a successful fetch AND parse.
Failed records stay untouched. Removed listings are flagged, never deleted.

Run: python research/refresh-catalogue/refresh_public_catalogues.py
Dependencies: Python standard library + sibling source_adapters.py.
"""
from pathlib import Path
import argparse, concurrent.futures, copy, datetime, hashlib, json, re, threading, time, urllib.request
import source_adapters as adapters

HERE=Path(__file__).resolve().parent
RESEARCH=HERE
WORKSPACE=RESEARCH.parent
PARSER=argparse.ArgumentParser(description=__doc__)
PARSER.add_argument('--app-data',type=Path,default=HERE.parents[1]/'public/data/projects.json')
PARSER.add_argument('--output',type=Path,default=HERE.parents[1]/'research-output/catalogue')
PARSER.add_argument('--baseline-run',type=Path,help='Optional previous completed run directory; otherwise compare original reviewed imports.')
PARSER.add_argument('--workers-per-source',type=int,default=4)
PARSER.add_argument('--timeout',type=int,default=24)
PARSER.add_argument('--max-seconds',type=int,default=900)
ARGS=PARSER.parse_args()
START=datetime.datetime.now(datetime.timezone.utc)
STAMP=START.strftime('%Y%m%dT%H%M%SZ')
RUN=ARGS.output/STAMP
RUN.mkdir(parents=True,exist_ok=False)
DEADLINE=time.monotonic()+ARGS.max_seconds
LOCK=threading.Lock()
EVIDENCE=[]; FAILURES=[]

def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def write(path,obj):
 path.parent.mkdir(parents=True,exist_ok=True)
 temp=path.with_suffix(path.suffix+'.tmp')
 temp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n');temp.replace(path)
def sha(b):return hashlib.sha256(b).hexdigest()

APP_BYTES=ARGS.app_data.read_bytes();APP=json.loads(APP_BYTES)
APP_PROJECTS={x['id']:x for x in APP['projects']}
MERGES=APP.get('metadata',{}).get('reviewedCrossSourceMerges',{})
def baseline(provider):
 if ARGS.baseline_run:return {x['id']:x for x in json.loads((ARGS.baseline_run/f'{provider}-refreshed.json').read_text())['projects']}
 rows={}
 for project in APP['projects']:
  for comparison in project.get('sourceComparisons',[]):
   sid=comparison.get('sourceRecordId','')
   if sid.startswith(provider+'-'):rows[sid]={**project,**comparison,'id':sid}
  if project['id'].startswith(provider+'-') and project['id'] not in rows:rows[project['id']]=project
 return rows
BASELINES={provider:baseline(provider) for provider in ['karu','myhome']}

BASE_FIELDS=['name','nameHy','nameRu','address','addressHy','district','districtHy','region','inYerevan','developer','coordinates','coordinateAccuracy','price','priceUpdatedAt','minimumApartmentPrice','area','floors','floorRangePublished','completion','completionIsTarget','completionPrecision','handover','startDate','status','soldOut','availableApartments','apartmentsCount','propertyType','constructionType','facilities','interiorConditions','contacts','website','imageSourceUrls','publishedDate','createdDate','progressUpdates','incomeTaxRefundClaim','floorHeightSourceValue','floorHeightSourceUnit']
MUTABLE_FIELDS=['price','priceUpdatedAt','minimumApartmentPrice','area','floors','floorRangePublished','completion','completionIsTarget','completionPrecision','handover','startDate','status','statusNote','soldOut','availableApartments','apartmentsCount','propertyType','constructionType','interiorConditions','contacts','website']
PRESERVE=['id','sourceId','coordinates','coordinateAccuracy','coordinateSource','coordinateSourceUrl','official','geometry','geometryStatus','geometryReview','name','nameHy','nameRu','address','addressHy','district','districtHy','notes','offers','sourceComparisons','modelPreset','modelReference','source identities','reviewedCrossSourceMerges','localized content']
PRIMARY_PROTECTED={'karu-1','karu-66'}

def fail(provider,kind,record_id,url,error,request_at=None):
 source_id=f'{provider}-{record_id}' if record_id is not None else None
 item={'provider':provider,'kind':kind,'sourceRecordId':source_id,'url':url,'attemptedAt':request_at or now(),'error':str(error),'previousCheckedAt':BASELINES.get(provider,{}).get(source_id,{}).get('checkedAt'),'advanceCheckedAt':False}
 with LOCK:FAILURES.append(item)
 return item

def fetch(provider,kind,record_id,url,payload=None,filename=None):
 requested=now()
 if time.monotonic()>DEADLINE:
  raise TimeoutError('Collection deadline reached before request')
 req=urllib.request.Request(url,data=json.dumps(payload).encode() if payload is not None else None,headers={'Content-Type':'application/json'} if payload is not None else {},method='POST' if payload is not None else 'GET')
 with urllib.request.urlopen(req,timeout=ARGS.timeout) as response:
  body=response.read();status=response.status;headers={k:response.headers.get(k) for k in ['Date','Last-Modified','ETag','Age','Cache-Control','Content-Type'] if response.headers.get(k)}
 if status!=200:raise ValueError(f'Expected200; got{status}')
 path=RUN/'raw'/provider/(filename or f'{kind}-{record_id}.json')
 path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(body)
 record={'provider':provider,'kind':kind,'sourceRecordId':f'{provider}-{record_id}' if record_id is not None else None,'url':url,'method':req.method,'requestedAt':requested,'fetchedAt':now(),'status':status,'sha256':sha(body),'bytes':len(body),'rawPath':str(path),'headers':headers}
 if payload is not None:record['requestBody']=payload
 with LOCK:EVIDENCE.append(record)
 return body,record

def validate_records(rows,label):
 if not isinstance(rows,list) or not rows:raise ValueError(f'{label}: expected nonempty record array')
 ids=[str(x.get('id')) for x in rows]
 if any(i=='None' for i in ids) or len(ids)!=len(set(ids)):raise ValueError(f'{label}: missing or duplicate record IDs')
 return rows

BASE_MYHOME_FILTER={'pageSize':18,'pageNumber':1,'sortType':'RankDescending','typeOfProperties':None,'priceCurrencyType':'AMD','minApartmentPrice':None,'maxApartmentPrice':None,'minAreaPrice':None,'maxAreaPrice':None,'minArea':None,'maxArea':None,'isWithIncomeTax':None,'isStudio':None,'isNoPlanning':None,'roomsCount':None,'minExploitationDate':None,'maxExploitationDate':None,'levelOfInteriorDecorations':None,'locations':None,'searchText':''}


def karu_catalogue():
 url='https://karucapatoxic.am/api/buildings'
 try:
  b,ev=fetch('karu','catalogue',None,url,filename='catalogue.json');rows=validate_records(json.loads(b),'Karucapatoxic catalogue')
  write(RUN/'karu-live-catalogue.json',{'fetchedAt':ev['fetchedAt'],'complete':True,'count':len(rows),'records':rows});return rows,ev,True
 except Exception as e:fail('karu','catalogue',None,url,e);return [],None,False

def myhome_catalogue():
 url='https://myhome.am/API/v1/buildings/filter_v2'
 try:
  b,ev=fetch('myhome','catalogue-page',1,url,BASE_MYHOME_FILTER,'catalogue-page-1.json');first=json.loads(b);rows=list(first['items']);total=int(first['totalCount']);pages=int(first['totalPages']);page_evidence=[ev]
  def page(n):
   body,e=fetch('myhome','catalogue-page',n,url,{**BASE_MYHOME_FILTER,'pageNumber':n},f'catalogue-page-{n}.json');data=json.loads(body)
   if data.get('currentPage')!=n or data.get('totalCount')!=total:raise ValueError('Pagination changed during refresh')
   return data['items'],e
  with concurrent.futures.ThreadPoolExecutor(max_workers=ARGS.workers_per_source) as pool:
   for items,e in pool.map(page,range(2,pages+1)):rows.extend(items);page_evidence.append(e)
  validate_records(rows,'MyHome catalogue')
  if len(rows)!=total:raise ValueError(f'Expected{total} unique records but got{len(rows)}')
  final=max(page_evidence,key=lambda e:e['fetchedAt']);write(RUN/'myhome-live-catalogue.json',{'fetchedAt':final['fetchedAt'],'complete':True,'count':len(rows),'records':rows});write(ARGS.output/'latest-myhome-building-ids.json',{'fetchedAt':final['fetchedAt'],'run':str(RUN),'count':len(rows),'ids':[r['id'] for r in rows],'cataloguePath':str(RUN/'myhome-live-catalogue.json')})
  print('MyHome catalogue complete:',len(rows),'records; IDs:',ARGS.output/'latest-myhome-building-ids.json',flush=True)
  return rows,final,True
 except Exception as e:fail('myhome','catalogue',None,url,e);return [],None,False


def refresh_karu_metadata():
 """Use public JS linked by the current homepage; fallback mappings are explicit."""
 regions=json.loads((RESEARCH/'karucapatoxic-regions.json').read_text());developers=json.loads((RESEARCH/'karucapatoxic-developers.json').read_text());fresh=False
 url='https://karucapatoxic.am/'
 try:
  body,ev=fetch('karu','homepage',None,url,filename='homepage.html');html=body.decode();paths=re.findall(r'<script[^>]*src="([^"]*)"',html)
  known='/_next/static/immutable/chunks/0ya8zl3h-j8by.js'
  paths=[known] if known in paths else [p for p in paths if p.endswith('.js')]
  for path in paths:
   js,e=fetch('karu','public-metadata-script',None,'https://karucapatoxic.am'+path,filename=path.rsplit('/',1)[-1]);s=js.decode()
   region_match=re.search(r'\[\{id:1,en:"Yerevan"',s)
   developer_match=re.search(r'\[\{id:\d+,url:"[^"]+",name:',s)
   if region_match and developer_match:
    def parse_at(i):return json.loads(re.sub(r'([{,])([A-Za-z_$][A-Za-z0-9_$]*):',r'\1"\2":',adapters.balanced(s,i)))
    regions=parse_at(region_match.start());developers=parse_at(developer_match.start());fresh=True;break
  if not fresh:raise ValueError('Current linked public scripts did not expose expected district/developer arrays')
 except Exception as e:fail('karu','metadata',None,url,e)
 adapters.districts={x['id']:{**x,'region':r['en']} for r in regions for x in r['items']};adapters.devs={x['id']:x for x in developers}
 write(RUN/'karu-metadata.json',{'fresh':fresh,'regions':regions,'developers':[{k:x[k] for k in ['id','name','url','link','phones'] if k in x} for x in developers]})
 return fresh


def refresh_detail(provider,row):
 record_id=str(row['id']);url='https://karucapatoxic.am/'+record_id if provider=='karu' else 'https://myhome.am/API/v1/buildings/'+record_id
 try:
  b,ev=fetch(provider,'detail',record_id,url,filename=f'detail-{record_id}'+('.html' if provider=='karu' else '.json'))
  if provider=='karu':
   data,ld=adapters.detail_data(b.decode())
   if not data or str(data.get('id'))!=record_id:raise ValueError('Detail parse missing or mismatched ID')
   normalized=adapters.normalize_karu(data,ld)
  else:
   data=json.loads(b)
   if str(data.get('id'))!=record_id:raise ValueError('Detail JSON missing or mismatched ID')
   normalized=adapters.normalize_myhome(row,data)
  # Only parsed, validated successful reads receive a fresh verification timestamp.
  normalized['checkedAt']=ev['fetchedAt'];normalized['sourceFetchedAt']=ev['fetchedAt']
  for source in normalized.get('sources',[]):
   if source.get('url')==normalized.get('sourceUrl'):source['checkedAt']=ev['fetchedAt']
  normalized['cataloguePresent']=True
  normalized['verification']={'state':'content_retrieved','checkedAt':ev['fetchedAt'],'evidenceSha256':ev['sha256'],'evidencePath':ev['rawPath'],'sourceApiUrl':url,'meaning':'Published source content re-read and parsed; no independent onsite or sales verification.'}
  return normalized,ev,data
 except Exception as e:fail(provider,'detail',record_id,url,e);return None,None,None


def refresh_details(provider,rows):
 normalized=[];data={}
 with concurrent.futures.ThreadPoolExecutor(max_workers=ARGS.workers_per_source) as pool:
  for index,(n,ev,raw) in enumerate(pool.map(lambda row:refresh_detail(provider,row),rows),1):
   if n:normalized.append(n);data[n['sourceId']]=raw
   if index%20==0:print(provider,'detail progress',index,'/',len(rows),'successful',len(normalized),flush=True)
 write(RUN/(provider+'-refreshed.json'),{'metadata':{'checkedAt':None,'sourceCount':len(rows),'successfulRecords':len(normalized),'meaning':'Use each record checkedAt; failures are separate.'},'projects':normalized});write(RUN/(provider+'-details-parsed.json'),data)
 return normalized


def build_patch(catalogues,results):
 patches=[];changes=[];added=[];removed=[];unchanged=[];catalogue_summary={}
 for provider,(rows,ev,complete) in catalogues.items():
  previous=BASELINES[provider];current_ids={provider+'-'+str(x['id']) for x in rows}
  added_ids=current_ids-set(previous) if complete else set();removed_ids=set(previous)-current_ids if complete else set()
  added.extend(sorted(added_ids));removed.extend({'sourceRecordId':i,'canonicalProjectId':MERGES.get(i,i),'catalogueCheckedAt':ev['fetchedAt'],'action':'mark_unlisted_in_this_source_only; retain project and last successful detail timestamp'} for i in sorted(removed_ids))
  refreshed=results.get(provider,[]);catalogue_summary[provider]={'complete':complete,'liveRecordCount':len(rows),'successfullyParsedDetails':len(refreshed),'baselineRecordCount':len(previous),'addedSourceIds':sorted(added_ids),'removedSourceIds':sorted(removed_ids),'catalogueCheckedAt':ev['fetchedAt'] if ev else None,'yerevanRecords':sum(x.get('inYerevan') is True for x in refreshed)}
  for n in refreshed:
   sid=n['id'];old=previous.get(sid);canonical=MERGES.get(sid,sid);app=APP_PROJECTS.get(canonical);field_changes=[]
   if old:
    for field in BASE_FIELDS:
     if old.get(field)!=n.get(field):field_changes.append({'field':field,'before':old.get(field),'after':n.get(field)})
   else:field_changes=[{'field':'source_record','before':None,'after':'new'}]
   if field_changes:changes.append({'sourceRecordId':sid,'canonicalProjectId':canonical,'changes':field_changes})
   else:unchanged.append(sid)
   protected=bool(canonical in PRIMARY_PROTECTED or (app and app.get('official')) or sid in MERGES or (app and app.get('sourceComparisons')))
   safe={};conflicts=[]
   if app and old and not protected:
    for field in MUTABLE_FIELDS:
     if n.get(field)!=old.get(field):
      if app.get(field)==old.get(field):safe[field]=n.get(field)
      else:conflicts.append({'field':field,'appValue':app.get(field),'previousSourceValue':old.get(field),'freshSourceValue':n.get(field),'action':'preserve reviewed app value; expose source conflict'})
   comparison={k:n.get(k) for k in BASE_FIELDS if k in n}
   comparison.update({'sourceRecordId':sid,'sourceId':n['sourceId'],'provider':provider,'sourceUrl':n['sourceUrl'],'checkedAt':n['checkedAt'],'verification':n['verification']})
   patches.append({'sourceRecordId':sid,'canonicalProjectId':canonical,'reviewedMerge':MERGES.get(sid),'presentInApp':app is not None,'sourceUrl':n['sourceUrl'],'checkedAt':n['checkedAt'],'sourceRecord':n,'upsertSourceComparison':comparison,'safeDirectFieldUpdates':safe,'preserveReviewedTopLevelFields':protected,'preserveFields':PRESERVE,'reviewConflicts':conflicts,'sourceFieldChanges':field_changes,'applyInstruction':'Upsert only this source comparison and source-specific verification. Apply safeDirectFieldUpdates only if app hash/base values still match. Never replace geometry, pins, reviewed merges, official overrides, offers or translations.'})
 summary={'runStartedAt':START.isoformat(),'runCompletedAt':now(),'baseAppPath':str(ARGS.app_data),'baseAppSha256':sha(APP_BYTES),'catalogues':catalogue_summary,'successfulRecords':len(patches),'sourceRecordsWithSubstantiveChanges':len(changes),'sourceRecordsUnchanged':len(unchanged),'addedSourceRecords':added,'removedSourceRecords':removed,'failures':len(FAILURES),'neverAdvanceCheckedAtOnFailure':True,'reviewedMergesPreserved':MERGES,'freshnessMeaning':'Successful content retrieval/parse at per-source timestamp, not a claim that seller prices, availability or construction condition have been independently verified.','sourceDatesMeaning':'priceUpdatedAt/publishedDate/createdDate are publisher dates; these remain separate from checkedAt.'}
 patch={'metadata':summary,'patches':patches,'removedSourceRecords':removed,'failures':FAILURES}
 for filename,obj in [('catalogue-patch.json',patch),('changes.json',changes),('failures.json',FAILURES),('evidence.json',EVIDENCE),('summary.json',summary)]:
  write(RUN/filename,obj);write(ARGS.output/filename,obj)
 write(ARGS.output/'latest-run.json',{'runDirectory':str(RUN),'summaryPath':str(RUN/'summary.json'),'patchPath':str(RUN/'catalogue-patch.json'),'startedAt':START.isoformat(),'finishedAt':summary['runCompletedAt']})
 print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)


def main():
 adapters.CHECKED=None
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  k=pool.submit(karu_catalogue);m=pool.submit(myhome_catalogue);catalogues={'karu':k.result(),'myhome':m.result()}
 print('Catalogues ready', {k:len(v[0]) for k,v in catalogues.items()},flush=True)
 if catalogues['karu'][2]:refresh_karu_metadata()
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  futures={p:pool.submit(refresh_details,p,v[0]) for p,v in catalogues.items() if v[2]}
  results={p:f.result() for p,f in futures.items()}
 build_patch(catalogues,results)
 from prepare_patch import prepare
 prepare(RUN,ARGS.output)
if __name__=='__main__':main()
