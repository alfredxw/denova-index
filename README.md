# Denova index

Public discovery metadata for Denova. Community packages stay in their authors' repositories. This repository maintains **two original example bundles**.

- Catalog: https://alfredxw.github.io/denova-index/index.json
- Submit: https://github.com/alfredxw/denova-index/issues/new?template=package.yml

## Examples

Install through **Resource market → Download and preview**. Resources inside each bundle can be selected independently; opening dependencies are selected together.

| Bundle | Contents | Requirements |
| --- | --- | --- |
| [照夜长河 · Cultivation World Simulation](examples/cultivation-starter) | 114 original lore entries across five regions and an immortal realm; progression from mortal life to ascension, sects, crafts, trade, usable technique progression and autonomous character development; prodigy and beauty rankings; three optional editable openings or custom/existing playable characters, eight trial/exploration sites, native state/rules and 18 event types | Choose a target book for lore/openings. Select the installed presets where applicable. Image generation requires an image model. |
| [扩展示例 · Extension starter](examples/extension-starter) | General text-statistics plugin + **邻里来信 / Small Circle**, a messaging-style AI social game | The plugin requires Node.js. The game requires a text model and permissions for Agent sessions and its own save data. |

[中文使用说明与内容清单](docs/examples.md)

The cultivation package targets Chinese-speaking creators: its original lore, openings, preset prompts, state/rule instructions, events and book-analysis Skill are written in Chinese. Lore and openings each occupy one collection file. The game and plugin have Chinese/English UI resources. Book analysis works with any fiction genre and can be selected without the cultivation material.

Small Circle includes three fictional contacts, private free-form conversations, public moments, likes, comments with AI replies, player-authored posts, streaming, cancellation and recovery. It uses Denova's configured model; it does not connect to a messaging service. The statistics plugin is independent and is not a game dependency. Characters count non-whitespace grapheme clusters; word segments are Unicode word boundaries, **not model tokens**.

The former six market entries have been replaced. Existing user installations and saves are not deleted or converted. Small Circle has a new game identity; it does not open old Lantern Crossing saves. If the previous standalone statistics installation is still tracked, resolve its ownership through the app's import preview before installing that member of the new bundle.

## Contribute

Authors maintain **one descriptor: `denova-pack.json`**. It contains both the resource list and the information shown in the market. No separate market metadata file is needed.

```json
{
  "format": "denova.resource-pack",
  "schema_version": 1,
  "package": {
    "id": "writing-kit",
    "version": "1.0.0",
    "locale": "zh-CN",
    "name": "写作资源包",
    "description": "叙事与文风素材。",
    "author": "Author",
    "tags": ["writing"],
    "usage": "导入后在创作方案中选用。",
    "translations": {
      "en-US": {
        "name": "Writing kit",
        "description": "Narrative and prose resources.",
        "usage": "Select the imported resources in Creative Setups."
      }
    }
  },
  "resources": [
    { "id": "narrative", "kind": "preset.narrative", "path": "narrative.json" }
  ]
}
```

- `package.locale` identifies the language of the default text. Write that text once; `translations` contains only other languages. Names, descriptions, usage and compatibility text are supported.
- `package.id`, `name`, `description`, `author` and `locale` are required for market registration. `tags`, `usage`, `compatibility`, a static HTTPS `cover`, and additional translations are optional.
- Resource kinds come from `resources`, and GitHub update dates come from the package directory's latest commit. Do not maintain copies of these values.
- A bundle with one Skill or extension uses the same descriptor. Keep the Skill or extension in its own resource directory; its native manifest defines its runtime behavior, not a second market entry. Direct native imports into Denova remain available.

To register, submit the **repository URL, Git ref and package directory** using the issue form, or add `entries/<package.id>.yaml`:

```yaml
source:
  kind: github
  url: https://github.com/author/resources
  ref: main
  path: writing-kit
# Optional, maintained by the index:
featured: true
```

The index file is only a locator and curation record. It does not repeat the ID, title, description, author or resource types; its filename must match `package.id`. Authors update the package manifest without editing the registration each time. Inclusion is not a code audit or authorization to execute code. Never include credentials or commands.

For a ZIP source, the registration points to the ZIP and a public HTTPS copy of **the same manifest**:

```yaml
source:
  kind: https_zip
  url: https://example.com/writing-kit.zip
manifest: https://example.com/denova-pack.json
```

For ZIP distribution, add `package.updated_at` in `YYYY-MM-DD` form because there is no Git history. Publish the manifest from the archive without maintaining a separate metadata format. The index reads this JSON only; archive download and installation validation remain the client's responsibility. Convert character cards to a resource pack before registering them.

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

`dist/index.json` is generated, not maintained. Package authors update their own repositories without changing registrations. Index PRs are needed only to add/remove registrations, change a source, or change curation.

Tests run offline with local fixtures. The build reads one public package manifest from each registered repository at a resolved commit, never downloads archives or executes third-party code. It reads this repository's examples from the checkout. `GITHUB_TOKEN` is used only for GitHub API requests when available. Failed or invalid metadata fails the build and does not replace the last published catalog.

GitHub Actions rebuilds on merges to `main`, manual dispatch, and every six hours to pick up upstream changes. Repository checkout includes history so bundled example dates can be derived correctly. The generated catalog remains a discovery snapshot; Denova independently freezes and validates the actual package before installation.

Submission forms create issues; maintainers turn accepted requests into registration PRs. The single package manifest and payloads stay in the package repository.

Sources point to each bundle directory on `main`; Denova freezes the commit during preview. Increment manifest versions for published extension changes.

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
