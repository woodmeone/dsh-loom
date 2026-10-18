/**
 * 块管理面板 —— 浏览器半侧。
 *
 * 这段代码由 scripts/build-client.mjs 注入 client.js 的 loader 工厂体内，
 * 所以它能直接用外层作用域的 h / react / useState / NS / apiUrl 等，
 * 不需要自己 require。
 *
 * 交互约定（跟需求对齐）：
 *   · 每块一行：开关、名称、位置、字数、来源
 *   · 默认块删除按钮灰掉（可关、可改、可还原）
 *   · 点行展开编辑器；默认只读，勾「允许编辑」才可变
 *   · 顶部两个动作：撤销本次改动（单块）、恢复出厂（全局）
 */

const LOOM_PANEL_CSS = `
.dshl-panel{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}
.dshl-panel[hidden]{display:none}
.dshl-card{width:min(1040px,94vw);max-height:88vh;display:flex;flex-direction:column;background:var(--dshl-bg,#fff);color:var(--dshl-fg,#111);border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.35);overflow:hidden;font-size:13px}
@media (prefers-color-scheme:dark){.dshl-card{--dshl-bg:#1b1d22;--dshl-fg:#e8eaed;--dshl-line:#2c2f36;--dshl-dim:#9aa0a6}}
.dshl-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--dshl-line,#e5e7eb)}
.dshl-title{font-weight:600;font-size:14px}
.dshl-sum{color:var(--dshl-dim,#6b7280);font-variant-numeric:tabular-nums}
.dshl-spacer{flex:1}
.dshl-btn{border:1px solid var(--dshl-line,#d1d5db);background:transparent;color:inherit;border-radius:8px;padding:5px 11px;cursor:pointer;font-size:12px}
.dshl-btn:hover{background:rgba(127,127,127,.12)}
.dshl-btn[disabled]{opacity:.4;cursor:not-allowed}
.dshl-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}
.dshl-btn.danger{color:#dc2626;border-color:#dc2626}
.dshl-body{overflow:auto;padding:8px 16px 16px}
.dshl-row{display:grid;grid-template-columns:28px 1fr 84px 76px 72px 64px;gap:10px;align-items:center;padding:7px 4px;border-bottom:1px solid var(--dshl-line,#f0f0f0)}
.dshl-row:hover{background:rgba(127,127,127,.06)}
.dshl-row.open{background:rgba(37,99,235,.07)}
.dshl-id{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:var(--dshl-dim,#6b7280)}
.dshl-name{font-weight:500}
.dshl-badge{display:inline-block;font-size:10px;padding:0 5px;border-radius:4px;margin-left:6px;border:1px solid currentColor;opacity:.75}
.dshl-src{font-size:11px;color:var(--dshl-dim,#6b7280)}
.dshl-num{text-align:right;font-variant-numeric:tabular-nums;color:var(--dshl-dim,#6b7280)}
.dshl-editor{border:1px solid var(--dshl-line,#e5e7eb);border-radius:10px;margin:6px 0 14px;padding:12px}
.dshl-editor textarea{width:100%;min-height:220px;resize:vertical;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.55;padding:10px;border-radius:8px;border:1px solid var(--dshl-line,#d1d5db);background:transparent;color:inherit;box-sizing:border-box}
.dshl-editor textarea[readonly]{opacity:.65;cursor:not-allowed}
.dshl-tools{display:flex;gap:8px;align-items:center;margin-top:9px;flex-wrap:wrap}
.dshl-lock{display:flex;gap:6px;align-items:center;color:var(--dshl-dim,#6b7280)}
.dshl-msg{padding:8px 16px;font-size:12px}
.dshl-msg.err{color:#dc2626}
.dshl-msg.ok{color:#059669}
.dshl-launch{position:fixed;right:18px;bottom:18px;z-index:2147482000;border-radius:999px;padding:9px 16px;border:1px solid rgba(127,127,127,.4);background:rgba(20,20,24,.86);color:#fff;cursor:pointer;font-size:12.5px;box-shadow:0 6px 20px rgba(0,0,0,.28)}
.dshl-launch:hover{background:rgba(20,20,24,.95)}
`;

function loomApi(op, payload) {
  const body = JSON.stringify({ op, ...(payload || {}) });
  const url = (typeof apiUrl === "function") ? apiUrl("/loom/api") : "/loom/api";
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  }).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  });
}

