/* ------------------------------------------------------
   Palliative Rounds — sync_github.js
   Zero-server sync using GitHub Contents API
   - Load once on open from data/patients.json
   - Debounced bulk saves (PUT) with conflict resolution
   - No polling, no change-log; last-writer-wins by updatedAt
   - Wraps PR.state only (no core logic changes)
-------------------------------------------------------*/

(function () {
  const U = PR.utils;
  const S = PR.state;

  /* ---------------- Config Keys ---------------- */
  const K = {
    ghToken: "gh_token",
    ghOwner: "gh_owner",
    ghRepo:  "gh_repo",
    ghPath:  "gh_path",   // e.g., data/patients.json
    ghBranch:"gh_branch", // e.g., main
    inited:  "gh_inited",
    sha:     "gh_last_sha", // last known blob SHA for PUT
  };

  // Save debounce (good for CSV import & batched edits)
  const SAVE = {
    DEBOUNCE_MS: 800,
    MAX_QUEUE:  200,
  };

  /* ---------------- Local State ---------------- */
  let APPLYING_REMOTE = false;
  let saveTimer = null;
  let pendingCount = 0;

  /* ---------------- Storage helpers ---------------- */
  const get = (k, d) => U.load(k, d);
  const set = (k, v) => U.save(k, v);
  const del = (k)    => localStorage.removeItem(k);

  function cfg() {
    return {
      token: (get(K.ghToken, "") || "").trim(),
      owner: (get(K.ghOwner, "") || "").trim(),
      repo:  (get(K.ghRepo , "") || "").trim(),
      path:  (get(K.ghPath , "data/patients.json") || "").trim(),
      branch:(get(K.ghBranch, "main") || "").trim(),
    };
  }

  function setCfgField(key, val) { set(key, (val || "").trim()); }

  function isConfigured() {
    const c = cfg();
    return !!(c.token && c.owner && c.repo && c.path && c.branch);
  }

  function setSha(sha) { set(K.sha, sha || ""); }
  function getSha()    { return get(K.sha, ""); }

  function setInited(v) { set(K.inited, !!v); }
  function isInited()   { return !!get(K.inited, false); }

  /* ---------------- HTTP helpers ---------------- */
  const GH_API = "https://api.github.com";

  function ghHeaders() {
    const c = cfg();
    const h = {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (c.token) h["Authorization"] = `token ${c.token}`;
    return h;
  }

  async function ghGetContents() {
    const c = cfg();
    const url = `${GH_API}/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${encodeURIComponent(c.path)}?ref=${encodeURIComponent(c.branch)}`;
    const res = await fetch(url, { headers: ghHeaders(), method: "GET", mode: "cors" });
    if (!res.ok) {
      const t = await safeText(res);
      throw new Error(`GET ${res.status} ${res.statusText} ${t && "– "+t}`);
    }
    return res.json();
  }

  async function ghPutContents({ contentB64, message, sha }) {
    const c = cfg();
    const url = `${GH_API}/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${encodeURIComponent(c.path)}`;
    const body = {
      message: message || "Palliative data update",
      content: contentB64,
      branch: c.branch,
    };
    if (sha) body.sha = sha;
    const res = await fetch(url, {
      method: "PUT",
      headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      mode: "cors",
    });
    // 201/200 OK; 409 conflict
    if (!res.ok) {
      const t = await safeText(res);
      const err = new Error(`PUT ${res.status} ${res.statusText} ${t && "– "+t}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async function safeText(res) {
    try { return (await res.text()).slice(0, 300); }
    catch { return ""; }
  }

  /* ---------------- JSON <-> Base64 helpers (UTF-8 safe) ---------------- */
  function toB64Utf8(str) {
    // Encode UTF-8 then Base64
    const bytes = new TextEncoder().encode(str);
    // Convert bytes to binary string for btoa
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function fromB64Utf8(b64) {
    const bin = atob(b64 || "");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ---------------- Patient merging (conflict resolution) ---------------- */
  function ensurePatientShape(p) {
    if (!p.bio)  p.bio  = {};
    if (!p.hpi)  p.hpi  = {};
    if (!p.esas) p.esas = {};
    if (!p.ctcae) p.ctcae = { enabled:false, items:{} };
    if (!p.labs) p.labs = {};
    return p;
  }

  function mergeByUpdatedAt(remoteArr, localArr) {
    const byId = new Map();
    (remoteArr || []).forEach(r => { if (r && r.id) byId.set(r.id, ensurePatientShape(r)); });
    (localArr  || []).forEach(l => {
      if (!l || !l.id) return;
      const r = byId.get(l.id);
      if (!r) { byId.set(l.id, ensurePatientShape(l)); return; }
      // prefer the newer updatedAt (ISO string)
      const rt = Date.parse(r.updatedAt || 0) || 0;
      const lt = Date.parse(l.updatedAt || 0) || 0;
      byId.set(l.id, ensurePatientShape(lt >= rt ? l : r));
    });
    return Array.from(byId.values());
  }

  /* ---------------- Load Once (on open) ---------------- */
  async function loadOnce() {
    if (!isConfigured()) return;
    try {
      const meta = await ghGetContents(); // { content, sha, ... }
      const json = fromB64Utf8(meta.content || "");
      const parsed = JSON.parse(json || "[]");

      APPLYING_REMOTE = true;

      // Replace local list with file content
      const localIds = S.state.patients.map(p => p.id);
      localIds.forEach(id => S.removePatient(id)); // no push while APPLYING_REMOTE
      (Array.isArray(parsed) ? parsed : (parsed.patients || [])).forEach(p => {
        S.addPatient(ensurePatientShape(p));
      });

      setSha(meta.sha || "");
      setInited(true);
      U.toast("Loaded from GitHub.", "success");
    } catch (e) {
      // If file not found (404), OK — we will create it on first save.
      if (String(e.message || e).includes("404")) {
        setSha("");
        setInited(true);
        U.toast("No data file yet. Will create on first save.", "warn");
        return;
      }
      console.error("GitHub load failed:", e);
      U.toast(`GitHub load failed: ${e.message || e}`, "warn");
    } finally {
      APPLYING_REMOTE = false;
    }
  }

  /* ---------------- Save (debounced bulk) ---------------- */
  function scheduleSave() {
    pendingCount++;
    if (pendingCount >= SAVE.MAX_QUEUE) {
      clearTimeout(saveTimer); saveTimer = null;
      saveNow().catch(console.error);
    } else if (!saveTimer) {
      saveTimer = setTimeout(() => saveNow().catch(console.error), SAVE.DEBOUNCE_MS);
    }
  }

  async function saveNow() {
    saveTimer = null; pendingCount = 0;
    if (!isConfigured()) return;

    try {
      // Serialize current patients
      const out = JSON.stringify(S.state.patients, null, 0);
      const contentB64 = toB64Utf8(out);
      const message = "chore(data): sync patients.json";
      const sha = getSha() || undefined;

      // First attempt
      let res;
      try {
        res = await ghPutContents({ contentB64, message, sha });
      } catch (e1) {
        if (e1.status === 409 || e1.status === 422) {
          // Conflict or missing SHA: reload, merge, retry once
          const meta = await ghGetContents(); // remote latest
          const remote = JSON.parse(fromB64Utf8(meta.content || "") || "[]");
          const merged = mergeByUpdatedAt(remote, S.state.patients);
          const mergedB64 = toB64Utf8(JSON.stringify(merged, null, 0));
          res = await ghPutContents({ contentB64: mergedB64, message: "merge: resolved by updatedAt", sha: meta.sha });
          // Apply merged locally too (to keep parity)
          APPLYING_REMOTE = true;
          const ids = S.state.patients.map(p => p.id);
          ids.forEach(id => S.removePatient(id));
          merged.forEach(p => S.addPatient(ensurePatientShape(p)));
          APPLYING_REMOTE = false;
        } else {
          throw e1;
        }
      }

      // Success
      const newSha = (res && res.content && res.content.sha) || "";
      setSha(newSha);
      // U.toast("Saved to GitHub.", "success");
    } catch (e) {
      console.error("GitHub save failed:", e);
      U.toast(`GitHub save failed: ${e.message || e}`, "warn");
    }
  }

  /* ---------------- Wrap PR.state (no logic change) ---------------- */
  function wrapState() {
    const _add = S.addPatient;
    const _update = S.updatePatient;
    const _remove = S.removePatient;

    S.addPatient = function (partial) {
      const id = _add(partial);
      if (!APPLYING_REMOTE) scheduleSave();
      return id;
    };

    S.updatePatient = function (id, patch) {
      const ok = _update(id, patch);
      if (ok && !APPLYING_REMOTE) scheduleSave();
      return ok;
    };

    S.removePatient = function (id) {
      const removed = _remove(id);
      if (removed && !APPLYING_REMOTE) scheduleSave();
      return removed;
    };
  }

  /* ---------------- Settings UI Injection ---------------- */
  function hookSettingsUI() {
    const dlg = document.getElementById("modalSettings");
    if (!dlg) return;

    if (!dlg.querySelector("#ghSyncRow")) {
      const body = dlg.querySelector(".modal-body");
      const footer = dlg.querySelector(".modal-footer");

      const wrap = document.createElement("div");
      wrap.id = "ghSyncRow";
      wrap.className = "grid-2";
      wrap.style.marginTop = "10px";
      wrap.innerHTML = `
        <div class="field" style="grid-column: 1 / -1">
          <label>GitHub Personal Access Token (repo / contents)</label>
          <input id="ghTok" type="password" placeholder="ghp_********************************" />
        </div>
        <div class="field">
          <label>Owner</label>
          <input id="ghOwner" type="text" placeholder="your-username-or-org" />
        </div>
        <div class="field">
          <label>Repo</label>
          <input id="ghRepo" type="text" placeholder="your-repo" />
        </div>
        <div class="field">
          <label>Path</label>
          <input id="ghPath" type="text" placeholder="data/patients.json" />
        </div>
        <div class="field">
          <label>Branch</label>
          <input id="ghBranch" type="text" placeholder="main" />
        </div>
        <div class="field" style="grid-column: 1 / -1">
          <small class="muted">Your token stays in this browser (localStorage). Keep it private.</small>
        </div>
      `;
      body.insertBefore(wrap, footer);
    }

    const openBtn = document.getElementById("openSettings");
    const saveBtn = document.getElementById("saveSettings");

    const $ = (id) => document.getElementById(id);

    openBtn?.addEventListener("click", () => {
      const c = cfg();
      $("ghTok").value = get(K.ghToken, "");
      $("ghOwner").value = c.owner;
      $("ghRepo").value = c.repo;
      $("ghPath").value = c.path;
      $("ghBranch").value = c.branch;
    });

    saveBtn?.addEventListener("click", async () => {
      setCfgField(K.ghToken, $("ghTok")?.value || "");
      setCfgField(K.ghOwner, $("ghOwner")?.value || "");
      setCfgField(K.ghRepo , $("ghRepo")?.value  || "");
      setCfgField(K.ghPath , $("ghPath")?.value  || "data/patients.json");
      setCfgField(K.ghBranch, $("ghBranch")?.value|| "main");

      // Reset SHA when repo/path/branch changes
      del(K.sha);

      if (isConfigured()) {
        U.toast("GitHub config saved.", "success");
        if (!isInited()) await loadOnce();
      } else {
        U.toast("GitHub config incomplete.", "warn");
      }
    });
  }

  /* ---------------- Boot ---------------- */
  document.addEventListener("DOMContentLoaded", () => {
    wrapState();
    hookSettingsUI();

    if (isConfigured() && !isInited()) {
      loadOnce();
    }
  });

  /* ---------------- Public API (optional) ---------------- */
  PR.sync = {
    loadOnce,
    saveNow,
    getConfig: cfg,
  };
})();
