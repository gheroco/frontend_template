#!/usr/bin/env node
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, validateStory } from '../server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/validate-content.mjs [--content-dir PATH]\nValidates lessons, catalogue summaries, prose parity, answer keys, references and local image files. No network requests are made.');
  process.exit(0);
}
let contentDir = path.join(ROOT, 'content');
if (args.length) {
  if (args.length !== 2 || args[0] !== '--content-dir') {
    console.error('Use --help for supported arguments.');
    process.exit(2);
  }
  contentDir = path.resolve(args[1]);
}
const errors = [];
const warnings = [];
const error = (label, message) => errors.push(label + ': ' + message);
const warning = (label, message) => warnings.push(label + ': ' + message);
const equal = (left, right) => canonicalJson(left) === canonicalJson(right);
const presentText = value => typeof value === 'string' && value.trim().length > 0;
const schema = JSON.parse(await readFile(path.join(ROOT, 'schema/lesson.schema.json'), 'utf8'));

function resolveRef(ref) {
  if (!ref.startsWith('#/')) throw new Error('Only local schema references are supported.');
  return ref.slice(2).split('/').reduce((node, key) => node[key.replace(/~1/g, '/').replace(/~0/g, '~')], schema);
}

// Implements the small, explicit JSON Schema subset used by lesson.schema.json.
// Additional semantic checks below cover constraints that JSON Schema cannot express.
function visit(value, rule, label, output) {
  const fail = message => output.push(label + ': ' + message);
  if (rule.$ref) visit(value, resolveRef(rule.$ref), label, output);
  if (rule.oneOf) {
    const matches = rule.oneOf.map(candidate => {
      const candidateErrors = [];
      visit(value, candidate, label, candidateErrors);
      return candidateErrors;
    });
    if (matches.filter(result => result.length === 0).length !== 1) fail('does not match exactly one permitted structure');
  }
  if (rule.allOf) for (const candidate of rule.allOf) visit(value, candidate, label, output);
  if (Object.hasOwn(rule, 'const') && !equal(value, rule.const)) fail('must equal ' + JSON.stringify(rule.const));
  if (rule.enum && !rule.enum.some(candidate => equal(value, candidate))) fail('is not an allowed value');
  if (rule.type) {
    const valid = rule.type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
      : rule.type === 'array' ? Array.isArray(value)
      : rule.type === 'integer' ? Number.isInteger(value)
      : rule.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
      : typeof value === rule.type;
    if (!valid) { fail('must be ' + rule.type); return; }
  }
  if (typeof value === 'string') {
    if (rule.minLength !== undefined && value.length < rule.minLength) fail('is too short');
    if (rule.minLength > 0 && !value.trim()) fail('must not contain only whitespace');
    if (rule.maxLength !== undefined && value.length > rule.maxLength) fail('is too long');
    if (rule.pattern && !new RegExp(rule.pattern, 'u').test(value)) fail('does not match the required pattern');
    if (rule.format === 'uri') {
      try {
        const url = new URL(value);
        if (url.username || url.password) fail('must not contain credentials');
      } catch { fail('must be an absolute URL'); }
    }
    if (rule.format === 'date-time' && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))) fail('must be an ISO 8601 timestamp with a timezone');
  }
  if (typeof value === 'number') {
    if (rule.minimum !== undefined && value < rule.minimum) fail('is below the minimum');
    if (rule.maximum !== undefined && value > rule.maximum) fail('is above the maximum');
  }
  if (Array.isArray(value)) {
    if (rule.minItems !== undefined && value.length < rule.minItems) fail('has too few items');
    if (rule.maxItems !== undefined && value.length > rule.maxItems) fail('has too many items');
    if (rule.uniqueItems && new Set(value.map(canonicalJson)).size !== value.length) fail('contains duplicate items');
    if (rule.items) value.forEach((item, index) => visit(item, rule.items, label + '[' + index + ']', output));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of rule.required ?? []) if (!Object.hasOwn(value, key)) fail('missing required property ' + key);
    for (const [key, child] of Object.entries(rule.properties ?? {})) if (Object.hasOwn(value, key)) visit(value[key], child, label + '.' + key, output);
    if (rule.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!Object.hasOwn(rule.properties ?? {}, key)) fail('unknown property ' + key);
    }
  }
}

