import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createServer, canonicalJson, storyHash, validateStory } from '../server.mjs';

const fixtureStory = () => ({ slug: 'island-story', title: 'How islands formed', sections: [{ id: 'first', title: 'An ancient sea', paragraphs: ['Limestone formed from marine sediment.'] }], vocabulary: [{ id: 'limestone', term: 'limestone', definition: 'A rock made mainly of calcium carbonate.', armenian: 'կրաքար', dictionaryUrl: 'https://www.merriam-webster.com/dictionary/limestone' }], quiz: [{ id: 'q1', question: 'Where did limestone form?', options: ['In an ancient sea', 'In a cloud'], correctIndex: 0, explanation: 'Marine sediment accumulated underwater.' }], cloze: [{ id: 'c1', sentence: 'The rock is called ____.', answer: 'limestone' }], speaking: [{ id: 's1', prompt: 'Explain how the islands formed.' }], grammar: [{ id: 'g1', title: 'Past passive', explanation: 'Use was or were with a past participle.', examples: ['The rock was lifted.'] }], media: [{ id: 'cover', url: '/media/cover.svg', alt: 'A limestone island.' }], sources: [{ id: 'dmr', title: 'Department of Mineral Resources', url: 'https://www.dmr.go.th/' }], originalMarkdown: '# How islands formed\n\nLimestone formed from marine sediment.' });

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'story-atlas-'));
  const contentDir = path.join(root, 'content'), publicDir = path.join(root, 'public');
  await mkdir(path.join(contentDir, 'stories'), { recursive: true });
  await mkdir(path.join(contentDir, 'media'), { recursive: true });
  await mkdir(publicDir);
  const story = fixtureStory();
  const save = async value => {
    await writeFile(path.join(contentDir, 'index.json'), JSON.stringify({ version: 1, stories: [{ slug: value.slug, title: value.title, media: value.media }] }));
    await writeFile(path.join(contentDir, 'stories', value.slug + '.json'), JSON.stringify(value));
  };
  await save(story);
  await writeFile(path.join(publicDir, 'index.html'), '<!doctype html><title>Story Atlas</title>');
  await writeFile(path.join(contentDir, 'media', 'cover.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const servers = [];
  const start = async more => {
    const server = createServer({ mode: 'local', contentDir, publicDir, ...options, ...more });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    return { server, base: 'http://127.0.0.1:' + server.address().port };
  };
  t.after(async () => { for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await rm(root, { recursive: true, force: true }); });
  return { root, contentDir, publicDir, story, save, start, ...(await start()) };
}

const post = (base, body, endpoint = '/api/stories') => fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('full lesson publish verifies every field and GET returns the exact committed lesson', async t => {
  const f = await fixture(t);
  const response = await post(f.base, f.story);
  assert.equal(response.status, 200);
  const receipt = await response.json();
  assert.equal(receipt.persisted, true);
  assert.equal(receipt.sha256, storyHash(f.story));
  assert.deepEqual(receipt.counts, { sections: 1, vocabulary: 1, quiz: 1, cloze: 1, speaking: 1, grammar: 1, media: 1, sources: 1 });
  assert.deepEqual(await (await fetch(f.base + '/api/stories/island-story')).json(), f.story);
  const list = await (await fetch(f.base + '/api/stories')).json();
  assert.equal(list.total, 1);
  assert.equal(list.stories[0].slug, f.story.slug);
  const image = await fetch(f.base + f.story.media[0].url);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/svg+xml');
});

test('published content survives a completely fresh server and updates reload from durable files', async t => {
  const f = await fixture(t);
  assert.equal((await post(f.base, f.story)).status, 200);
  const fresh = await f.start();
  assert.deepEqual(await (await fetch(fresh.base + '/api/stories/island-story')).json(), f.story);
  const updated = { ...f.story, title: 'A newly published revision' };
  await f.save(updated);
  const response = await post(fresh.base, { slug: updated.slug }, '/api/publish');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sha256, storyHash(updated));
  assert.deepEqual(await (await fetch(f.base + '/api/stories/island-story')).json(), updated);
});

test('unauthorized or uncommitted changes cannot be published', async t => {
  const f = await fixture(t);
  const modified = { ...f.story, title: 'Uncommitted injection' };
  const response = await post(f.base, modified);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'content_mismatch');
  assert.equal((await post(f.base, { ...f.story, slug: 'unknown-story' })).status, 409);
  assert.deepEqual(await (await fetch(f.base + '/api/stories/island-story')).json(), f.story);
});

test('object key order is normalized while array order and field contents remain significant', async t => {
  const f = await fixture(t);
  const shuffled = Object.fromEntries(Object.entries(f.story).reverse());
  assert.equal(canonicalJson(shuffled), canonicalJson(f.story));
  assert.equal((await post(f.base, { story: shuffled })).status, 200);
});

