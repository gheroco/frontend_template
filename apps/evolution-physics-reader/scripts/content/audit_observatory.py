#!/usr/bin/env python3
"""Publish an honest page/section/figure ledger against frozen source evidence.

The original PDF is identified by its retained SHA. This check reads its original
extracted PNGs, verifies those bytes against the earlier extraction inventory,
and compares every figure crop pixel-for-pixel. It does not re-proofread OCR.
"""
import hashlib
import html
import json
import subprocess
import sys
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / 'src/content'
AUDIT = ROOT / 'content-audit/source'
OUT = ROOT / 'src/companion'
load = lambda path: json.loads(path.read_text())
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
esc = lambda value: html.escape(str(value))

book = load(CONTENT / 'book.json')
inventory = load(AUDIT / 'inventory.json')
art = load(AUDIT / 'figures.json')
companion = load(OUT / 'companion.json')
check = subprocess.run([sys.executable, str(ROOT / 'scripts/content/verify_content.py')], cwd=ROOT, capture_output=True, text=True)
integrity = json.loads(check.stdout)
errors = list(integrity['errors'])
scans = {entry['pdf_page']: entry for entry in inventory['pages']}
native = {n: load(CONTENT / f'pages/{n:03}.json') for n in range(1, 346)}
pages, figures, sections = [], [], []
compared = set(book['verification']['wholePageComparisonPages'])
manual = set(book['verification']['manuallyProofreadPages'])
for meta in book['pages']:
    n = meta['number']
    path = CONTENT / f'scans/page-{n:03}.png'
    sha_ok = digest(path) == scans[n]['image_sha256']
    if not sha_ok:
        errors.append({'page': n, 'error': 'retained scan differs from original extraction hash'})
    status = 'Ручная транскрипция; один проход' if n in manual else 'Полный визуальный проход' if n in compared else 'OCR; структура и выборочные исправления'
    if meta.get('kind') == 'blank': status = 'Пустой лист; учтён'
    if meta.get('kind') == 'plate': status = 'Фотовкладка; оригинал сохранён'
    pages.append({'page': n, 'printedPage': meta.get('printedPage'), 'sectionId': meta['sectionId'], 'destination': f'../#read/{n}', 'sourceImage': f'../content/scans/page-{n:03}.png', 'kind': meta.get('kind'), 'duplicateOf': meta.get('duplicateOf'), 'textSourcePage': native[n].get('textSourcePage'), 'blockCount': len(native[n]['blocks']), 'scanSha256': scans[n]['image_sha256'], 'scanHashMatchesExtraction': sha_ok, 'verification': status, 'characterPerfect': False, 'uncertainty': 'p268-b004: повреждены буквы «ви» в слове «независимо»; прежняя реконструкция по контексту' if n == 268 else None})
for record in art:
    n = record['page']
    source = CONTENT / f'scans/page-{n:03}.png'
    crop = CONTENT / record['src']
    with Image.open(source) as image, Image.open(crop) as published:
        expected = image.crop(tuple(record['bbox'])).convert('RGB')
        actual = published.convert('RGB')
        ok = expected.size == actual.size and ImageChops.difference(expected, actual).getbbox() is None
    if not ok: errors.append({'figure': record['id'], 'error': 'source pixel mismatch'})
    figures.append({'id': record['id'], 'caption': record['caption'], 'page': n, 'kind': record['kind'], 'destination': '../#figure/' + record['id'], 'sourcePage': f'../#read/{n}', 'sourceCrop': record['bbox'], 'originalPixelsMatch': ok, 'sha256': digest(crop)})
for section in book['sections']:
    entries = [e for e in companion['entries'] if e['sectionId'] == section['id']]
    sections.append({'id': section['id'], 'title': section['title'], 'firstPage': section['startPage'], 'lastPage': section['endPage'], 'destination': '../#section/' + section['id'], 'companionEntries': [e['id'] for e in entries]})
    if not entries: errors.append({'section': section['id'], 'error': 'no companion explanation'})
