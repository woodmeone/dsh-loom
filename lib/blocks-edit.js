/**
 * 块的编辑操作 —— 供 UI 与工具调用。
 *
 * 与 lib/blocks.js 的分工：blocks.js 只读（装配用，必须无副作用）；
 * 这里负责写：改内容、开关、排序、撤销、恢复出厂。
 *
 * 三档存储的写入规则：
 *   · 改一个默认块 → 写 `overrides/<id>.md`，blocks/<id>.md 原样不动
 *   · 恢复出厂 → 删 `overrides/<id>.md`，被删的内容进 `_trash/<时间戳>/`
 *   · 撤销本次改动 → 同上，但只对「有 override」的块有效
 *   · 改开关 / 顺序 / 位置 → 只动 config.json，不碰内容
 */

import fs from "node:fs";
import path from "node:path";
import * as blocks from "./blocks.js";

function root(dshHome) {
  return blocks.blockRoot(dshHome);
}

function cfgPath(dshHome) {
  return blocks.configPath(dshHome);
}

function readConfigRaw(dshHome) {
  try {
    const fp = cfgPath(dshHome);
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}

function writeConfigRaw(dshHome, cfg) {
  const fp = cfgPath(dshHome);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const tmp = `${fp}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, fp);
  return fp;
}

/** 保证 config.json 存在，且含全部默认块（首次编辑时的兜底）。 */
function ensureConfig(dshHome) {
  const existing = readConfigRaw(dshHome);
  if (existing && Array.isArray(existing.blocks)) {
    const ids = new Set(existing.blocks.map((b) => b?.id));
    let dirty = false;
    for (const b of blocks.BUILTIN_BLOCKS) {
      if (!ids.has(b.id)) {
        existing.blocks.push({
          id: b.id, name: b.name, order: b.order, enabled: b.enabled,
          role: "system", slots: [b.id === "core-tail" ? "tail" : "top"], tailDepth: 0,
        });
        dirty = true;
      }
    }
    if (dirty) writeConfigRaw(dshHome, existing);
    return existing;
  }
  const cfg = {
    $comment: "块目录配置。order 决定装配次序（顺序即覆盖）；builtin 块不可删。",
    blocks: blocks.BUILTIN_BLOCKS.map((b) => ({
      id: b.id, name: b.name, order: b.order, enabled: b.enabled,
      role: "system", slots: [b.id === "core-tail" ? "tail" : "top"], tailDepth: 0,
    })),
  };
  writeConfigRaw(dshHome, cfg);
  return cfg;
}

/** 把一份内容挪进 _trash，返回落点。不删。 */
function toTrash(dshHome, id, text) {
  if (!text) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(root(dshHome), "_trash", stamp);
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, `${id}.md`);
  fs.writeFileSync(fp, text, "utf8");
  return fp;
}

function safeId(id) {
  const s = String(id || "").trim();
  if (!s) return "";
  // 只允许字母数字下划线点短横，防目录穿越
  return /^[A-Za-z0-9_.-]+$/.test(s) ? s : "";
}

/** 改块正文 → 写 override。 */
export function setBlockContent(dshHome, id, content) {
  const bid = safeId(id);
  if (!bid) return { ok: false, error: "非法块 id" };
  const cfg = ensureConfig(dshHome);
  if (!cfg.blocks.some((b) => b.id === bid)) return { ok: false, error: `块不存在: ${bid}` };
  const dir = path.join(root(dshHome), "overrides");
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, `${bid}.md`);
  const prev = (() => { try { return fs.readFileSync(fp, "utf8"); } catch { return ""; } })();
  if (prev) toTrash(dshHome, bid, prev);
  fs.writeFileSync(fp, String(content ?? ""), "utf8");
  return { ok: true, path: fp, overridden: true };
}

/** 新建自建块。 */
export function addBlock(dshHome, { id, name, content = "", order, enabled = true, slots = ["top"] } = {}) {
  const bid = safeId(id);
  if (!bid) return { ok: false, error: "非法块 id" };
  const cfg = ensureConfig(dshHome);
  if (cfg.blocks.some((b) => b.id === bid)) return { ok: false, error: `块已存在: ${bid}` };
  const maxOrder = cfg.blocks.reduce((n, b) => Math.max(n, Number(b.order) || 0), 0);
  const entry = {
    id: bid,
    name: String(name || bid),
    order: Number.isFinite(order) ? order : maxOrder + 100,
    enabled: enabled !== false,
    role: "system",
    slots: Array.isArray(slots) && slots.length ? slots : ["top"],
    tailDepth: 0,
  };
  cfg.blocks.push(entry);
  writeConfigRaw(dshHome, cfg);
  if (String(content).trim()) {
    const dir = path.join(root(dshHome), "blocks");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${bid}.md`), String(content), "utf8");
  }
  return { ok: true, block: entry };
}

