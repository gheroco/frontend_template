# Publishing a Story Atlas lesson

This guide is for a future ChatGPT session with the user’s connected GitHub account, or a developer with authorized Git access.

**Deployment URL:** https://story-atlas-gk.onrender.com  
Use the actual deployed origin if it differs. Read **/api/config** and **/api/publishing-guide** on that origin to confirm the configured repository and branch before writing.

**Repository:** gheroco/frontend_template  
**App branch:** apps/story-atlas  
**Story path:** content/stories/<slug>.json  
**Catalogue path:** content/index.json  
**Image directory:** content/media/  
**Image URL prefix:** /media/

This application is isolated on its own branch. Do not write to main or to another application’s branch.

## What publication means

A lesson is durably saved by an authenticated GitHub commit. The application then reads that committed content.

**POST /api/stories is a verification and refresh endpoint.** The server resolves the configured branch’s current head through the GitHub API, then reads the catalogue and lesson at that immutable Git commit SHA. It accepts a complete lesson only when the JSON matches the lesson at that commit and the catalogue includes its slug. It does not create files, edit the repository, or authorize a different source. No new API key or bearer secret is required.

The alternate **POST /api/publish** accepts a slug, resolves the same authoritative branch head, and verifies the corresponding committed lesson. Prefer the complete-JSON route when publishing from ChatGPT, because it also checks that the exact prepared lesson is the one being served. In either case, check the successful receipt’s **source.commit** against the commit created for this publication.

A user request to add or publish a lesson supplies the relevant task authorization. Complete the preparation and verification within that scope; do not introduce an extra approval step for an already authorized publication.

## 1. Discover the current contract and latest content

Read these endpoints from the deployed app:

- **GET /api/config** — repository, branch, application version, and storage mode.
- **GET /api/publishing-guide** — source paths, publication steps, and schema location.
- **GET /api/schema** — current lesson schema.
- **GET /api/stories** — current catalogue as seen by readers.

Through the connected GitHub account, read the current branch reference, its commit and tree, and **content/index.json** at that exact commit. Record the head commit SHA. Use this fresh repository catalogue for the merge, because a reader response may be cached.

The intended target for this app is **gheroco/frontend_template**, branch **apps/story-atlas**. If the live app reports a different source, inspect the current project configuration and the user’s request before proceeding; never silently write into another app.

## 2. Prepare the complete article and lesson

Use a stable, descriptive slug containing lowercase words separated by hyphens, at most 100 characters. The filename and lesson slug must agree. Reuse an existing slug when the user requests an update to that lesson.

Preserve the supplied article’s wording and facts in **originalMarkdown**. Keep its complete prose, headings, emphasis, and ordinary source links. Do not replace the article with an excerpt or a summary. Add teaching material in the separate lesson arrays.

The current contract contains:

| Field | Content |
| --- | --- |
| slug, title, subtitle | Stable identity and reader-facing titles |
| description, excerpt | Catalogue description; excerpt is optional |
| category, level, language | Topic, suggested CEFR range, and en |
| estimatedMinutes, tags | Reading time and searchable topics |
| createdAt, updatedAt | ISO 8601 creation time and optional revision time |
| originalMarkdown | Complete original article with ordinary Markdown source links |
| sections | The same prose divided into ordered reading sections |
| vocabulary | Terms, English definitions, Armenian translations, examples, and dictionary links |
| quiz | Multiple-choice comprehension questions with zero-based correctIndex |
| cloze | Sentences with one ____ blank, answer, and hint |
| speaking | Prompts and helpful tips |
| grammar | Explanations, examples, and optionally an exercise with its answer |
| sources | Stable IDs, specific titles, and real HTTPS source URLs |
| media | Image URLs, alt text, captions, credits, license, and provenance |

Each section has an ID, heading, paragraphs, and sourceIds. Prefer an ordered **blocks** array to preserve lists between paragraphs:

    {
      "type": "paragraph",
      "text": "A complete paragraph from the article."
    }

    {
      "type": "bullets",
      "items": ["First list item.", "Second list item."]
    }

The value **list** is accepted as an alias for **bullets**. A section’s paragraphs must match its paragraph blocks, and its optional bullets must match its list blocks. Do not render both representations; blocks provide the reading order, while the flattened arrays support validation and compatibility.

