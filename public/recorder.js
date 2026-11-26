/**
 * Local speech practice. No audio ever leaves this browser through this module.
 * API: new AudioPractice({ onStatus(message), onChange() }); start(day) -> boolean;
 * stop() -> metadata|null; list(day?) -> newest-first metadata[]; getBlob(id)
 * -> Blob|null; remove(id) -> boolean. `active`, `elapsedSeconds`, `supported`
 * are getters. Call stop() before leaving the lesson. Microphone access requires
 * an explicit user action and HTTPS. Playback/download URLs are owned by the UI.
 * IndexedDB persistence depends on browser storage; `storage: 'session'` clips
 * must be downloaded before closing the tab. `interrupted: true` marks a clip
 * stopped unexpectedly or without the browser's final stop event; listen back
 * before relying on it. Clearing site data removes clips.
 */

const DB_NAME = 'fluent-thirty-audio';
const STORE_NAME = 'clips';
const MAX_SECONDS = 600;
const MIME_TYPES = [
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

function stopTracks(stream) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try { track.stop(); } catch { /* A track may already have ended. */ }
  }
}

function metadata(clip) {
  if (!clip) return null;
  const { id, day, createdAt, duration, mimeType, size, storage = 'device', interrupted = false } = clip;
  return { id, day, createdAt, duration, mimeType, size, storage, interrupted };
}

function microphoneError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Microphone access was not allowed. Enable it in your browser settings, then try again. You can also record with your phone’s voice recorder.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No microphone was found. Connect a microphone or use your phone’s voice recorder.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Your microphone is unavailable or being used by another app. Close that app and try again.';
    case 'SecurityError':
      return 'This browser has blocked microphone access. Open the secure website directly in Safari or Chrome.';
    case 'AbortError':
      return 'The microphone could not start. Please try again.';
    default:
      return 'Recording could not start in this browser. Please try again or use your phone’s voice recorder.';
  }
}