test('validation rejects malformed quiz keys, unsafe URLs, slugs, invalid JSON, and oversized bodies', async t => {
  const f = await fixture(t);
  assert.throws(() => validateStory({ ...f.story, quiz: [{ ...f.story.quiz[0], correctIndex: 99 }] }));
  assert.equal((await post(f.base, { ...f.story, slug: '../secret' })).status, 400);
  assert.equal((await post(f.base, { ...f.story, media: [{ url: 'javascript:alert(1)', alt: 'bad' }] })).status, 400);
  assert.equal((await post(f.base, { ...f.story, sources: [{ title: 'bad', url: 'http://169.254.169.254/' }] })).status, 400);
  assert.equal((await fetch(f.base + '/api/stories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await fetch(f.base + '/api/stories', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await post(f.base, { ...f.story, originalMarkdown: 'x'.repeat(1024 * 1024) })).status, 413);
});

test('server never serves content source files, traversal targets, or unknown API endpoints', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(f.base + '/server.mjs')).status, 404);
  assert.equal((await fetch(f.base + '/content/stories/island-story.json')).status, 404);
  assert.equal((await fetch(f.base + '/api/unknown')).status, 404);
  assert.equal((await fetch(f.base + '/media/%2e%2e%2findex.json')).status, 403);
  const page = await fetch(f.base + '/story/island-story');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await fetch(f.base + '/api/health')).status, 200);
});

test('remote publish fails during source outage while cached reading is marked stale', async t => {
  let failed = false;
  const story = fixtureStory();
  const upstream = http.createServer((req, res) => {
    if (failed) { res.statusCode = 503; return res.end('Offline'); }
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/content/index.json')) return res.end(JSON.stringify({ version: 1, stories: [{ slug: story.slug, title: story.title }] }));
    if (req.url.startsWith('/content/stories/island-story.json')) return res.end(JSON.stringify(story));
    res.statusCode = 404; res.end();
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(async () => { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); });
  const f = await fixture(t, { mode: 'github', sourceBaseUrl: 'http://127.0.0.1:' + upstream.address().port + '/', cacheTtlMs: 0 });
  const good = await post(f.base, story);
  assert.equal(good.status, 200);
  assert.equal((await good.json()).storage, 'github');
  failed = true;
  const read = await fetch(f.base + '/api/stories/island-story');
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('x-content-stale'), 'true');
  assert.deepEqual(await read.json(), story);
  const publish = await post(f.base, story);
  assert.equal(publish.status, 503);
  assert.equal((await publish.json()).ok, false);
});

test('publication force refreshes are bounded and browser cross-origin requests are rejected', async t => {
  const f = await fixture(t, { publishLimit: 1 });
  assert.equal((await post(f.base, f.story)).status, 200);
  const limited = await post(f.base, f.story);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  const cross = await fetch(f.base + '/api/stories', { method: 'POST', headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' }, body: JSON.stringify(f.story) });
  assert.equal(cross.status, 403);
});

test('publication bypasses stale branch CDN data and pins lesson, catalogue and images to the verified commit', async t => {
  const revisionOne = '1'.repeat(40), revisionTwo = '2'.repeat(40);
  const original = fixtureStory(), updated = { ...original, title: 'A later authorized revision' };
  let head = revisionOne, refReads = 0, unavailable = false;
  const upstream = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://fixture').pathname;
    if (pathname === '/refs/current') {
      refReads++;
      if (unavailable) { res.statusCode = 503; return res.end('Cannot resolve HEAD'); }
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ object: { type: 'commit', sha: head } }));
    }
    // The branch CDN remains stale forever, even for query-string cache busters.
    if (pathname === '/branch/content/index.json') return res.end(JSON.stringify({ version: 1, stories: [] }));
    const match = pathname.match(/^\/commits\/([12]{40})\/content\/(.+)$/);
    if (match) {
      const story = match[1] === revisionOne ? original : updated;
      if (match[2] === 'index.json') return res.end(JSON.stringify({ version: 1, stories: [{ slug: story.slug, title: story.title }] }));
      if (match[2] === 'stories/island-story.json') return res.end(JSON.stringify(story));
      if (match[2] === 'media/cover.svg') return res.end('<svg xmlns="http://www.w3.org/2000/svg"><title>' + match[1] + '</title></svg>');
    }
    res.statusCode = 404; res.end('Not found');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(async () => { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); });
  const origin = 'http://127.0.0.1:' + upstream.address().port;
  const f = await fixture(t, { mode: 'github', sourceBaseUrl: origin + '/branch/', sourceRevisionRoot: origin + '/commits/', refApiUrl: origin + '/refs/current', cacheTtlMs: 0, revisionTtlMs: 360000 });
  assert.equal((await (await fetch(f.base + '/api/stories')).json()).total, 0);
  const published = await post(f.base, original);
  assert.equal(published.status, 200);
  const receipt = await published.json();
  assert.equal(receipt.source.commit, revisionOne);
  assert.equal(receipt.revision, revisionOne);
  assert.equal(receipt.sha256, storyHash(original));
  const catalogue = await fetch(f.base + '/api/stories');
  assert.equal(catalogue.headers.get('x-story-commit'), revisionOne);
  assert.equal((await catalogue.json()).total, 1);
  const lesson = await fetch(f.base + '/api/stories/island-story');
  assert.equal(lesson.headers.get('x-story-commit'), revisionOne);
  assert.deepEqual(await lesson.json(), original);
  const image = await fetch(f.base + '/media/cover.svg');
  assert.equal(image.headers.get('x-story-commit'), revisionOne);
  assert.match(await image.text(), new RegExp(revisionOne));
  assert.equal(refReads, 1, 'ordinary reads must not spend GitHub API quota');
  // A new publication must re-resolve HEAD, ignoring the previous revision pin.
  head = revisionTwo;
  const republished = await post(f.base, updated);
  assert.equal(republished.status, 200);
  assert.equal((await republished.json()).source.commit, revisionTwo);
  assert.deepEqual(await (await fetch(f.base + '/api/stories/island-story')).json(), updated);
  assert.equal(refReads, 2);
  unavailable = true;
  const failed = await post(f.base, updated);
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).code, 'revision_unavailable');
});
