/**
 * 改名契约测试：dsh-purge -> dsh-loom。
 *
 * 只查静态事实，不碰任何宿主文件：这个测试在改名之前必须是红的。
 * 见 PROJECT.md「从 dsh-purge 切到 dsh-loom」一节。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else out.push(relative(ROOT, abs).split("\\").join("/"));
  }
  return out;
}

/** 旧名字面量。`dshpg-` 后面跟 `loom-` 是新前缀，不算。 */
const LEGACY_LITERAL = /dsh-purge|dsh_purge|DSH_PURGE|dshpg-(?!loom-)/;

/** 唯一允许出现旧名字面量的文件：迁移用常量表。 */
const LEGACY_MARKS_MODULE = "lib/legacy-purge-marks.js";

const pkg = JSON.parse(read("package.json"));

test("package.json 的包名与 bin 都是 dsh-loom", () => {
  assert.equal(pkg.name, "dsh-loom");
  assert.deepEqual(pkg.bin, { "dsh-loom": "bin/dsh-loom.js" });
  assert.ok(existsSync(join(ROOT, "bin/dsh-loom.js")), "bin/dsh-loom.js 必须存在");
  assert.ok(!existsSync(join(ROOT, "bin/dsh-purge.js")), "旧的 bin/dsh-purge.js 必须已删掉");
});

test("package.json 的仓库 / 安装地址指向 woodmeone/dsh-loom", () => {
  const urls = [
    pkg.repository?.url,
    pkg.homepage,
    pkg.bugs?.url,
    pkg.dsh?.install?.tarball,
    pkg.dsh?.install?.zip,
    pkg.dsh?.install?.git,
  ];
  for (const url of urls) {
    assert.ok(typeof url === "string" && url.length > 0, `缺少地址: ${url}`);
    assert.match(url, /woodmeone\/dsh-loom/);
    assert.doesNotMatch(url, /dsh-purge/);
  }
});

test("package.json 有 node --test 入口", () => {
  // 票里写的是 `node --test test/`；实测 Node 22.18 把目录参数当模块去 require
  // （Cannot find module '.../test'），所以用 Node 自己展开的 glob。
  assert.equal(pkg.scripts?.test, "node --test test/*.test.js");
});

test("cordis.patch.yml 里没有旧 id / 旧 name", () => {
  const yml = read("cordis.patch.yml");
  assert.doesNotMatch(yml, LEGACY_LITERAL);
  // 两层补丁同时插同一个 cordis id 会把 46 条补丁打两遍，所以 id 必须全部是新名字。
  const ids = [...yml.matchAll(/^\s*-?\s*id:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  assert.ok(ids.length >= 5, `id 数量异常: ${ids.length}`);
  for (const id of ids) {
    assert.doesNotMatch(id, LEGACY_LITERAL, `cordis id 还是旧名: ${id}`);
  }
  assert.ok(ids.includes("dsh-loom"), "缺少主插件 id: dsh-loom");
  assert.ok(ids.includes("dsh-loom-redteam"), "缺少演练台 id: dsh-loom-redteam");
});

test("lib/ 下没有旧名字面量（只有迁移常量表例外）", () => {
  const offenders = [];
  for (const rel of walk(join(ROOT, "lib"))) {
    const hits = read(rel).match(new RegExp(LEGACY_LITERAL.source, "g"));
    if (!hits) continue;
    if (rel === LEGACY_MARKS_MODULE) continue;
    offenders.push(`${rel} (${hits.length})`);
  }
  assert.deepEqual(offenders, [], `这些文件里还有旧名字面量: ${offenders.join(", ")}`);
});

test("迁移常量表集中在 lib/legacy-purge-marks.js 一处", () => {
  const mod = read(LEGACY_MARKS_MODULE);
  for (const literal of ["dsh-purge", "dshpg-", "__dsh_purge_deny_disabled__", "DSH_PURGE_MARKER_NEEDLE"]) {
    assert.ok(mod.includes(literal), `常量表缺少 ${literal}`);
  }
  assert.match(mod, /hasLegacyMarks/, "必须导出 hasLegacyMarks");
  // 只有这个文件允许写旧字面量，别处一律走 legacyOf / markPresent。
  assert.ok(statSync(join(ROOT, LEGACY_MARKS_MODULE)).isFile());
});

test("CI workflow 指向本仓库，且不会在 push 之外莫名发布", () => {
  const yml = read(".github/workflows/release.yml");
  assert.match(yml, /woodmeone\/dsh-loom/);
  assert.doesNotMatch(yml, /YuJunZhiXue/);
  assert.doesNotMatch(yml, /dsh-purge/);
  assert.match(yml, /node --check lib\/index\.js/, "语法检查步骤必须留着");
  assert.match(yml, /workflow_dispatch:/, "要能手动跑");
  // 发布只在 push 到本仓库 main，或手动显式勾选 publish 时才走。
  assert.match(yml, /inputs\.publish/);
});

test("上游历史与 ADR 保持原样（引用的就是上游包名）", () => {
  assert.match(read("release-notes.md"), /dsh-purge/, "release-notes.md 是冻结的上游历史，不能被改名");
  const adr = "docs/adr/0001-从-dsh-purge-派生.md";
  assert.ok(existsSync(join(ROOT, adr)), "ADR 文件名引用上游包名，不能被改名");
  assert.match(read(adr), /dsh-purge/, `${adr} 引用的是上游包名，不能被改名`);
});