function uniqueIds(items, label) {
  const seen = new Set();
  for (const item of items ?? []) {
    if (!item || !presentText(item.id)) continue;
    if (seen.has(item.id)) error(label, 'duplicate id ' + item.id);
    seen.add(item.id);
  }
  return seen;
}

function markdownLinks(text, sourceUrls) {
  // Parse balanced link destinations so source URLs containing parentheses survive.
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const image = text[i] === '!' && text[i + 1] === '[';
    const start = image ? i + 1 : i;
    if (text[start] !== '[') { result += text[i]; continue; }
    const close = text.indexOf('](', start + 1);
    if (close < 0 || text.slice(start, close).includes('\n')) { result += text[i]; continue; }
    let depth = 1;
    let end = close + 2;
    for (; end < text.length && depth > 0; end++) {
      if (text[end] === '\\') { end++; continue; }
      if (text[end] === '(') depth++;
      if (text[end] === ')') depth--;
    }
    if (depth !== 0) { result += text[i]; continue; }
    const label = text.slice(start + 1, close);
    const destination = text.slice(close + 2, end - 1).trim().replace(/^<|>$/g, '');
    const url = destination.split(/\s+"/)[0];
    if (!image && !sourceUrls.has(url)) result += label;
    i = end - 1;
  }
  return result;
}

