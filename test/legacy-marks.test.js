/**
 * 补丁链测试：改名不能让"这个文件已经打过了"判断失效。
 *
 * 失败模式（本测试就是钉住它）：dsh-purge v1.1.71 把 `[dsh-purge] xxx` 之类标记
 * 写进了宿主文件，dsh-loom 只认 `[dsh-loom] xxx` 就会认不出旧盘面 → 重打一遍 →
 * 不报错、静默叠加。
 *
 * 用合成盘面跑，不读本机任何宿主文件。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasAnyMark,
  hasLegacyMarks,
  legacyOf,
  markPresent,
  markersPresent,
  toLoomMarks,
} from "../lib/legacy-purge-marks.js";
import { ALL_PATCHES, applyReplacementsToText, patchApplied } from "../lib/core.js";

/** 旧插件的典型盘面：marker 注释 + 段名 + 死字符串 + 环境变量。 */
const LEGACY_PANEL = [
  "const sections = assembled.sections.filter(section => keep.has(section?.name) || String(section?.name || \"\").startsWith(\"dsh-purge\") || String(section?.name || \"\").startsWith(\"dshpg-\"))",
  "// [dsh-purge] phase-1 keep persona+inject sections",
  "const PERSONA_SECTION_NAMES = new Set(['deployment:persona', 'persona', 'dsh-purge', 'dsh-purge:rules'])",
  'if (merged.decision === "__dsh_purge_deny_disabled__") /* [dsh-purge] hooks deny→allow */ return { kind: "reject" };',
  "Started by DSH_PURGE_RESTART=1",
  "shim tag: dsh-purge shim begin",
  "",
].join("\n");

test("hasLegacyMarks 认得旧盘面，hasAnyMark 两代都认", () => {
  assert.equal(hasLegacyMarks(LEGACY_PANEL), true);
  assert.equal(hasAnyMark(LEGACY_PANEL), true);
  assert.equal(hasLegacyMarks("nothing to see here"), false);
  assert.equal(hasAnyMark("[dsh-loom] identity stripped"), true);
  // .dshpurge.bak 这种磁盘产物名不是标记，别误判。
  assert.equal(hasLegacyMarks("file.js.dshpurge.bak"), false);
});

test("markPresent 先认新写法，再认旧写法", () => {
  assert.equal(markPresent(LEGACY_PANEL, "[dsh-loom] hooks deny→allow"), true);
  assert.equal(markPresent(LEGACY_PANEL, "startsWith(\"dsh-loom\")"), true);
  assert.equal(markPresent(LEGACY_PANEL, "startsWith(\"dshpg-loom-\")"), true);
  assert.equal(markPresent(LEGACY_PANEL, "__dsh_loom_deny_disabled__"), true);
  assert.equal(markPresent(LEGACY_PANEL, "__dsh_loom_something_else__"), false);
  assert.equal(markersPresent(LEGACY_PANEL, ["[dsh-loom] hooks deny→allow", "[dsh-loom] hooks ask→allow"], true), true);
  assert.equal(markersPresent(LEGACY_PANEL, ["[dsh-loom] hooks deny→allow", "[dsh-loom] hooks ask→allow"], false), false);
});

test("legacyOf / toLoomMarks 互为反向，迁移幂等", () => {
  assert.equal(legacyOf(toLoomMarks(LEGACY_PANEL)), LEGACY_PANEL);
  const migrated = toLoomMarks(LEGACY_PANEL);
  assert.equal(hasLegacyMarks(migrated), false);
  assert.equal(toLoomMarks(migrated), migrated);
  // 混写（一半新一半旧）也要收敛，不能变成 dshpg-loom-loom-。
  assert.equal(toLoomMarks("dshpg-loom-x and dshpg-y"), "dshpg-loom-x and dshpg-loom-y");
  assert.equal(toLoomMarks("dshpg-loom-x"), "dshpg-loom-x");
});

test("补丁已经打过就不再重打：patchApplied 认旧标记", () => {
  const patch = ALL_PATCHES.find(
    (p) => Array.isArray(p.markers) && p.markers.length === 1 && p.markers[0].startsWith("[dsh-loom]"),
  );
  assert.ok(patch, "找不到带 markers 的补丁，测试需要更新");
  const marker = patch.markers[0];
  assert.equal(patchApplied(`lead-in\n${marker}\n`, patch), true, "新标记要算已打");
  assert.equal(patchApplied(`lead-in\n${legacyOf(marker)}\n`, patch), true, "旧标记也必须算已打");
  assert.equal(patchApplied("lead-in\nnothing marked\n", patch), false);
});

test("盘面迁移：旧写法被打过的补丁文件只迁移一次，然后收敛", () => {
  const patch = ALL_PATCHES.find(
    (p) =>
      Array.isArray(p.replacements) &&
      p.replacements.length === 1 &&
      typeof p.replacements[0].replace === "string" &&
      p.replacements[0].replace.includes("[dsh-loom]") &&
      Array.isArray(p.markers),
  );
  assert.ok(patch, "找不到合适的补丁做迁移测试");
  const body = patch.replacements[0].replace;
  const legacyBody = legacyOf(body);
  assert.notEqual(legacyBody, body);

  // 第一次：旧盘面被迁移成新写法，patchApplied 认出"已打"，不再叠加。
  const first = applyReplacementsToText(legacyBody, patch);
  assert.equal(hasLegacyMarks(first.text), false, "迁移后不该再留旧写法");
  assert.equal(patchApplied(first.text, patch), true);

  // 第二次：已经是新写法，读写都为空操作。
  const second = applyReplacementsToText(first.text, patch);
  assert.equal(second.text, first.text, "迁移必须幂等");
  assert.equal(second.changed, false, "第二次不该再判定有改动");
});
