/**
 * 重建 client.js：
 *   1. identity pass —— 模块 id / HTTP 路由 / NS / 存储键 / drill 标记都跟着包名走；
 *   2. 把 lib/redteam/client.js 抽成可嵌入的工厂片段，写进 DSH_LOOM_DRILL 标记之间。
 *
 * client.js 是构建产物：不许手改，改动只能从 lib/redteam/client.js 和本脚本出去。
 * identity pass 用 lib/legacy-purge-marks.js 的 toLoomMarks()，幂等。
 *
 * 用法：node scripts/build-client.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toLoomMarks } from "../lib/legacy-purge-marks.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const drillSrc = join(root, "lib", "redteam", "client.js");
const clientPath = join(root, "client.js");

const BEGIN = "/* __DSH_LOOM_DRILL_BEGIN__ */";
const END = "/* __DSH_LOOM_DRILL_END__ */";

let raw = readFileSync(drillSrc, "utf8").replace(/\r\n/g, "\n");
const startMark = "factory: (require) => {";
const start = raw.indexOf(startMark);
if (start < 0) throw new Error("cannot find ModuleLoader factory in drill client");
const endMark = "\n    return module.exports\n  },\n})";
const end = raw.lastIndexOf(endMark);
if (end < 0) throw new Error("cannot find factory end in drill client");
let body = raw.slice(start + startMark.length, end);

// 去掉末尾 exports（return 已在 endMark 外）
body = body
	.replace(/\n\s*exports\.apply\s*=\s*apply\s*\n/, "\n")
	.replace(/\n\s*exports\.inject\s*=\s*inject\s*\n/, "\n");

// 替换 apply(ctx)：不再自己注册槽位，只导出 Panel / CSS / 状态
const applyAt = body.lastIndexOf("function apply(ctx) {");
if (applyAt < 0) throw new Error("apply(ctx) not found in drill client");
// apply() 本体没有嵌套函数花括号冲突到 CSS（CSS 在前面），用括号深度即可
let d = 0;
let j = body.indexOf("{", applyAt);
for (; j < body.length; j += 1) {
	const ch = body[j];
	if (ch === "{") d += 1;
	else if (ch === "}") {
		d -= 1;
		if (d === 0) {
			j += 1;
			break;
		}
	}
}
const applyParts = `function applyDrillParts() {
      return { CSS: CSS, Panel: Panel, setUI: setUI, useUI: useUI, isFullWindow: isFullWindow, setDockWidth: setDockWidth };
    }
`;
body = body.slice(0, applyAt) + applyParts + body.slice(j);

const fragment = `${BEGIN}
		// 内嵌演练台（源码在 lib/redteam，已并进本插件）
		const __dshPurgeDrill = (() => {
			var module = { exports: {} };
			var exports = module.exports;
${body}
			return applyDrillParts();
		})();
${END}`;

let client = readFileSync(clientPath, "utf8");
// identity pass：包名已经不叫旧名字了，浏览器侧注册 id、HTTP 路由前缀、locale NS、
// localStorage 键、drill 标记都要一起换，否则宿主按 package 名找不到这个模块
// （dsh-client-modules 会直接抛「unknown entry」）。
const renamed = toLoomMarks(client);
if (renamed !== client) {
	client = renamed;
	console.log("identity pass: rewrote legacy markers in client.js");
}
if (!client.includes(BEGIN) || !client.includes(END)) {
	throw new Error("client.js missing drill markers; run patch-client-dock.mjs first");
}
const beginAt = client.indexOf(BEGIN);
const endAt = client.indexOf(END);
if (beginAt < 0 || endAt < 0 || endAt < beginAt) throw new Error("drill markers out of order");
client = client.slice(0, beginAt) + fragment + client.slice(endAt + END.length);
writeFileSync(clientPath, client);
console.log("embedded drill client into client.js (" + Buffer.byteLength(fragment) + " bytes fragment)");
