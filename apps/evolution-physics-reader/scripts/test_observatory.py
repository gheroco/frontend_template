#!/usr/bin/env python3
"""Browser acceptance checks and real screenshots, Chromium + mobile WebKit."""
import json
import os
import subprocess
import sys
import time
import traceback
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts'
OUT.mkdir(exist_ok=True)
BASE = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:4173')
results, errors = [], []
server = None
if 'TEST_BASE_URL' not in os.environ:
    server = subprocess.Popen(['node', 'scripts/serve.mjs', '--port', '4173'], cwd=ROOT)
    for _ in range(50):
        try:
            urllib.request.urlopen(BASE, timeout=1)
            break
        except Exception:
            time.sleep(.1)

def run(page, name, fn):
    try:
        fn()
        results.append({'check': name, 'ok': True})
        print('PASS', name, flush=True)
    except Exception as error:
        results.append({'check': name, 'ok': False, 'error': str(error)})
        print('FAIL', name, str(error), flush=True)
        traceback.print_exc()
        try: page.screenshot(path=str(OUT / (name + '-failure.png')))
        except Exception: pass

def ready(page, route=''):
    page.goto(BASE + '/' + route)
    page.locator('#chapter-cards .chapter-card').first.wait_for(state='attached')
    page.evaluate('document.fonts.ready')
    if route.startswith(('#read', '#learn', '#experiment', '#section')):
        page.locator('#reader-content .source-page').first.wait_for()
    if route.startswith(('#learn', '#experiment')):
        page.locator('#companion-body h2, #companion-body h3').first.wait_for()
    if route.startswith('#experiment'):
        page.locator('.experiment-result').wait_for()

def route(page, target):
    page.evaluate('(hash)=>location.hash=hash', target)
    page.wait_for_timeout(250)

def set_range(locator, value):
    minimum=float(locator.get_attribute('min') or 0)
    step=float(locator.get_attribute('step') or 1)
    locator.focus()
    locator.press('Home')
    for _ in range(round((float(value)-minimum)/step)):
        locator.press('ArrowRight')

def screenshot(page, name):
    page.screenshot(path=str(OUT / (name + '.png')))

def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
    assert page.locator('img:visible').evaluate_all('(imgs)=>imgs.filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src)') == []

def anchor(page):
    return page.evaluate('''()=>{const s=document.querySelector('#reading-scroll'),top=s.getBoundingClientRect().top;const el=[...document.querySelectorAll('.source-text>[id]')].find(e=>e.getBoundingClientRect().bottom>top+24);return el?{id:el.id,offset:el.getBoundingClientRect().top-top}:null}''')