function proseFromMarkdown(markdown, sourceUrls) {
  return markdownLinks(markdown, sourceUrls)
    .replace(/^ {0,3}#{1,6}\s.*$/gm, '')
    .replace(/^\[\^[^\]]+\]:.*$/gm, '')
    .replace(/\[\^[^\]]+\]/g, '')
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, '')
    .replace(/^\s*(?:>\s*)?(?:[-+*]|\d+[.)])\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*|__|(?<!\w)[*_]|[*_](?!\w)/g, '')
    .replace(/\x60/g, '')
    .replace(/\\([\\*_[\]()#>+-])/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+·\s+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function checkProse(story, label) {
  if (!presentText(story.originalMarkdown) || !Array.isArray(story.sections)) return;
  if (/[]/u.test(story.originalMarkdown)) error(label, 'originalMarkdown still contains a ChatGPT citation or image widget; replace it with ordinary source links/media');
  const sourceUrls = new Set((story.sources ?? []).map(item => item.url));
  const paragraphs = [];
  for (const section of story.sections) {
    if (Array.isArray(section.blocks)) {
      const blockParagraphs = section.blocks.filter(block => block.type === 'paragraph').map(block => block.text);
      const blockItems = section.blocks.filter(block => ['bullets', 'list'].includes(block.type)).flatMap(block => block.items ?? []);
      if (!equal(section.paragraphs ?? [], blockParagraphs)) error(label + '.sections.' + section.id, 'paragraphs differ from paragraph blocks');
      if (!equal(section.bullets ?? [], blockItems)) error(label + '.sections.' + section.id, 'bullets differ from list blocks');
      for (const block of section.blocks) paragraphs.push(...(block.type === 'paragraph' ? [block.text] : block.items ?? []));
    } else {
      paragraphs.push(...(section.paragraphs ?? []), ...(section.bullets ?? []));
    }
  }
  if (paragraphs.some(item => typeof item !== 'string')) return;
  const original = proseFromMarkdown(story.originalMarkdown, sourceUrls);
  const rendered = proseFromMarkdown(paragraphs.join('\n\n'), sourceUrls);
  if (original !== rendered) {
    const complex = /(?:^\s*\|.+\|\s*$|^\s*~~~|^\s*\x60{3}|<\w|\\\[|\$\$)/m.test(story.originalMarkdown);
    if (complex) {
      warning(label, 'complex Markdown prevents a reliable automatic prose comparison; manually verify originalMarkdown against ordered section blocks');
    } else {
      const left = original.split(' ');
      const right = rendered.split(' ');
      let first = 0;
      while (first < Math.min(left.length, right.length) && left[first] === right[first]) first++;
      error(label, 'originalMarkdown and ordered section prose differ near word ' + (first + 1) + ' (original: ' + JSON.stringify(left.slice(first, first + 10).join(' ')) + '; sections: ' + JSON.stringify(right.slice(first, first + 10).join(' ')) + ')');
    }
  }
}

function imageInfo(bytes, extension) {
  const hex = bytes.subarray(0, 8).toString('hex');
  if (['.jpg', '.jpeg'].includes(extension)) {
    if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return null;
    let position = 2;
    const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (position + 3 < bytes.length) {
      if (bytes[position] !== 255) break;
      while (bytes[position] === 255) position++;
      const marker = bytes[position++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (position + 1 >= bytes.length) break;
      const size = bytes.readUInt16BE(position);
      if (size < 2 || position + size > bytes.length) break;
      if (frameMarkers.has(marker) && size >= 7) return {width:bytes.readUInt16BE(position + 5),height:bytes.readUInt16BE(position + 3)};
      position += size;
    }
    return null;
  }
  if (extension === '.png') return hex === '89504e470d0a1a0a' && bytes.length >= 24 ? {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)} : null;
  if (extension === '.gif') return /^(GIF87a|GIF89a)$/.test(bytes.subarray(0, 6).toString('ascii')) && bytes.length >= 10 ? {width:bytes.readUInt16LE(6),height:bytes.readUInt16LE(8)} : null;
  if (extension === '.webp') return bytes.length >= 20 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP' ? {} : null;
  if (extension === '.avif') return bytes.length >= 16 && bytes.subarray(4, 8).toString('ascii') === 'ftyp' && /avif|avis/.test(bytes.subarray(8, 64).toString('ascii')) ? {} : null;
  if (extension === '.svg') {
    const text = bytes.toString('utf8');
    return /<svg(?:\s|>)/i.test(text) && !/<script(?:\s|>)/i.test(text) ? {} : null;
  }
  return null;
}

const checkedMedia = new Map();
async function checkMedia(media, label) {
  if (!media || typeof media.url !== 'string') return;
  if (!presentText(media.credit) || !presentText(media.license)) error(label, 'image attribution and license/permission are required');
  if (/^CC\s/i.test(media.license ?? '') && (!media.licenseUrl || !media.sourceUrl)) error(label, 'Creative Commons images require their source page and license URL');
  if (!media.url.startsWith('/media/')) {
    if (/^https:\/\//.test(media.url)) warning(label, 'external image is not self-contained; save an authorized copy to content/media and verify it after publication');
    return;
  }
  const relative = media.url.slice('/media/'.length);
  if (!relative || relative.includes('\\') || relative.split('/').some(part => !part || part.startsWith('.'))) {
    error(label, 'invalid local image path'); return;
  }
  let info = checkedMedia.get(media.url);
  if (!info) {
    try {
      const mediaRoot = await realpath(path.join(contentDir, 'media'));
      const resolved = await realpath(path.join(mediaRoot, relative));
      if (!resolved.startsWith(mediaRoot + path.sep)) throw new Error('image path escapes content/media');
      const size = (await stat(resolved)).size;
      if (size <= 0 || size > 8 * 1024 * 1024) throw new Error('image must be nonempty and at most 8 MiB');
      const bytes = await readFile(resolved);
      info = imageInfo(bytes, path.extname(relative).toLowerCase());
      if (!info) throw new Error('image bytes do not match the file extension or supported format');
      if ((info.width !== undefined && info.width <= 0) || (info.height !== undefined && info.height <= 0)) throw new Error('image has invalid dimensions');
      checkedMedia.set(media.url, info);
    } catch (cause) {
      error(label, cause.message); return;
    }
  }
  if (media.width !== undefined && info.width !== undefined && media.width !== info.width) error(label, 'declared width does not match the image');
  if (media.height !== undefined && info.height !== undefined && media.height !== info.height) error(label, 'declared height does not match the image');
}

async function readJson(filename, label) {
  try {
    const bytes = await readFile(filename);
    if (bytes.length > 1024 * 1024) error(label, 'exceeds the 1 MiB JSON limit');
    return JSON.parse(bytes.toString('utf8'));
  } catch (cause) {
    error(label, 'could not read valid JSON: ' + cause.message);
    return null;
  }
}

const index = await readJson(path.join(contentDir, 'index.json'), 'content/index.json');
const stories = new Map();
let files = [];
try { files = await readdir(path.join(contentDir, 'stories'), {withFileTypes:true}); }
catch (cause) { if (cause.code !== 'ENOENT') error('content/stories', cause.message); }

for (const file of files) {
  if (file.name.startsWith('.')) continue;
  if (!file.isFile() || !file.name.endsWith('.json')) { error('content/stories/' + file.name, 'only flat <slug>.json story files are supported'); continue; }
  const label = 'content/stories/' + file.name;
  const story = await readJson(path.join(contentDir, 'stories', file.name), label);
  if (!story) continue;
  const schemaErrorStart = errors.length;
  visit(story, schema, label, errors);
  const structurallyValid = errors.length === schemaErrorStart;
  try { validateStory(story); } catch (cause) { error(label, 'runtime validation: ' + cause.message); }
  if (typeof story !== 'object' || Array.isArray(story)) continue;
  if (story.slug !== file.name.slice(0, -5)) error(label, 'slug must match the filename');
  if (stories.has(story.slug)) error(label, 'duplicate story slug');
  stories.set(story.slug, story);
  if (!structurallyValid) continue;
  for (const key of ['sections','vocabulary','quiz','cloze','speaking','grammar','sources','media']) if (Array.isArray(story[key])) uniqueIds(story[key], label + '.' + key);
  const sourceIds = new Set((Array.isArray(story.sources) ? story.sources : []).map(item => item?.id));
  for (const section of Array.isArray(story.sections) ? story.sections : []) {
    if (!section || typeof section !== 'object') continue;
    for (const id of Array.isArray(section.sourceIds) ? section.sourceIds : []) if (!sourceIds.has(id)) error(label + '.sections.' + section.id, 'unknown sourceId ' + id);
  }
  for (const question of Array.isArray(story.quiz) ? story.quiz : []) {
    if (question && (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex >= (question.options?.length ?? 0))) error(label + '.quiz.' + question.id, 'correctIndex must select an existing option');
  }
  for (const item of Array.isArray(story.cloze) ? story.cloze : []) {
    if (!item) continue;
    if (typeof item.sentence === 'string' && (item.sentence.match(/____/g) ?? []).length !== 1) error(label + '.cloze.' + item.id, 'sentence must contain exactly one ____ blank');
    if (typeof item.answer === 'string' && /_{2,}/.test(item.answer)) error(label + '.cloze.' + item.id, 'answer must contain the actual answer, not a blank');
  }
  for (const item of Array.isArray(story.grammar) ? story.grammar : []) {
    if (item && Boolean(item.exercise) !== Boolean(item.answer)) error(label + '.grammar.' + item.id, 'exercise and answer must be supplied together');
  }
  if (Array.isArray(story.sections) && story.sections.every(item => item && typeof item === 'object')) checkProse(story, label);
  for (const media of Array.isArray(story.media) ? story.media : []) await checkMedia(media, label + '.media.' + (media?.id ?? '?'));
}

if (index) {
  if (index.version !== 1) error('content/index.json', 'version must equal 1');
  if (!Array.isArray(index.stories)) error('content/index.json', 'stories must be an array');
  else {
    const slugs = new Set();
    const summaryFields = ['slug','title','subtitle','description','category','level','language','estimatedMinutes','tags','media','createdAt'];
    for (const item of index.stories) {
      if (!item || typeof item !== 'object' || !presentText(item.slug)) { error('content/index.json', 'each summary requires a slug'); continue; }
      const label = 'content/index.json:' + item.slug;
      if (slugs.has(item.slug)) error(label, 'duplicate catalogue slug');
      slugs.add(item.slug);
      const story = stories.get(item.slug);
      if (!story) { error(label, 'catalogue entry has no matching story file'); continue; }
      for (const field of summaryFields) if (!equal(item[field], story[field])) error(label, 'summary field ' + field + ' differs from the story');
      for (const field of ['excerpt','updatedAt']) if (Object.hasOwn(item, field) && !equal(item[field], story[field])) error(label, 'summary field ' + field + ' differs from the story');
      if (item.vocabularyCount !== story.vocabulary?.length) error(label, 'vocabularyCount must equal vocabulary.length');
      if (item.questionCount !== story.quiz?.length) error(label, 'questionCount must equal quiz.length');
    }
    for (const slug of stories.keys()) if (!slugs.has(slug)) error('content/index.json', 'story ' + slug + ' is missing from the catalogue');
  }
}

for (const message of warnings) console.warn('WARNING ' + message);
if (errors.length) {
  for (const message of errors.slice(0, 80)) console.error('ERROR ' + message);
  if (errors.length > 80) console.error('... ' + (errors.length - 80) + ' additional errors');
  console.error('Content validation failed with ' + errors.length + ' error(s).');
  process.exitCode = 1;
} else {
  console.log('Content validation passed: ' + stories.size + ' story/stories, ' + checkedMedia.size + ' local image(s), ' + warnings.length + ' warning(s).');
  if (stories.size === 0) console.log('The empty catalogue is valid; no lesson files or media are required.');
}