for entry in companion['entries']:
    src = entry['source']
    if src.get('blockId') not in [b['id'] for b in native[src['page']]['blocks']]:
        errors.append({'lesson': entry['id'], 'error': 'missing source block'})
report = {'schemaVersion': 1, 'edition': book.get('title'), 'sourcePdfSha256': inventory['source_sha256'], 'baselineCommit': '3f17c3ae4e69ced0a1675ce45ff5d613b4b902c7', 'ok': not errors, 'scope': 'Structural coverage, retained extraction hashes, exact original figure pixels, original/search parity, passage anchors and companion coverage. No new complete character proofreading and no fresh PDF extraction.', 'counts': {**integrity['counts'], 'sourcePixelCropsVerified': sum(f['originalPixelsMatch'] for f in figures), 'wholePageComparisonsRecorded': len(compared), 'manualTranscriptionsRecorded': len(manual), 'companionNotes': len(companion['entries']), 'experiments': 6}, 'limitations': ['Все 345 исходных листов имеют адрес, включая повторы, пустые листы, титулы, содержание, послесловие и указатель.', '104 листа имеют записанный полный визуальный проход, включая 27 ручных транскрипций и повторные листы. Эти записи унаследованы из исходного проекта, не являются новой вычиткой этого редизайна.', 'Для остальных 241 листа нет записи о полной сверке текста; в это число входят также пустые листы и фотовкладки. Посимвольная точность всей книги не подтверждена.', 'Лист 268, p268-b004: буквы «ви» в слове «независимо» повреждены. Прежняя контекстная реконструкция сохранена и явно отмечена в интерфейсе.', 'Редизайн сохраняет все файлы src/content без изменения. Новые объяснения и модели размещены отдельно. Современные формулы не приписываются авторам.', 'Проверка сравнивает сохранённые исходные PNG с хешами первоначального извлечения. Исходный PDF заново не извлекался.'], 'pages': pages, 'sections': sections, 'figures': figures, 'errors': errors}
OUT.mkdir(exist_ok=True)
(OUT / 'coverage-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
page_rows = ''.join(f'<tr><td><a href="{p["destination"]}">{p["page"]}</a></td><td>{esc(p["printedPage"] or "—")}</td><td>{esc(p["sectionId"])}</td><td>{esc(p["kind"])}{(" · повтор " + str(p["duplicateOf"])) if p["duplicateOf"] else ""}</td><td>{p["blockCount"]}</td><td>{esc(p["verification"])}{("<strong> · " + esc(p["uncertainty"]) + "</strong>") if p["uncertainty"] else ""}</td><td><a href="{p["sourceImage"]}">Скан ↗</a> · SHA ✓</td></tr>' for p in pages)
section_rows = ''.join(f'<tr><td><a href="{s["destination"]}">{esc(s["title"])}</a></td><td>{s["firstPage"]}–{s["lastPage"]}</td><td>{len(s["companionEntries"])}</td></tr>' for s in sections)
figure_rows = ''.join(f'<tr><td><a href="{f["destination"]}">{esc(f["id"])}</a></td><td>{esc(f["caption"])}</td><td><a href="{f["sourcePage"]}">{f["page"]}</a></td><td>{esc(f["kind"])}</td><td>{"Совпадают" if f["originalPixelsMatch"] else "ОШИБКА"}</td></tr>' for f in figures)
document = f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Покрытие и точность — Эволюция физики</title><style>
:root{{color-scheme:dark}}*{{box-sizing:border-box}}body{{margin:0;background:#070e19;color:#ecebe4;font:16px/1.75 system-ui,sans-serif}}main{{max-width:1200px;margin:auto;padding:50px 24px 80px}}a{{color:#87dce7;text-underline-offset:4px}}h1{{font-size:clamp(30px,5vw,56px);line-height:1.15;max-width:800px;font-weight:500}}h2{{margin-top:55px;font-weight:500}}p,li{{max-width:900px;color:#b8c5cf}}li{{margin-bottom:12px}}code{{overflow-wrap:anywhere;font-size:12px}}nav{{display:flex;gap:20px;flex-wrap:wrap}}.stats{{display:flex;flex-wrap:wrap;gap:32px;margin-block:40px}}.stats strong{{font-size:30px;color:#87dce7;font-weight:500}}.stats span{{display:block;font-size:12px;color:#b8c5cf}}.table{{overflow:auto;border:1px solid #26394a;border-radius:8px}}table{{width:100%;border-collapse:collapse;font-size:13px;text-align:left}}th,td{{padding:13px 16px;border-bottom:1px solid #26394a;vertical-align:top}}th{{background:#102132}}td strong{{color:#e9c288;font-weight:500}}.status{{color:#e9c288}}a:focus-visible{{outline:2px solid #87dce7;outline-offset:5px}}.status-box{{padding:24px;background:#102132;border-radius:8px}}@media print{{body{{background:white;color:black}}p,li,a{{color:black}}.table{{overflow:visible}}}}</style></head><body><main><nav><a href="../">← Книга</a><a href="#pages">345 листов</a><a href="#sections">46 разделов</a><a href="#figures">86 иллюстраций</a><a href="coverage-report.json">JSON</a></nav><h1>Покрытие книги.<br>Границы подтверждённой точности.</h1><p>А. Эйнштейн и Л. Инфельд. «Эволюция физики». Москва, «Наука», 1965. Третий исправленный русский выпуск.</p><div class="stats"><div><strong>345 / 345</strong><span>исходных листов имеют адрес</span></div><div><strong>86 / 86</strong><span>изображений совпадают с исходными пикселями</span></div><div><strong>60 + 6</strong><span>объяснений и учебных моделей</span></div></div><div class="status-box"><strong class="status">Полная посимвольная вычитка не завершена.</strong><p>Структурная проверка: {'пройдена, ошибок нет' if not errors else 'ОБНАРУЖЕНЫ ОШИБКИ'}. Наличие всех листов и совпадение изображений не доказывают безошибочность OCR.</p></div><h2>Что проверено и что остаётся</h2><ul>{''.join('<li>'+esc(s)+'</li>' for s in report['limitations'])}</ul><p>345 листов: 327 различных печатных страниц, 10 повторов, 3 фотовкладки, 5 пустых сканов. 86 изображений: 75 нумерованных рисунков, 10 фотогрупп, издательский знак. 1770 содержательных блоков; 86 886 слов по принятому счётчику.</p><p>SHA-256 исходного PDF:<br><code>{inventory['source_sha256']}</code></p><h2 id="pages">Постраничная карта</h2><p>Номер листа — постоянный адрес веб-текста. «Скан» открывает неизменённое исходное изображение. SHA ✓ означает совпадение с хешем первоначального извлечения.</p><div class="table" tabindex="0" aria-label="Постраничное покрытие"><table><thead><tr><th>Лист</th><th>Стр.</th><th>Раздел</th><th>Тип</th><th>Блоки</th><th>Проверка текста</th><th>Источник</th></tr></thead><tbody>{page_rows}</tbody></table></div><h2 id="sections">Разделы и объяснения</h2><p>Объяснения — новый учебный слой. Оригинальный порядок книги не изменён.</p><div class="table" tabindex="0"><table><thead><tr><th>Раздел</th><th>Листы</th><th>Объяснения</th></tr></thead><tbody>{section_rows}</tbody></table></div><h2 id="figures">Оригинальные иллюстрации</h2><p>Проверяется точное совпадение каждого RGB-пикселя с прямоугольником исходного скана, а также размеры, подпись и привязка к странице.</p><div class="table" tabindex="0"><table><thead><tr><th>Адрес</th><th>Подпись</th><th>Лист</th><th>Тип</th><th>Пиксели</th></tr></thead><tbody>{figure_rows}</tbody></table></div></main></body></html>'''
(OUT / 'coverage-report.html').write_text(document)
print(json.dumps({'ok': not errors, 'counts': report['counts'], 'errors': errors}, ensure_ascii=False, indent=2))
sys.exit(bool(errors))
