/**
 * 块管理 HTTP 桥：`POST /loom/api`
 *
 * 给浏览器半侧的块编辑面板用。与 `/redteam/api` 同样的来源校验：
 * 本机回环放行，非回环要求 Origin 与 Host 同源。
 *
 * 约定：
 *   · 只接受 POST
 *   · body 是 `{ op, ...args }`
 *   · 返回 `{ ok: boolean, ... }`，错误放 `error`
 *   · 任何 op 都不写宿主文件——只动 $DSH_HOME/dsh-loom/
 */

import { snapshot, setBlockContent, addBlock, removeBlock, updateBlockMeta, revertBlock, restoreFactory } from "./blocks-edit.js";

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(text);
}

async function readBody(req, limit = 4 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("body too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function originAllowed(req) {
  const remote = req.socket?.remoteAddress ? String(req.socket.remoteAddress) : "";
  const loopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  const host = typeof req.headers.host === "string" ? req.headers.host : "";
  const hostLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
  if (loopback) return true;
  const origin = req.headers.origin;
  if (hostLocal) {
    if (origin === undefined || origin === "" || origin === "null") return true;
    if (typeof origin === "string" && /^app:/i.test(origin)) return true;
    try {
      const oh = new URL(origin).host;
      if (oh === host || oh === "") return true;
    } catch { /* fall through */ }
  }
  if (typeof origin !== "string" || origin === "") return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function registerLoomApi(ctx, core) {
  if (!ctx?.webServer?.register) return false;
  try {
    ctx.effect(() => ctx.webServer.register({
      kind: "exact",
      path: "/loom/api",
      handler: async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "POST only" });
          return;
        }
        if (!originAllowed(req)) {
          sendJson(res, 403, { ok: false, error: "origin rejected" });
          return;
        }
        let payload;
        try {
          payload = await readBody(req);
        } catch (error) {
          sendJson(res, 400, { ok: false, error: `bad body: ${error?.message || error}` });
          return;
        }
        const home = core.findDshHome();
        const op = String(payload?.op || "");
        try {
          switch (op) {
            case "snapshot":
              sendJson(res, 200, { ok: true, data: snapshot(home) });
              return;
            case "setContent": {
              const r = setBlockContent(home, payload.id, payload.content);
              sendJson(res, r.ok ? 200 : 400, r);
              return;
            }
            case "setMeta": {
              const r = updateBlockMeta(home, payload.id, payload.patch || {});
              sendJson(res, r.ok ? 200 : 400, r);
              return;
            }
            case "add": {
              const r = addBlock(home, payload.block || {});
              sendJson(res, r.ok ? 200 : 400, r);
              return;
            }
            case "remove": {
              const r = removeBlock(home, payload.id);
              sendJson(res, r.ok ? 200 : 400, r);
              return;
            }
            case "revert": {
              const r = revertBlock(home, payload.id);
              sendJson(res, r.ok ? 200 : 400, r);
              return;
            }
            case "restoreFactory": {
              const r = restoreFactory(home);
              sendJson(res, r.ok ? 200 : 400, r);
              return;
            }
            default:
              sendJson(res, 400, { ok: false, error: `unknown op: ${op}` });
          }
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error?.message || error) });
        }
      },
    }));
    return true;
  } catch {
    return false;
  }
}