/** 删块。默认块不可删，只能关。 */
export function removeBlock(dshHome, id) {
  const bid = safeId(id);
  if (!bid) return { ok: false, error: "非法块 id" };
  const cfg = ensureConfig(dshHome);
  const idx = cfg.blocks.findIndex((b) => b.id === bid);
  if (idx < 0) return { ok: false, error: `块不存在: ${bid}` };
  if (blocks.BUILTIN_BLOCKS.some((b) => b.id === bid)) {
    return { ok: false, error: `默认块不可删除: ${bid}（可以关闭）` };
  }
  cfg.blocks.splice(idx, 1);
  writeConfigRaw(dshHome, cfg);
  // 内容也挪进 trash
  for (const sub of ["blocks", "overrides"]) {
    const fp = path.join(root(dshHome), sub, `${bid}.md`);
    try {
      if (fs.existsSync(fp)) {
        toTrash(dshHome, bid, fs.readFileSync(fp, "utf8"));
        fs.rmSync(fp, { force: true });
      }
    } catch { /* 删不掉就留着，不影响装配 */ }
  }
  return { ok: true };
}

/** 开关 / 排序 / 位置。只动 config，不碰正文。 */
export function updateBlockMeta(dshHome, id, patch = {}) {
  const bid = safeId(id);
  if (!bid) return { ok: false, error: "非法块 id" };
  const cfg = ensureConfig(dshHome);
  const b = cfg.blocks.find((x) => x.id === bid);
  if (!b) return { ok: false, error: `块不存在: ${bid}` };
  if (typeof patch.enabled === "boolean") b.enabled = patch.enabled;
  if (Number.isFinite(patch.order)) b.order = patch.order;
  if (typeof patch.name === "string" && patch.name.trim()) b.name = patch.name.trim();
  if (Array.isArray(patch.slots)) {
    const ok = patch.slots.filter((s) => s === "top" || s === "tail");
    if (ok.length) b.slots = ok;
  }
  if (patch.role === "system" || patch.role === "user" || patch.role === "assistant") b.role = patch.role;
  writeConfigRaw(dshHome, cfg);
  return { ok: true, block: b };
}

/** 撤销本次改动：删 override，回到默认块内容。 */
export function revertBlock(dshHome, id) {
  const bid = safeId(id);
  if (!bid) return { ok: false, error: "非法块 id" };
  const fp = path.join(root(dshHome), "overrides", `${bid}.md`);
  if (!fs.existsSync(fp)) return { ok: false, error: `没有可撤销的改动: ${bid}` };
  toTrash(dshHome, bid, fs.readFileSync(fp, "utf8"));
  fs.rmSync(fp, { force: true });
  return { ok: true, reverted: bid };
}

/**
 * 恢复出厂：所有 override 进 trash，config 回到内建默认表。
 * 只动 loom 自己的数据目录，不碰任何宿主文件。
 */
export function restoreFactory(dshHome) {
  const base = root(dshHome);
  if (!base) return { ok: false, error: "拿不到 DSH_HOME" };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const moved = [];

  // overrides 全部进 trash
  const ov = path.join(base, "overrides");
  if (fs.existsSync(ov)) {
    for (const f of fs.readdirSync(ov)) {
      const fp = path.join(ov, f);
      try {
        if (fs.statSync(fp).isFile()) {
          toTrash(dshHome, path.basename(f, ".md"), fs.readFileSync(fp, "utf8"));
          fs.rmSync(fp, { force: true });
          moved.push(`overrides/${f}`);
        }
      } catch { /* 单个失败不影响其余 */ }
    }
  }

  // config 备份后重建
  const cp = cfgPath(dshHome);
  if (fs.existsSync(cp)) {
    const dir = path.join(base, "_trash", stamp);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(cp, path.join(dir, "config.json"));
    moved.push("config.json");
  }
  const cfg = {
    $comment: "块目录配置。order 决定装配次序（顺序即覆盖）；builtin 块不可删。",
    blocks: blocks.BUILTIN_BLOCKS.map((b) => ({
      id: b.id, name: b.name, order: b.order, enabled: b.enabled,
      role: "system", slots: [b.id === "core-tail" ? "tail" : "top"], tailDepth: 0,
    })),
  };
  writeConfigRaw(dshHome, cfg);

  return { ok: true, moved, trash: path.join(base, "_trash", stamp) };
}

/** UI 需要的一份完整快照：块列表 + 每块正文 + 装配结果。 */
export function snapshot(dshHome) {
  const d = blocks.describe(dshHome);
  return {
    ...d,
    items: d.blocks.map((b) => {
      const c = blocks.readBlockContent(dshHome, b.id);
      return {
        ...b,
        content: c.text,
        contentSource: c.source,
        overridden: c.source === "override",
        inline: c.source === "inline",
      };
    }),
    topText: blocks.assembleTop(dshHome).text,
    tailText: blocks.assembleTail(dshHome).text,
  };
}
