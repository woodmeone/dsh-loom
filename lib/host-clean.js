/** 重启前看系统提示词文件：标记写上了，或者当前原文里已经没有那两处旧拦截。 */
import { markPresent } from "./legacy-purge-marks.js";

export function hostPromptKeepsInject(text) {
  const body = String(text || "");
  // markPresent：上游旧插件 v1.1.71 写下的标记也算「洗过了」。
  const identityMarked = markPresent(body, "[dsh-loom] identity stripped");
  const injectMarked = markPresent(body, "[dsh-loom] complete prompt keeps waterfall inject")
    || markPresent(body, "[dsh-loom] complete prompt keeps inject");
  if (identityMarked && injectMarked) return true;
  // 空文件或不是这份模块，不能当成已经洗过。
  if (!body.includes("system-prompt/assemble")) return false;
  const identityLeft = body.includes("You are an AI agent powered by DeepSeek Harness.");
  const dropsInject = body.includes("transformed.sections : [completeSection]");
  return !identityLeft && !dropsInject;
}
