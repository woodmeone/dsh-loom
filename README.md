# dsh-loom

A [dsh](https://www.deepseek.com/harness/) (DeepSeek Harness) plugin, derived from
[dsh-purge](https://github.com/YuJunZhiXue/dsh-purge) v1.1.71.

This file is **install + usage only**. For the project's current state, terminology,
decisions, and roadmap, read [PROJECT.md](PROJECT.md), [CONTEXT.md](CONTEXT.md) and
[docs/adr/](docs/adr/).

> **If you have `dsh-purge` installed, revert it first.** `dsh-loom` writes its own
> markers into the harness; installing it over a still-applied `dsh-purge` leaves two
> sets of marks on disk. Run `dsh-purge --revert` (or **Clean → Restore** in the old
> dock) before adding `dsh-loom`. See
> [PROJECT.md → switching from dsh-purge to dsh-loom](PROJECT.md).

## Supported hosts

The current line targets **dsh 0.2** only — do not apply it to 0.1.x.

| Host | Profile | Notes |
|---|---|---|
| official `dsh web` | `web` | |
| official desktop EXE (DeepSeek Harness 0.2.0-rc.2) | `desktop` | Node ≥ 22 for the no-flash path |

Web and the desktop app have separate profiles and separate `$DSH_HOME`s. **Install
both, apply each separately** — a Web install does not reach the desktop app.

## Install

```sh
# official web
dsh plugin --profile web add dsh-loom

# official desktop EXE
dsh plugin --profile desktop add dsh-loom
```

Already inside a clone? use `add .` instead of the package name. Registry blocked? add
`https://github.com/woodmeone/dsh-loom/archive/refs/heads/main.tar.gz` with the same
`--profile`.

### After the command: three steps

Adding the plugin to a profile does **not** patch `@deepseek-ai` by itself.

1. **Quit and reopen** the host you installed into — stop and restart `dsh web`, or quit
   the desktop tray and reopen that app.
2. On **that host**, click **dsh-loom** beside the session title, then **Apply** on the
   **Clean** page. It is not on the host Settings page.
3. A successful **Apply** restarts once so the patched packages load. An unfinished Apply
   does not restart.

Web controls affect Web only; desktop controls affect the desktop app only.

### How to tell it installed

- **dsh-loom** sits beside the session title, with **Apply** on its Clean page.
- `/purge status` in chat prints `DSH_HOME` and the patch list — the path should be the
  home you actually run.
- Patches that do not match the installed harness version report `skipped` /
  `pattern_not_found`; nothing is rewritten blindly.

### Hand this to an assistant

<!-- AI-AGENT-START -->

Install the dsh plugin `dsh-loom` into both the Web profile and the official desktop
profile. Do not scan the whole disk, do not read or edit other files, do not apply
settings, and do not restart the app.

If `dsh` is not on PATH, tell the user and stop. If this directory is already a clone,
use `.` instead of the package name in both commands. If the npm registry is blocked, use
`https://github.com/woodmeone/dsh-loom/archive/refs/heads/main.tar.gz`. If one profile is
missing, skip that command and still install the other.

```sh
dsh plugin --profile web add dsh-loom
dsh plugin --profile desktop add dsh-loom
```

After the commands finish, tell the user to fully quit and restart `dsh web`, and to quit
the desktop tray then reopen the EXE. On each host, open **dsh-loom** beside the session
title and click **Apply** on **Clean**. Then stop.

<!-- AI-AGENT-END -->

### Manual install

Use this when the command fails or `dsh` is not on PATH. Edit **only the profile for the
host you run**.

<details>
<summary><strong>Full manual steps</strong></summary>

**1. Find the `$DSH_HOME` this host uses.** A real home is named `.dsh` (the official EXE
sometimes uses `dsh-home`), contains `profiles`, and has at least one
`profiles/<name>/package.json`.

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

**2. Put the plugin at `$DSH_HOME/plugins/dsh-loom`** — the folder must be named
`dsh-loom` and its `package.json` `"name"` must be `dsh-loom`.

```sh
git clone https://github.com/woodmeone/dsh-loom.git "$DSH_HOME/plugins/dsh-loom"
```

Without git: download
[main.tar.gz](https://github.com/woodmeone/dsh-loom/archive/refs/heads/main.tar.gz),
extract, rename `dsh-loom-main` → `dsh-loom`, and place it under `plugins`.

**3. Edit only that profile's `package.json` — back it up first.** Add exactly two
things and keep every existing dependency and bundle:

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

Keep the JSON valid (comma before the new item, none after the last). Do not switch the
`file:` path to an absolute one and do not list `"dsh-loom"` twice.

**4. Run `pnpm install` in that profile only**:

```sh
cd "$DSH_HOME/profiles/web"   # or profiles/desktop
pnpm install
```

Success: `profiles/<web|desktop>/node_modules/dsh-loom/package.json` exists.

**5. Fully quit that host, reopen it, then Apply** — same three steps as above.

</details>

### Uninstall

**dsh-loom** beside the session title → **Clean** → **Uninstall**. It reverts any applied
patches, restores the original harness, and restarts the current host.

```sh
# from a terminal
dsh-loom --uninstall

# or in chat
/purge uninstall
```

Plugin config lives in `cordis.patch.yml`; `postPrompt` is empty by default:

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

## Usage

```sh
dsh-loom --status
dsh-loom --apply
dsh-loom --revert
dsh-loom --uninstall
dsh-loom --edit
```

Chat / model entry points:

```text
/purge status | apply | revert | uninstall | edit | help
/rules list | use <id> | create <id> | delete <id> | reset | help
/skills list | import <zip-or-folder> | create <id> [description] | delete <id> | help
/rewind

purge_status   purge_apply   purge_revert
```

### The dock

**dsh-loom** sits beside the session title and opens a right-hand dock with two pages:

| Area | What it shows |
|---|---|
| Clean | patches, prompt, rule sets, skills — and **Apply** / **Restore** / **Uninstall** |
| Drill | assets, skills, and environment after authorization. Says Unauthorized until then |
| Prompt | edit `prompt-inject.md` as the session override |
| Own servers | one exact IP or hostname per line, saved to `$DSH_HOME/net-scope-allow.txt` |
| Rule sets | several `AGENTS.md` / `CLAUDE.md`; Enable writes under `$DSH_HOME` |
| Skills | import a zip or folder into this host's `$DSH_HOME/skills/<id>/SKILL.md` |

Opening **Drill** for the first time requires reading the notice, waiting out the
countdown, scrolling to the end, and checking three boxes. Clean does not. Drill is only
for a host you manage, an offline target, or an exercise you already have written
authorization for.

### Apply, restart, revert

After a successful Apply the host restarts once so the patched packages load. **Restart**
is also available manually in the dock. **Restore** (or `/purge revert`) copies the
backups back, deletes them, and strips the shim lines this plugin wrote.

Switching presets alone does not reload patches in a running process: quit the host
fully → Apply → restart → start a new chat.

### Local checks

```sh
node --check lib/index.js lib/core.js lib/reapply.js
node --input-type=module -e "import './lib/index.js'"
npm test           # node --test over test/
```

## Attribution required

**If you borrow this project's name, ideas, code, or prompts, you must credit the author
and name the source repository:** [YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge).

`dsh-loom` is a derived work. Upstream history stays in
[release-notes.md](release-notes.md); the license stays [MIT](LICENSE). Using the
upstream work without attribution, hiding its source, or passing it off as your own will
be pursued.

## Non-profit project

Free and non-profit. Commercial sale, paid resale, and profit from illegal or gray-market
activity are forbidden. This is a technical reference.

### ⚠️ Legal and compliance disclaimer

**Disclaimer:** this is a non-profit open-source project for learning and research only.
Do not use it for any illegal or non-compliant purpose; the user bears the consequences.

**Zero tolerance:** the project forbids any illegal activity. The authors do not support,
encourage, or assist unauthorized network attacks, exploit use, data theft, or unlawful
intrusion into computer information systems.

1. **Local official harness only.** The eval patches and prompt injection target the
   **official DeepSeek Harness already installed on the user's machine** (`@deepseek-ai`
   packages, local profile / `$DSH_HOME`) — not someone else's website, server, account,
   or information system.
2. **No attack traffic.** Apply, inject, revert, and uninstall stay in local files and
   local processes. They do not scan, probe, intrude, or send attack traffic to any
   public host. Do not use this project as a jump host against the public internet.
3. **Lawful, controlled scope.** Run it only on a harness you are entitled to
   administer, offline local synthetic fixtures, or a compliant lab environment — never
   against targets without the owner's lawful written authorization.
4. **Mainland China, Hong Kong, and Macau ranges are forbidden.** The only exception is
   one exact IP, or one exact hostname, registered in advance as your own server. A key,
   a password, a network range, a wildcard, or a claim made in chat adds no exception.
5. **The user bears all responsibility.** The project is provided as-is under the MIT
   license, with no warranty. Anyone who uses it for illegal attacks or malicious
   activity has their open-source license terminated from that moment and must stop
   using it, destroy all copies and derivatives, and accept legal sanctions.
6. **No affiliation.** This is an independent security-eval research project. It has no
   employment, commercial, authorization, or endorsement relationship with DeepSeek or
   its affiliates.