function LoomBlockPanel() {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState(null);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await loomApi("snapshot");
      setSnap(r.data);
      setErr("");
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    refresh();
    let style = document.querySelector('style[data-dshl="1"]');
    if (!style) {
      style = document.createElement("style");
      style.setAttribute("data-dshl", "1");
      style.textContent = LOOM_PANEL_CSS;
      document.head.append(style);
    }
    return undefined;
  }, [open, refresh]);

  useEffect(() => {
    if (!styleOnce.done && typeof document !== "undefined") {
      styleOnce.done = true;
      let style = document.querySelector('style[data-dshl="1"]');
      if (!style) {
        style = document.createElement("style");
        style.setAttribute("data-dshl", "1");
        style.textContent = LOOM_PANEL_CSS;
        document.head.append(style);
      }
    }
  }, []);

  const act = useCallback(async (fn, okText) => {
    setBusy(true);
    setErr("");
    setOkMsg("");
    try {
      await fn();
      if (okText) setOkMsg(okText);
      await refresh();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const toggle = (b) => act(() => loomApi("setMeta", { id: b.id, patch: { enabled: !b.enabled } }));
  const revert = (b) => act(() => loomApi("revert", { id: b.id }), `已还原 ${b.id}`);
  const remove = (b) => act(() => loomApi("remove", { id: b.id }), `已删除 ${b.id}`);
  const restoreAll = () => {
    if (typeof window !== "undefined" && !window.confirm("恢复出厂会清空所有改动（历史进 _trash），继续？")) return;
    act(() => loomApi("restoreFactory"), "已恢复出厂");
  };

  const openEditor = (b) => {
    if (activeId === b.id) { setActiveId(""); return; }
    setActiveId(b.id);
    setDraft(b.content || "");
    setUnlocked(false);
  };
  const save = () => act(() => loomApi("setContent", { id: activeId, content: draft }), `已保存 ${activeId}`);

  const launch = h("button", {
    type: "button",
    className: "dshl-launch",
    title: "提示词块管理",
    onClick: () => setOpen(true),
  }, "块管理");

  if (!open) return launch;

  const items = snap?.items || [];
  const rows = [];
  for (const b of items) {
    const isOpen = activeId === b.id;
    rows.push(h("div", {
      key: b.id,
      className: `dshl-row${isOpen ? " open" : ""}`,
      onClick: () => openEditor(b),
      style: { cursor: "pointer" },
    },
      h("input", {
        type: "checkbox",
        checked: !!b.enabled,
        disabled: busy,
        onClick: (e) => e.stopPropagation(),
        onChange: () => toggle(b),
      }),
      h("div", null,
        h("span", { className: "dshl-name" }, b.name || b.id),
        b.builtin ? h("span", { className: "dshl-badge" }, "默认") : null,
        b.overridden ? h("span", { className: "dshl-badge" }, "已改") : null,
        h("div", { className: "dshl-id" }, b.id),
      ),
      h("div", { className: "dshl-src" }, (b.slots || []).join(",")),
      h("div", { className: "dshl-src" }, b.source || "-"),
      h("div", { className: "dshl-num" }, `${b.bytes} 字`),
      h("button", {
        type: "button",
        className: "dshl-btn",
        disabled: busy || b.builtin,
        title: b.builtin ? "默认块不可删除（可关闭）" : "删除此块",
        onClick: (e) => { e.stopPropagation(); remove(b); },
      }, "删"),
    ));

    if (isOpen) {
      rows.push(h("div", { key: `${b.id}-editor`, className: "dshl-editor" },
        h("textarea", {
          value: draft,
          readOnly: !unlocked,
          onChange: (e) => setDraft(e.target.value),
        }),
        h("div", { className: "dshl-tools" },
          h("label", { className: "dshl-lock" },
            h("input", {
              type: "checkbox",
              checked: unlocked,
              onChange: (e) => setUnlocked(e.target.checked),
            }),
            "允许编辑",
          ),
          h("button", { type: "button", className: "dshl-btn primary", disabled: !unlocked || busy, onClick: save }, "保存"),
          h("button", { type: "button", className: "dshl-btn", disabled: !b.overridden || busy, onClick: () => revert(b) }, "撤销本次改动"),
          h("span", { className: "dshl-spacer" }),
          h("span", { className: "dshl-src" }, `${b.contentSource} · ${b.bytes} 字`),
        ),
      ));
    }
  }

  return h(react.Fragment, null,
    launch,
    h("div", { className: "dshl-panel" },
      h("div", { className: "dshl-card" },
        h("div", { className: "dshl-head" },
          h("span", { className: "dshl-title" }, "提示词块"),
          h("span", { className: "dshl-sum" },
            snap ? `${snap.enabled}/${snap.total} 开 · 顶部 ${snap.topBytes} 字` : "读取中…"),
          h("span", { className: "dshl-spacer" }),
          h("button", { type: "button", className: "dshl-btn", disabled: busy, onClick: refresh }, "刷新"),
          h("button", { type: "button", className: "dshl-btn danger", disabled: busy, onClick: restoreAll }, "恢复出厂"),
          h("button", { type: "button", className: "dshl-btn", onClick: () => setOpen(false) }, "关闭"),
        ),
        err ? h("div", { className: "dshl-msg err" }, err) : null,
        okMsg ? h("div", { className: "dshl-msg ok" }, okMsg) : null,
        h("div", { className: "dshl-body" }, rows.length ? rows : h("div", { className: "dshl-msg" }, "还没有块。")),
      ),
    ),
  );
}

const styleOnce = { done: false };

export { LoomBlockPanel };
