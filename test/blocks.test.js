import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as blocks from "../lib/blocks.js";

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "loom-blocks-"));
}

function writeBlock(home, id, body) {
  const dir = blocks.blocksDir(home);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.md`), body, "utf8");
}

test("零配置：config.json 不存在时用内建默认块表", () => {
  const home = tmpHome();
  try {
    const cfg = blocks.loadConfig(home);
    assert.equal(cfg.source, "builtin");
    assert.equal(cfg.blocks.length, blocks.BUILTIN_BLOCKS.length);
    assert.ok(cfg.blocks.every((b) => b.builtin === true));
    // 任务路由默认关
    const routing = cfg.blocks.find((b) => b.id === "core-routing");
    assert.equal(routing.enabled, false, "任务路由应默认关闭");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("装配：只拼 enabled 的块，按 order 升序，空块跳过", () => {
  const home = tmpHome();
  try {
    writeBlock(home, "core-persona", "我是海鸥");
    writeBlock(home, "core-style", "短句");
    writeBlock(home, "core-routing", "这段不该出现");
    // 其余默认块没有正文文件，应被跳过

    const out = blocks.assembleTop(home);
    assert.equal(out.text, "我是海鸥\n\n短句");
    assert.deepEqual(out.parts.map((p) => p.id), ["core-persona", "core-style"]);
    assert.ok(!out.text.includes("这段不该出现"), "关闭的块不能进正文");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("三档优先级：内联 > overrides > 默认", () => {
  const home = tmpHome();
  try {
    writeBlock(home, "core-persona", "默认档");
    fs.mkdirSync(path.join(blocks.blockRoot(home), "overrides"), { recursive: true });
    fs.writeFileSync(path.join(blocks.blockRoot(home), "overrides", "core-persona.md"), "覆盖档", "utf8");

    assert.equal(blocks.readBlockContent(home, "core-persona").source, "override");
    assert.match(blocks.readBlockContent(home, "core-persona").text, /覆盖档/);

    // 加内联 → 内联赢
    const cfg = blocks.loadConfig(home);
    const list = cfg.blocks.map((b) =>
      b.id === "core-persona" ? { ...b, content: "内联档" } : b,
    );
    fs.writeFileSync(
      blocks.configPath(home),
      JSON.stringify({ blocks: list }, null, 2),
      "utf8",
    );
    const r = blocks.readBlockContent(home, "core-persona");
    assert.equal(r.source, "inline");
    assert.match(r.text, /内联档/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("默认块不可删：config.json 漏掉它会被补回来", () => {
  const home = tmpHome();
  try {
    fs.mkdirSync(blocks.blockRoot(home), { recursive: true });
    fs.writeFileSync(
      blocks.configPath(home),
      JSON.stringify({ blocks: [{ id: "custom-a", name: "自建", order: 10, enabled: true }] }),
      "utf8",
    );
    const cfg = blocks.loadConfig(home);
    const ids = cfg.blocks.map((b) => b.id);
    for (const b of blocks.BUILTIN_BLOCKS) {
      assert.ok(ids.includes(b.id), `默认块 ${b.id} 必须存在`);
      assert.equal(cfg.blocks.find((x) => x.id === b.id).builtin, true);
    }
    assert.ok(ids.includes("custom-a"), "自建块保留");
    assert.equal(cfg.blocks.find((x) => x.id === "custom-a").builtin, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("损坏的 config.json 不炸，降级成内建默认", () => {
  const home = tmpHome();
  try {
    fs.mkdirSync(blocks.blockRoot(home), { recursive: true });
    fs.writeFileSync(blocks.configPath(home), "{ 这不是 JSON", "utf8");
    const cfg = blocks.loadConfig(home);
    assert.equal(cfg.source, "builtin");
    assert.equal(cfg.blocks.length, blocks.BUILTIN_BLOCKS.length);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("顺序即覆盖：改 order 就改拼接次序", () => {
  const home = tmpHome();
  try {
    writeBlock(home, "core-persona", "A");
    writeBlock(home, "core-style", "B");
    assert.equal(blocks.assembleTop(home).text, "A\n\nB");

    fs.mkdirSync(blocks.blockRoot(home), { recursive: true });
    const cfg = blocks.loadConfig(home);
    const list = cfg.blocks.map((b) => {
      if (b.id === "core-persona") return { ...b, order: 900 };
      if (b.id === "core-style") return { ...b, order: 100 };
      return b;
    });
    fs.writeFileSync(blocks.configPath(home), JSON.stringify({ blocks: list }), "utf8");
    assert.equal(blocks.assembleTop(home).text, "B\n\nA");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("一个块可同时挂顶部与尾部", () => {
  const home = tmpHome();
  try {
    writeBlock(home, "core-persona", "两处都出");
    fs.mkdirSync(blocks.blockRoot(home), { recursive: true });
    const cfg = blocks.loadConfig(home);
    const list = cfg.blocks.map((b) =>
      b.id === "core-persona" ? { ...b, slots: ["top", "tail"] } : b,
    );
    fs.writeFileSync(blocks.configPath(home), JSON.stringify({ blocks: list }), "utf8");

    assert.match(blocks.assembleTop(home).text, /两处都出/);
    assert.match(blocks.assembleTail(home).text, /两处都出/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("describe 给出可读状态", () => {
  const home = tmpHome();
  try {
    writeBlock(home, "core-persona", "我是海鸥");
    const d = blocks.describe(home);
    assert.ok(d.total >= blocks.BUILTIN_BLOCKS.length);
    assert.ok(d.topBytes > 0);
    assert.ok(Array.isArray(d.blocks));
    const persona = d.blocks.find((b) => b.id === "core-persona");
    assert.equal(persona.bytes, 4);
    assert.equal(persona.source, "default");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
