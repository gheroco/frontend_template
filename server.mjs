import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_JSON = 1024 * 1024;
const MAX_IMAGE = 8 * 1024 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const IMAGE_EXTENSIONS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);

class ApiError extends Error {
  constructor(status, message, code = 'request_failed') { super(message); this.status = status; this.code = code; }
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

export const storyHash = story => createHash('sha256').update(canonicalJson(story)).digest('hex');
const validSlug = slug => typeof slug === 'string' && slug.length <= 100 && SLUG.test(slug);
const ensure = (ok, message) => { if (!ok) throw new ApiError(400, message, 'invalid_lesson'); };
const isText = (text, max = 100000) => typeof text === 'string' && text.length <= max;
const nonempty = (text, max) => isText(text, max) && text.trim().length > 0;

function safeUrl(value, allowLocal = false) {
  if (typeof value !== 'string' || value.length > 3000) return false;
  if (allowLocal && /^\/media\/[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(value) && !value.split('/').includes('..')) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

export function validateStory(story) {
  ensure(story && typeof story === 'object' && !Array.isArray(story), 'A lesson must be a JSON object.');
  ensure(validSlug(story.slug), 'slug must contain lowercase words separated by hyphens (maximum 100 characters).');
  ensure(nonempty(story.title, 240), 'A title is required (maximum 240 characters).');
  ensure(Array.isArray(story.sections) && story.sections.length > 0 && story.sections.length <= 200, 'sections must contain 1–200 sections.');
  for (const section of story.sections) {
    ensure(section && typeof section === 'object', 'Every section must be an object.');
    ensure(isText(section.title ?? '', 300), 'Section title must be text.');
    const paragraphs = section.paragraphs ?? [];
    ensure(Array.isArray(paragraphs) && paragraphs.every(p => isText(p)), 'Section paragraphs must be text strings.');
    if (section.bullets !== undefined) ensure(Array.isArray(section.bullets) && section.bullets.every(p => isText(p)), 'Section bullets must be text strings.');
    if (section.blocks !== undefined) {
      ensure(Array.isArray(section.blocks), 'Section blocks must be an array.');
      for (const block of section.blocks) {
        ensure(block && ['paragraph', 'list', 'bullets'].includes(block.type), 'Block type must be paragraph, list, or bullets.');
        ensure(block.type === 'paragraph' ? isText(block.text) : Array.isArray(block.items) && block.items.every(p => isText(p)), 'Invalid section block.');
      }
    }
  }
  ensure(Array.isArray(story.vocabulary) && story.vocabulary.length <= 2000, 'vocabulary must be an array with at most 2,000 entries.');
  for (const word of story.vocabulary) {
    ensure(word && nonempty(word.term, 160) && nonempty(word.definition, 3000), 'Every vocabulary entry needs a term and definition.');
    if (word.armenian !== undefined) ensure(isText(word.armenian, 3000), 'Armenian translations must be text.');
    if (word.dictionaryUrl) ensure(safeUrl(word.dictionaryUrl), 'Dictionary links must be HTTPS URLs.');
  }
  ensure(Array.isArray(story.quiz) && story.quiz.length <= 200, 'quiz must be an array with at most 200 questions.');
  for (const q of story.quiz) {
    ensure(q && nonempty(q.question, 3000) && Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 10 && q.options.every(p => nonempty(p, 3000)), 'Quiz questions require text and 2–10 options.');
    ensure(Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.options.length, 'Quiz correctIndex must identify an existing option.');
  }
  for (const field of ['cloze', 'speaking', 'grammar', 'sources', 'media']) if (story[field] !== undefined) ensure(Array.isArray(story[field]) && story[field].length <= 500, field + ' must be an array with at most 500 items.');
  for (const item of story.cloze ?? []) ensure(item && nonempty(item.sentence, 5000) && nonempty(item.answer, 1000), 'Cloze exercises require a sentence and answer.');
  for (const item of story.speaking ?? []) ensure(item && nonempty(item.prompt, 5000), 'Speaking exercises require a prompt.');
  for (const item of story.grammar ?? []) ensure(item && nonempty(item.title, 300) && isText(item.explanation, 10000), 'Grammar lessons require a title and explanation.');
  for (const source of story.sources ?? []) ensure(source && nonempty(source.title, 1000) && safeUrl(source.url), 'Sources require a title and an HTTPS URL.');
  for (const media of story.media ?? []) ensure(media && safeUrl(media.url, true) && nonempty(media.alt, 2000) && (!media.sourceUrl || safeUrl(media.sourceUrl)), 'Images require a safe URL and alt text.');
  if (story.originalMarkdown !== undefined) ensure(isText(story.originalMarkdown, 600000), 'originalMarkdown must be text.');
  return story;
}

function validateIndex(index) {
  if (!index || !Array.isArray(index.stories) || index.stories.length > 10000) throw new ApiError(502, 'The story catalogue is not valid.', 'invalid_source');
  const slugs = new Set();
  for (const item of index.stories) {
    if (!item || !validSlug(item.slug) || slugs.has(item.slug)) throw new ApiError(502, 'The story catalogue contains an invalid or duplicate slug.', 'invalid_source');
    slugs.add(item.slug);
  }
  return index;
}

function counts(story) {
  return { sections: story.sections.length, vocabulary: story.vocabulary.length, quiz: story.quiz.length, cloze: (story.cloze ?? []).length, speaking: (story.speaking ?? []).length, grammar: (story.grammar ?? []).length, media: (story.media ?? []).length, sources: (story.sources ?? []).length };
}

export function parseGitRefAdvertisement(data, branch) {
  const target = 'refs/heads/' + branch;
  let offset = 0;
  while (offset < data.length) {
    if (offset + 4 > data.length) throw new Error('Incomplete Git packet header');
    const hex = data.subarray(offset, offset + 4).toString('ascii');
    if (!/^[0-9a-f]{4}$/i.test(hex)) throw new Error('Invalid Git packet header');
    const length = Number.parseInt(hex, 16);
    offset += 4;
    if (length === 0) continue;
    if (length < 4 || offset + length - 4 > data.length) throw new Error('Incomplete Git packet');
    const packet = data.subarray(offset, offset + length - 4).toString('utf8').split('\0')[0].trimEnd();
    offset += length - 4;
    const match = packet.match(/^([a-f0-9]{40}) ([^\s]+)$/);
    if (match?.[2] === target) return match[1];
  }
  throw new Error('Configured branch is absent from Git advertisement');
}

class ContentSource {
  constructor(config) { this.config = config; this.cache = new Map(); this.pending = new Map(); this.active = 0; this.waiting = []; this.maxEntries = 250; this.cachedBytes = 0; this.maxCacheBytes = 32 * 1024 * 1024; this.pinnedRevision = null; this.revisionExpiresAt = 0; this.revisionStale = false; this.revisionError = null; this.revisionRefresh = null; this.revisionGeneration = 0; }
  hasRevisionResolver() { return this.config.mode === 'github' && Boolean(this.config.smartGitUrl || this.config.refApiUrl); }
  currentRevision() { return this.pinnedRevision; }
  pinRevision(revision) {
    if (!revision) return;
    this.pinnedRevision = revision;
    this.revisionExpiresAt = this.config.now() + this.config.revisionTtlMs;
    this.revisionStale = false;
    this.revisionError = null;
    this.revisionGeneration++;
  }
  async resolveRevision() {
    if (!this.hasRevisionResolver()) return null;
    return this.slot(async () => {
      const failures = [];
      const candidates = [
        { name: 'git', url: this.config.smartGitUrl, accept: 'application/x-git-upload-pack-advertisement', limit: 2 * 1024 * 1024 },
        { name: 'rest', url: this.config.refApiUrl, accept: 'application/vnd.github+json', limit: 128 * 1024 },
      ].filter(source => source.url);
      for (const candidate of candidates) {
        try {
          const response = await fetch(candidate.url, { signal: AbortSignal.timeout(this.config.revisionTimeoutMs), redirect: 'error', headers: { Accept: candidate.accept, 'User-Agent': 'Story-Atlas/1.0', 'Cache-Control': 'no-cache' } });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          if (Number(response.headers.get('content-length')) > candidate.limit) throw new Error('Oversized ref response');
          const chunks = []; let size = 0;
          for await (const chunk of response.body) {
            size += chunk.length;
            if (size > candidate.limit) throw new Error('Oversized ref response');
            chunks.push(chunk);
          }
          const data = Buffer.concat(chunks);
          const revision = candidate.name === 'git' ? parseGitRefAdvertisement(data, this.config.branch) : JSON.parse(data.toString('utf8'))?.object?.sha;
          if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('Invalid commit SHA');
          return revision;
        } catch (error) {
          // Only bounded diagnostic labels are logged; no tokens, response bodies or request headers.
          failures.push(candidate.name + ': ' + (error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timeout' : /^HTTP \d+$/.test(error.message) ? error.message : 'invalid or unavailable response'));
        }
      }
      this.config.logger.warn('Story Atlas revision lookup failed (' + failures.join('; ') + ')');
      throw new ApiError(503, 'The current GitHub branch revision could not be verified. Please try publishing again shortly.', 'revision_unavailable');
    });
  }
  async ensureCurrentRevision() {
    if (!this.hasRevisionResolver()) return;
    if (this.config.now() < this.revisionExpiresAt) {
      if (this.revisionError) throw this.revisionError;
      return;
    }
    if (this.revisionRefresh) return this.revisionRefresh;
    const generation = this.revisionGeneration;
    this.revisionRefresh = (async () => {
      try {
        const revision = await this.resolveRevision();
        const manifest = await this.read('index.json', { force: true, revision });
        validateIndex(manifest.value);
        // A background reader cannot replace a newer explicit publication.
        if (generation === this.revisionGeneration) this.pinRevision(revision);
      } catch (error) {
        if (generation === this.revisionGeneration) {
          this.revisionStale = true;
          this.revisionError = error;
          this.revisionExpiresAt = this.config.now() + this.config.revisionRetryMs;
        }
        throw error;
      }
    })();
    try { await this.revisionRefresh; } finally { this.revisionRefresh = null; }
  }
  async snapshot(relative, binary = false) {
    const data = await this.local(relative, binary ? MAX_IMAGE : MAX_JSON);
    return { value: binary ? data : JSON.parse(data.toString('utf8')), time: Date.now(), stale: true, origin: 'deployment-snapshot', revision: null };
  }
  async slot(fn) {
    if (this.active >= 6) {
      if (this.waiting.length >= 30) throw new ApiError(503, 'The content source is busy. Please try again shortly.', 'source_busy');
      await new Promise(resolve => this.waiting.push(resolve));
    }
    this.active++;
    try { return await fn(); } finally { this.active--; this.waiting.shift()?.(); }
  }
  async local(relative, limit) {
    try {
      const resolved = await realpath(path.join(this.config.contentDir, relative));
      const root = await realpath(this.config.contentDir);
      if (!resolved.startsWith(root + path.sep)) throw new ApiError(403, 'Invalid source path.', 'invalid_path');
      const size = (await stat(resolved)).size;
      if (size > limit) throw new ApiError(502, 'Source file exceeds the supported size.', 'source_too_large');
      return await readFile(resolved);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(error.code === 'ENOENT' ? 404 : 503, error.code === 'ENOENT' ? 'Story or media was not found in the content source.' : 'The content source is unavailable.', 'source_unavailable');
    }
  }
  async remote(relative, force, limit, revision = null) {
    return this.slot(async () => {
      const base = revision ? new URL(revision + '/', this.config.sourceRevisionRoot) : this.config.sourceBaseUrl;
      const url = new URL('content/' + relative, base);
      if (force) url.searchParams.set('publish', Date.now().toString());
      let response;
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(this.config.sourceTimeoutMs), redirect: 'error', headers: { Accept: relative.endsWith('.json') ? 'application/json' : 'image/*', 'User-Agent': 'Story-Atlas/1.0', ...(force ? { 'Cache-Control': 'no-cache' } : {}) } });
        if (!response.ok) throw new ApiError(response.status === 404 ? 404 : 503, response.status === 404 ? 'Story or media was not found in the authorized repository.' : 'GitHub content is temporarily unavailable. Please try again.', 'source_unavailable');
        if (Number(response.headers.get('content-length')) > limit) throw new ApiError(502, 'Source file exceeds the supported size.', 'source_too_large');
        const chunks = []; let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > limit) throw new ApiError(502, 'Source file exceeds the supported size.', 'source_too_large');
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(503, 'GitHub content is temporarily unavailable. Please try again.', 'source_unavailable');
      }
    });
  }
  save(key, entry) {
    this.cachedBytes -= this.cache.get(key)?.bytes ?? 0;
    this.cache.delete(key); this.cache.set(key, entry);
    this.cachedBytes += entry.bytes;
    while (this.cache.size > this.maxEntries || this.cachedBytes > this.maxCacheBytes) {
      const oldest = this.cache.keys().next().value;
      this.cachedBytes -= this.cache.get(oldest).bytes;
      this.cache.delete(oldest);
    }
  }
  async read(relative, { force = false, binary = false, revision = undefined } = {}) {
    const targetRevision = revision === undefined ? this.currentRevision() : revision;
    // A branch read already in flight cannot overwrite a verified immutable revision.
    const cacheKey = (targetRevision ?? 'branch') + ':' + relative;
    const previous = this.cache.get(cacheKey);
    const freshness = entry => this.revisionStale && targetRevision === this.pinnedRevision ? { ...entry, stale: true } : entry;
    if (!force && this.config.mode === 'github' && previous && (targetRevision || Date.now() - previous.time < this.config.cacheTtlMs)) return freshness(previous);
    const key = cacheKey + (force ? ':fresh' : ':regular');
    if (this.pending.has(key)) return this.pending.get(key);
    const operation = (async () => {
      try {
        const data = this.config.mode === 'local' ? await this.local(relative, binary ? MAX_IMAGE : MAX_JSON) : await this.remote(relative, force, binary ? MAX_IMAGE : MAX_JSON, targetRevision);
        let value = data;
        if (!binary) {
          try { value = JSON.parse(data.toString('utf8')); } catch { throw new ApiError(502, 'The content source returned invalid JSON.', 'invalid_source'); }
        }
        const entry = { value, bytes: data.length, time: Date.now(), stale: false, origin: this.config.mode, revision: targetRevision };
        this.save(cacheKey, entry); return freshness(entry);
      } catch (error) {
        // A publish receipt always requires an actual fresh source read.
        if (force || this.config.mode === 'local') throw error;
        if (previous) return { ...previous, stale: true };
        // Once a revision is known, never substitute older deployment content.
        if (this.config.allowSnapshotFallback && !targetRevision) {
          try {
            return await this.snapshot(relative, binary);
          } catch { /* Preserve the remote source error. */ }
        }
        throw error;
      }
    })();
    this.pending.set(key, operation);
    try { return await operation; } finally { this.pending.delete(key); }
  }
  async index(force = false, revision = undefined) {
    if (!force && revision === undefined) {
      try { await this.ensureCurrentRevision(); }
      catch (error) {
        if (!this.pinnedRevision) {
          if (!this.config.allowSnapshotFallback) throw error;
          const result = await this.snapshot('index.json'); validateIndex(result.value); return result;
        }
      }
    }
    const result = await this.read('index.json', { force, revision }); validateIndex(result.value); return result;
  }
  async media(relative) {
    try { await this.ensureCurrentRevision(); }
    catch (error) {
      if (!this.pinnedRevision) {
        if (!this.config.allowSnapshotFallback) throw error;
        return this.snapshot('media/' + relative, true);
      }
    }
    return this.read('media/' + relative, { binary: true });
  }
  async story(slug, { force = false, index = null, revision = undefined } = {}) {
    const manifest = index ?? await this.index(force, revision);
    if (!manifest.value.stories.some(s => s.slug === slug)) throw new ApiError(404, 'This story is not in the published catalogue.', 'story_not_found');
    const result = manifest.origin === 'deployment-snapshot' && !force
      ? await this.snapshot('stories/' + slug + '.json')
      : await this.read('stories/' + slug + '.json', { force, revision: revision === undefined ? manifest.revision : revision });
    try { validateStory(result.value); } catch { throw new ApiError(502, 'The saved lesson does not pass validation.', 'invalid_source'); }
    if (result.value.slug !== slug) throw new ApiError(502, 'The source lesson slug does not match its path.', 'invalid_source');
    return { ...result, stale: result.stale || manifest.stale };
  }
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https: data:; font-src 'self' https: data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
}

function json(res, status, body, { stale = false, origin = null, revision = null } = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (origin) res.setHeader('X-Story-Source', origin);
  if (revision) res.setHeader('X-Story-Commit', revision);
  if (stale) { res.setHeader('X-Content-Stale', 'true'); res.setHeader('Warning', '110 - "Serving a previously retrieved story"'); }
  res.end(JSON.stringify(body));
}

async function requestJson(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) throw new ApiError(415, 'Send the lesson as application/json.', 'unsupported_media_type');
  if (Number(req.headers['content-length']) > MAX_JSON) throw new ApiError(413, 'The lesson exceeds the 1 MB upload limit.', 'body_too_large');
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON) throw new ApiError(413, 'The lesson exceeds the 1 MB upload limit.', 'body_too_large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400, 'The request body is not valid JSON.', 'invalid_json'); }
}

