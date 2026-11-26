/**
 * Private, device-only PDF library. No PDF bytes or extracted text leave the
 * browser. PDF.js and its support files are fetched from this site's own vendor
 * directory; documents are always supplied as data, never as a remote URL.
 *
 * list() returns metadata. get() additionally returns the extracted pages.
 * Imported text is untrusted plain text: callers must escape it before rendering.
 */

const DATABASE = 'fluent-thirty-private-books';
const DATABASE_VERSION = 1;
const MAX_BYTES = 60 * 1024 * 1024;
const MAX_PAGES = 800;
const BOOK_ID = /^pdf-[a-f0-9]{64}$/;
const VENDOR = new URL('./vendor/pdfjs/', import.meta.url);
let pdfLibraryPromise;

function abortError() {
  const error = new Error('Book operation cancelled.');
  error.name = 'AbortError';
  return error;
}

function checkAbort(signal) {
  if (signal?.aborted) throw abortError();
}

function readableError(error, fallback = 'The book could not be saved in this browser.') {
  if (error?.name === 'AbortError') return error;
  if (error?.name === 'QuotaExceededError') {
    return new Error('There is not enough browser storage for this book. Remove an imported book or free some space, then try again.');
  }
  if (['SecurityError', 'InvalidStateError', 'UnknownError', 'NotAllowedError'].includes(error?.name)) {
    return new Error('Private book storage is unavailable in this browser. Try a regular browser tab with website storage enabled.');
  }
  return new Error(fallback, error ? { cause: error } : undefined);
}

function validId(id) {
  if (typeof id !== 'string' || !BOOK_ID.test(id)) throw new Error('This book could not be found.');
  return id;
}

function report(callback, value) {
  if (typeof callback !== 'function') return;
  try {
    const result = callback(value);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch { /* A detached progress UI must not interrupt a local import. */ }
}

function forwardAbort(source, controller) {
  if (!source) return () => {};
  const abort = () => controller.abort();
  if (source.aborted) abort();
  else source.addEventListener('abort', abort, { once: true });
  return () => source.removeEventListener('abort', abort);
}

async function pdfLibrary() {
  if (!pdfLibraryPromise) {
    pdfLibraryPromise = import('./vendor/pdfjs/pdf.js').then(pdf => {
      pdf.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.js', VENDOR).href;
      return pdf;
    }).catch(error => {
      pdfLibraryPromise = null;
      throw new Error('The PDF reader could not load. Connect to the internet and try again.', { cause: error });
    });
  }
  return pdfLibraryPromise;
}

function pdfOptions(data) {
  return {
    data,
    cMapUrl: new URL('cmaps/', VENDOR).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', VENDOR).href,
    wasmUrl: new URL('wasm/', VENDOR).href,
    useWorkerFetch: true,
    disableWorkerRendering: true,
    enableWebGPU: false,
    enableXfa: false,
    stopAtErrors: true,
    verbosity: 0
  };
}

function pdfError(error) {
  if (error?.name === 'AbortError') return error;
  if (error?.name === 'PasswordException') {
    return new Error('This PDF is password-protected. Use a copy that you are allowed to open without a password; this reader does not unlock protected books.');
  }
  if (error?.name === 'InvalidPDFException') {
    return new Error('This file could not be read as a PDF. It may be damaged or incomplete.');
  }
  return error instanceof Error ? error : new Error('This PDF could not be read.');
}

/** All writes resolve only after the complete IndexedDB transaction commits. */
function transaction(database, stores, mode, work, signal) {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = database.transaction(stores, mode); }
    catch (error) { reject(readableError(error)); return; }
    let result, failure, settled = false;
    const cleanup = () => signal?.removeEventListener('abort', cancel);
    const cancel = () => {
      if (settled) return;
      failure = abortError();
      try { tx.abort(); } catch { /* The transaction may already have committed. */ }
    };
    tx.oncomplete = () => { settled = true; cleanup(); resolve(result); };
    tx.onabort = () => {
      settled = true;
      cleanup();
      reject(failure || (signal?.aborted ? abortError() : readableError(tx.error)));
    };
    tx.onerror = () => { /* Request errors abort the whole transaction. */ };
    signal?.addEventListener('abort', cancel, { once: true });
    const fail = error => {
      failure = error;
      try { tx.abort(); } catch { settled = true; cleanup(); reject(error); }
    };
    try { work(tx, value => { result = value; }, fail); }
    catch (error) { fail(error); }
    if (signal?.aborted) cancel();
  });
}

