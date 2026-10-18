import { toLoomMarks } from "./legacy-purge-marks.js";

export const PHASE1_KEEP_EXPR =
  'PERSONA_SECTION_NAMES.has(section?.name) || String(section?.name || "").startsWith("dsh-loom") || String(section?.name || "").startsWith("dshpg-loom-")';

/**
 * 把官方 phase-1 白名单放宽到 dsh-loom* + dshpg-loom-*。
 * 已放行 dsh-loom 的旧补丁会升到带 dshpg。
 */
export function widenPhase1KeepFilter(text) {
  // 迁移：上游旧插件 v1.1.71 写下的白名单表达式先换成新写法，下面的正则只认新形态。
  const raw = toLoomMarks(String(text || ""));
  const crlf = raw.includes("\r\n");
  let next = raw.replace(/\r\n/g, "\n");
  next = next.replace(
    /PERSONA_SECTION_NAMES\.has\(section\?\.name\) \|\| String\(section\?\.name \|\| ""\)\.startsWith\("dsh-loom"\)(?! \|\| String\(section\?\.name \|\| ""\)\.startsWith\("dshpg-loom-"\))/g,
    PHASE1_KEEP_EXPR,
  );
  next = next.replace(
    /section => PERSONA_SECTION_NAMES\.has\(section\?\.name\)(?! \|\|)/g,
    `section => ${PHASE1_KEEP_EXPR}`,
  );
  return crlf ? next.replace(/\n/g, "\r\n") : next;
}
