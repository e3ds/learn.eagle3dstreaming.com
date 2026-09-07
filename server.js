/* [E3DS-LEARN-SERVER] Serves the docs, and lets them be edited in the browser.
 * ===========================================================================
 *
 * WHAT THIS IS FOR. A page here is written once and then found to be wrong in a
 * small way - a number, a sentence, a name. Asking a developer to change a word
 * is the wrong shape for that, and a git workflow is the wrong shape for a
 * typo. So: open the page with ?edit=1, change the text in place, press Save,
 * and the HTML file on disk is rewritten and served from that moment.
 *
 * NO DATABASE AND NO BUILD STEP. The file that is served IS the file that is
 * edited. Nothing to sync, nothing to rebuild, and a page cannot drift from its
 * source because there is only one of them.
 *
 * ---------------------------------------------------------------------------
 * WHAT PROTECTS IT, since this rewrites files on a public host:
 *
 *   a password        checked on SAVE, not on view. Reading is public - it is
 *                     documentation - and only writing is gated.
 *   path confinement  the target is resolved and must sit inside site/. A path
 *                     like ../../cirrus.js resolves outside and is refused, so
 *                     this cannot be walked out of.
 *   .html only        the one thing it is for. Nothing else is writable.
 *   a backup first    every save copies the current file into .backups/ with a
 *                     timestamp before overwriting. A bad edit is always one
 *                     file copy away from being undone.
 *   a size cap        so a runaway paste cannot fill the disk.
 *
 * The password lives in editor-password.txt beside this file, which is
 * gitignored. Absent, saving is DISABLED rather than open - a missing secret
 * must never mean "no security required".
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "site");
const BACKUPS = path.join(__dirname, ".backups");
const PORT = Number(process.env.LEARN_PORT) || 6500;
const MAX_BYTES = 2 * 1024 * 1024;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff2": "font/woff2",
};

function password() {
  try {
    const p = fs.readFileSync(path.join(__dirname, "editor-password.txt"), "utf8").trim();
    return p || null;
  } catch (e) { return null; }
}

/* Resolve inside ROOT or not at all. realpath is not used because the file may
 * not exist yet; the resolved prefix check is what matters. */