function cleanText(value) {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ');
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Reflow selectable page text conservatively. Only a persistent, clearly
 * separated two-column body is reordered. Tables and ambiguous layouts stay
 * row-based; the original-page view remains the reference for their layout.
 */
function extractPageText(items, viewport) {
  const matrix = viewport.transform;
  const positioned = [];
  for (const item of items) {
    if (typeof item.str !== 'string' || !item.str.trim()) continue;
    const raw = cleanText(item.str);
    const t = item.transform;
    if (!Array.isArray(t) || t.length < 6) continue;
    const x = matrix[0] * t[4] + matrix[2] * t[5] + matrix[4];
    const y = matrix[1] * t[4] + matrix[3] * t[5] + matrix[5];
    const height = Math.max(2, Math.abs(item.height || Math.hypot(t[2], t[3]) || 10));
    positioned.push({
      text: raw.trim(), x, y, height,
      width: Math.max(0, Math.abs(item.width || 0)),
      leadingSpace: /^\s/.test(raw), trailingSpace: /\s$/.test(raw),
      hasEOL: !!item.hasEOL
    });
  }
  if (!positioned.length) return { text: '', paragraphs: [], hasText: false, textPoor: true };

  // Sideways text is safer in the PDF's own text order than in an invented
  // geometric column order. hasEOL is supplied by PDF.js for logical lines.
  if (Math.abs(viewport.rotation || 0) % 180) {
    const lines = []; let current = '';
    for (const item of positioned) {
      current += (current ? ' ' : '') + item.text;
      if (item.hasEOL) { lines.push(current); current = ''; }
    }
    if (current) lines.push(current);
    return textResult(lines);
  }

  positioned.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const item of positioned) {
    let row = null, distance = Infinity;
    for (let i = rows.length - 1; i >= Math.max(0, rows.length - 5); i--) {
      const candidate = rows[i];
      const dy = Math.abs(candidate.y - item.y);
      if (dy <= Math.max(2, Math.min(candidate.height, item.height) * .36) && dy < distance) {
        row = candidate; distance = dy;
      }
    }
    if (!row) { row = { y: item.y, height: item.height, items: [] }; rows.push(row); }
    row.items.push(item);
    row.height = Math.max(row.height, item.height);
  }
  rows.sort((a, b) => a.y - b.y);
  const lines = rows.map(row => {
    row.items.sort((a, b) => a.x - b.x);
    const segments = []; let segment;
    for (const item of row.items) {
      const gap = segment ? item.x - segment.right : 0;
      if (!segment || gap > Math.max(20, row.height * 2.4)) {
        segment = { text: item.text, x: item.x, right: item.x + item.width, trailingSpace: item.trailingSpace };
        segments.push(segment);
      } else {
        const space = gap > Math.max(1.2, row.height * .15) || item.leadingSpace || segment.trailingSpace;
        segment.text += (space ? ' ' : '') + item.text;
        segment.right = Math.max(segment.right, item.x + item.width);
        segment.trailingSpace = item.trailingSpace;
      }
    }
    return { y: row.y, height: row.height, x: segments[0].x, segments, text: segments.map(s => s.text).join('   ') };
  });

  const body = lines.filter(line => line.text.length >= 18);
  const candidates = body.filter(line => {
    if (line.segments.length !== 2) return false;
    const [a, b] = line.segments;
    const middle = (a.right + b.x) / 2;
    return a.text.length >= 18 && b.text.length >= 18 &&
      a.right - a.x >= viewport.width * .18 && b.right - b.x >= viewport.width * .18 &&
      b.x - a.right >= Math.max(20, line.height * 2) &&
      middle > viewport.width * .3 && middle < viewport.width * .7;
  });
  const gutter = candidates.length >= 6 && candidates.length >= body.length * .5
    ? median(candidates.map(line => (line.segments[0].right + line.segments[1].x) / 2)) : null;

  let ordered = lines;
  if (gutter !== null && candidates.every(line => line.segments[0].right < gutter && line.segments[1].x > gutter)) {
    ordered = []; let left = [], right = [];
    const flush = () => { ordered.push(...left, ...right); left = []; right = []; };
    for (const line of lines) {
      if (line.segments.some(s => s.x < gutter && s.right > gutter)) {
        flush(); ordered.push(line); continue;
      }
      for (const segment of line.segments) {
        const target = segment.x >= gutter ? right : left;
        target.push({ ...line, x: segment.x, text: segment.text, segments: [segment] });
      }
    }
    flush();
  }

  const paragraphs = []; let paragraph = '', previous = null;
  for (const line of ordered) {
    const numbered = /^(?:\d+[.)]|[A-Za-z][.)]|[•●▪])\s/.test(line.text);
    const separated = previous && (
      line.y < previous.y - line.height ||
      line.y - previous.y > Math.max(line.height, previous.height) * 1.85 ||
      Math.abs(line.height - previous.height) > Math.max(2, previous.height * .26) ||
      Math.abs(line.x - previous.x) > line.height * 1.5 ||
      line.segments.length > 1 || previous.segments.length > 1 || numbered
    );
    if (separated && paragraph) { paragraphs.push(paragraph); paragraph = ''; }
    paragraph += (paragraph && !paragraph.endsWith('-') ? ' ' : '') + line.text;
    previous = line;
  }
  if (paragraph) paragraphs.push(paragraph);
  return textResult(paragraphs);
}

