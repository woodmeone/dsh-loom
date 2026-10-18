import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as blocks from "../lib/blocks.js";
import * as edit from "../lib/blocks-edit.js";

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "loom-edit-"));
}
function seed(home, id, body) {
  const dir = blocks.blocksDir(home);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.md`), body, "utf8");
}

test("改内容写 override，默认块文件不动", () => {
  const home = tmpHome();
  try {
    seed(home, "core-persona", "出厂内容");
    const r = edit.setBlockContent(home, "core-persona", "改过的内容");
    assert.equal(r.ok, true);
    assert.equal(r.overridden, true);

    // 默认块本体没变
    const def = fs.readFileSync(path.join(blocks.blocksDir(home), "core-persona.md"), "utf8");
    assert.equal(def, "出厂内容");

    // 装配用 override
    assert.match(blocks.readBlockContent(home, "core-persona").text, /改过的内容/);
    assert.equal(blocks.readBlockContent(home, "core-persona").source, "override");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("撤销本次改动回到默认，被删内容进 _trash", () => {
  const home = tmpHome();
  try {
    seed(home, "core-persona", "出厂内容");
    edit.setBlockContent(home, "core-persona", "第一次改");
    edit.setBlockContent(home, "core-persona", "第二次改");

    const r = edit.revertBlock(home, "core-persona");
    assert.equal(r.ok, true);
    assert.match(blocks.readBlockContent(home, "core-persona").text, /出厂内容/);

    const trash = path.join(blocks.blockRoot(home), "_trash");
    assert.equal(fs.existsSync(trash), true);
    const all = fs.readdirSync(trash, { recursive: true })
      .filter((f) => String(f).endsWith("core-persona.md"));
    assert.ok(all.length >= 2, `trash 里应有历史版本，实际 ${all.length}`);

    // 再撤销应报错（已无 override）
    assert.equal(edit.revertBlock(home, "core-persona").ok, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("默认块不可删，自建块可删", () => {
  const home = tmpHome();
  try {
    seed(home, "core-persona", "x");
    const bad = edit.removeBlock(home, "core-persona");
    assert.equal(bad.ok, false);
    assert.match(bad.error, /不可删除/);

    const add = edit.addBlock(home, { id: "my-block", name: "我的块", content: "自建内容" });
    assert.equal(add.ok, true);
    assert.match(blocks.readBlockContent(home, "my-block").text, /自建内容/);

    const del = edit.removeBlock(home, "my-block");
    assert.equal(del.ok, true);
    assert.equal(blocks.readBlockContent(home, "my-block").text, "");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("非法 id 一律拒绝（防目录穿越）", () => {
  const home = tmpHome();
  try {
    for (const bad of ["../etc/passwd", "a/b", "a\\b", "", "   ", "a b"]) {
      const r = edit.setBlockContent(home, bad, "x");
      assert.equal(r.ok, false, `应拒绝: ${JSON.stringify(bad)}`);
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("开关与排序只动 config，不碰正文", () => {
  const home = tmpHome();
  try {
    seed(home, "core-persona", "A");
    seed(home, "core-style", "B");
    const before = fs.readFileSync(path.join(blocks.blocksDir(home), "core-persona.md"), "utf8");

    edit.updateBlockMeta(home, "core-persona", { enabled: false });
    assert.equal(blocks.assembleTop(home).text, "B");

    edit.updateBlockMeta(home, "core-persona", { enabled: true, order: 999 });
    assert.equal(blocks.assembleTop(home).text, "B\n\nA");

    const after = fs.readFileSync(path.join(blocks.blocksDir(home), "core-persona.md"), "utf8");
    assert.equal(before, after, "正文不该被动");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("恢复出厂：override 清空、config 回内建、历史进 trash", () => {
  const home = tmpHome();
  try {
    seed(home, "core-persona", "出厂");
    edit.setBlockContent(home, "core-persona", "改过");
    edit.updateBlockMeta(home, "core-style", { enabled: false });
    edit.addBlock(home, { id: "temp-x", name: "临时" });

    const r = edit.restoreFactory(home);
    assert.equal(r.ok, true);
    assert.ok(r.moved.length > 0);
    assert.equal(fs.existsSync(r.trash), true);

    // 内容回出厂
    assert.match(blocks.readBlockContent(home, "core-persona").text, /出厂/);
    assert.equal(blocks.readBlockContent(home, "core-persona").source, "default");

    // config 里只剩内建块
    const cfg = blocks.loadConfig(home);
    assert.equal(cfg.blocks.length, blocks.BUILTIN_BLOCKS.length);
    assert.ok(!cfg.blocks.some((b) => b.id === "temp-x"), "自建块应被清掉");

    // 默认开关状态回来（任务路由关）
    assert.equal(cfg.blocks.find((b) => b.id === "core-routing").enabled, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("snapshot 给出 UI 要的全部信息", () => {
  const home = tmpHome();
  try {
    seed(home, "core-persona", "内容");
    const s = edit.snapshot(home);
    assert.ok(Array.isArray(s.items));
    assert.ok(s.topText.length > 0);
    const p = s.items.find((x) => x.id === "core-persona");
    assert.equal(p.content, "内容");
    assert.equal(p.overridden, false);
    assert.equal(typeof p.enabled, "boolean");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("config 缺失时编辑会自动建好并补全默认块", () => {
  const home = tmpHome();
  try {
    assert.equal(fs.existsSync(blocks.configPath(home)), false);
    edit.updateBlockMeta(home, "core-armor", { enabled: false });
    assert.equal(fs.existsSync(blocks.configPath(home)), true);
    const cfg = blocks.loadConfig(home);
    assert.equal(cfg.blocks.length, blocks.BUILTIN_BLOCKS.length);
    assert.equal(cfg.blocks.find((b) => b.id === "core-armor").enabled, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
