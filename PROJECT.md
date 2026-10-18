# PROJECT — dsh-loom

> **唯一真相文档**：只回答「项目现在是什么样」。
> 术语定义 → `CONTEXT.md`　｜　决策理由 → `docs/adr/`　｜　函数级实现 → 代码　｜　历史变更 → Git + Issues

---

## 项目目标

`dsh-loom` 是 [dsh（DeepSeek Harness）](https://github.com/deepseek-ai) 的插件，做两件事：

1. **提示词管理** —— 把系统提示词拆成可独立开关、可编辑、可命名保存的内容块，按场景装配
2. **破限破甲** —— 内置面向角色扮演与越狱评测的提示词块

执行环境能力（沙箱 / 审批 / 工具 / 文件系统绕过）继承自 `dsh-purge`，本项目不重做。

## 来源

从 `dsh-purge` v1.1.71 **整份派生**。上游 `https://github.com/YuJunZhiXue/dsh-purge`，派生于 commit `6c1d638`。

- 本仓库 Git 历史从「导入基底」这一个 commit 起算，**不含上游历史**
- 上游历史的唯一记录是根目录 `release-notes.md`（**冻结，不再追加**）
- 派生理由见 `docs/adr/0001-从-dsh-purge-派生.md`

## 从 dsh-purge 切到 dsh-loom

**必须先还原旧插件，再装新插件。**

```sh
dsh-purge --revert          # 或在旧 dock 里点 Clean → 还原
dsh plugin --profile web remove dsh-purge   # desktop profile 同理
dsh plugin --profile web add dsh-loom
```

为什么不还原就不能直接装：两层补丁都往宿主里插 **同一个 cordis id**，两边同时存在会让
46 条代码补丁被打两遍；日志前缀、`[dsh-...]` 标记、`$DSH_HOME` 数据目录也会各写一套。

`dsh-loom` 对旧盘面是**认账**的，不是硬重打：

- `lib/legacy-purge-marks.js` 是唯一收着旧字面量（旧包名、`dshpg-` 段名前缀、
  `__dsh_purge_deny_disabled__`、`DSH_PURGE_*`）的地方，**只用于识别与迁移，不用于新写入**。
- 判定「这份补丁已经打过了」走 `markPresent()`：新标记没命中，再看一次旧插件写下的写法。
  旧盘面因此不会被重打，也不会静默叠加。
- 宿主文件里残留的旧写法会在 apply 时被整体迁移成新写法（`toLoomMarks()`，幂等）。

没还原就装的话，需要人工确认或清理的残留：

| 位置 | 说明 |
|---|---|
| `$DSH_HOME/dsh-purge/` | 旧数据目录。**不迁移**：`override-state.json`、`applied.json`、`installed-rev`、`hooks-deny.json`、`drill-grant.json` 都要靠新插件重新写一遍 |
| `$DSH_HOME/prompt-inject.md` | 用户文件，**不迁移也不改写**；血统靠内容判（`looksLikePluginDefault()`），不靠状态目录。但旧状态里的 `customized` / `seedHash` 会丢，改过插件默认稿的人可能被判成「插件默认」而被重新 seed → **迁移前先备份这个文件** |
| `*.dshpurge.bak`、`*.dsh-purge-rule.bak` | 备份后缀**故意不改名**：改名会让已有备份变成孤儿，还原会静默跳过，反而更危险 |
| 旧 profiled 里的 `node_modules/dsh-purge` | 要自己 `dsh plugin remove dsh-purge` 删掉 |

迁移完成后 `$DSH_HOME/dsh-loom/` 才是新家；数据目录改名不会带走旧状态。

## 模块地图

### 提示词层（本项目的主要演进区）

| 模块 | 代码区域 | 核心入口 |
|---|---|---|
| 插件主入口、注入段注册 | `lib/index.js` | `apply()`、`registerPromptSections()`、`injectAllowedNow()` |
| 覆盖层生命周期、默认稿解析 | `lib/core.js`、`lib/rules.js` | `resolveInjectText()`、`looksLikePluginDefault()`、`isKeepableUserOverride()`、`syncPromptInjectOnDiskSync()` |
| 位置常量、ChatML 信封处理 | `lib/identity.js` | `GLOBAL_PROMPT_ORDER`、`peelChatmlEnvelope()`、`adaptInjectForMinimalPreset()` |
| 能力选用协议段 | `lib/capability-protocol.js` | `CAPABILITY_SECTION`、`capabilityProtocolText()` |
| 加密默认稿表 | `lib/asset-table.js`、`lib/table-key.js`、`lib/table-read.js` | `SLOT` / `MASK` / `TAG` / `IV` |

### 执行环境层（继承自上游，不在本项目演进范围内）

| 模块 | 代码区域 | 职责 |
|---|---|---|
| 工具 deny / ask 旁路 | `lib/hooks-deny.js`、`lib/child-process-hide.mjs` | #80 |
| 网络范围拦截 | `lib/net-scope.js` | `installNetScope()`、`appendDenial()` |
| 宿主面适配 | `lib/host.js`、`lib/host-clean.js`、`lib/surface.js`、`lib/desktop.js`、`lib/web.js` | gui / tui / web |
| 安装 / 更新 / 回滚 / 卸载 | `lib/update.js`、`lib/reapply.js`、`lib/reapply-cli.js`、`lib/rewind.js`、`lib/uninstall.js`、`lib/uninstall-restart.js` | |
| 官方客户端补丁回写 | `lib/official-update.js`、`lib/official-update.wscript`、`lib/extract-asar.js` | |
| 重启宿主 | `lib/restart-desktop.js`、`lib/restart-web.js`、`lib/settle-policy.js`、`lib/hide-console.js` | |
| 演练台授权 | `lib/drill-grant.js`、`lib/phase1-keep.js` | |
| 续写重试 | `lib/continue-retry.js` | 配置 `autoContinue` / `continueMax` / `continueText` |
| 杂项 | `lib/zip-extract.js`、`lib/skills.js` | |

### 演练台（红队，继承自上游）

| 模块 | 代码区域 |
|---|---|
| 服务与编排 | `lib/redteam/index.js`、`store.js`、`store-core.js`（SQLite 事实库） |
| HTTP 桥 | `lib/redteam/ui.js`（`POST /redteam/api`） |
| 工具集 | `lib/redteam/tools.js`、`skill-fixes.js`、`skill-availability.js` |
| 评分与校验 | `lib/redteam/score-rules.js`、`validate.js`、`schema.js` |
| 预设合成 / 报告 | `lib/redteam/preset-composition.js`、`report-replay.js`、`role-section.js` |
| 平台配置 | `lib/redteam/platform-config.js`、`ip-utils.js`、`settings.js` |
| 客户端 | `lib/redteam/client.js` |
| 技能 | `skills/redteam/*.md`（23 个） |
| 预设 | `presets/redteam/preset.yml`、`agent.cordis.yml`、`anchor-gate.mjs` |

### 外围

| 模块 | 位置 |
|---|---|
| 挂载与配置 | `cordis.patch.yml` |
| 客户端 UI 包（构建产物） | `client.js`，由 `scripts/build-client.mjs` 生成 |
| CLI | `bin/dsh-loom.js` |
| 脚本 | `scripts/embed-default-prompt.mjs`、`build-client.mjs`、`patch-client-dock.mjs`、`export-engagement-report.mjs`、`redteam-setup.sh` |
| 发布 | `.github/workflows/release.yml` |

## 模块职责与交互

**提示词层内部的数据流**（现役）：

```
cordis.patch.yml  →  挂载 dsh-loom
      ↓
lib/index.js apply()
      ↓
registerPromptSections(ctx, config)
      ├─ dsh-loom                @ order -100000   ← 主提示词
      ├─ dshpg-loom-capabilities @ order -99999    ← 能力协议（capabilityProtocol 控制）
      └─ dsh-loom:post           @ order 5100      ← 仅当 postPrompt 非空
      ↓
每个 section 的 text 每轮求值
      ↓
systemPrompt.assemble() 按 order 升序排 sections
      ↓
renderPrompt() 拼成一个字符串（空文本的 section 被过滤）
      ↓
作为唯一一条 role:"system" 消息发出去
```

主提示词的取文优先级（`lib/index.js`）：**提示词框自改 > `prompt-inject.md` > 加密默认稿**，并带「永不空串」兜底。

**覆盖层**：`lib/core.js` 用 `$DSH_HOME/dsh-loom/override-state.json` 记录 `{customized, hash, seedHash, updatedAt}`；`looksLikePluginDefault()` 判断盘上那份是不是插件自带默认稿，决定是否重新 seed。

**两处 `agent/pre-step` 钩子**（都在 `lib/index.js`）：

- `installMnemonMessageStrip` —— 在瀑布上 `filter` 掉 mnemon 插件消息（受 `stripMnemon` 控制）。挂载带 `mounted` 闸，防叠层
- `installIdentityOverride` —— 不加减消息，只调 `wrapAssemble("preStep")` 重挂装配代理

两处都**不往消息数组里加内容**。

## 关键数据结构

### 提示词块（目标形态）

| 字段 | 来源 | 说明 |
|---|---|---|
| `id` | 酒馆预设的 `identifier` | 唯一键 |
| `name` | `name` | 显示名 |
| `content` | `content` | 正文 |
| `slots` | 由 `injection_position` 推导 | 数组，可同时含 `top` 和 `tail` |
| `role` | `role` | 单独存，不能从位置推 |
| `enabled` | `enabled` | 开关 |
| `builtin` | 本项目自加 | 默认块标记，不可删 |
| `tailDepth` | `injection_depth` | 只为兼容酒馆预设而存在，不做排布 |

### 插件配置（`cordis.patch.yml`，16 个 key）

`enabled` `autoApplyOnStart` `autoUpdateOnStart` `autoRevertOnMissing` `injectOnce` `stripMnemon` `verbose` `postPrompt` `postPromptOrder` `autoRetry` `retryMax` `autoContinue` `continueMax` `continueText` `capabilityProtocol` `hooksDenyBypass`

与 `lib/index.js` 的 `DEFAULTS` 键集合一致。

### 宿主目录

| 路径 | 内容 |
|---|---|
| `$DSH_HOME/prompt-inject.md` | 现役提示词（22,343 字）。**目标形态下废弃** |
| `$DSH_HOME/dsh-loom/override-state.json` | 覆盖状态 |
| `$DSH_HOME/dsh-loom/` | 演练台授权文件 |
| `$DSH_HOME/redteam/` | 演练台 SQLite 事实库 |

## 必须遵守的约束

1. **`systemPrompt.section()` 只能产出 system 角色。** `PromptSection` 类型没有 `role` 字段；`renderPrompt()` 把全部 sections 拼成一个字符串，最终固定变成一条 `role:"system"` 消息。
2. **`agent/pre-step` 只能产出 user 消息。** 返回类型是 `UserMessage[]`，消费端把每个元素硬编码记成 `user/message`。塞 assistant 角色不会当场报错，但会写脏持久日志，**下次加载必抛** `user/message message must have role "user"`。要 assistant 得走 `session.append('assistant/message', …)`（范本见上游 `lib/net-scope.js` 的 `appendDenial()`）。
3. **`order` 不是 `depth`。** `order` 只在**那一条 system 消息内部**排序，越小越靠前；`depth` 决定插在**消息数组的第几条**。两者是完全不同的轴。
4. **`renderPrompt()` 会过滤空文本的 section。** `text: () => ""` 是让一个 section 静默消失的合法手段。
5. **提示词层的让位必须改代码。** 现役闸门只有 `config.enabled !== false`，且带「永不空串」兜底——清空 `prompt-inject.md` 会让它掉头读加密默认稿。空文件既不算插件默认、也不算可保留的用户自改，会被同步逻辑覆盖回去。
6. **两份 dsh-purge 的内容一致，但行尾不同。** 仓库检出 `core.autocrlf = true` → CRLF；npm 安装副本 → LF。逐文件哈希比会报 92 个「差异」，归一化换行后归零。
7. **计数用 UTF-8 显式读。** 本机默认 shell 是 Windows PowerShell 5.1，`Get-Content` 按 CP936 解码，同一份 UTF-8 中文文件会报错值。
8. **主分支只通过 PR 前进。** 功能 commit 不直推主分支。

## 当前支持的功能

- 系统提示词整体注入（单段，`order = -100000`）
- 提示词覆盖层与「恢复出厂」（`prompt-inject.md` + 加密默认稿）
- 能力选用协议段
- 沙箱 / 审批 / 工具 / 文件系统绕过（46 处代码补丁）
- 演练台：SQLite 事实库、23 个红队技能、预设合成、评分与报告
- web / desktop 宿主面适配、安装 / 更新 / 回滚 / 卸载

## 演进方向

**一期（Issue #1）**：块引擎（顶部）+ 三档存储 + 一键回默认 + UI。把一个 22,343 字的单体提示词拆成可开关的块。

**二期**：尾部注入 + `role` 分流 + 宏引擎 + 酒馆预设导入。