Use stable, unique IDs within each array. Every section sourceId must resolve to a source entry. Every quiz question should have one unambiguous correct answer, an in-range correctIndex, and a useful explanation. A cloze answer should be the actual missing word or phrase.

Vocabulary definitions must match the meaning used in the article. Check Armenian translations in that context; for example, a geographical “depression” is an իջվածք, not a mental-health term. Include an original example and a Merriam-Webster URL. The optional forms array helps match plural and inflected forms in the article.

The schema permits empty practice arrays when appropriate, but a complete learning lesson should include useful teaching material rather than placeholder exercises.

## 3. Preserve images and citations properly

ChatGPT citation widgets and dynamic image carousels are not portable assets. Convert citations to ordinary source URLs, and put each chosen image in **media**.

For every image:

1. Retrieve the actual image file from an allowed source or use a user-provided image.
2. Check that the intended use is permitted.
3. Save a self-contained copy under **content/media/**.
4. Use its **/media/<filename>** URL in the lesson.
5. Record accurate alt text, a caption, creator credit, license or permission, original source page, and license URL when available.
6. Disclose resizing, cropping, or other relevant changes.

Do not claim to have preserved an exact ChatGPT carousel image if its source cannot be recovered. Use an appropriate, permitted replacement and disclose that replacement in the completion message. Never invent image authors, licenses, or source pages.

The initial lesson uses Creative Commons photographs with attribution. Keep their creator, source, license URL, and change notes when reusing them.

Use a new descriptive filename for changed image bytes, for example **phang-nga-cliffs-v2.jpg**. This avoids stale images from browser, server, or upstream caching. Each image must be at most 8 MiB. Supported extensions are JPG/JPEG, PNG, WebP, AVIF, GIF, and SVG. Use self-contained SVG files without scripts.

Remote HTTPS images are structurally accepted, but saving permitted copies locally provides the durable, self-contained result expected here. External image URLs must still be verified before completion.

## 4. Merge the catalogue without losing other stories

The catalogue structure is:

    {
      "version": 1,
      "stories": [
        {
          "slug": "example-story",
          "title": "Example title",
          "subtitle": "Example subtitle",
          "description": "An accurate lesson description.",
          "category": "Nature & science",
          "level": "B1–B2",
          "language": "en",
          "estimatedMinutes": 8,
          "tags": ["Nature"],
          "media": [],
          "createdAt": "2026-11-28T00:00:00.000Z",
          "vocabularyCount": 24,
          "questionCount": 8
        }
      ]
    }

The example counts are illustrative; calculate them from the actual lesson. **vocabularyCount equals vocabulary.length. questionCount equals quiz.length.**

Copy summary values directly from the lesson. The summary’s media array must match the full lesson’s media array. If you include excerpt or updatedAt in a summary, those values must also match the lesson.

Replace only the entry with the same slug, or append a new entry if it does not exist. Preserve the other entries and their order. Do not rebuild the catalogue from only the current chat’s stories.

A catalogue with **version: 1** and **stories: []** is valid. It is used when deploying the application before its first content publication. A nonempty story file must have a matching catalogue entry.

## 5. Validate locally when an executor is available

From the app root:

    npm run check
    npm test

The offline content validator can also be run alone:

    node scripts/validate-content.mjs

It checks the current schema, required arrays and IDs, article/section prose parity, ordered blocks, source references, quiz indices, cloze blanks, vocabulary structures, image files and headers, and catalogue summaries.

For an independently prepared content directory:

    node scripts/validate-content.mjs --content-dir /absolute/path/to/content

No network requests are made by this validator. It checks known image signatures and available dimensions; it does not replace visual inspection or license review.

A warning about complex Markdown means prose parity needs a manual comparison. Preserve all prose rather than deleting the difficult formatting to silence a warning.

## 6. Commit the story, images, and catalogue atomically

### Connected GitHub: Git Database flow

Discover the current connected GitHub tool shapes. Use its authenticated Git Database operations to create one commit containing all changed files.