function textResult(paragraphs) {
  const filtered = paragraphs.map(p => p.trim()).filter(Boolean);
  const text = filtered.join('\n\n');
  const meaningful = (text.match(/[\p{L}\p{N}]/gu) || []).length;
  return { text, paragraphs: filtered, hasText: meaningful > 0, textPoor: meaningful < 40 };
}

async function readOutline(pdf, signal) {
  const source = await pdf.getOutline();
  if (!Array.isArray(source)) return [];
  const references = new Map(); let count = 0;
  async function pageFor(destination) {
    checkAbort(signal);
    let dest = destination;
    if (typeof dest === 'string') dest = await pdf.getDestination(dest);
    if (!Array.isArray(dest) || !dest.length) return null;
    if (Number.isInteger(dest[0])) return dest[0] >= 0 && dest[0] < pdf.numPages ? dest[0] + 1 : null;
    const ref = dest[0];
    if (!ref || !Number.isInteger(ref.num) || !Number.isInteger(ref.gen)) return null;
    const key = `${ref.num}:${ref.gen}`;
    if (!references.has(key)) references.set(key, await pdf.getPageIndex(ref) + 1);
    const page = references.get(key);
    return page >= 1 && page <= pdf.numPages ? page : null;
  }
  async function walk(nodes, depth = 0) {
    if (depth > 30) return [];
    const result = [];
    for (const node of nodes) {
      checkAbort(signal);
      if (++count > 5000) break;
      let page = null;
      try { page = await pageFor(node.dest); } catch (error) { if (signal?.aborted) throw abortError(); }
      result.push({ title: cleanText(node.title).trim().slice(0, 500), page, children: Array.isArray(node.items) ? await walk(node.items, depth + 1) : [] });
    }
    return result;
  }
  return walk(source);
}

export class BookLibrary {
  #databasePromise = null;
  #database = null;
  #writes = new Map();
  #importController = null;
  #importPromise = null;
  #renderController = null;
  #renderQueue = Promise.resolve();
  #renderDocument = null;

