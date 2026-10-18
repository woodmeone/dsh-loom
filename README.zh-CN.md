# dsh-loom

[dsh](https://www.deepseek.com/harness/)（DeepSeek Harness）插件，从
[dsh-purge](https://github.com/YuJunZhiXue/dsh-purge) v1.1.71 派生。

本文件**只讲安装与使用**。项目现状、术语、决策记录看
[PROJECT.md](PROJECT.md)、[CONTEXT.md](CONTEXT.md)、[docs/adr/](docs/adr/)。

> **已经装过 `dsh-purge` 的，先还原再装。** `dsh-loom` 会往宿主里写自己的标记；
> 在还打着补丁的 `dsh-purge` 上直接装，盘上会留两套标记。先跑
> `dsh-purge --revert`（或在旧 dock 里点 **Clean → 还原**）再加 `dsh-loom`。见
> [PROJECT.md → 从 dsh-purge 切到 dsh-loom](PROJECT.md)。

## 适配范围

当前这一版只针对 **dsh 0.2**，不要用到 0.1.x。

| 宿主 | profile | 说明 |
|---|---|---|
| 官方 `dsh web` | `web` | |
| 官方桌面 EXE（DeepSeek Harness 0.2.0-rc.2） | `desktop` | 不闪控制台需要 Node ≥ 22 |

Web 和桌面端各有各的 profile、各有各的 `$DSH_HOME`。**两边都装，分别点应用** ——
Web 装了不会自动覆盖桌面端。

## 安装

```sh
# 官方 web
dsh plugin --profile web add dsh-loom

# 官方桌面 EXE
dsh plugin --profile desktop add dsh-loom
```

已经在克隆目录里，把包名换成 `.`。registry 被墙就用
`https://github.com/woodmeone/dsh-loom/archive/refs/heads/main.tar.gz`，`--profile` 照旧。

### 装完都要做这三步

把插件加进 profile **不会**自动改 `@deepseek-ai`。

1. **完全退出再打开**你装的那个宿主 —— 停掉再起 `dsh web`，或退出桌面托盘再打开。
2. 在**那个宿主**上点会话标题旁的 **dsh-loom**，进 **Clean** 页点 **应用**。它不在宿主设置页。
3. 应用成功会自己重启一次，好让打过补丁的包加载。没跑完就不重启。

Web 的按钮只管 Web，桌面端的只管桌面端。

### 怎样算装上了

- **dsh-loom** 出现在会话标题旁，Clean 页有**应用**。
- 聊天里 `/purge status` 能打出 `DSH_HOME` 和补丁列表，路径应是你正在用的那一份。
- 与当前宿主版本对不上的补丁会报 `skipped` / `pattern_not_found`，不会硬改。

### 交给助手安装

<!-- AI-AGENT-START -->

把 dsh 插件 `dsh-loom` 装进 Web profile 和官方桌面 profile。不要扫全盘、不要读改别的文件、
不要动设置、不要重启应用。

`dsh` 不在 PATH 就告诉用户并停下。已经在克隆目录里，两条命令的包名都换成 `.`。
registry 被墙就用 `https://github.com/woodmeone/dsh-loom/archive/refs/heads/main.tar.gz`。
某个 profile 不存在就跳过那条，另一条照装。

```sh
dsh plugin --profile web add dsh-loom
dsh plugin --profile desktop add dsh-loom
```

跑完让用户完全退出再启动 `dsh web`，退出桌面托盘再打开 EXE。在每个宿主上打开会话标题旁的
**dsh-loom**，在 **Clean** 页点**应用**。然后停下。

<!-- AI-AGENT-END -->

### 手动安装

命令失败或 `dsh` 不在 PATH 时用这条路。**只改你实际在跑的那个宿主的 profile。**

<details>
<summary><strong>完整手动步骤</strong></summary>

**1. 先找准这个宿主用的 `$DSH_HOME`。** 真正的 home 叫 `.dsh`（官方 EXE 有时叫
`dsh-home`），里面有 `profiles`，且至少有一个 `profiles/<name>/package.json`。

```powershell
$cands = @()
if ($env:DSH_HOME) { $cands += $env:DSH_HOME }
$cands += "$env:USERPROFILE\.dsh"
$dsh = Get-Command dsh -ErrorAction SilentlyContinue
if ($dsh) {
  $dir = Split-Path $dsh.Source
  $cands += @((Join-Path $dir ".dsh"), (Join-Path (Split-Path $dir) ".dsh"), (Join-Path (Split-Path (Split-Path $dir)) ".dsh"))
}
$cands += @("$env:APPDATA\DeepSeek Harness\dsh-home", "$env:LOCALAPPDATA\DeepSeek Harness\dsh-home")
$cands | Select-Object -Unique | Where-Object { $_ -and (Test-Path (Join-Path $_ "profiles")) }
```

**2. 把插件放到 `$DSH_HOME/plugins/dsh-loom`** —— 目录名必须是 `dsh-loom`，
里面 `package.json` 的 `"name"` 也得是 `dsh-loom`。

```sh
git clone https://github.com/woodmeone/dsh-loom.git "$DSH_HOME/plugins/dsh-loom"
```

没有 git：下载
[main.tar.gz](https://github.com/woodmeone/dsh-loom/archive/refs/heads/main.tar.gz)，
解压、把 `dsh-loom-main` 改名成 `dsh-loom`，放进 `plugins`。

**3. 只改那个 profile 的 `package.json`，先备份。** 只加两样，其余依赖和 bundle 一个都别动：

```json
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "dsh-loom": "file:../../plugins/dsh-loom"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-loom"
      ],
      "patchReload": "live"
    }
  }
}
```

JSON 要保持合法（新项前有逗号、最后一项后没有）。别把 `file:` 换成绝对路径，也别把
`"dsh-loom"` 写两遍。

**4. 只在这个 profile 里跑 `pnpm install`**：

```sh
cd "$DSH_HOME/profiles/web"   # 或 profiles/desktop
pnpm install
```

成功标志：`profiles/<web|desktop>/node_modules/dsh-loom/package.json` 存在。

**5. 完全退出该宿主，再启动，再点应用** —— 和上面三步一样。

</details>

### 卸载

会话标题旁的 **dsh-loom** → **Clean** → **卸载**。它会先还原已打的补丁、恢复官方宿主，
再重启当前宿主。

```sh
# 终端
dsh-loom --uninstall

# 聊天里
/purge uninstall
```

插件配置在 `cordis.patch.yml`，`postPrompt` 默认是空的：

```yaml
- insert:
    - id: dsh-loom
      name: 'dsh-loom'
      config:
        enabled: true
        autoApplyOnStart: false
        autoUpdateOnStart: false
        autoRevertOnMissing: false
        verbose: false
        postPromptOrder: 5100
        postPrompt: ""
```

## 使用

```sh
dsh-loom --status
dsh-loom --apply
dsh-loom --revert
dsh-loom --uninstall
dsh-loom --edit
```

聊天 / 模型工具入口：

```text
/purge status | apply | revert | uninstall | edit | help
/rules list | use <id> | create <id> | delete <id> | reset | help
/skills list | import <zip-or-folder> | create <id> [description] | delete <id> | help
/rewind

purge_status   purge_apply   purge_revert
```

### 右侧 dock

**dsh-loom** 挂在会话标题旁，点开是右侧 dock，两页：

| 区域 | 内容 |
|---|---|
| Clean | 补丁、提示词、规则集、技能，以及**应用** / **还原** / **卸载** |
| Drill | 授权之后的资产、技能、环境。没授权前显示未授权 |
| Prompt | 编辑 `prompt-inject.md`，作为会话覆盖 |
| 自己的服务器 | 一行一个精确 IP 或主机名，存到 `$DSH_HOME/net-scope-allow.txt` |
| 规则集 | 多份 `AGENTS.md` / `CLAUDE.md`；启用会写进 `$DSH_HOME` |
| 技能 | 从 zip 或目录导入到本宿主的 `$DSH_HOME/skills/<id>/SKILL.md` |

第一次进 **Drill** 要读完声明、等倒计时结束、滚到文末、勾三下。Clean 不需要。
Drill 只用于你有权管理的本机、离线靶标，或已有书面授权的演练环境。

### 应用 / 重启 / 还原

应用成功后宿主会重启一次，好让打过补丁的包加载。dock 里也有手动的**重启**。
**还原**（或 `/purge revert`）会把备份覆盖回去、删掉备份，并剥掉本插件写进 shim 的行。

只切换预设不会让运行中的进程重新加载补丁：完全退出宿主 → 应用 → 重启 → 开新对话。

### 本地校验

```sh
node --check lib/index.js lib/core.js lib/reapply.js
node --input-type=module -e "import './lib/index.js'"
npm test           # node --test 跑 test/
```

## 署名要求

**借用本项目的名字、思路、代码或提示词，必须署名并写出源仓库：**
[YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)。

`dsh-loom` 是派生作品。上游历史留在 [release-notes.md](release-notes.md)，许可证仍是
[MIT](LICENSE)。不署名、抹掉出处、冒充原创，都会被追究。

## 非盈利项目

免费、非盈利。严禁商业售卖、付费倒卖，严禁用于黑灰产牟利。仅供技术参考。

### ⚠️ 法律与合规声明

**免责声明：** 本项目是非营利开源项目，仅供学习与研究。严禁用于任何违法或不合规用途，
后果由使用者自负。

**零容忍：** 本项目反对并禁止任何违法活动。作者不支持、不鼓励、不协助未经授权的网络攻击、
漏洞利用、数据窃取，或非法侵入计算机信息系统。

1. **只针对本机官方宿主。** 评测补丁与提示词注入只作用于**用户机器上已安装的官方
   DeepSeek Harness**（`@deepseek-ai` 包、本地 profile / `$DSH_HOME`），不是别人的网站、
   服务器、账号或信息系统。
2. **不产生攻击流量。** 应用、注入、还原、卸载都只在本机文件与本机进程里进行，不扫描、
   不探测、不入侵、不向任何公网主机发送攻击流量。不要拿它当打公网的跳板。
3. **合法受控范围。** 只能用在你有权管理的宿主、离线本机靶标，或合规演练环境；
   没有权利人书面授权的目标一律不许用。
4. **中国大陆、香港、澳门地址段禁止。** 唯一例外是事先登记过的**一个精确 IP** 或
   **一个精确主机名**。密钥、密码、网段、通配符，或聊天里口头声称"这是我的服务器"，
   都不构成例外。
5. **责任全在用户。** 本项目按 MIT 许可证「原样」提供，不提供任何担保。任何把它用于
   非法攻击或恶意活动的人，其开源许可自该刻起自动终止，必须停止使用、永久销毁所有副本
   与衍生品，并承担法律后果。
6. **无关联。** 本项目是独立的安全评测研究项目，与 DeepSeek 及其关联方没有雇佣、商业、
   授权或背书关系。
