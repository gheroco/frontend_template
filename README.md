# Fluent /30

A complete 30-day English speaking studio with Armenian guidance, created from the full course workbook.

## Run and build

Use Node.js 22.13 or later (Node 24 recommended). PDF rendering uses the pinned Apache-2.0-licensed `pdfjs-dist` dependency. The build copies its legacy browser modules, worker, fonts, CMaps, and WASM assets into the static output; no third-party CDN is required.

```sh
npm ci
npm run check
npm run build
```

The production output is `dist/`. Serve that folder with any static web server. `public/` is the source site. Hash-based routes work without a server rewrite.

## Render

Create a **Static Site** with:

- Repository: `gheroco/frontend_template`
- Branch: `apps/fluent-thirty`
- Build command: `node build.mjs`
- Publish directory: `dist`
- No environment variables or backend required

A service worker caches the course shell and course data after the first successful visit. Linked third-party learning material and films require an internet connection. Workbook downloads are deliberately not pre-cached. Update the cache version in `public/sw.js` when changing the app shell.

## Course content

`public/course.json` contains all 30 lessons, the original Armenian instructions, 90 listening/reading questions and their answers, 90 language exercises and their answers, 120 conversation questions, 149 useful expressions, and four optional film practice sessions. The complete PDF and editable Word workbook are linked from the course guide.

`src/build-content.py` can regenerate the course from the original workbook JSON files, provided using its `--source-dir` argument. The checked-in `course.json` is self-contained and needs no generator during deployment.

## Features

- Six timed practice blocks for each day; Day 30 keeps its assessment-first order.
- Editable answers, lesson notes, speaking minutes and checkpoint scores.
- Explicit completion controls and a 30-day progress view.
- Searchable phrases, bookmarks, flashcards and optional browser speech synthesis.
- Role-play scenarios and copyable conversation-coach prompts.
- Movie resources with concrete listening and speaking tasks.
- Local voice recording, playback, downloads and deletion where supported.
- JSON progress backup and restore, with imported data validation.
- Responsive layouts, keyboard focus handling, reduced-motion support and home-screen installation metadata.

## Grammar & books

The Grammar & Books section is linked from the desktop navigation, the mobile Course area, the overview, and every daily language block. `public/grammar-content.json` contains 12 original topics, 48 single-gap exercises with feedback, 36 bilingual examples, 24 speaking prompts, and official Cambridge edition links. These are original course explanations, not copied or parsed Murphy units. The full copyrighted books are not bundled.

The private reader imports a user-selected PDF, up to 60 MB and 800 pages. It extracts selectable page text and available PDF outline destinations, then stores metadata, page text, and the original PDF in separate IndexedDB stores. Imports are committed atomically, deduplicated by SHA-256 content hash, and can be cancelled. Text-poor pages are flagged. Password-protected or copying-restricted files are rejected; the app does not bypass protection. The reader provides whole-book text search, text-size controls, an original-page canvas view, page bookmarks, reading position, and page notes with Markdown export.

PDF text extraction is not OCR or a structured textbook conversion. Layout and reading order may need review; original-page view preserves tables and illustrations. Cambridge online ebooks are read on Cambridge’s platform and are not downloadable PDF inputs for this reader. The included course workbook is an optional import example.

## Storage and privacy

There are no accounts, analytics, tracking scripts or server-side storage. Lesson progress and text answers use this browser's localStorage. Original grammar practice also uses localStorage. Voice recordings and private books use separate IndexedDB databases. Imported PDFs, extracted text and book notes are never uploaded. If recording persistence fails, the interface reports session-only audio; if private-book storage fails, import stops with a clear error rather than claiming that a book is saved.

Progress backup files contain course notes, answers, practice progress, and original grammar progress. Existing version-1 backups remain compatible. Recordings are downloaded individually; private PDFs and book notes are not included in the progress backup. Export book notes from the reader and keep the original PDF. Resetting course progress does not remove recordings or private books. Another device or browser has separate progress until a backup is imported. Browser storage may be removed by clearing browsing data; download important recordings and export a backup periodically.

Microphone use requires HTTPS (or localhost), a supported MediaRecorder implementation, and the user's permission. Media formats are detected at runtime. If the browser or OS interrupts a recording, the clip is marked for review. Browser-generated pronunciation depends on the voices available on the device and is not pronunciation scoring.

## Verification

The build validates all 30 days, resource URL protocols, the presence of every question and answer, all 12 original grammar topics, 48 grammar answers, and grammar links covering all course days. Responsive layout checks cover narrow phone, standard phone, wide phone, tablet and desktop widths. Functional checks cover editing and persistence, lesson navigation, model answers, bookmarks and progress. Real microphone capture and playback should also be checked on the target phone; responsive Chromium inspection is not native iOS Safari validation.
