# ADR-0001：从 dsh-purge 整份派生

- 状态：已接受
- 日期：2026-10-18

## 背景

需要一个跑在 dsh 上的「破限破甲 + 提示词管理」插件。

`dsh-purge` 已经提供本项目需要的全部执行环境能力：46 处代码补丁（沙箱 / 审批 / 工具 / 文件系统绕过）、redteam 演练台、23 个红队技能。这部分不打算重做。

问题出在提示词层。`dsh-purge` 的提示词闸门只有一处：

```js
// lib/index.js:165
function injectAllowedNow(config) {
  return config.enabled !== false;
}
```

关掉它，46 处补丁一起没。而绕开闸门的另一条路也是死的——`lib/index.js:195-198` 带「永不空串」兜底：

```js
const fallback = core.normalizeOverride(core.defaultOverrideText()) || "";
const text = resolved.text || fallback;
```

清空 `prompt-inject.md` 会让它掉头读加密默认稿。而且空文件在 `looksLikePluginDefault()`（`lib/core.js:7671`）与 `isKeepableUserOverride()`（`lib/core.js:7679`）里都返回 `false`——既不算插件默认、也不算可保留的用户自改，会被同步逻辑覆盖回去。

**结论：要让提示词层让位，必须改代码。**

## 决策与取舍

**整份复制 `dsh-purge` 成一个新仓库 `dsh-loom`，改副本。原包保持可用。**

放弃了三个方案：

- **独立插件挂在原 purge 旁边。** 两套都往 `order = -100000` 注入，46 处补丁也会叠两遍。
- **vendor 目录或软链。** 违反 `git-native-sop` 的「无额外副本」——同一份代码出现第二个可写位置就是事故源。
- **向上游发 PR。** 上游定位是红队工具，本项目要加的是提示词管理，方向不同。

## 后果

- 新仓库继承上游**全部代码与安全面**，包括演练台和红队技能。想改提示词时得在一堆红队代码里找路。
- Git 历史**从「导入基底」这一个 commit 起算**，不含上游历史。上游唯一的记录是根目录 `release-notes.md`（冻结，不再追加）。
- 上游后续更新需要**手工搬运**，不能 merge。
- 新仓库与原包在 `node_modules` 里会并存。挂载层必须只挂一个（见 `cordis.patch.yml`）。
