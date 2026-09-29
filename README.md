# Denova index

Public discovery metadata for Denova. Community packages stay in their authors' repositories. This repository maintains **two original example bundles**.

- Catalog: https://alfredxw.github.io/denova-index/index.json
- Submit: https://github.com/alfredxw/denova-index/issues/new?template=package.yml

## Examples

Install through **Resource market → Download and preview**. Resources inside each bundle can be selected independently; opening dependencies are selected together.

| Bundle | Contents | Requirements |
| --- | --- | --- |
| [青岚修仙 · Cultivation starter](examples/cultivation-starter) | One consolidated lore entry, 3 openings, narrative style, illustration preset with sample artwork, genre-independent book-analysis Skill | Choose a target book for lore/openings. Select the installed presets where applicable. Image generation requires an image model. |
| [扩展示例 · Extension starter](examples/extension-starter) | General text-statistics plugin + **邻里来信 / Small Circle**, a messaging-style AI social game | The plugin requires Node.js. The game requires a text model and permissions for Agent sessions and its own save data. |

[中文使用说明与内容清单](docs/examples.md)

Cultivation lore and openings are original Chinese creative content. Model instructions use English and request the user's language. The game and plugin have Chinese/English UI resources. Book analysis works with any fiction genre and can be selected without the cultivation material.

Small Circle includes three fictional contacts, private free-form conversations, public moments, likes, comments with AI replies, player-authored posts, streaming, cancellation and recovery. It uses Denova's configured model; it does not connect to a messaging service. The statistics plugin is independent and is not a game dependency. Characters count non-whitespace grapheme clusters; word segments are Unicode word boundaries, **not model tokens**.

The former six market entries have been replaced. Existing user installations and saves are not deleted or converted. Small Circle has a new game identity; it does not open old Lantern Crossing saves. If the previous standalone statistics installation is still tracked, resolve its ownership through the app's import preview before installing that member of the new bundle.

## Contribute

Add `entries/<id>.yaml` or use the submission form. Each entry describes one package, including mixed packages. Inclusion is not a code audit or authorization to execute code.

Required fields: `id`, localized `name` and `description`, `author`, `format`, `kinds`, `tags`, `source`, and `updated_at` (catalog update date). Optional: `featured`, `compatibility` (localized), and `cover` (static HTTPS image).

Formats: `skill`, `extension.plugin`, `extension.game`, `denova.resource-pack`, `character_card`. GitHub sources use `kind: github`, repository `url`, explicit `ref`, and optional repository-relative `path`. ZIP sources use `kind: https_zip` and `url`. Never include credentials or commands.

## Maintain and verify

Use Node.js 24 or later:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

Unit checks cover catalog metadata, mixed file/directory payloads, resource dependencies, statistics, save conflicts, request recovery, incomplete runs and SSE decoding. Browser checks cover chat, moments, comments, likes, cancellation, reload, recipient drafts, both languages/themes and narrow/wide layouts. They use an isolated HTTP fixture with scripted replies; they never call a paid model or execute third-party packages. CI installs Chromium and runs both suites before publishing.

`npm run preview` starts the **scripted development preview** at http://127.0.0.1:4381. It uses temporary in-memory data and test replies, not a live AI model. Set `PORT` to use another free port. For real play, install the bundle into Denova and configure the game's text model.

Entries are the sole maintained catalog source; `dist/index.json` is generated. Merges to `main` deploy to GitHub Pages; failed builds do not publish. Submission forms create issues; maintainers turn accepted requests into entry PRs. Sources point to each bundle directory on `main`; Denova freezes the commit during preview. Increment manifest versions for published extension changes and update the catalog date when its description changes.

## Verify with a Denova checkout

Use a checkout that implements resource-pack import and extension API v1:

```sh
npm run test:denova -- /absolute/path/to/denova
```

This uses Denova's real package importer to preview, install, export and re-preview both bundles. A Go test overlay then installs both extensions, opens the actual isolated game view, exercises Agent chat/comments and persistent reload in Chromium, and invokes the Node statistics plugin. The model is deterministic test code; no account configuration or real provider calls are used. All data belongs to temporary test projects. The overlay does not modify the Denova checkout.

The native integration entry point remains available from that checkout:

```sh
DENOVA_INDEX_EXAMPLES_DIR="$INDEX_REPO/examples" go test ./internal/app/resourceexchange -run TestIndexExamplesValidation -count=1 -v
```

The older `resource-market-examples.spec.ts` in Denova targets the retired Lantern Crossing game and is not a validation entry point for these bundles.

## License

Repository content and examples are Apache-2.0. SDK copies `runtime.mjs` and `client.mjs` are attributed in the extension `NOTICE` files. Keep the included licenses and notices when redistributing. The [example guide](docs/examples.md) records its ImageGen provenance and complete prompt.
