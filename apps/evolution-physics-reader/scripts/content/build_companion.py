"""Build separate reading notes without modifying canonical book content."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
BOOK = json.loads((ROOT / 'src/content/book.json').read_text())
NOTES = json.loads((ROOT / 'src/companion/notes.json').read_text())
PAGES = {p['number']: json.loads((ROOT / 'src' / p['path']).read_text()) for p in BOOK['pages']}
SECTIONS = {s['id']: s for s in BOOK['sections']}
TOPICS = {s['id']: s for s in BOOK.get('subsections', [])}
def anchor(section):
    for n in range(section['startPage'], section['endPage'] + 1):
        for block in PAGES[n]['blocks']:
            if block['type'] == 'heading' and section['title'].casefold().replace('—', ' ') in block.get('text', '').casefold().replace('—', ' '):
                return n, block['id']
    blocks = PAGES[section['startPage']]['blocks']
    return section['startPage'], next((b['id'] for b in blocks if b.get('text')), blocks[0]['id'] if blocks else None)
entries = []
for key, title, summary, reasoning, misconception, question, experiment in NOTES:
    if key in SECTIONS:
        section = SECTIONS[key]
        page, block = anchor(section)
        end = section['endPage']
    else:
        topic = TOPICS[key]
        section = SECTIONS[topic['sectionId']]
        page, block = topic['page'], topic['blockId']
        later = [t['page'] for t in TOPICS.values() if t['page'] > page]
        end = min(later) - 1 if later else section['endPage']
    entries.append(dict(id=key, sectionId=section['id'], title=title, summary=summary, reasoning=reasoning, misconception=misconception, question=question, experiment=experiment, source=dict(page=page, blockId=block, endPage=end), attribution='Объяснение редакции цифрового издания; не текст авторов.'))
assert len(entries) == len(SECTIONS) + len(TOPICS)
out = dict(schemaVersion=1, label='Объяснение', entries=entries, references=[
    dict(id='waves', title='OpenStax · College Physics 2e, 16.9: Waves', url='https://openstax.org/books/college-physics-2e/pages/16-9-waves'),
    dict(id='photoelectric', title='OpenStax · College Physics 2e, 29.2: The Photoelectric Effect', url='https://openstax.org/books/college-physics-2e/pages/29-2-the-photoelectric-effect'),
    dict(id='constants', title='NIST · Fundamental Physical Constants', url='https://physics.nist.gov/cuu/Constants/')])
(ROOT / 'src/companion/companion.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
print(f'Built {len(entries)} notes: {len(SECTIONS)} sections + {len(TOPICS)} afterword topics.')