  async #open() {
    if (this.#databasePromise) return this.#databasePromise;
    this.#databasePromise = new Promise((resolve, reject) => {
      let request, settled = false;
      try {
        if (!globalThis.indexedDB) throw new Error('IndexedDB unavailable');
        request = indexedDB.open(DATABASE, DATABASE_VERSION);
      } catch (error) {
        reject(readableError(error, 'Private book storage is unavailable in this browser. No book was imported.'));
        return;
      }
      const fail = (error, message) => { if (!settled) { settled = true; reject(readableError(error, message)); } };
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('books')) database.createObjectStore('books', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('files')) database.createObjectStore('files', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('pages')) {
          const pages = database.createObjectStore('pages', { keyPath: ['bookId', 'number'] });
          pages.createIndex('bookId', 'bookId', { unique: false });
        }
      };
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(null, 'Book storage is waiting for another tab. Close other Fluent /30 tabs and try again.');
      request.onsuccess = () => {
        const database = request.result;
        if (settled) { database.close(); return; }
        settled = true;
        this.#database = database;
        database.onversionchange = () => { database.close(); this.#database = null; this.#databasePromise = null; };
        database.onclose = () => { if (this.#database === database) { this.#database = null; this.#databasePromise = null; } };
        resolve(database);
      };
    });
    try { return await this.#databasePromise; }
    catch (error) { this.#databasePromise = null; throw error; }
  }

  #write(id, action) {
    const previous = this.#writes.get(id) || Promise.resolve();
    const current = previous.catch(() => {}).then(action);
    this.#writes.set(id, current);
    current.finally(() => { if (this.#writes.get(id) === current) this.#writes.delete(id); }).catch(() => {});
    return current;
  }

  async list() {
    const database = await this.#open();
    const books = await transaction(database, ['books'], 'readonly', (tx, done) => {
      const request = tx.objectStore('books').getAll();
      request.onsuccess = () => done(request.result);
    });
    return books.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id) {
    validId(id);
    const database = await this.#open();
    return transaction(database, ['books', 'pages'], 'readonly', (tx, done) => {
      let metadata = null, pages = [], finished = 0;
      const finish = () => { if (++finished === 2) done(metadata ? { ...metadata, pages: pages.map(({ bookId, ...page }) => page).sort((a, b) => a.number - b.number) } : null); };
      const bookRequest = tx.objectStore('books').get(id);
      const pageRequest = tx.objectStore('pages').index('bookId').getAll(id);
      bookRequest.onsuccess = () => { metadata = bookRequest.result || null; finish(); };
      pageRequest.onsuccess = () => { pages = pageRequest.result; finish(); };
    });
  }

  async importPdf(file, { onProgress, signal } = {}) {
    if (this.#importController) throw new Error('Another book is being imported. Wait for it to finish or cancel it first.');
    const controller = new AbortController();
    this.#importController = controller;
    const unlink = forwardAbort(signal, controller);
    const promise = this.#import(file, onProgress, controller.signal);
    this.#importPromise = promise;
    try { return await promise; }
    finally {
      unlink();
      if (this.#importController === controller) this.#importController = null;
      if (this.#importPromise === promise) this.#importPromise = null;
    }
  }

  async #import(file, onProgress, signal) {
    checkAbort(signal);
    if (!(file instanceof Blob) || file.size === 0) throw new Error('Choose a non-empty PDF file.');
    if (file.size > MAX_BYTES) throw new Error('This PDF is larger than 60 MB. Choose a smaller PDF so it can be read safely on your phone.');
    if (!globalThis.crypto?.subtle) throw new Error('Private PDF import needs a secure browser connection. Open the HTTPS website and try again.');
    const database = await this.#open();
    report(onProgress, { phase: 'reading', page: 0, total: 0, percent: 0, message: 'Reading your PDF on this device…' });
    const header = new TextDecoder('latin1').decode(await file.slice(0, 1024).arrayBuffer());
    if (!header.includes('%PDF-')) throw new Error('This file does not appear to be a PDF. Choose the original PDF file.');
    checkAbort(signal);
    const bytes = new Uint8Array(await file.arrayBuffer());
    checkAbort(signal);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const id = 'pdf-' + [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
    checkAbort(signal);
    const existing = await this.get(id);
    if (existing) {
      report(onProgress, { phase: 'saving', page: existing.pageCount, total: existing.pageCount, percent: 100, message: 'This book is already in your private library.' });
      return { ...existing, duplicate: true };
    }

    this.#renderController?.abort();
    await this.#renderQueue.catch(() => {});
    await this.#releaseDocument();
    checkAbort(signal);
    const pdfjs = await pdfLibrary();
    checkAbort(signal);
    const loadingTask = pdfjs.getDocument(pdfOptions(bytes));
    const cancel = () => { void loadingTask.destroy().catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    let pdf;
    try {
      pdf = await loadingTask.promise;
      checkAbort(signal);
      if (pdf.numPages > MAX_PAGES) throw new Error('This PDF has more than 800 pages. Import a smaller book or volume.');
      const permissions = await pdf.getPermissions();
      if (Array.isArray(permissions) && !permissions.includes(pdfjs.PermissionFlag.COPY)) {
        throw new Error('This PDF restricts text copying. Choose a PDF that permits text extraction; this reader does not remove document restrictions.');
      }
      const filename = String(file.name || 'Imported book.pdf').slice(0, 255);
      let title = filename.replace(/\.pdf$/i, '').trim().slice(0, 160) || 'My book';
      try {
        const metadata = await pdf.getMetadata();
        const suggested = cleanText(metadata.info?.Title).trim();
        if (suggested && !/^(untitled|document)$/i.test(suggested)) title = suggested.slice(0, 160);
      } catch (error) { if (signal.aborted) throw abortError(); }
      const pages = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        checkAbort(signal);
        const page = await pdf.getPage(number);
        try {
          const viewport = page.getViewport({ scale: 1 });
          const content = await page.getTextContent();
          checkAbort(signal);
          pages.push({ number, ...extractPageText(content.items, viewport), width: viewport.width, height: viewport.height });
        } catch (error) {
          if (signal.aborted) throw abortError();
          throw new Error(`Page ${number} could not be extracted. No partial book was saved. Try a different PDF copy.`, { cause: error });
        } finally { page.cleanup(); }
        report(onProgress, { phase: 'extracting', page: number, total: pdf.numPages, percent: Math.round(number / pdf.numPages * 94), message: `Reading page ${number} of ${pdf.numPages}…` });
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      checkAbort(signal);
      let outline = [];
      try { outline = await readOutline(pdf, signal); }
      catch (error) { if (signal.aborted) throw abortError(); }
      const now = new Date().toISOString();
      const metadata = {
        id, title, filename, bytes: file.size, pageCount: pages.length,
        textPages: pages.filter(p => p.hasText).length,
        textPoorPages: pages.filter(p => p.textPoor).length,
        imageOnlyPages: pages.filter(p => !p.hasText).length,
        createdAt: now, updatedAt: now, lastPage: 1,
        bookmarks: [], notes: {}, outline, extractionVersion: 1
      };
      report(onProgress, { phase: 'saving', page: pages.length, total: pages.length, percent: 97, message: 'Saving the book privately in this browser…' });
      const result = await this.#write(id, () => transaction(database, ['books', 'pages', 'files'], 'readwrite', (tx, done, fail) => {
        const books = tx.objectStore('books');
        const request = books.get(id);
        request.onsuccess = () => {
          // Another tab may have imported the same file during extraction.
          if (request.result) { done({ duplicate: true }); return; }
          try {
            books.add(metadata);
            tx.objectStore('files').add({ id, blob: file });
            const pageStore = tx.objectStore('pages');
            for (const page of pages) pageStore.add({ bookId: id, ...page });
            done({ duplicate: false });
          } catch (error) { fail(readableError(error)); }
        };
      }, signal));
      const saved = result.duplicate ? await this.get(id) : { ...metadata, pages };
      report(onProgress, { phase: 'saving', page: pages.length, total: pages.length, percent: 100, message: result.duplicate ? 'This book is already in your private library.' : 'Your book is saved on this device.' });
      return { ...saved, duplicate: result.duplicate };
    } catch (error) {
      if (signal.aborted) throw abortError();
      throw pdfError(error);
    } finally {
      signal.removeEventListener('abort', cancel);
      await loadingTask.destroy().catch(() => {});
    }
  }

  async update(id, patch) {
    validId(id);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('The book update could not be read.');
    return this.#write(id, async () => {
      const database = await this.#open();
      return transaction(database, ['books'], 'readwrite', (tx, done, fail) => {
        const store = tx.objectStore('books');
        const request = store.get(id);
        request.onsuccess = () => {
          const current = request.result;
          if (!current) { fail(new Error('This book is no longer in this browser. Import it again before saving notes or progress.')); return; }
          const next = { ...current, notes: { ...current.notes }, updatedAt: new Date().toISOString() };
          if (typeof patch.title === 'string') next.title = cleanText(patch.title).trim().slice(0, 160) || current.title;
          if (Number.isInteger(patch.lastPage)) next.lastPage = Math.max(1, Math.min(current.pageCount, patch.lastPage));
          if (Array.isArray(patch.bookmarks)) next.bookmarks = [...new Set(patch.bookmarks.filter(page => Number.isInteger(page) && page >= 1 && page <= current.pageCount))].sort((a, b) => a - b);
          if (patch.notes && typeof patch.notes === 'object' && !Array.isArray(patch.notes)) {
            for (const [key, value] of Object.entries(patch.notes)) {
              const page = Number(key);
              if (!/^\d+$/.test(key) || !Number.isInteger(page) || page < 1 || page > current.pageCount || typeof value !== 'string') continue;
              if (value.trim()) next.notes[page] = value.slice(0, 10000);
              else delete next.notes[page];
            }
          }
          store.put(next);
          done(next);
        };
      });
    });
  }

  async remove(id) {
    validId(id);
    this.#renderController?.abort();
    await this.#renderQueue.catch(() => {});
    if (this.#renderDocument?.id === id) await this.#releaseDocument();
    return this.#write(id, async () => {
      const database = await this.#open();
      return transaction(database, ['books', 'pages', 'files'], 'readwrite', (tx, done) => {
        const books = tx.objectStore('books');
        const existing = books.get(id);
        existing.onsuccess = () => done(!!existing.result);
        books.delete(id);
        tx.objectStore('files').delete(id);
        const pages = tx.objectStore('pages');
        const keys = pages.index('bookId').getAllKeys(id);
        keys.onsuccess = () => { for (const key of keys.result) pages.delete(key); };
      });
    });
  }

  async #releaseDocument() {
    const current = this.#renderDocument;
    this.#renderDocument = null;
    if (current) await current.task.destroy().catch(() => {});
  }

  async #document(id, signal) {
    if (this.#renderDocument?.id === id) return this.#renderDocument.pdf;
    await this.#releaseDocument();
    checkAbort(signal);
    const database = await this.#open();
    const record = await transaction(database, ['files'], 'readonly', (tx, done) => {
      const request = tx.objectStore('files').get(id);
      request.onsuccess = () => done(request.result);
    }, signal);
    if (!record?.blob) throw new Error('The original PDF is no longer available in this browser. Import your file again.');
    const pdfjs = await pdfLibrary();
    checkAbort(signal);
    const data = new Uint8Array(await record.blob.arrayBuffer());
    checkAbort(signal);
    const task = pdfjs.getDocument(pdfOptions(data));
    const cancel = () => { void task.destroy().catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const pdf = await task.promise;
      checkAbort(signal);
      this.#renderDocument = { id, pdf, task };
      return pdf;
    } catch (error) {
      await task.destroy().catch(() => {});
      if (signal.aborted) throw abortError();
      throw pdfError(error);
    } finally { signal.removeEventListener('abort', cancel); }
  }

  async renderPage(id, pageNumber, canvas, { width = 600, signal } = {}) {
    validId(id);
    if (!canvas || typeof canvas.getContext !== 'function') throw new Error('The page display is unavailable.');
    this.#renderController?.abort();
    const controller = new AbortController();
    this.#renderController = controller;
    const unlink = forwardAbort(signal, controller);
    const work = this.#renderQueue.catch(() => {}).then(async () => {
      checkAbort(controller.signal);
      const pdf = await this.#document(id, controller.signal);
      checkAbort(controller.signal);
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) throw new Error('This page is outside the book.');
      const page = await pdf.getPage(pageNumber);
      let task;
      const cancel = () => task?.cancel();
      controller.signal.addEventListener('abort', cancel, { once: true });
      try {
        checkAbort(controller.signal);
        const original = page.getViewport({ scale: 1 });
        const requestedWidth = Math.max(1, Math.min(1600, Number(width) || 600));
        const viewport = page.getViewport({ scale: requestedWidth / original.width });
        // Limit the canvas footprint on phones, including unusually tall pages.
        const density = Math.min(2, Number(globalThis.devicePixelRatio) || 1, Math.sqrt(4_000_000 / (viewport.width * viewport.height)));
        canvas.width = Math.max(1, Math.floor(viewport.width * density));
        canvas.height = Math.max(1, Math.floor(viewport.height * density));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = 'auto';
        canvas.style.maxWidth = '100%';
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('This browser could not create the page image. Use the text view instead.');
        const pdfjs = await pdfLibrary();
        checkAbort(controller.signal);
        task = page.render({ canvasContext: context, viewport, transform: density === 1 ? null : [density, 0, 0, density, 0, 0], annotationMode: pdfjs.AnnotationMode.DISABLE });
        await task.promise;
        checkAbort(controller.signal);
        return { width: viewport.width, height: viewport.height, pageNumber };
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'RenderingCancelledException') throw abortError();
        throw pdfError(error);
      } finally {
        controller.signal.removeEventListener('abort', cancel);
        page.cleanup();
      }
    });
    this.#renderQueue = work.catch(() => {});
    try { return await work; }
    finally { unlink(); if (this.#renderController === controller) this.#renderController = null; }
  }

  /** Release workers and active operations; this instance can be used again. */
  async dispose() {
    this.#importController?.abort();
    this.#renderController?.abort();
    await Promise.allSettled([this.#importPromise, this.#renderQueue].filter(Boolean));
    await this.#releaseDocument();
  }
}