export class AudioPractice {
  constructor({ onStatus = () => {}, onChange = () => {} } = {}) {
    this._onStatus = onStatus;
    this._onChange = onChange;
    this._session = null;
    this._requesting = false;
    this._requestToken = 0;
    this._memory = new Map();
    this._dbPromise = null;
    this._dbUnavailable = false;
    this._lastDuration = 0;
    this._readWarningShown = false;
    // A route change should explicitly await stop(). This additionally releases
    // the microphone when the browser navigates away from the entire app.
    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('pagehide', () => { void this.stop(); });
    }
  }

  get supported() {
    return globalThis.isSecureContext !== false
      && typeof globalThis.MediaRecorder === 'function'
      && typeof globalThis.navigator?.mediaDevices?.getUserMedia === 'function';
  }

  get active() {
    return this._requesting || Boolean(this._session && !this._session.finished);
  }

  get elapsedSeconds() {
    if (!this._session) return this._lastDuration;
    const end = this._session.stoppedAt || Date.now();
    return Math.max(0, Math.floor((end - this._session.startedAt) / 1000));
  }

  _status(message) {
    try {
      const result = this._onStatus(message);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch { /* UI callbacks must not lose audio. */ }
  }

  _changed() {
    try {
      const result = this._onChange();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch { /* The recording can remain usable if a UI callback fails. */ }
  }

  async start(day) {
    const lessonDay = Number(day);
    if (!Number.isInteger(lessonDay) || lessonDay < 1 || lessonDay > 30) {
      this._status('Choose a lesson from Day 1 to Day 30 before recording.');
      return false;
    }
    if (this.active) {
      this._status('Finish the current recording before starting another one.');
      return false;
    }
    if (!this.supported) {
      this._status('Recording is not available here. Open the secure website in Safari or Chrome, or use your phone’s voice recorder.');
      return false;
    }

    const token = ++this._requestToken;
    this._requesting = true;
    this._lastDuration = 0;
    this._status('Allow microphone access to start your recording.');
    this._changed();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      // stop() may have been called while the permission dialog was open.
      if (token !== this._requestToken) {
        stopTracks(stream);
        return false;
      }

      let mimeType = '';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        mimeType = MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type)) || '';
      }
      let recorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        // Some browsers advertise a format but reject its options at runtime.
        recorder = new MediaRecorder(stream);
      }
      const session = {
        recorder, stream, day: lessonDay, chunks: [], startedAt: Date.now(),
        createdAt: new Date().toISOString(), stoppedAt: null, finished: false,
        finalizing: false, stopRequested: false, limitTimer: null, stopTimer: null,
        error: false, resolve: null, promise: null,
      };
      session.promise = new Promise(resolve => { session.resolve = resolve; });
      recorder.ondataavailable = event => {
        if (!session.finished && event.data && event.data.size > 0) session.chunks.push(event.data);
      };
      recorder.onstop = () => {
        // A device/OS interruption can stop a recorder without an error event.
        if (!session.stopRequested) session.error = true;
        void this._finish(session);
      };
      recorder.onerror = () => {
        // A late event from an old recorder must not stop a newer recording.
        if (session.finished || this._session !== session) return;
        session.error = true;
        this._status('Recording was interrupted. Saving any audio captured so far.');
        void this.stop();
      };
      this._session = session;
      this._requesting = false;
      recorder.start(1000);
      session.limitTimer = setTimeout(() => {
        if (this._session === session && !session.finished) {
          this._status('The 10-minute recording limit was reached. Saving your clip.');
          void this.stop();
        }
      }, MAX_SECONDS * 1000);
      this._status('Recording. Speak naturally; press Stop when you finish.');
      this._changed();
      return true;
    } catch (error) {
      stopTracks(stream);
      if (token === this._requestToken) {
        this._requesting = false;
        if (this._session) {
          clearTimeout(this._session.limitTimer);
          clearTimeout(this._session.stopTimer);
          this._session.finished = true;
          this._session.resolve(null);
          this._session = null;
        }
        this._status(microphoneError(error));
        this._changed();
      }
      return false;
    }
  }

  async stop() {
    if (this._requesting) {
      ++this._requestToken;
      this._requesting = false;
      this._status('Recording request cancelled.');
      this._changed();
    }
    const session = this._session;
    if (!session) return null;
    if (session.stopRequested || session.finalizing) return session.promise;
    session.stopRequested = true;
    session.stoppedAt = Date.now();
    clearTimeout(session.limitTimer);
    this._status('Saving your recording…');
    // Guard against a browser failing to emit its final stop event. Normally
    // onstop runs immediately after the final dataavailable event.
    session.stopTimer = setTimeout(() => {
      if (session.finished || session.finalizing) return;
      session.error = true;
      void this._finish(session);
    }, 10000);
    try {
      if (session.recorder.state !== 'inactive') session.recorder.stop();
    } catch {
      session.error = true;
      void this._finish(session);
    } finally {
      stopTracks(session.stream);
    }
    this._changed();
    return session.promise;
  }

  async _finish(session) {
    if (session.finalizing || session.finished) return session.promise;
    session.finalizing = true;
    session.stoppedAt ||= Date.now();
    clearTimeout(session.limitTimer);
    clearTimeout(session.stopTimer);
    stopTracks(session.stream);
    let saved = null;
    try {
      const mimeType = session.recorder.mimeType || session.chunks[0]?.type || 'audio/webm';
      const blob = new Blob(session.chunks, { type: mimeType });
      if (!blob.size) {
        this._status('No audio was captured. Please check microphone permission and try a longer recording.');
      } else {
        const clip = {
          id: typeof globalThis.crypto?.randomUUID === 'function'
            ? crypto.randomUUID()
            : `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          day: session.day,
          createdAt: session.createdAt,
          duration: Math.max(0.1, Math.round((session.stoppedAt - session.startedAt) / 100) / 10),
          mimeType, size: blob.size, storage: 'device', interrupted: session.error, blob,
        };
        try {
          await this._operation('readwrite', store => store.put(clip));
          this._status(session.error
            ? 'Your interrupted recording was saved on this device. Listen back to check it.'
            : 'Recording saved on this device. Listen back or download a copy.');
        } catch {
          clip.storage = 'session';
          this._memory.set(clip.id, clip);
          this._status('Browser storage is unavailable or full. Your clip is available in this tab only—download it before leaving.');
        }
        saved = metadata(clip);
        this._lastDuration = Math.floor(clip.duration);
      }
    } catch {
      this._status('The browser could not create an audio file. Please try again or use your phone’s voice recorder.');
    } finally {
      session.finished = true;
      session.chunks = [];
      session.recorder.ondataavailable = null;
      session.recorder.onstop = null;
      session.recorder.onerror = null;
      if (this._session === session) this._session = null;
      session.resolve(saved);
      this._changed();
    }
    return saved;
  }

  async list(day) {
    const targetDay = day === undefined || day === null ? null : Number(day);
    let stored = [];
    try {
      stored = await this._operation('readonly', store => targetDay === null
        ? store.getAll()
        : store.index('day').getAll(targetDay));
    } catch {
      this._warnRead();
    }
    const combined = new Map((stored || []).map(clip => [clip.id, clip]));
    for (const [id, clip] of this._memory) {
      if (targetDay === null || clip.day === targetDay) combined.set(id, clip);
    }
    return [...combined.values()]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(metadata);
  }

  async getBlob(id) {
    if (this._memory.has(id)) return this._memory.get(id).blob;
    try {
      const clip = await this._operation('readonly', store => store.get(String(id)));
      return clip?.blob || null;
    } catch {
      this._warnRead();
      return null;
    }
  }

  async remove(id) {
    const inMemory = this._memory.has(id);
    try {
      await this._operation('readwrite', store => store.delete(String(id)));
      this._memory.delete(id);
      this._status('Recording removed from this device.');
      this._changed();
      return true;
    } catch {
      if (inMemory) {
        this._memory.delete(id);
        this._status('Temporary recording removed.');
        this._changed();
        return true;
      }
      this._status('The browser could not remove this recording. Please try again.');
      return false;
    }
  }

  _warnRead() {
    if (this._readWarningShown) return;
    this._readWarningShown = true;
    this._status('Saved recordings are unavailable in this browser session. New clips can still be downloaded before closing the tab.');
  }

  _openDB() {
    if (this._dbUnavailable || !globalThis.indexedDB) {
      return Promise.reject(new Error('Browser audio storage is unavailable.'));
    }
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => fail(new Error('Audio storage did not open.')), 6000);
      const fail = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this._dbUnavailable = true;
        reject(error);
      };
      let request;
      try { request = indexedDB.open(DB_NAME, 1); } catch (error) { fail(error); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('day', 'day', { unique: false });
        }
      };
      request.onerror = () => fail(request.error || new Error('Audio storage could not open.'));
      request.onblocked = () => fail(new Error('Audio storage is blocked by another tab.'));
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        settled = true;
        clearTimeout(timer);
        const db = request.result;
        db.onversionchange = () => { db.close(); this._dbPromise = null; };
        resolve(db);
      };
    });
    return this._dbPromise;
  }

  async _operation(mode, operation) {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      let transaction;
      let result;
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error || new Error('Audio storage operation failed.'));
      };
      const timer = setTimeout(() => {
        try { transaction?.abort(); } catch { /* It may already be complete. */ }
        fail(new Error('Audio storage operation timed out.'));
      }, 6000);
      try {
        transaction = db.transaction(STORE_NAME, mode);
        const request = operation(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => fail(request.error);
        transaction.oncomplete = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(result);
        };
        transaction.onerror = () => fail(transaction.error);
        transaction.onabort = () => fail(transaction.error);
      } catch (error) { fail(error); }
    });
  }
}
