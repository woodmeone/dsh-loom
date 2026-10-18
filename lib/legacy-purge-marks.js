/**
 * dsh-purge v1.1.71 遗留标记 —— 历史常量，只读。
 *
 * 这些字符串是上游 dsh-purge（v1.1.71，commit 6c1d638）写在盘上的标记：
 * 它把 `[dsh-purge] ...` 注释、`"dsh-purge"` 段名、`__dsh_purge_deny_disabled__`
 * 死字符串、`dsh-purge shim begin/end`、`dshpg-*` 段名前缀等写进宿主文件，
 * 下一轮再靠这些字面量判断"这个文件已经打过了"。
 *
 * 本模块只做两件事：
 *   1. 把旧字面量收在一处，**任何新写入都不得再使用它们**；
 *   2. 提供 legacyOf / markPresent / hasLegacyMarks，让 dsh-loom 能把
 *      "盘上是 dsh-purge 打过的" 认成"已经打过"，从而不重打、不静默叠加。
 *
 * 判断旧盘面的顺序永远是：新标记没命中时，再看一次旧形态。
 * 绝不允许把这里返回的旧字符串当成新写入内容 —— 那是 dsh-purge 的签名，
 * 写进去会让 dsh-loom 与 dsh-purge 在盘上不可区分。
 */

/** 上游包名 / cordis id / 数据目录名 / 日志前缀 / patch marker 标签。 */
export const LEGACY_PACKAGE_NAME = "dsh-purge";

/** 段名前缀：能力协议、目标、红队角色段用的是 `dshpg-*`。 */
export const LEGACY_SECTION_PREFIX = "dshpg-";

/** hooks deny 旁路写进宿主的死字符串（占位分支，永远不会等于真实 decision）。 */
export const LEGACY_DENY_DISABLED = "__dsh_purge_deny_disabled__";

/** 环境变量前缀：DSH_PURGE_RESTART / DSH_PURGE_DEEP_AIBASE_SCAN / ... */
export const LEGACY_ENV_PREFIX = "DSH_PURGE_";

/** core.js 里"原文是否已被我们改过"那枚 needle 的旧常量名。 */
export const LEGACY_MARKER_NEEDLE = "DSH_PURGE_MARKER_NEEDLE";

/** 新标记的正式名字（旧的是 LEGACY_PACKAGE_NAME）。 */
export const LOOM_TAG = "dsh-loom";

/** 新段名前缀（旧的是 LEGACY_SECTION_PREFIX）。 */
export const LOOM_SECTION_PREFIX = "dshpg-loom-";

/**
 * 遍历用的旧标记表（人看的清单）。`dshpg-` 后面跟 `loom-` 是新前缀，见下面的正则。
 */
export const LEGACY_MARKS = Object.freeze([
  LEGACY_PACKAGE_NAME,
  LEGACY_SECTION_PREFIX,
  LEGACY_DENY_DISABLED,
  LEGACY_ENV_PREFIX,
]);

/**
 * 判定旧盘面用的正则。
 *
 * 两条约束：
 *   1. `dshpg-` 必须排除新前缀 `dshpg-loom-`，否则新盘面会被反复判成旧的、无限迁移；
 *   2. 四个变体一个都不能漏。漏了会出现「NEW_TO_OLD 里认、这里不认」的表不一致，
 *      表现是 toLoomMarks 提前 return，某个变体永远迁不过来（v1.1.71 迁移期曾漏
 *      `dsh_purge`，导致裸下划线写法不被识别）。
 */
const LEGACY_MARK_RES = Object.freeze([
  /dsh-purge/,
  /dshpg-(?!loom-)/,
  /__dsh_purge_/,
  /(?<![A-Za-z0-9_])dsh_purge(?![A-Za-z0-9_])/,
  /DSH_PURGE/,
]);

/**
 * 新 → 旧 的还原表。顺序敏感：先长后短，避免 `dshpg-loom-` 被 `dsh-loom` 规则咬到。
 * 只用于"再看一眼旧形态"，不用于写入。
 */
const NEW_TO_OLD = Object.freeze([
  ["dshpg-loom-", LEGACY_SECTION_PREFIX],
  ["__dsh_loom_", "__dsh_purge_"],
  ["DSH_LOOM", "DSH_PURGE"],
  ["dsh_loom", "dsh_purge"],
  ["dsh-loom", LEGACY_PACKAGE_NAME],
]);

/** 把任意"新形态"字符串还原成 dsh-purge v1.1.71 的写法。 */
export function legacyOf(text) {
  let out = String(text ?? "");
  if (!out) return out;
  for (const [from, to] of NEW_TO_OLD) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

/**
 * 旧 → 新。一次性迁移用：把宿主里 dsh-purge v1.1.71 写下的标记整体换成 dsh-loom 写法。
 * 每一代盘面都只换一次；`dshpg-` 带 lookahead，避免把混写文本里的 `dshpg-loom-` 变成 `dshpg-loom-loom-`。
 */
export function toLoomMarks(text) {
  let out = String(text ?? "");
  if (!out) return out;
  if (!hasLegacyMarks(out)) return out;
  out = out.replace(/dshpg-(?!loom-)/g, LOOM_SECTION_PREFIX);
  out = out.replace(/__dsh_purge_/g, "__dsh_loom_");
  out = out.replace(/DSH_PURGE/g, "DSH_LOOM");
  out = out.replace(/dsh_purge/g, "dsh_loom");
  out = out.split(LEGACY_PACKAGE_NAME).join(LOOM_TAG);
  return out;
}

/** 盘上是否带 dsh-purge v1.1.71 的标记。 */
export function hasLegacyMarks(text) {
  const s = String(text ?? "");
  if (!s) return false;
  for (const re of LEGACY_MARK_RES) {
    if (re.test(s)) return true;
  }
  return false;
}

/** 盘上是否带 dsh-loom 的标记。 */
export function hasLoomMarks(text) {
  return String(text ?? "").includes(LOOM_TAG);
}

/** 正则字面量转义。 */
export function escapeRegExp(text) {
  return String(text ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 生成"新写法或旧写法"的正则源片段，给必须同时匹配两代盘面的正则用。
 * @param {string} marker 新写法的标记
 */
export function tagRegexSource(marker) {
  const now = escapeRegExp(marker);
  const old = escapeRegExp(legacyOf(marker));
  return old === now ? now : `(?:${now}|${old})`;
}

/** 盘上是否带任一版本的标记（新或旧）。 */
export function hasAnyMark(text) {
  return hasLoomMarks(text) || hasLegacyMarks(text);
}

/**
 * 单条标记是否命中：先看新写法，再看 dsh-purge v1.1.71 的写法。
 * @param {string} hay 待检查文本
 * @param {string} marker 新写法的标记（`[dsh-loom] xxx`、`startsWith("dsh-loom")`、`__dsh_loom_deny_disabled__` ...）
 */
export function markPresent(hay, marker) {
  const s = String(hay ?? "");
  const m = String(marker ?? "");
  if (!s || !m) return false;
  if (s.includes(m)) return true;
  const old = legacyOf(m);
  return old !== m && s.includes(old);
}

/** 一组标记是否命中。any=true 时任一命中即可。 */
export function markersPresent(hay, markers, any = false) {
  if (!Array.isArray(markers) || markers.length === 0) return false;
  const test = (marker) => markPresent(hay, marker);
  return any ? markers.some(test) : markers.every(test);
}

/** shim 注入块的 tag：which = "begin" | "end" | ""（整个前缀）。 */
export function shimTagPresent(text, which = "") {
  return markPresent(text, `dsh-loom shim${which ? ` ${which}` : ""}`);
}