1. Read **refs/heads/apps/story-atlas** and record **CURRENT_HEAD_SHA**.
2. Read that commit’s root tree and the catalogue at that commit.
3. Create a blob for each changed story JSON, image, and merged catalogue. Use UTF-8 for text and base64 for image bytes when the tool requires it.
4. Create a tree based on the existing root tree. Add entries only for the intended changed paths, with mode **100644** and type **blob**. The base tree preserves everything else.
5. Create one commit with that new tree and **parents: [CURRENT_HEAD_SHA]**.
6. Update **refs/heads/apps/story-atlas** to the new commit with **force: false** and **expected_sha: CURRENT_HEAD_SHA** through the connector’s compare-and-swap support.

Record the successfully published commit SHA as **PUBLISHED_COMMIT_SHA**. This is the value to compare with the app’s later **source.commit** receipt field; it is distinct from the lesson’s SHA-256 content digest.

Do not use separate file commits for the lesson and catalogue. The branch must move once, making the complete publication visible together.

The expected SHA protects work that arrives while you are preparing the publication. If the branch moved, reread the latest head and catalogue, merge your one entry again, and create a new commit on that head. Do not force the old tree onto the newer branch.

**expected_sha is a connector capability, not a parameter to assume exists in GitHub’s standard REST update-ref endpoint.** If the available connector lacks a safe expected-head operation, use an authorized normal git fast-forward push instead. Do not simulate a successful compare-and-swap check with only an earlier read.

### Authorized git alternative

Work in a clean checkout or isolated worktree of **apps/story-atlas**. Stage only the intended story, new or changed media, and catalogue. Commit them together and perform a normal push to that branch.

A normal push rejects a conflicting remote change. If rejected, fetch the new head, preserve the other catalogue entries, resolve the merge, rerun validation, and push again. Never use force, force-with-lease, reset a shared branch, or write to main for a story publication.

Keep authentication in the connected account or the existing credential system. Never add tokens, cookies, passwords, or API keys to content, code, commit messages, browser storage, or documentation.

## 7. Verify the exact committed lesson through the app

Once the GitHub branch update succeeds, send the complete lesson JSON:

    curl --fail-with-body \
      -X POST 'https://story-atlas-gk.onrender.com/api/stories' \
      -H 'Content-Type: application/json' \
      --data-binary @content/stories/your-story-slug.json

The body can be the lesson object itself. The API also accepts an object with a **story** property containing the lesson, but the direct object is simplest.

Alternatively, verify by slug:

    curl --fail-with-body \
      -X POST 'https://story-atlas-gk.onrender.com/api/publish' \
      -H 'Content-Type: application/json' \
      --data '{"slug":"your-story-slug"}'

Use the actual deployed origin if it differs from the target above. Do not attach a publishing secret; none is required.

A successful response includes:

- **ok: true** and the correct slug.
- A reader URL under **/story/<slug>**.
- **source.commit**, the GitHub branch-head commit SHA used for the verification, and the same SHA in **revision** when running in GitHub mode.
- **sha256**, a separate digest of the complete lesson JSON after canonicalizing object keys.
- Counts for sections, vocabulary, quiz, cloze, speaking, grammar, media, and sources.
- **persisted: true**, storage information, configured source information, and a verification timestamp.

Check the repository, branch, slug, and every count. Require **source.commit === PUBLISHED_COMMIT_SHA** for the normal case. Do not compare the Git commit SHA with **sha256**: the first identifies a repository snapshot, while the second identifies the lesson’s JSON content.

If the branch legitimately advanced between your commit and the POST, inspect the current branch head through the connected GitHub account. Confirm that it is the intended continuation of your commit and that the lesson, catalogue entry, and image files remain correct. Only then accept that newer SHA as the expected revision and reverify the full served lesson. Do not silently accept an older or unrelated SHA, or overwrite newer work to make the receipt match.

For the full-JSON route, matching semantics mean that object key order and whitespace do not matter, while all values and array order do. In local development mode, **source.commit** is null and **revision** falls back to a content-hash identifier; local verification is not proof of a production GitHub publication.

Both routes require the story to be in the catalogue at the same resolved commit as the lesson. The server uses GitHub’s branch-reference API and immutable raw-content URLs for this verification. The receipt identifies HEAD at the start of verification; the branch may legitimately move afterward. Every new POST resolves HEAD again, even during an existing pin. A request cannot supply a different repository, branch, commit, URL, or persistence location.