try:
    with sync_playwright() as pw:
        for engine, size, width, height in [('chromium','phone',390,844),('chromium','tablet',834,1112),('chromium','laptop',1366,900),('chromium','wide',1920,1080),('webkit','safari-phone',390,844)]:
            browser = getattr(pw, engine).launch()
            context = browser.new_context(viewport={'width':width,'height':height}, device_scale_factor=1, is_mobile=width<500, has_touch=width<900, reduced_motion='reduce', locale='ru-RU')
            page = context.new_page()
            page.set_default_timeout(15000)
            runtime_errors, failed_responses = [], []
            page.on('pageerror', lambda e: runtime_errors.append(str(e)))
            page.on('response', lambda r: failed_responses.append(str(r.status)+' '+r.url) if r.status>=400 else None)
            def entrance():
                ready(page)
                expect(page.locator('.hero h1')).to_contain_text('Эволюция')
                expect(page.locator('.authors')).to_contain_text('ИНФЕЛЬД')
                expect(page.locator('.site-header .brand')).to_contain_text('ЭВОЛЮЦИЯ')
                assert page.evaluate('document.documentElement.dataset.motion') == 'off'
                set_range(page.locator('#hero-frequency'), 2)
                expect(page.locator('#hero-wavelength')).to_contain_text('2')
                page.locator('#hero-reset').click()
                page.evaluate('window.scrollTo(0,0)');no_overflow(page);screenshot(page,size+'-entrance')
            run(page,size+'-entrance',entrance)
            def reader():
                ready(page,'#read/88')
                expect(page.locator('#reader')).to_be_visible()
                assert len(page.locator('#reader-content').inner_text())>3000
                expect(page.locator('#page-number')).to_have_value('88')
                no_overflow(page);screenshot(page,size+'-reader')
                page.locator('#bookmark-current').click()
                expect(page.locator('#bookmark-current')).to_have_attribute('aria-pressed','true')
                saved=page.evaluate("JSON.parse(localStorage.getItem('evolution-native-progress-v2'))")
                assert 88 in saved['bookmarks']
                page.locator('#reading-scroll').evaluate('(e)=>e.scrollTop+=430')
                page.wait_for_timeout(300)
                before=anchor(page)
                page.locator('#font-plus').click();page.wait_for_timeout(100)
                after=anchor(page)
                assert before['id']==after['id'] and abs(before['offset']-after['offset'])<4,(before,after)
                page.locator('#explain-current').click()
                expect(page.locator('#companion-panel')).to_be_visible()
                expect(page.locator('.lesson-title')).to_be_visible()
                page.wait_for_timeout(150)
                after=anchor(page)
                assert before['id']==after['id'] and abs(before['offset']-after['offset'])<4,(before,after)
                no_overflow(page);screenshot(page,size+'-explanation')
                page.locator('#close-companion').click();page.wait_for_timeout(200)
                page.locator('#focus-toggle').click()
                expect(page.locator('#focus-toggle')).to_have_attribute('aria-pressed','true')
                page.keyboard.press('Escape')
                expect(page.locator('#focus-toggle')).to_have_attribute('aria-pressed','false')
                page.wait_for_timeout(100)
                before=anchor(page)
                route(page,'#');route(page,'#resume')
                page.locator('#reader-content .source-page').first.wait_for();page.wait_for_timeout(300)
                after=anchor(page)
                assert before['id']==after['id'] and abs(before['offset']-after['offset'])<5,(before,after)
            run(page,size+'-reading-and-resume',reader)
            def figure():
                ready(page,'#figure/figure-001')
                expect(page.locator('#image-dialog')).to_be_visible()
                expect(page.locator('#zoom-image')).to_be_visible()
                page.locator('#image-plus').click();expect(page.locator('#image-reset')).to_have_text('140%')
                page.locator('#image-stage').focus();page.keyboard.press('ArrowRight')
                assert '35px' in page.locator('#zoom-image').get_attribute('style') or '40px' in page.locator('#zoom-image').get_attribute('style')
                page.locator('#image-reset').click();expect(page.locator('#image-reset')).to_have_text('100%')
                page.locator('#image-fullscreen').click();expect(page.locator('#image-fullscreen')).to_have_attribute('aria-pressed','true')
                no_overflow(page);screenshot(page,size+'-figure')
                page.keyboard.press('Escape');expect(page.locator('#image-dialog')).not_to_be_visible()
            run(page,size+'-figure-controls',figure)
            def experiments():
                for exp,param,value,expected in [('waves','frequency','2','2 м'),('frames','frameVelocity','3','неподвижен'),('fields','rightCharge','1','компенсируются'),('lightclock','beta','0.6','1,25'),('elevator','acceleration','8','0,707'),('photoelectric','wavelengthNm','700','эмиссии нет')]:
                    ready(page,'#experiment/'+exp)
                    control=page.locator('[data-param="'+param+'"]')
                    if exp=='fields':control.select_option(value)
                    else:set_range(control,value)
                    expect(page.locator('.experiment-result')).to_contain_text(expected)
                    no_overflow(page)
                    if exp=='waves':
                        screenshot(page,size+'-experiment')
                        if size=='wide':
                            page.locator('#reader [data-motion]').click()
                            page.wait_for_timeout(250)
                            page.locator('.experiment-pause').click()
                            frozen=page.locator('.experiment-visual canvas').screenshot()
                            page.wait_for_timeout(150)
                            assert frozen==page.locator('.experiment-visual canvas').screenshot()
                            page.locator('#reader [data-motion]').click()
                    if size=='wide':screenshot(page,'wide-experiment-'+exp)
                    if exp!='fields':expect(page.locator('.experiment-pause span')).to_have_text('Запустить')
                    page.locator('.experiment-reset').click()
                # Original text remains available alongside the experiment.
                expect(page.locator('#reading-scroll')).to_be_visible()
                page.locator('#source-current').click();expect(page.locator('#compare-text')).to_be_visible()
                expect(page.locator('#zoom-image')).to_be_visible();page.keyboard.press('Escape')
            run(page,size+'-physics-models',experiments)
            def search():
                page.locator('[data-search-reader]').click()
                page.locator('#book-search').fill('волна')
                page.locator('#search-results .search-result').first.wait_for()
                expect(page.locator('#search-results')).to_contain_text('ТЕКСТ КНИГИ')
                page.locator('[name="search-scope"][value="companion"]').check()
                page.locator('.companion-result').first.wait_for()
                expect(page.locator('#search-results')).to_contain_text('ДОБАВЛЕНО РЕДАКЦИЕЙ')
                no_overflow(page);screenshot(page,size+'-search')
                page.keyboard.press('Escape');expect(page.locator('#search-dialog')).not_to_be_visible()
            run(page,size+'-search',search)
            def navigation():
                ready(page,'#read/260')
                assert page.locator('#reader-content .source-page').count()==92
                expect(page.locator('#page-number')).to_have_value('260')
                no_overflow(page);screenshot(page,size+'-long-chapter')
                if page.locator('#reader').evaluate("e=>e.classList.contains('sidebar-closed')"):
                    page.locator('#sidebar-toggle').click()
                expect(page.locator('#sidebar')).to_be_visible()
                page.locator('#bookmarks-tab').click();expect(page.locator('.bookmark-entry').first).to_contain_text('волна')
                screenshot(page,size+'-navigation')
                if width<=900:
                    page.keyboard.press('Escape');expect(page.locator('#sidebar-toggle')).to_be_focused()
                ready(page,'#atlas')
                page.locator('.concept-node').first.wait_for()
                no_overflow(page);screenshot(page,size+'-atlas')
                page.locator('[data-atlas-view="list"]').click()
                expect(page.locator('#concept-list')).to_be_visible()
                expect(page.locator('#concept-map')).not_to_be_visible()
                ready(page,'#read/268/p268-b004')
                expect(page.locator('#b-268-p268-b004')).to_have_class('passage-target')
                expect(page.locator('.transcription-uncertain')).to_be_attached()
            run(page,size+'-navigation',navigation)
            def runtime():
                assert not runtime_errors, runtime_errors
                assert not failed_responses, failed_responses
            run(page,size+'-runtime-and-assets',runtime)
            context.close();browser.close()
finally:
    if server:server.terminate()
    report={'checks':len(results),'passed':sum(r['ok'] for r in results),'failed':sum(not r['ok'] for r in results),'results':results,'engines':['Chromium','WebKit'],'viewports':{'phone':[390,844],'tablet':[834,1112],'laptop':[1366,900],'wide':[1920,1080]}}
    (OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!='results'},ensure_ascii=False))
sys.exit(0 if results and all(r['ok'] for r in results) else 1)
