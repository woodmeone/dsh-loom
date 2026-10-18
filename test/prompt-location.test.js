import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as core from "../lib/core.js";

/** 提示词正文落在插件自己的数据目录，不再占用 $DSH_HOME 公共位置。 */
test("findOverrideFile 指向插件数据目录", () => {
  const home = path.join(os.tmpdir(), "loom-probe");
  assert.equal(core.findOverrideFile(home), path.join(home, "dsh-loom", "prompt-inject.md"));
  assert.equal(core.findLegacyOverrideFile(home), path.join(home, "prompt-inject.md"));
});

test("旧位置自动回退读取，迁移后新位置优先且幂等", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "loom-mig-"));
  try {
    const body = "<|im_start|>system:<project_instructions>\n\n迁移探针\n<!-- purge-default-rev: seagull-v2 -->\n";
    fs.writeFileSync(core.findLegacyOverrideFile(home), body, "utf8");

    // 新位置还没有 → 回退读到旧位置
    assert.match(core.readPromptInjectFileSync(home), /迁移探针/);

    // 迁移一次
    const first = core.migratePromptFileLocation(home);
    assert.equal(first.moved, true);
    assert.match(fs.readFileSync(core.findOverrideFile(home), "utf8"), /迁移探针/);

    // 旧文件保留（不删）
    assert.equal(fs.existsSync(core.findLegacyOverrideFile(home)), true);

    // 幂等
    assert.equal(core.migratePromptFileLocation(home).moved, false);

    // 两处都有时新位置优先
    fs.writeFileSync(core.findLegacyOverrideFile(home), "旧位置的另一份", "utf8");
    assert.match(core.readPromptInjectFileSync(home), /迁移探针/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("内置默认稿就是随插件发行的那一份", () => {
  const bundled = core.defaultOverrideText();
  assert.ok(bundled.length > 1000, "内置稿不应为空");
  assert.equal(core.looksLikePluginDefault(bundled), true, "内置稿必须被认作插件默认");
  assert.equal(core.defaultOverrideText(), core.defaultOverrideText(), "两次解出应一致");
});