function safePath(urlPath) {
  const clean = decodeURIComponent(String(urlPath).split("?")[0]);
  const rel = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

/* The editor, injected into a page only when ?edit=1 is asked for. Kept out of
 * the file itself so the saved HTML never contains the editing machinery - a
 * page that saved its own toolbar would grow one copy per save. */
const EDITOR = `
<style id="e3dsEditStyle">
  #e3dsEditBar{position:fixed;left:0;right:0;bottom:0;z-index:99999;display:flex;
    gap:10px;align-items:center;padding:10px 14px;background:#161c1b;color:#e8eeec;
    border-top:2px solid #5fc2bc;font:14px/1.4 system-ui,sans-serif}
  #e3dsEditBar button{font:inherit;padding:7px 14px;border-radius:6px;cursor:pointer;
    border:1px solid #3c4846;background:#1d2524;color:#e8eeec}
  #e3dsEditBar button.primary{background:#5fc2bc;color:#0f1413;border-color:#5fc2bc;font-weight:600}
  #e3dsEditBar input{font:inherit;padding:7px 9px;border-radius:6px;border:1px solid #3c4846;
    background:#0f1413;color:#e8eeec}
  #e3dsEditBar .msg{opacity:.8}
  body.e3ds-editing [contenteditable="true"]{outline:2px dashed #5fc2bc;outline-offset:4px}
  body{padding-bottom:70px}
</style>
<div id="e3dsEditBar">
  <strong>Editing</strong>
  <span class="msg" id="e3dsEditMsg">Click any text to change it.</span>
  <span style="flex:1"></span>
  <input id="e3dsEditPw" type="password" placeholder="password" autocomplete="current-password">
  <button class="primary" id="e3dsEditSave">Save</button>
  <button id="e3dsEditCancel">Stop editing</button>
</div>
<script>
(function () {
  var bar = document.getElementById("e3dsEditBar");
  var msg = document.getElementById("e3dsEditMsg");
  var target = document.querySelector(".wrap") || document.body;
  target.setAttribute("contenteditable", "true");
  document.body.classList.add("e3ds-editing");

  document.getElementById("e3dsEditCancel").onclick = function () {
    location.href = location.pathname;
  };

  document.getElementById("e3dsEditSave").onclick = async function () {
    var pw = document.getElementById("e3dsEditPw").value;
    if (!pw) { msg.textContent = "Enter the password first."; return; }

    /* Take a copy of the document, strip the editing machinery out of THAT
     * rather than out of the live page, so the page keeps working while the
     * save is in flight and a failed save leaves nothing half-removed. */
    var clone = document.documentElement.cloneNode(true);
    /* Only the editing machinery is stripped. The navigation is part of the
     * page on disk and must survive a save - it is not stripped, and it sits
     * outside .wrap so editing cannot reach it either. */
    ["e3dsEditBar", "e3dsEditStyle"].forEach(function (id) {
      var n = clone.querySelector("#" + id); if (n) n.remove();
    });
    clone.querySelectorAll("script").forEach(function (n) {
      if ((n.textContent || "").indexOf("e3dsEditSave") !== -1) n.remove();
    });
    var t = clone.querySelector(".wrap") || clone.querySelector("body");
    if (t) t.removeAttribute("contenteditable");
    var b = clone.querySelector("body");
    if (b) b.classList.remove("e3ds-editing");

    msg.textContent = "Saving\\u2026";
    try {
      var r = await fetch("/_edit/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: location.pathname,
          html: "<!doctype html>\\n" + clone.outerHTML,
          password: pw,
        }),
      });
      var j = await r.json();
      msg.textContent = j.ok
        ? "Saved. Previous version kept as " + j.backup
        : "Not saved: " + j.error;
    } catch (e) {
      msg.textContent = "Not saved: " + e.message;
    }
  };
})();
</script>
`;

function send(res, code, body, type) {
  res.writeHead(code, { "Content-Type": type || "text/plain; charset=utf-8" });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/_edit/save") {
    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > MAX_BYTES) { req.destroy(); }
    });
    req.on("end", () => {
      let o;
      try { o = JSON.parse(body); }
      catch (e) { return send(res, 400, JSON.stringify({ ok: false, error: "bad JSON" }), "application/json"); }

      const pw = password();
      if (!pw) {
        return send(res, 503, JSON.stringify({ ok: false,
          error: "editing is disabled - no editor-password.txt on the server" }), "application/json");
      }
      if (String(o.password || "") !== pw) {
        return send(res, 403, JSON.stringify({ ok: false, error: "wrong password" }), "application/json");
      }

      const abs = safePath(o.path || "");
      if (!abs || path.extname(abs).toLowerCase() !== ".html") {
        return send(res, 400, JSON.stringify({ ok: false, error: "only .html inside site/" }), "application/json");
      }
      if (typeof o.html !== "string" || o.html.length < 50) {
        return send(res, 400, JSON.stringify({ ok: false, error: "that does not look like a page" }), "application/json");
      }

      try {
        fs.mkdirSync(BACKUPS, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const name = path.basename(abs, ".html") + "." + stamp + ".html";
        if (fs.existsSync(abs)) fs.copyFileSync(abs, path.join(BACKUPS, name));
        fs.writeFileSync(abs, o.html, "utf8");
        return send(res, 200, JSON.stringify({ ok: true, backup: name }), "application/json");
      } catch (e) {
        return send(res, 500, JSON.stringify({ ok: false, error: String(e.message) }), "application/json");
      }
    });
    return;
  }

  const abs = safePath(req.url);
  if (!abs) return send(res, 403, "outside the site directory");

  let file = abs;
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html"); }
  catch (e) { return send(res, 404, "not found"); }

  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "not found");
    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext] || "application/octet-stream";
    /* Pages are served exactly as they sit on disk - nothing is assembled per
     * request. The navigation is stamped into the files by build-nav.js, so the
     * markup a crawler sees is the markup in the file, and the site would still
     * be correct served by nginx alone. The editor is the one exception, and
     * only when it is explicitly asked for. */
    if (ext === ".html" && /(\?|&)edit=1(&|$)/.test(req.url)) {
      let html = buf.toString("utf8");
      html = html.includes("</body>") ? html.replace("</body>", EDITOR + "</body>") : html + EDITOR;
      return send(res, 200, html, type);
    }
    res.writeHead(200, { "Content-Type": type });
    res.end(buf);
  });
});

server.listen(PORT, () => {
  console.log("[E3DS-LEARN] serving " + ROOT + " on :" + PORT);
  console.log("[E3DS-LEARN] editing " + (password() ? "ENABLED" : "DISABLED (no editor-password.txt)"));
});
