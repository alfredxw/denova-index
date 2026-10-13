# Publish a Denova package · 发布 Denova 资源包

[中文说明](#中文说明) · [English](#english)

## 中文说明

### GitHub 自助发现

1. 创建公开的 GitHub 仓库，在**默认分支根目录**放置 `denova-pack.json`，提交资源包所需的全部文件。需要构建的插件必须包含可安装的构建产物。
2. 在仓库首页的 **About → Topics** 添加 `denova-package`。
3. 等待索引下一次成功发布。市场将标注“GitHub 自动发现”，无需提交 Issue 或 PR。

一个仓库自动发现一个资源包，包内可包含多个插件、游戏、Skill 或创作资源。不扫描子目录；私有、归档和 fork 仓库不参与自动发现。该入口只读取 manifest，不下载或运行包内代码，也不代表人工审核或安全背书。

包名、描述、作者、语言、版本及资源列表沿用 `denova-pack.json`，无需额外配置文件。下面的最小示例包含一个 Skill；`skill/SKILL.md` 也必须提交到仓库：

```json
{
  "format": "denova.resource-pack",
  "schema_version": 1,
  "package": {
    "id": "acme-writing-kit",
    "version": "1.0.0",
    "locale": "zh-CN",
    "name": "写作资源包",
    "description": "帮助整理创作思路的 Skill。",
    "author": "acme",
    "translations": {
      "en-US": {
        "name": "Writing kit",
        "description": "A Skill for organizing writing ideas."
      }
    }
  },
  "resources": [
    { "id": "writing", "kind": "skill", "path": "skill" }
  ]
}
```

建议在 `package.id` 中使用作者前缀，避免与其他包重名。ID 创建后应保持稳定；更新已发布内容时提高版本号。市场只校验发现元数据，安装时 Denova 会重新下载、冻结并校验实际包，供用户选择内容及确认权限。

### 更新时间与排查

- 索引每六小时计划构建，也支持维护者手动触发；GitHub 搜索和 Actions 调度可能延迟。客户端目录缓存一小时，“刷新”只拉取已发布目录，不立即扫描 GitHub。
- 未出现时检查 [Actions 构建日志](https://github.com/alfredxw/denova-index/actions/workflows/pages.yml)：缺少或无效的 manifest、被排除的仓库和 ID 冲突都会记录原因。
- 同一仓库根目录已有手动注册时，保留注册指定的分支或 tag。自动包与已注册包 ID 冲突时跳过自动包；多个自动包同名时全部跳过，不由搜索顺序决定归属。
- 移除 topic、归档仓库或将仓库设为私有后，下一次成功收集时退出自动发现。不会删除用户已安装的内容，已安装包仍跟随其原来源检查更新。

### 手动注册与维护

子目录、多包仓库、指定 ref、ZIP 来源以及 fork 仓库请使用 [注册表单](https://github.com/alfredxw/denova-index/issues/new?template=package.yml)，或按 [README 的注册格式](../README.md#contribute) 提交 PR。推荐由索引维护者决定；手动收录同样不等于代码审计。

维护者可在根目录 `excluded-repositories.json` 添加 `owner/repo`，忽略大小写，阻止该仓库被 topic 自动收录。它不覆盖手动注册：完全下架时还须移除对应 `entries/*.yaml`。无需修改用户安装记录。

搜索失败、结果不完整、超过 GitHub 的 1000 条搜索上限，以及读取时发生网络或限流故障，会使构建失败并保留上次成功发布；单个包缺少或具有无效 manifest 时只跳过该包。索引仍受 5000 条和 4 MiB 上限约束，超限不会静默截断。

## English

### Automatic discovery on GitHub

1. Put `denova-pack.json` at the **root of the default branch** of a public GitHub repository. Commit every file needed to install the package, including built plugin assets where required.
2. Add the `denova-package` repository topic under **About → Topics**.
3. Wait for the next successful index publication. The market labels the package **Discovered on GitHub**; no submission or pull request is required.

One repository exposes one root package, which may contain multiple plugins, games, Skills or creative resources. Subdirectories are not scanned. Private, archived and fork repositories are excluded. Discovery only reads the manifest; it neither runs package code nor constitutes a review or safety endorsement.

Use the existing manifest format, illustrated above. That example also needs `skill/SKILL.md`. Prefer an author prefix for `package.id`, keep the ID stable, and increment the version for published changes. Names, descriptions, authors and translations belong in the manifest. Denova downloads and validates the actual package only after the user chooses Get, then offers content selection and permission confirmation.

### Updates, troubleshooting and manual registration

- The index is scheduled every six hours and can be dispatched by a maintainer. GitHub search indexing and Actions may be delayed. Denova caches the catalog for one hour; Refresh fetches the published catalog, without starting a GitHub scan.
- Check the [build logs](https://github.com/alfredxw/denova-index/actions/workflows/pages.yml) for missing or invalid manifests, excluded repositories and ID conflicts. A manual registration for the same repository root wins, including its chosen ref. Automatic packages conflicting with a registered ID are omitted. All automatic packages sharing an ID are omitted, regardless of search order.
- Removing the topic, archiving the repository or making it private removes it from discovery on the next successful collection. Installed content remains, and update checks continue to use its recorded source.
- For subdirectories, multiple packages, specific refs, ZIP sources or forks, use the [submission form](https://github.com/alfredxw/denova-index/issues/new?template=package.yml) or a [registration PR](../README.md#contribute). Maintainers choose recommendations. Manual inclusion is not a code audit either.
- Maintainers can block automatic discovery through the root `excluded-repositories.json`, listing case-insensitive `owner/repo` names. Remove any matching manual registrations separately for a complete delisting.
- Failed, incomplete or over-1000-result searches, network failures and rate limits abort publication, preserving the previous catalog. A missing or invalid individual manifest is skipped and logged. The existing 5000-entry and 4 MiB catalog limits still apply; results are never silently truncated.