export function createServer(options = {}) {
  const config = {
    mode: options.mode ?? process.env.SOURCE_MODE ?? (process.env.RENDER ? 'github' : 'local'),
    repository: options.repository ?? process.env.CONTENT_REPO ?? 'gheroco/frontend_template',
    branch: options.branch ?? process.env.CONTENT_BRANCH ?? 'apps/story-atlas',
    contentDir: options.contentDir ?? path.join(ROOT, 'content'),
    publicDir: options.publicDir ?? path.join(ROOT, 'public'),
    projectDir: options.projectDir ?? ROOT,
    cacheTtlMs: options.cacheTtlMs ?? 60000,
    revisionTtlMs: options.revisionTtlMs ?? 360000,
    revisionRetryMs: options.revisionRetryMs ?? 60000,
    revisionTimeoutMs: options.revisionTimeoutMs ?? 15000,
    sourceTimeoutMs: options.sourceTimeoutMs ?? 8000,
    allowSnapshotFallback: options.allowSnapshotFallback ?? true,
    publishLimit: options.publishLimit ?? 20,
    logger: options.logger ?? console,
    now: options.now ?? Date.now,
    version: options.version ?? '1.0.2',
  };
  if (!['local', 'github'].includes(config.mode)) throw new Error('SOURCE_MODE must be local or github');
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.repository)) throw new Error('Invalid CONTENT_REPO');
  // Test fixtures can inject their source at construction. This is never a request parameter.
  config.sourceBaseUrl = options.sourceBaseUrl ?? `https://raw.githubusercontent.com/${config.repository}/${encodeURIComponent(config.branch)}/`;
  config.sourceRevisionRoot = options.sourceRevisionRoot ?? `https://raw.githubusercontent.com/${config.repository}/`;
  // An injected fixture source has no implicit connection to the public GitHub API.
  config.refApiUrl = options.refApiUrl ?? (options.sourceBaseUrl ? null : `https://api.github.com/repos/${config.repository}/git/ref/heads/${config.branch.split('/').map(encodeURIComponent).join('/')}`);
  config.smartGitUrl = options.smartGitUrl ?? (options.sourceBaseUrl ? null : `https://github.com/${config.repository}.git/info/refs?service=git-upload-pack`);
  const source = new ContentSource(config);
  let publicationWindow = { start: Date.now(), count: 0 };
  const rate = () => {
    if (Date.now() - publicationWindow.start >= 60000) publicationWindow = { start: Date.now(), count: 0 };
    if (++publicationWindow.count > config.publishLimit) throw new ApiError(429, 'Please wait a minute before verifying another publication.', 'rate_limited');
  };
  const receipt = (story, commit = null) => {
    const digest = storyHash(story);
    return { ok: true, slug: story.slug, url: '/story/' + story.slug, revision: commit ?? 'sha256:' + digest, sha256: digest, counts: counts(story), persisted: true, storage: config.mode === 'github' ? 'github' : 'local-files', source: { mode: config.mode, repository: config.repository, branch: config.branch, commit, path: 'content/stories/' + story.slug + '.json' }, verifiedAt: new Date().toISOString() };
  };
  const server = http.createServer(async (req, res) => {
    securityHeaders(res);
    try {
      const rawPath = (req.url ?? '/').split('?')[0];
      let pathname;
      try { pathname = decodeURIComponent(rawPath); } catch { throw new ApiError(400, 'Invalid URL encoding.', 'invalid_path'); }
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(segment => segment === '..' || segment === '.')) throw new ApiError(403, 'Invalid path.', 'invalid_path');
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (pathname === '/api/health') return json(res, 200, { ok: true, service: 'Story Atlas', version: config.version, storage: config.mode, time: new Date().toISOString() });
        if (pathname === '/api/config') return json(res, 200, { appName: 'Story Atlas', version: config.version, publishingEnabled: true, publishingMode: 'github-verified', apiKeyRequired: false, storage: config.mode === 'github' ? 'GitHub repository' : 'Local content files', progressStorage: 'this-browser', contentSource: config.mode, repository: config.repository, branch: config.branch });
        if (pathname === '/api/publishing-guide') return json(res, 200, { app: 'Story Atlas', repository: config.repository, branch: config.branch, authentication: 'Use the connected GitHub account to commit content. Only content matching this repository branch can be published.', storyPath: 'content/stories/{slug}.json', indexPath: 'content/index.json', mediaPath: 'content/media/{filename}', schemaUrl: '/api/schema', guideUrl: '/PUBLISHING.md', instructionUrl: '/PUBLISHING.md', exampleUrl: '/api/stories/thailand-limestone-islands', steps: ['Create a complete lesson JSON with the story, vocabulary, exercises, media and sources.', 'Use the authenticated GitHub connector to commit the lesson and add its summary to content/index.json on ' + config.branch + '. Preserve existing stories. Upload referenced media into content/media/.', 'POST the full lesson JSON to /api/stories or POST {"slug":"your-story-slug"} to /api/publish. The service compares the submission with the committed source and returns a hash and item counts.', 'GET /api/stories/{slug} and inspect its media and counts before reporting publication complete.'], limits: { maxStoryBytes: MAX_JSON }, notes: ['No bearer secret is needed for verification; authorization comes from the authenticated repository write.', 'This verification API cannot create or overwrite repository files.', 'If the content source is unavailable, publication verification fails; a cached reader response may be explicitly marked stale.'] });
        if (pathname === '/api/schema' || pathname === '/PUBLISHING.md') {
          const filename = pathname === '/api/schema' ? path.join(config.projectDir, 'schema', 'lesson.schema.json') : path.join(config.projectDir, 'PUBLISHING.md');
          let data;
          try { data = await readFile(filename); } catch { throw new ApiError(404, 'Publishing documentation is not available.', 'not_found'); }
          res.setHeader('Content-Type', pathname === '/api/schema' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=300');
          return res.end(req.method === 'HEAD' ? undefined : data);
        }
        if (pathname === '/api/stories') {
          const result = await source.index();
          return json(res, 200, { stories: result.value.stories, total: result.value.stories.length }, result);
        }
        const match = pathname.match(/^\/api\/stories\/([^/]+)$/);
        if (match) {
          if (!validSlug(match[1])) throw new ApiError(400, 'Invalid story slug.', 'invalid_slug');
          const result = await source.story(match[1]);
          return json(res, 200, result.value, result);
        }
        if (pathname.startsWith('/api/')) throw new ApiError(404, 'API endpoint not found.', 'not_found');
        if (pathname.startsWith('/media/')) {
          const relative = pathname.slice(7);
          if (!/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(relative) || relative.split('/').some(x => x.startsWith('.')) || !IMAGE_EXTENSIONS.has(path.extname(relative).toLowerCase())) throw new ApiError(404, 'Image not found.', 'not_found');
          const result = await source.media(relative);
          res.setHeader('Content-Type', MIME[path.extname(relative).toLowerCase()]);
          res.setHeader('Cache-Control', 'public, max-age=300');
          res.setHeader('X-Story-Source', result.origin);
          if (result.revision) res.setHeader('X-Story-Commit', result.revision);
          if (result.stale) res.setHeader('X-Content-Stale', 'true');
          res.setHeader('Content-Length', result.value.length);
          return res.end(req.method === 'HEAD' ? undefined : result.value);
        }
        let relative = pathname === '/' || /^\/(story\/[a-z0-9-]+|library|words|review|practice|speak|add|publish|settings|help)\/?$/.test(pathname) ? 'index.html' : pathname.replace(/^\//, '');
        if (!relative || relative.split('/').some(part => part.startsWith('.'))) throw new ApiError(404, 'Page not found.', 'not_found');
        try {
          const root = await realpath(config.publicDir);
          const resolved = await realpath(path.join(root, relative));
          if (!resolved.startsWith(root + path.sep) || !(await stat(resolved)).isFile()) throw new ApiError(404, 'Page not found.', 'not_found');
          const data = await readFile(resolved);
          res.setHeader('Content-Type', MIME[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream');
          res.setHeader('Cache-Control', relative === 'index.html' ? 'no-cache' : 'public, max-age=300');
          res.setHeader('Content-Length', data.length);
          return res.end(req.method === 'HEAD' ? undefined : data);
        } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(404, 'Page not found.', 'not_found'); }
      }
      if (req.method === 'POST' && ['/api/stories', '/api/publish'].includes(pathname)) {
        if (req.headers.origin) {
          let origin; try { origin = new URL(req.headers.origin); } catch { throw new ApiError(403, 'Invalid request origin.', 'invalid_origin'); }
          if (origin.host !== req.headers.host) throw new ApiError(403, 'Use this site to verify a browser publication.', 'invalid_origin');
        }
        rate();
        const body = await requestJson(req);
        const submitted = pathname === '/api/stories' ? body?.story ?? body : null;
        const slug = submitted ? validateStory(submitted).slug : body?.slug;
        if (!validSlug(slug)) throw new ApiError(400, 'A valid story slug is required.', 'invalid_slug');
        let saved;
        const commit = await source.resolveRevision();
        try {
          const manifest = await source.index(true, commit);
          saved = (await source.story(slug, { force: true, index: manifest, revision: commit })).value;
        } catch (error) {
          if (error.status === 404) throw new ApiError(409, 'Commit this lesson and its catalogue entry through your connected GitHub account first.', 'not_committed');
          throw error;
        }
        if (submitted && storyHash(submitted) !== storyHash(saved)) throw new ApiError(409, 'The submitted lesson does not match the saved repository version. Commit this exact lesson through your connected GitHub account first.', 'content_mismatch');
        source.pinRevision(commit);
        return json(res, 200, receipt(saved, commit));
      }
      res.setHeader('Allow', pathname.startsWith('/api/') ? 'GET, HEAD, POST' : 'GET, HEAD');
      throw new ApiError(405, 'Method not allowed.', 'method_not_allowed');
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      if (error.status === 429) res.setHeader('Retry-After', '60');
      json(res, error instanceof ApiError ? error.status : 500, { ok: false, error: error instanceof ApiError ? error.message : 'An unexpected error occurred.', code: error instanceof ApiError ? error.code : 'internal_error' });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer();
  const portFlag = process.argv.indexOf('--port');
  const hostFlag = process.argv.indexOf('--host');
  const port = Number(process.env.PORT ?? (portFlag >= 0 ? process.argv[portFlag + 1] : 3000));
  const host = hostFlag >= 0 ? process.argv[hostFlag + 1] : '0.0.0.0';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('A valid listening port is required.');
  server.listen(port, host, () => console.log(`Story Atlas listening on port ${port}`));
  const stop = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10000).unref(); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
