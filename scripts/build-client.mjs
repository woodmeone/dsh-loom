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

// ── 块管理面板 ────────────────────────────────────────────────
// 与 drill 同样的做法：源码在 lib/loom-panel.client.js，
// 构建时插进 loader 工厂体内的标记之间。手改 client.js 一律会被覆盖。
const PANEL_BEGIN = "/* __DSH_LOOM_PANEL_BEGIN__ */";
const PANEL_END = "/* __DSH_LOOM_PANEL_END__ */";
const panelSrc = join(root, "lib", "loom-panel.client.js");
let panelBody = readFileSync(panelSrc, "utf8").replace(/\r\n/g, "\n");
// 去掉顶层 import/export —— 工厂体内要用外层作用域的 h / react / useState
panelBody = panelBody
	.replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, "")
	.replace(/^\s*export\s+(?:const|function|class)\s+/gm, "$1 ")
	.replace(/^\s*import[^;]*;\s*$/gm, "");
const panelFragment = `${PANEL_BEGIN}
		/* 提示词块管理面板（源码 lib/loom-panel.client.js） */
${panelBody}
${PANEL_END}`;

if (!client.includes(PANEL_BEGIN) || !client.includes(PANEL_END)) {
	// 首次：插在 loader 工厂体最前面（h / react 已定义之后由外层保证）
	const anchor = 'const inject = ["slots", "locale"];';
	const at = client.indexOf(anchor);
	if (at < 0) throw new Error("cannot find inject anchor for panel");
	client = client.slice(0, at) + panelFragment + "\n\t\t" + client.slice(at);
	console.log("inserted loom-panel markers into client.js");
} else {
	const pb = client.indexOf(PANEL_BEGIN);
	const pe = client.indexOf(PANEL_END);
	client = client.slice(0, pb) + panelFragment + client.slice(pe + PANEL_END.length);
	console.log("replaced loom-panel block in client.js");
}

writeFileSync(clientPath, client);
console.log("embedded loom panel (" + Buffer.byteLength(panelFragment) + " bytes)");