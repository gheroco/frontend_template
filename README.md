# Story Atlas

Story Atlas turns complete English articles into reading lessons with Armenian vocabulary support, comprehension practice, and speaking prompts.

**Live app:** https://story-atlas-gk.onrender.com  
**Content repository:** gheroco/frontend_template  
**Dedicated branch:** apps/story-atlas

Confirm the deployed address and configured source at **/api/config** before publishing. The app occupies this dedicated branch; the repository’s main branch and other app branches are separate projects.

## Learning features

- Read the complete article with source links and credited photographs.
- Explore useful words, contextual definitions, Armenian translations, and Merriam-Webster entries.
- Practise comprehension questions, missing-word exercises, grammar, and speaking.
- Use the browser’s read-aloud voices when available.
- Save learning progress in the current browser and export or import it.
- Copy a practice prompt and open ChatGPT for a separate conversation.

Read-aloud uses browser speech synthesis. Available voices depend on the device and browser. The app does not use a paid speech API or connect to a ChatGPT subscription. Opening ChatGPT starts a separate interaction; the website does not receive that conversation.

Learning progress stays in this browser’s local storage. It is not an account-backed cloud record; use export/import when moving to another browser or device.

## Run locally

Use Node.js 22 or newer. The app has no third-party runtime dependencies.

    npm run dev

Open http://localhost:3000. Local development reads the files in **content/** directly.

    npm run check
    npm test

The check command validates JavaScript syntax and content. The test command exercises server behavior. A catalogue containing no stories is valid, which supports deploying the application before the first content publication.

## Project layout

| Path | Purpose |
| --- | --- |
| public/ | Browser application, styles, and static assets |
| server.mjs | HTTP server, content reader, and publication verification API |
| content/index.json | Versioned catalogue of story summaries |
| content/stories/<slug>.json | Complete lesson, original article, vocabulary, exercises, sources, and image metadata |
| content/media/ | Authorized image files served through /media/ |
| schema/lesson.schema.json | Draft 2020-12 lesson schema |
| scripts/validate-content.mjs | Offline authoring and catalogue validation |
| test/ | Server tests |
| PUBLISHING.md | Complete instructions for future ChatGPT or human publishers |
| AGENTS.md | Repository-specific working instructions |

## Add or update a lesson

Read [PUBLISHING.md](PUBLISHING.md). The durable publication flow is:

1. Prepare a complete lesson and its image files.
2. Merge its summary into the latest catalogue, preserving other stories.
3. Commit the lesson, images, and catalogue together on **apps/story-atlas** through the connected GitHub account.
4. POST the exact lesson JSON to **/api/stories**, check the returned **source.commit** against the new GitHub commit, then verify the entire served lesson and every image.

The POST endpoint verifies content that already exists in the configured repository branch. It cannot write arbitrary material to the repository. GitHub’s authenticated write is the authorization step, so the app does not need a new publishing secret.

For publication, the server resolves the configured branch’s current head through the GitHub API and reads the catalogue and lesson at that immutable commit SHA. The successful receipt identifies this commit in **source.commit**. Check that SHA against the commit you just created; if the branch legitimately advanced, inspect the newer commit before accepting it.

After successful publication, the server pins that verified revision for six minutes, so immediate catalogue, story, and image reads use the same source revision and identify it in **X-Story-Commit**. Every new publication POST resolves branch HEAD again, even while a revision is pinned; normal GET requests do not make that GitHub API lookup. The ordinary source cache lasts approximately 60 seconds; upstream caching can also affect reads outside the pin. The pin is temporary server memory, while the content remains durably committed in GitHub. Content additions do not require a Render deployment or a separate database.

Application code changes require a manual Render deployment because this service uses **autoDeploy=no**.

## Configuration

| Environment variable | Default / behavior |
| --- | --- |
| PORT | 3000 locally; Render supplies the production port |
| SOURCE_MODE | local normally; github when RENDER is set |
| CONTENT_REPO | gheroco/frontend_template |
| CONTENT_BRANCH | apps/story-atlas |

In GitHub mode, the server reads public raw content without storing GitHub credentials. The configured content branch must therefore remain readable by that server. Changing the repository, branch, or application code is a deployment/configuration change, not a lesson publication.

## API

| Method and path | Behavior |
| --- | --- |
| GET /api/health | Service status and source mode |
| GET /api/config | Current application and source configuration |
| GET /api/publishing-guide | Discoverable publishing instructions and paths |
| GET /api/schema | Lesson JSON Schema |
| GET /api/stories | Published catalogue |
| GET /api/stories/<slug> | Complete lesson JSON |
| POST /api/stories | Resolve branch HEAD and verify a full lesson against that immutable commit |
| POST /api/publish | Verify a committed lesson by sending an object containing its slug |
| GET /media/<filename> | Read a committed image file |

Both publication routes require catalogue membership at the resolved commit. The full-lesson route additionally requires semantic equality with that committed JSON: object key order and whitespace may differ, but values and array order must match. In GitHub mode, successful receipts contain the Git commit SHA in **source.commit** and **revision**, a separate content digest in **sha256**, and counts for all lesson collections. The content digest and Git commit SHA identify different things and must not be compared with each other.

Reader responses may use previously retrieved or deployment-snapshot content when the remote source is unavailable. Such responses carry **X-Content-Stale: true**. Publication verification requires a successful branch-head lookup and fresh reads at the resolved commit; it fails when that revision or its content cannot be verified.

## Content and image credits

The first lesson preserves the supplied explanation of Thailand’s limestone islands and includes its source URLs. Image-specific creators, source pages, licenses, and modification notes are stored in each lesson’s **media** array and must remain with the images when content is updated.
