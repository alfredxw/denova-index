# Denova index

Public discovery metadata for Denova. Community packages stay in their authors' repositories; this repository also maintains a small set of working examples.

- Catalog: https://alfredxw.github.io/denova-index/index.json
- Submit: https://github.com/alfredxw/denova-index/issues/new?template=package.yml

## Contribute

Add `entries/<id>.yaml` or use the submission form. Each entry describes one package, including mixed packages. Inclusion is not a code audit or authorization to execute code.

Required fields: `id`, localized `name` and `description`, `author`, `format`, `kinds`, `tags`, `source`, and `updated_at` (catalog update date). Optional: `featured`, `compatibility` (localized), and `cover` (static HTTPS image).

Formats: `skill`, `extension.plugin`, `extension.game`, `denova.resource-pack`, `character_card`. GitHub sources use `kind: github`, repository `url`, explicit `ref`, and optional repository-relative `path`. ZIP sources use `kind: https_zip` and `url`. Never include credentials or commands.

## Maintain

Run `npm ci`, `npm test`, and `npm run build`. Entries are the sole maintained source; `dist/index.json` is generated. PR checks run offline. They validate metadata and test this repository's examples; they never fetch or execute third-party packages. Merges to `main` deploy to GitHub Pages; failed builds do not publish. Submission forms create issues; maintainers turn accepted requests into entry PRs.

## Working examples

These are original, maintained examples, not copies of Denova's bundled Skills. Install through Resource market → Download and preview. Check the selected resources, target book and extension permissions before confirming.

| Package | Contents | Use |
| --- | --- | --- |
| [Quiet mystery](examples/quiet-mystery) | Narrative preset + prose reference | Restrained suspense; the prose dependency is included automatically. |
| [Ink storyboards](examples/ink-storyboards) | Image preset | Monochrome ink scene illustrations; bring your own configured image model. |
| [Tide harbor](examples/harbor-lore) | 3 lore items + 2 openings | Original Chinese harbor mystery; select a target book on import. |
| [Story review](examples/story-review) | Skill | Evidence-based continuity and viewpoint critique; no automatic editing. |
| [Text statistics](examples/text-statistics) | Plugin + pure tool | Enable its toolset for your Agent. Counts supplied text without file access or model calls. Requires Node.js. |
| [Lantern crossing](examples/lantern-crossing) | Static game | Create a story with this game type. Seven scenes, two endings, automatic saves, English/Chinese and light/dark themes. No model needed. |

Presets and Skills use English model instructions; the harbor lore is intentionally Chinese creative content. The game and plugin provide both English and Chinese UI strings. Word segments in Text statistics are Unicode word boundaries, not model tokens; characters count non-whitespace grapheme clusters.

The index points to each example's directory on `main`. Denova freezes the repository commit during preview. When changing a published extension, increment its manifest version; update the entry date when its catalog description changes. The game uses revision-checked saves and blocks further choices after an unconfirmed write until saved progress is reloaded. It never overwrites an unreadable save.

## Verify with a Denova checkout

Use a Denova build with resource-pack import and extension API v1. Unit checks here do not replace importing into the app. Optional integration tests in Denova own their temporary data and processes; do not point tests at your normal data directory.

From the Denova checkout, set `DENOVA_INDEX_EXAMPLES_DIR` to this repository's absolute `examples` path and run:

```sh
DENOVA_INDEX_EXAMPLES_DIR="$INDEX_REPO/examples" go test ./internal/app/resourceexchange -run TestIndexExamplesValidation -count=1 -v
```

For the actual game view, create an archive from its directory (run in this repository):

```sh
python3 -m zipfile -c /tmp/denova-lantern-validation.zip examples/lantern-crossing
```

Then, from the Denova checkout:

```sh
DENOVA_MARKET_GAME_ZIP=/tmp/denova-lantern-validation.zip pnpm --dir web exec playwright test --project=e2e tests/e2e/resource-market-examples.spec.ts
```

Without these variables the cross-repository tests skip. The app's normal market browser tests remain self-contained.

## License

Repository content and examples are Apache-2.0. `runtime.mjs` and `client.mjs` in the examples are unmodified copies of the Denova SDK; their source and attribution are in each package's `NOTICE`. Keep the included license and notice when redistributing them.
