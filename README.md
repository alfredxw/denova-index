# Denova index

Public discovery metadata for Denova. Packages stay in their authors' repositories.

- Catalog: https://alfredxw.github.io/denova-index/index.json
- Submit: https://github.com/alfredxw/denova-index/issues/new?template=package.yml

## Contribute

Add `entries/<id>.yaml` or use the submission form. Each entry describes one package, including mixed packages. Inclusion is not a code audit or authorization to execute code.

Required fields: `id`, localized `name` and `description`, `author`, `format`, `kinds`, `tags`, `source`, and `updated_at` (catalog update date). Optional: `featured`, `compatibility` (localized), and `cover` (static HTTPS image).

Formats: `skill`, `extension.plugin`, `extension.game`, `denova.resource-pack`, `character_card`. GitHub sources use `kind: github`, repository `url`, explicit `ref`, and optional repository-relative `path`. ZIP sources use `kind: https_zip` and `url`. Never include credentials or commands.

## Maintain

Run `npm ci`, `npm test`, and `npm run build`. Entries are the sole maintained source; `dist/index.json` is generated. PR checks run offline and never execute package code. Merges to `main` deploy to GitHub Pages; failed builds do not publish. Submission forms create issues; maintainers turn accepted requests into entry PRs.

Initial entries link to public Denova Skills. These may already be bundled with the app; installing a user copy enables customization without modifying built-ins. Add community packages independently of client releases.
