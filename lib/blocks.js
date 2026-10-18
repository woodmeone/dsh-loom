/**
 * 块引擎 —— 读块目录 + 配置，装配成一段系统提示词。
 *
 * 设计要点：
 *   1. **只有一个位置**。顶部那一坨拼成一个 section，`order` 沿用 GLOBAL_PROMPT_ORDER。
 *      没有第二个位置就没有坑位冲突，缓存前缀也更稳。
 *   2. **顺序即语义**。同一位置内后读到的覆盖先读到的，所以 `order` 是执行顺序不是排版。
 *   3. **装配必须无副作用**。`assemble()` 每轮都可能被调用，不能写盘、不能抛。
 *      任何读不到/写坏了的东西降级成空块并记录，绝不让整个注入塌掉。
 *   4. **零配置可用**。config.json 不存在时用内建默认块表，不要求用户先建目录。
 */

import fs from "node:fs";
import path from "node:path";

/** 块的内建默认表：随插件发行，用户不可删，可关可改。 */
export const BUILTIN_BLOCKS = Object.freeze([
  { id: "core-persona", name: "人格", order: 100, enabled: true, slots: ["top"] },
  { id: "core-style", name: "文风", order: 200, enabled: true, slots: ["top"] },
  { id: "core-contract", name: "核心执行契约", order: 300, enabled: true, slots: ["top"] },
  { id: "core-jailbreak", name: "破限", order: 400, enabled: true, slots: ["top"] },
  { id: "core-armor", name: "破甲", order: 500, enabled: true, slots: ["top"] },
  { id: "core-routing", name: "任务路由", order: 600, enabled: false, slots: ["top"] },
  { id: "core-tail", name: "尾部续压", order: 700, enabled: true, slots: ["tail"] },
]);

const CONFIG_FILE = "config.json";
const BLOCKS_DIR = "blocks";

/** 块目录根：$DSH_HOME/dsh-loom */
export function blockRoot(dshHome) {
  const home = path.normalize(String(dshHome || ""));
  if (!home) return "";
  return path.join(home, "dsh-loom");
}

export function configPath(dshHome) {
  const root = blockRoot(dshHome);
  return root ? path.join(root, CONFIG_FILE) : "";
}

export function blocksDir(dshHome) {
  const root = blockRoot(dshHome);
  return root ? path.join(root, BLOCKS_DIR) : "";
}

function readJson(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}

/**
 * 读取配置。缺失或损坏时返回内建默认。
 * 返回 { blocks: [...], source: "config" | "builtin" }
 */
export function loadConfig(dshHome) {
  const raw = readJson(configPath(dshHome));
  const list = Array.isArray(raw?.blocks) ? raw.blocks : null;
  if (!list) {
    return {
      blocks: BUILTIN_BLOCKS.map((b) => ({ ...b, builtin: true })),
      source: "builtin",
    };
  }
  const builtinIds = new Set(BUILTIN_BLOCKS.map((b) => b.id));
  const blocks = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || "").trim();
    if (!id) continue;
    blocks.push({
      id,
      name: String(item.name || id),
      order: Number.isFinite(item.order) ? item.order : 0,
      enabled: item.enabled !== false,
      role: typeof item.role === "string" ? item.role : "system",
      slots: Array.isArray(item.slots) ? item.slots.filter((s) => typeof s === "string") : ["top"],
      tailDepth: Number.isFinite(item.tailDepth) ? item.tailDepth : 0,
      builtin: builtinIds.has(id),
    });
  }
  // 配置里漏掉的默认块补回来，保证「默认块不可删」这条在数据层也成立。
  for (const b of BUILTIN_BLOCKS) {
    if (!blocks.some((x) => x.id === b.id)) {
      blocks.push({
        ...b,
        role: "system",
        slots: Array.isArray(b.slots) ? [...b.slots] : ["top"],
        tailDepth: 0,
        builtin: true,
      });
    }
  }
  return { blocks, source: "config" };
}

/**
 * 读一个块的正文。三档：内联 > overrides/ > 默认。
 * 读不到返回空串，不抛。
 */
export function readBlockContent(dshHome, id) {
  const root = blockRoot(dshHome);
  if (!root || !id) return { text: "", source: "none" };

  const cfg = readJson(configPath(dshHome));
  const inline = Array.isArray(cfg?.blocks)
    ? cfg.blocks.find((b) => b && b.id === id)
    : null;
  if (inline && typeof inline.content === "string" && inline.content.trim()) {
    return { text: inline.content, source: "inline" };
  }

  const candidates = [
    path.join(root, "overrides", `${id}.md`),
    path.join(root, BLOCKS_DIR, `${id}.md`),
  ];
  for (const fp of candidates) {
    try {
      if (fs.existsSync(fp)) {
        const text = fs.readFileSync(fp, "utf8");
        if (text.trim()) {
          return { text, source: fp.includes(`${path.sep}overrides${path.sep}`) ? "override" : "default" };
        }
      }
    } catch { /* 读失败当空 */ }
  }
  return { text: "", source: "none" };
}

/**
 * 装配顶部正文。
 *
 * @returns {{ text: string, parts: Array<{id:string,bytes:number,source:string}> }}
 */
export function assembleTop(dshHome) {
  const { blocks } = loadConfig(dshHome);
  const picked = blocks
    .filter((b) => b.enabled)
    .filter((b) => Array.isArray(b.slots) ? b.slots.includes("top") : true)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const parts = [];
  const chunks = [];
  for (const b of picked) {
    const { text, source } = readBlockContent(dshHome, b.id);
    if (!text.trim()) continue;
    chunks.push(text.replace(/\r\n/g, "\n").trimEnd());
    parts.push({ id: b.id, bytes: text.length, source });
  }
  return { text: chunks.join("\n\n"), parts };
}

/** 装配尾部正文（二期用，这里先给出同样的取块逻辑，位置过滤换成 tail）。 */
export function assembleTail(dshHome) {
  const { blocks } = loadConfig(dshHome);
  const picked = blocks
    .filter((b) => b.enabled)
    .filter((b) => Array.isArray(b.slots) && b.slots.includes("tail"))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const parts = [];
  const chunks = [];
  for (const b of picked) {
    const { text, source } = readBlockContent(dshHome, b.id);
    if (!text.trim()) continue;
    chunks.push(text.replace(/\r\n/g, "\n").trimEnd());
    parts.push({ id: b.id, bytes: text.length, source, tailDepth: b.tailDepth, role: b.role });
  }
  return { text: chunks.join("\n\n"), parts };
}

/** 状态摘要，给 /loom status 和测试用。 */
export function describe(dshHome) {
  const { blocks, source } = loadConfig(dshHome);
  const top = assembleTop(dshHome);
  return {
    root: blockRoot(dshHome),
    configSource: source,
    total: blocks.length,
    enabled: blocks.filter((b) => b.enabled).length,
    builtin: blocks.filter((b) => b.builtin).length,
    topBytes: top.text.length,
    topParts: top.parts,
    blocks: blocks.map((b) => {
      const { text, source: src } = readBlockContent(dshHome, b.id);
      return {
        id: b.id,
        name: b.name,
        order: b.order,
        enabled: b.enabled,
        builtin: b.builtin,
        slots: b.slots,
        bytes: text.length,
        source: src,
      };
    }),
  };
}
