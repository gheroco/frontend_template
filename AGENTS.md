# Story Atlas working instructions

These instructions apply to this application directory and its files.

## Scope and repository

- This app uses **gheroco/frontend_template**, branch **apps/story-atlas**.
- Keep its work isolated from main and every other app branch.
- Read **README.md** and **PUBLISHING.md** before changing publishing behavior or adding content.
- Read the current user request and live **/api/config** before an external publication. Follow the user’s existing authorization; do not invent an extra approval gate for work already authorized.
- Preserve unrelated files and other lessons. Use a clean checkout or isolated worktree if the current working tree contains unrelated changes.

## Application design

- The server uses Node.js built-ins and the browser uses native web APIs. Avoid adding dependencies without a concrete need.
- Durable lesson content lives in the configured GitHub branch. The publication API verifies committed content; it does not write arbitrary requests to the repository.
- Keep the configured content source under server control. Never accept a request-provided repository, branch, content URL, or filesystem destination.
- Preserve exact semantic comparison for full lesson publication, catalogue membership at the same immutable Git commit, authoritative branch-head resolution through the GitHub API, revision pinning after verification, and honest stale-content headers.
- Do not add or embed credentials or a new publishing secret.
- Personal learning progress lives in localStorage with export/import. Do not describe it as cloud-synced.
- Read-aloud uses browser speech synthesis. ChatGPT practice is a copy/open handoff, not access to the user’s subscription.

## Lesson authoring

- Preserve all supplied article wording in **originalMarkdown**. Put new teaching material in its own fields.
- Keep section prose equal to the article. Use ordered blocks when lists appear between paragraphs.
- Replace ChatGPT citation widgets with actual ordinary source URLs.
- Store permitted image copies in **content/media/** and reference them under **/media/**. Keep accurate alt text, caption, credit, license, source page, and applicable change notes.
- Never claim an exact image was retained when only a replacement could be retrieved.
- Use stable slugs and IDs, contextual Armenian translations, correct answer keys, and real dictionary/source links.
- Follow **schema/lesson.schema.json**. Update the schema, validator, runtime contract, and documentation together if the format intentionally changes.

## Atomic content publication

1. Read the latest branch head and catalogue.
2. Prepare the complete lesson and media.
3. Merge only the relevant summary while preserving every other story.
4. Validate locally when an executor is available.
5. Commit the story, media, and catalogue together.
6. Use the connected GitHub Git Database flow with the current head as parent and an expected-SHA, non-forced ref update. If that safe operation is unavailable, use an authorized normal git fast-forward push.
7. If the head changed, re-read and merge again. Never force an old catalogue over newer work.
8. Record the published Git commit SHA. POST the exact JSON to **/api/stories** and require the receipt’s **source.commit** to match it. If the branch legitimately advanced, inspect the newer head and confirm the intended lesson, catalogue, and media before accepting that newer revision.
9. Verify the whole served lesson, counts, catalogue, and every media URL before reporting success. Require **X-Story-Commit** on pinned catalogue, lesson, and local media responses to match the accepted receipt commit. Keep the receipt’s Git commit SHA distinct from its **sha256** lesson-content digest; media reference counts alone do not verify image bytes.

The catalogue may legitimately be empty during initial application deployment. A valid empty catalogue needs no story or media files.

## Validation and deployment

- Run **npm run check** for syntax and offline content validation.
- Run **npm test** when server behavior, publishing, or application contracts change; use targeted checks for a content-only correction.
- Do not broaden tests without a concrete remaining risk. Never remove content to make a check pass.
- Inspect the reader on mobile when changing layout, media, or interactions.
- Content updates are read from GitHub and need no redeployment.
- Application code, styles, schema, and shipped documentation changes require a manual Render deploy because **autoDeploy=no**.
- Publication resolves the configured branch head through the GitHub API and reads catalogue and lesson files at that immutable SHA. After success, the server pins the verified revision for six minutes so immediate GET and media reads stay on that revision. Every new POST resolves HEAD again, even during a pin; normal GETs do not perform that API lookup.
- The ordinary source cache lasts approximately 60 seconds, and upstream reads may still be delayed. The revision pin is temporary server memory, while GitHub remains durable storage. Do not promise a hard visibility deadline or accept an unexpected receipt commit without inspection.
- If a fresh verification fails, report that accurately even when an older cached lesson is still readable.

## Completion

Explain what changed, provide the live lesson or app link, give the verified Git commit and collection counts when publishing content, and disclose any material limitation or image replacement. Do not equate a local artifact or a GitHub commit with a verified live result.
