---
name: comic-creation
description: Create, continue, or revise multi-page comic episodes in the current Project using Comic Studio tools and shared character and style references.
---

# Comic creation

Use the current Project creation Agent and its available tools. Reply in the user's language. This Skill provides creative guidance; the selected runtime owns execution, cancellation, continuation, and Todo/Plan.

## Plan and save the artwork

- Inspect the comic and relevant shared Lore before creating pages. Reuse existing episode and page IDs. Do not treat the selected canvas page as the entire requested scope.
- Develop a coherent episode with page-by-page action, composition, and exact dialogue. Follow the requested page count and language. Unless the user asks to discuss first, save and generate within their authorized scope without requiring approval for each page.
- Create an episode with `plugin_comic_structure(kind=episode)` when needed. Create multiple pages with `kind=page`, `episodeId`, and `count`. After uncertain creation outcomes, inspect the comic before creating more pages.
- Read episode detail with `plugin_comic_inspect(episodeId)`, following `nextOffset`. Save scripts in inspected page groups with `plugin_comic_structure(kind=plan, episodeId, expectedRevision, pages)`. Each page needs its `pageId`, `prompt` (at most 16 KiB in UTF-8), and current `expectedRevision`. Plan items have independent results; retry only unsaved items after rereading their revisions.
- On the first plan, read the selected page's full references with `plugin_comic_inspect(pageId)` and supply the requested uploaded assets and library IDs in the **top-level** `references` array, alongside `episodeId` and `pages`, never inside page items. Use clear character/style role notes. The tool freezes library text and images and the toolbar's selected image model into every script. Omit references only to retain an existing episode snapshot; `[]` deliberately clears them. Verify the returned references and saved items before generating. Do not directly edit comic JSON or build a parallel character library or task queue.

## Generate and continue

- Use the runtime's Todo/Plan when available to communicate task progress. Actual generated and adopted counts come from episode inspection, not Todo or attempted tool calls.
- Call `plugin_comic_render` with only `pageId` to execute a saved script with its fixed model and references. Generate one page at a time through ordinary Agent tool calls. Do not write a separate executor or launch another Agent for this workflow.
- On continuation, inspect the episode first. Skip saved candidates for the script's command ID. For a recorded request lacking a saved candidate, call `plugin_comic_render(action=recover, pageId, commandId)` before considering any new generation. Recovery uses the original request, not the latest Lore or image model selection.
- Failed, cancelled, interrupted, or uncertain paid requests are not automatically retried. Explain the affected pages and continue other pending scripts when useful. Retry a failed page only when authorized, using `plugin_comic_render(action=retry, pageId, commandId=<new UUID>)`. This retains the saved model and references and makes the new attempt visible in episode progress. Never retry an entire episode to repair one failed page.
- References improve consistency but cannot guarantee identical character appearance or unchanged pixels. Inspect saved images when image-reading tools are available, and report any remaining visual uncertainty honestly.

## Adopt candidates

Generated images stay candidates. If the user requests adoption, inspect and call `plugin_comic_adopt(items)` with each exact `pageId`, candidate `resultId`, and `expectedCurrentId` returned by episode inspection. This preserves images selected while generation was in progress. A conflict affects only that item; report it without overriding the user's choice. Replace such a selection only when the user explicitly requests replacement and after reading its actual current ID.

Finish with saved/generated/adopted counts and any incomplete pages. A new conversation can continue from the same saved artwork without relying on the previous conversation's memory.
