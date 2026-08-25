/* CrimeLine wallet connect — self-contained, no dependencies.
   Detects injected Solana wallets (Phantom / Solflare / Backpack), connects,
   persists the choice, silently reconnects on return visits, and updates every
   .js-wallet button on the page. Devnet beta: connecting links a wallet for
   early access — no transactions are made and nothing is ever signed. */
(function () {
  "use strict";
  var LS_KEY = "cl_wallet_provider";
  var state = { provider: null, providerId: null, pubkey: null };
  var originalLabels = new Map();

  /* ---------- provider detection (at call time — wallets inject late) ---------- */
  function getPhantom() {
    if (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) return window.phantom.solana;
    if (window.solana && window.solana.isPhantom) return window.solana;
    return null;
  }
  function getSolflare() {
    if (window.solflare && (window.solflare.isSolflare || typeof window.solflare.connect === "function")) return window.solflare;
    return null;
  }
  function getBackpack() {
    if (window.backpack && window.backpack.solana) return window.backpack.solana;
    if (window.backpack && window.backpack.isBackpack) return window.backpack;
    return null;
  }
  var WALLETS = [
    { id: "phantom",  name: "Phantom",  get: getPhantom,  url: "https://phantom.com/download",
      icon: '<svg viewBox="0 0 34 34" width="30" height="30"><rect width="34" height="34" rx="9" fill="#ab9ff2"/><path fill="#fffdf8" d="M27.3 17.4c0 5.6-4.3 10.2-9.8 10.6-.3 0-.5 0-.8 0-2.5 0-4.4-1.6-5.9-3.6-.3-.4-.9-.3-1.1.1-.8 1.7-2 3.5-3.9 3.5-1.5 0-2.1-1.3-2.1-2.9C3.7 17 9.6 6.9 17.5 6.9c5.4 0 9.8 4.7 9.8 10.5Zm-15.6-.6c.7 0 1.2-.7 1.2-1.6 0-.9-.5-1.6-1.2-1.6s-1.2.7-1.2 1.6c0 .9.5 1.6 1.2 1.6Zm5 0c.7 0 1.2-.7 1.2-1.6 0-.9-.5-1.6-1.2-1.6s-1.2.7-1.2 1.6c0 .9.5 1.6 1.2 1.6Z"/></svg>' },
    { id: "solflare", name: "Solflare", get: getSolflare, url: "https://www.solflare.com/download/",
      icon: '<svg viewBox="0 0 34 34" width="30" height="30"><rect width="34" height="34" rx="9" fill="#1b1d2a"/><path fill="#ffc10b" d="M17 5.5 19.9 14l8.6 3-8.6 3L17 28.5 14.1 20l-8.6-3 8.6-3L17 5.5Z"/><circle cx="24.8" cy="9.2" r="2.3" fill="#ff6d3d"/></svg>' },
    { id: "backpack", name: "Backpack", get: getBackpack, url: "https://backpack.app/download",
      icon: '<svg viewBox="0 0 34 34" width="30" height="30"><rect width="34" height="34" rx="9" fill="#e33e3f"/><path fill="#fff" d="M17 6.6c-1.6 0-3 .5-4.1 1.5-.5-.2-1.1-.2-1.7 0-1.8.6-2.7 2.7-2.7 4.9V24c0 1.9 1.5 3.4 3.4 3.4h10.2c1.9 0 3.4-1.5 3.4-3.4V13c0-2.2-.9-4.3-2.7-4.9-.6-.2-1.2-.2-1.7 0A5.9 5.9 0 0 0 17 6.6Zm0 2.6c1.3 0 2.5.6 3.2 1.6-1-.3-2.1-.4-3.2-.4s-2.2.1-3.2.4c.7-1 1.9-1.6 3.2-1.6Zm0 3.8c3.2 0 5.9 1 5.9 3.5v2H11.1v-2c0-2.5 2.7-3.5 5.9-3.5Z"/></svg>' }
  ];

  function short(pk) { return pk.slice(0, 4) + "…" + pk.slice(-4); }

  /* ---------- injected styles ---------- */
  var css = ""
    + ".clw-ov{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(3,5,10,.72);backdrop-filter:blur(7px);animation:clwFade .2s ease}"
    + ".clw-ov[hidden]{display:none}"
    + "@keyframes clwFade{from{opacity:0}to{opacity:1}}"
    + ".clw-m{position:relative;width:100%;max-width:420px;border:1px solid #262d3b;border-radius:24px;background:#1d2330;padding:30px 28px 26px;box-shadow:0 50px 100px -30px rgba(0,0,0,.6);animation:clwRise .25s cubic-bezier(.2,.7,.2,1);color:#e4e8f1;font-family:Inter,ui-sans-serif,system-ui,sans-serif}"
    + "@keyframes clwRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}"
    + ".clw-x{position:absolute;top:14px;right:14px;width:32px;height:32px;border-radius:9px;border:none;background:#262d3b;color:#98a1b3;cursor:pointer;font-size:13px}"
    + ".clw-x:hover{color:#e4e8f1}"
    + ".clw-eyebrow{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#646d80;margin:0}"
    + ".clw-m h3{margin:10px 0 6px;font-family:'Space Grotesk',Inter,sans-serif;font-size:21px;font-weight:700;letter-spacing:-.01em}"
    + ".clw-sub{margin:0 0 18px;color:#98a1b3;font-size:13.5px;line-height:1.65}"
    + ".clw-list{display:flex;flex-direction:column;gap:10px}"
    + ".clw-w{display:flex;align-items:center;gap:13px;width:100%;padding:13px 15px;border:none;border-radius:14px;background:#232937;color:#e4e8f1;cursor:pointer;font:inherit;font-size:15px;font-weight:650;text-align:left;text-decoration:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);transition:background .14s ease,transform .14s ease}"
    + ".clw-w:hover{background:#2a3140;transform:translateY(-1px)}"
    + ".clw-w .clw-ic{flex:none;width:30px;height:30px;border-radius:8px;overflow:hidden;display:flex}"
    + ".clw-w .clw-nm{flex:1}"
    + ".clw-w .clw-tag{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.09em;text-transform:uppercase;padding:4px 9px;border-radius:6px;color:#31d492;background:rgba(49,212,146,.1)}"
    + ".clw-w .clw-tag.get{color:#98a1b3;background:#1a1f2a}"
    + ".clw-note{display:flex;gap:10px;align-items:flex-start;margin-top:18px;padding:13px 15px;border-radius:12px;background:rgba(91,138,255,.08);color:#a8bce8;font-size:12.5px;line-height:1.6}"
    + ".clw-note b{color:#cdd9f5}"
    + ".clw-note .clw-dot{flex:none;margin-top:5px;width:7px;height:7px;border-radius:50%;background:#5b8aff}"
    + ".clw-err{min-height:16px;margin:10px 0 0;font-size:12.5px;color:#ff6478}"
    + ".clw-acct{display:flex;flex-direction:column;align-items:center;text-align:center}"
    + ".clw-avatar{width:56px;height:56px;border-radius:50%;margin:4px 0 12px;background:conic-gradient(from 210deg,#ff3050,#5b8aff,#31d492,#ff3050);padding:3px}"
    + ".clw-avatar i{display:block;width:100%;height:100%;border-radius:50%;background:#1d2330 center/60% no-repeat}"
    + ".clw-addr{font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:700;letter-spacing:.02em}"
    + ".clw-via{margin:4px 0 0;font-family:'JetBrains Mono',monospace;font-size:11px;color:#646d80;letter-spacing:.08em;text-transform:uppercase}"
    + ".clw-devnet{display:inline-flex;align-items:center;gap:7px;margin-top:12px;padding:5px 12px;border-radius:999px;background:rgba(232,179,75,.1);color:#e8b34b;font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase}"
    + ".clw-devnet i{width:6px;height:6px;border-radius:50%;background:#e8b34b}"
    + ".clw-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;margin-top:20px}"
    + ".clw-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 16px;border:none;border-radius:999px;background:#232937;color:#e4e8f1;font:inherit;font-size:13.5px;font-weight:650;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.05);transition:background .14s ease}"
    + ".clw-btn:hover{background:#2a3140}"
    + ".clw-btn.solid{background:#eef1f7;color:#12151d}"
    + ".clw-btn.solid:hover{background:#fff}"
    + ".clw-btn.danger{color:#ff6478}"
    /* ── the Connect Wallet sign (not a button) ──────────────────────
       Understated CrimeLine-red lettering with one soft neon halo.
       Connected: shows the truncated address in the same treatment. */
    + ".js-wallet{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;gap:8px;background:none;border:none;padding:10px 4px;cursor:pointer;"
    +   "font-family:'Space Grotesk',Inter,ui-sans-serif,sans-serif;font-size:15px;font-weight:650;letter-spacing:.015em;line-height:1;"
    +   "color:#ff4d63;text-shadow:0 0 12px rgba(255,48,80,.38),0 0 30px rgba(255,48,80,.12);"
    +   "transition:color .2s ease,text-shadow .2s ease}"
    + ".js-wallet:hover{color:#ff6e81;text-shadow:0 0 12px rgba(255,48,80,.55),0 0 34px rgba(255,48,80,.22)}"
    + ".js-wallet.clw-on{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13.5px;letter-spacing:.04em;color:#ff5e75;"
    +   "text-shadow:0 0 12px rgba(255,48,80,.35)}"
    + ".js-wallet.clw-on:hover{color:#ff8093;text-shadow:0 0 12px rgba(255,48,80,.5)}"
    + ".js-wallet:focus-visible{outline:2px solid rgba(255,48,80,.7);outline-offset:5px;border-radius:8px}"
    + ".js-wallet .wdot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#31d492;margin-right:2px;box-shadow:0 0 8px rgba(49,212,146,.9)}"
    + "@media (max-width:680px){.nav-links .js-wallet{margin-top:12px;justify-content:center;padding:15px 4px;border-bottom:none}}"
    + "body.clw-lock{overflow:hidden}";
  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------- modal ---------- */
  var ov = document.createElement("div");
  ov.className = "clw-ov";
  ov.hidden = true;
  ov.innerHTML =
    '<div class="clw-m" role="dialog" aria-modal="true" aria-labelledby="clwTitle">' +
      '<button class="clw-x" type="button" aria-label="Close">✕</button>' +
      '<div data-view="pick">' +
        '<p class="clw-eyebrow">Devnet beta</p>' +
        '<h3 id="clwTitle">Connect a Solana wallet</h3>' +
        '<p class="clw-sub">Link your wallet to be ready for the first markets. Trading runs in <b>USDC</b> when boards open.</p>' +
        '<div class="clw-list" data-list></div>' +
        '<p class="clw-err" data-err role="alert"></p>' +
        '<div class="clw-note"><span class="clw-dot"></span><span><b>Nothing is live yet.</b> CrimeLine is in devnet beta — connecting only links your address for early access. No transaction is made and you will never be asked to sign anything here.</span></div>' +
      '</div>' +
      '<div data-view="acct" hidden>' +
        '<p class="clw-eyebrow">Connected</p>' +
        '<div class="clw-acct">' +
          '<span class="clw-avatar"><i></i></span>' +
          '<span class="clw-addr" data-addr></span>' +
          '<span class="clw-via" data-via></span>' +
          '<span class="clw-devnet"><i></i>Devnet beta · USDC markets soon</span>' +
          '<div class="clw-row">' +
            '<button class="clw-btn solid" type="button" data-copy>Copy address</button>' +
            '<button class="clw-btn danger" type="button" data-disconnect>Disconnect</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  var lastFocus = null;
  function mount() { if (!ov.parentNode) document.body.appendChild(ov); }

  var $ = function (sel) { return ov.querySelector(sel); };

  function openModal(view) {
    mount();
    lastFocus = document.activeElement;
    showView(view);
    ov.hidden = false;
    document.body.classList.add("clw-lock");
  }
  function closeModal() {
    ov.hidden = true;
    document.body.classList.remove("clw-lock");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function showView(view) {
    $('[data-view="pick"]').hidden = view !== "pick";
    $('[data-view="acct"]').hidden = view !== "acct";
    if (view === "pick") renderList();
    if (view === "acct") {
      $("[data-addr]").textContent = state.pubkey ? short(state.pubkey) : "";
      $("[data-via]").textContent = "via " + (state.providerId || "wallet");
    }
  }
  function renderList() {
    var list = $("[data-list]");
    $("[data-err]").textContent = "";
    var rows = WALLETS.map(function (w) {
      var installed = !!w.get();
      if (installed) {
        return '<button class="clw-w" type="button" data-connect="' + w.id + '">' +
          '<span class="clw-ic">' + w.icon + '</span><span class="clw-nm">' + w.name + '</span>' +
          '<span class="clw-tag">Detected</span></button>';
      }
      return '<a class="clw-w" href="' + w.url + '" target="_blank" rel="noopener">' +
        '<span class="clw-ic">' + w.icon + '</span><span class="clw-nm">' + w.name + '</span>' +
        '<span class="clw-tag get">Install ↗</span></a>';
    });
    list.innerHTML = rows.join("");
  }

  /* ---------- connect / disconnect ---------- */
  function wireEvents(prov) {
    if (!prov || !prov.on || prov.__clwWired) return;
    prov.__clwWired = true;
    try {
      prov.on("disconnect", function () { reset(); });
      prov.on("accountChanged", function (pk) {
        if (pk) { state.pubkey = pk.toString(); paint(); }
        else { reset(); }
      });
    } catch (_) {}
  }

  function connect(id, silent) {
    var w = WALLETS.filter(function (x) { return x.id === id; })[0];
    var prov = w && w.get();
    if (!prov) {
      if (!silent) $("[data-err]").textContent = "Wallet not detected — install it, refresh, and try again.";
      return Promise.reject(new Error("not detected"));
    }
    var opts = silent ? { onlyIfTrusted: true } : undefined;
    return Promise.resolve(prov.connect(opts)).then(function (resp) {
      var pk = (resp && resp.publicKey) || prov.publicKey;
      if (!pk) throw new Error("no public key returned");
      state.provider = prov;
      state.providerId = w.name;
      state.pubkey = pk.toString();
      try { localStorage.setItem(LS_KEY, id); } catch (_) {}
      wireEvents(prov);
      paint();
      return state.pubkey;
    });
  }

  function reset() {
    state.provider = null;
    state.providerId = null;
    state.pubkey = null;
    try { localStorage.removeItem(LS_KEY); } catch (_) {}
    paint();
  }

  function disconnect() {
    var p = state.provider;
    reset();
    if (p && typeof p.disconnect === "function") { try { p.disconnect(); } catch (_) {} }
    closeModal();
  }

  /* ---------- button state ---------- */
  function buttons() { return Array.prototype.slice.call(document.querySelectorAll(".js-wallet")); }
  function paint() {
    buttons().forEach(function (b) {
      if (!originalLabels.has(b)) originalLabels.set(b, b.innerHTML);
      if (state.pubkey) {
        b.innerHTML = '<span class="wdot"></span>' + short(state.pubkey);
        b.classList.add("clw-on"); // the neon sign lights up
        b.setAttribute("aria-label", "Wallet " + short(state.pubkey) + " connected — manage");
      } else {
        b.innerHTML = originalLabels.get(b);
        b.classList.remove("clw-on");
        b.removeAttribute("aria-label");
      }
    });
  }

  /* ---------- wiring ---------- */
  document.addEventListener("click", function (e) {
    var wb = e.target.closest(".js-wallet");
    if (wb) { e.preventDefault(); openModal(state.pubkey ? "acct" : "pick"); return; }
    if (ov.hidden) return;
    if (e.target === ov) { closeModal(); return; }
    if (e.target.closest(".clw-x")) { closeModal(); return; }
    var c = e.target.closest("[data-connect]");
    if (c) {
      var id = c.getAttribute("data-connect");
      c.disabled = true;
      $("[data-err]").textContent = "";
      connect(id, false).then(function () { showView("acct"); })
        .catch(function (err) {
          c.disabled = false;
          var m = (err && err.message) || "";
          $("[data-err]").textContent = /reject|denied|cancel/i.test(m)
            ? "Request cancelled in the wallet."
            : "Couldn’t connect — approve the request in your wallet and try again.";
        });
      return;
    }
    if (e.target.closest("[data-copy]")) {
      var btn = e.target.closest("[data-copy]");
      var done = function () { btn.textContent = "Copied ✓"; setTimeout(function () { btn.textContent = "Copy address"; }, 1400); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(state.pubkey || "").then(done, done);
      else done();
      return;
    }
    if (e.target.closest("[data-disconnect]")) { disconnect(); return; }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !ov.hidden) closeModal(); });

  /* ---------- silent reconnect on return visits ---------- */
  function tryReconnect() {
    var saved = null;
    try { saved = localStorage.getItem(LS_KEY); } catch (_) {}
    if (!saved) return;
    connect(saved, true).catch(function () { /* not trusted anymore — stay disconnected, keep saved id for next explicit click */ });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { paint(); setTimeout(tryReconnect, 60); });
  } else { paint(); setTimeout(tryReconnect, 60); }
  // wallets that inject after page load
  window.addEventListener("load", function () { setTimeout(tryReconnect, 350); });
})();
