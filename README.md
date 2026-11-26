# Fluent /30

A complete 30-day English speaking studio with Armenian guidance, created from the full course workbook.

## Run and build

This site has no npm dependencies. Use Node.js 20 or later.

```sh
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

## Storage and privacy

There are no accounts, analytics, tracking scripts or server-side storage. Lesson progress and text answers use this browser's localStorage. Voice recordings use IndexedDB. They are not sent to a server. If persistent storage fails, the interface reports that the data is only available for the current session.

Progress backup files contain notes, answers and practice progress. Recordings are downloaded individually and are not included in the progress backup. Another device or browser has separate progress until a backup is imported. Browser storage may be removed by clearing browsing data; download important recordings and export a backup periodically.

Microphone use requires HTTPS (or localhost), a supported MediaRecorder implementation, and the user's permission. Media formats are detected at runtime. If the browser or OS interrupts a recording, the clip is marked for review. Browser-generated pronunciation depends on the voices available on the device and is not pronunciation scoring.

## Verification

The build validates all 30 days, resource URL protocols, and the presence of every question and answer. Responsive layout checks cover narrow phone, standard phone, wide phone, tablet and desktop widths. Functional checks cover editing and persistence, lesson navigation, model answers, bookmarks and progress. Real microphone capture and playback should also be checked on the target phone; responsive Chromium inspection is not native iOS Safari validation.