## 8. Verify the complete reader result and every image

After checking the receipt’s commit SHA, fetch **GET /api/stories/<slug>** and compare the entire JSON with the prepared lesson. Compare recursively with sorted object keys; do not compare only title, excerpt, or counts. The server pins a successful publication’s verified revision for six minutes; immediate catalogue, lesson, and image reads use that revision unless another successful publication pins a newer one. Their **X-Story-Commit** header must match the accepted receipt commit during this verification.

Receipt counts describe the stored lesson fields. In particular, the media count counts image references; it does not prove that image bytes have been retrieved. Verify the image requests separately.

Fetch every media URL and confirm:

- HTTP 200.
- An image content type and nonempty bytes.
- No stale-source header.
- **X-Story-Commit** equal to the accepted Git commit for local **/media/** URLs.
- The image is available in the actual reader and its visible subject matches its alt text and caption.

Also check the catalogue entry and open **/story/<slug>**. On a narrow mobile viewport, inspect article text, images, word definitions, exercise controls, and horizontal overflow.

For an automated semantic comparison from this repository, adapt the slug below:

    node --input-type=module <<'NODE'
    import assert from 'node:assert/strict';
    import {readFile} from 'node:fs/promises';
    import {canonicalJson} from './server.mjs';

    const origin = 'https://story-atlas-gk.onrender.com';
    const slug = 'your-story-slug';
    const expectedCommit = 'REPLACE_WITH_PUBLISHED_GITHUB_COMMIT_SHA';
    assert.match(expectedCommit, /^[0-9a-f]{40}$/i, 'Set the actual expected Git commit SHA.');
    const wanted = JSON.parse(await readFile('content/stories/' + slug + '.json', 'utf8'));
    const published = await fetch(origin + '/api/stories', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(wanted)
    });
    assert.equal(published.status, 200);
    const receipt = await published.json();
    assert.equal(receipt.ok, true);
    assert.equal(receipt.persisted, true);
    assert.equal(receipt.storage, 'github');
    assert.equal(receipt.source.repository, 'gheroco/frontend_template');
    assert.equal(receipt.source.branch, 'apps/story-atlas');
    assert.equal(receipt.source.commit, expectedCommit);
    assert.equal(receipt.revision, expectedCommit);
    for (const key of ['sections','vocabulary','quiz','cloze','speaking','grammar','media','sources']) {
      assert.equal(receipt.counts[key], wanted[key].length, key);
    }
    const response = await fetch(origin + '/api/stories/' + slug, {cache:'no-store'});
    assert.equal(response.status, 200);
    assert.notEqual(response.headers.get('x-content-stale'), 'true');
    assert.equal(response.headers.get('x-story-commit'), expectedCommit);
    const actual = await response.json();
    assert.equal(canonicalJson(actual), canonicalJson(wanted));

    const catalogue = await fetch(origin + '/api/stories', {cache:'no-store'});
    assert.equal(catalogue.status, 200);
    assert.notEqual(catalogue.headers.get('x-content-stale'), 'true');
    assert.equal(catalogue.headers.get('x-story-commit'), expectedCommit);
    const entry = (await catalogue.json()).stories.find(item => item.slug === slug);
    assert.ok(entry, 'The catalogue must include the lesson.');
    assert.equal(entry.vocabularyCount, wanted.vocabulary.length);
    assert.equal(entry.questionCount, wanted.quiz.length);
    for (const key of ['slug','title','subtitle','description','category','level','language','estimatedMinutes','tags','media','createdAt']) {
      assert.equal(canonicalJson(entry[key]), canonicalJson(wanted[key]), key);
    }

    for (const image of actual.media) {
      const imageUrl = new URL(image.url, origin);
      const result = await fetch(imageUrl, {cache:'no-store'});
      assert.equal(result.status, 200, image.url);
      assert.match(result.headers.get('content-type') || '', /^image\//);
      assert.notEqual(result.headers.get('x-content-stale'), 'true');
      if (imageUrl.origin === origin && imageUrl.pathname.startsWith('/media/')) {
        assert.equal(result.headers.get('x-story-commit'), expectedCommit);
      }
      assert.ok((await result.arrayBuffer()).byteLength > 0, image.url);
    }
    console.log('Commit ' + expectedCommit + ', complete lesson, and all images verified.');
    NODE

The app’s ordinary source cache is approximately 60 seconds. Publication POST resolves branch HEAD through the GitHub API and requests files at the immutable SHA, then pins that verified revision for six minutes. This keeps immediate follow-up reads together and avoids relying on a branch-name URL for publication verification. Normal GET requests do not perform the GitHub API head lookup. The pin is temporary server memory and does not replace GitHub persistence; it can end on server restart, expire, or be replaced by a later successful publication.

If the commit header is missing or differs during follow-up verification, perform a new publication POST, inspect its returned commit, and repeat the complete checks. A missing header on an ordinary unpinned reader response is not itself a statement that the GitHub content was deleted.

Upstream availability and caching can still affect ordinary reads and image delivery. If verification fails, inspect the current GitHub branch head and the files at that exact SHA. Do not claim success while the server reports a mismatched commit, mismatched content, or an unavailable source. No separate database or Render deployment is required to publish lesson content.

Images are also cacheable. New filenames for changed images make verification and reader updates more reliable.

## Failure handling

| Response | Meaning and next action |
| --- | --- |
| 400 invalid lesson / JSON | Fix the lesson structure or request body, validate, and commit the corrected version if needed |
| 404 story not found | Check the slug and catalogue membership |
| 409 not_committed | Inspect the current GitHub branch head and confirm that both the lesson and catalogue entry exist at that exact commit |
| 409 content_mismatch | Compare the submitted JSON with the committed file; commit the intended exact version or submit the actual committed version |
| 413 body_too_large | Keep lesson JSON within 1 MiB; store image bytes as files rather than base64 inside the lesson |
| 415 unsupported_media_type | Send Content-Type: application/json |
| 429 rate_limited | Respect Retry-After and avoid repeated verification loops |
| 502 invalid_source | Inspect and fix malformed committed catalogue or lesson data |
| 503 revision_unavailable | The GitHub branch head could not be authoritatively resolved; preserve the commit and retry verification when that lookup is available |
| 503 source_unavailable | The upstream cannot be freshly verified; preserve the commit and retry later |

Cached reader content can remain available during a source outage and is marked **X-Content-Stale: true**. A publication receipt is never issued from that fallback.

## Content updates versus application deployments

Adding or editing a lesson, its images, and its catalogue entry requires no Render deployment. Verify that content update through the publication endpoint.

Changes to application JavaScript, styles, the server, schema, or shipped documentation require a manual Render deployment because this service uses **autoDeploy=no**. Follow the user’s authorized task scope and verify the deployed application afterward.

## Learning data and ChatGPT practice

The lesson catalogue is stored in GitHub. Personal learning progress is stored only in the current browser’s localStorage and can be exported or imported. Do not promise account sync, a server backup of that progress, or automatic transfer between devices.

Read-aloud uses browser speech synthesis and available device voices. The ChatGPT practice action copies a prompt or opens ChatGPT; it is not a live subscription integration and does not give the website access to a ChatGPT account.

## Completion report

Report the live lesson URL, the verified Git commit SHA, the saved collection counts, and the result of full-JSON and media verification. Mention any substituted image accurately. If publication or verification failed, say which step failed and what is already committed.

Do not report the work complete based only on a prepared local file, a GitHub commit, a title appearing in the catalogue, or a successful POST without checking the served lesson.

## Reusable instruction for a future ChatGPT session

> Add the complete explanation from this conversation as a new Story Atlas English lesson. Use my connected GitHub account and the app’s publishing guide. Preserve the entire article, convert citations to source links, keep or accurately replace the images with permitted credited copies, and add useful English vocabulary with Armenian translations, exercises, and speaking practice. Merge the latest catalogue without losing other stories, commit the lesson, media, and catalogue atomically on apps/story-atlas, POST the exact JSON for verification, check source.commit against the published GitHub commit, and check the full served lesson and every image. Return the working lesson link, verified commit, and counts.
