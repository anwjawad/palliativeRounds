/* ------------------------------------------------------
   Palliative Rounds — sync_gas_bridge.js
   Two-way sync with Google Apps Script via iframe Bridge
   - Works from file:// (no CORS)
   - Load once on open (snapshot)
   - Debounced bulk upsert + bulk delete
   - Optional overwrite_all (for big CSV imports)
   - Wraps PR.state only (no changes to core app logic)
-------------------------------------------------------*/

(function () {
  const U = PR.utils;
  const S = PR.state;

  /* ---------------- Config / Keys ---------------- */
  const K = {
    gasUrlKey: "gas_bridge_url",  // base /exec URL (without ?bridge=1)
    initedKey: "gas_bridge_inited",
  };

  // Default GAS Web App URL (you can change in Preferences)
  const DEFAULT_EXEC_URL = "https://script.google.com/macros/s/AKfycbxXT9xHZ3zKiS_KnaiTAMSjVA3NWhxu57dhC97ouTlPJ4ZaFizuBIqw71cTkrnSk1g-5g/exec";

  // Save batching (great for Import)
  const BATCH = {
    FLUSH_MS: 700,
    MAX_BATCH: 120,
    POST_TIMEOUT_MS: 20000,
  };

  /* ---------------- Local State ---------------- */
  let APPLYING_REMOTE = false;
  let iframe = null;
  let iframeReady = false;
  let readyQueue = [];

  // Response tracking for postMessage RPC
  const pending = new Map(); // reqId -> {resolve,reject,timer}

  // Queues
  const upsertMap = new Map(); // id -> patient
  const deleteSet = new Set(); // id
  let flushTimer = null;

  /* ---------------- Storage helpers ---------------- */
  const get = (k, d) => U.load(k, d);
  const set = (k, v) => U.save(k, v);

  function getExecUrl() {
    return (get(K.gasUrlKey, DEFAULT_EXEC_URL) || DEFAULT_EXEC_URL).trim();
  }
  function setExecUrl(url) {
    set(K.gasUrlKey, (url || "").trim());
  }
  function isInited() {
    return !!get(K.initedKey, false);
  }
  function setInited(v) {
    set(K.initedKey, !!v);
  }

  /* ---------------- Bridge (iframe + postMessage) ---------------- */

  function ensureIframe() {
    if (iframe) return;
    // Create hidden iframe to the GAS /exec?bridge=1
    const bridgeUrl = getExecUrl().replace(/\/+$/, "") + "?bridge=1";
    iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "-9999px";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.setAttribute("aria-hidden", "true");
    iframe.src = bridgeUrl;
    document.body.appendChild(iframe);
    // We consider iframe "ready" after it loads and we can ping it.
    iframe.addEventListener("load", () => {
      iframeReady = true;
      // Flush any queued calls
      const q = readyQueue.slice();
      readyQueue = [];
      q.forEach((fn) => fn());
    });
    // Listener for responses
    window.addEventListener("message", onBridgeMessage, false);
  }

  function onBridgeMessage(ev) {
    const data = ev && ev.data;
    if (!data || !data.reqId) return;
    const entry = pending.get(data.reqId);
    if (!entry) return;
    pending.delete(data.reqId);
    clearTimeout(entry.timer);
    if (data.ok) entry.resolve(data.result);
    else entry.reject(new Error(data.error || "Bridge error"));
  }

  function callBridge(cmd, payload) {
    return new Promise((resolve, reject) => {
      const post = () => {
        try {
          const reqId = "req_" + Math.random().toString(36).slice(2);
          const timer = setTimeout(() => {
            pending.delete(reqId);
            reject(new Error(`Bridge timeout for ${cmd}`));
          }, BATCH.POST_TIMEOUT_MS);

          pending.set(reqId, { resolve, reject, timer });
          iframe.contentWindow.postMessage({ reqId, cmd, ...payload }, "*");
        } catch (e) {
          reject(e);
        }
      };

      if (!iframe || !iframeReady) {
        readyQueue.push(post);
        try { ensureIframe(); } catch (e) { reject(e); }
      } else {
        post();
      }
    });
  }

  /* ---------------- Mapping helpers ---------------- */

  function ensurePatientShape(p) {
    if (!p.bio)  p.bio  = {};
    if (!p.hpi)  p.hpi  = {};
    if (!p.esas) p.esas = {};
    if (!p.ctcae) p.ctcae = { enabled:false, items:{} };
    if (!p.labs) p.labs = {};
    return p;
  }

  /* ---------------- Batch queue ---------------- */

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => flushNow().catch(console.error), BATCH.FLUSH_MS);
  }

  function enqueueUpsertById(id) {
    const p = S.state.patients.find((x) => x.id === id);
    if (!p) return;
    deleteSet.delete(id);
    upsertMap.set(id, p);
    if (upsertMap.size >= BATCH.MAX_BATCH) {
      clearTimeout(flushTimer); flushTimer = null;
      flushNow().catch(console.error);
    } else {
      scheduleFlush();
    }
  }

  function enqueueDelete(id) {
    upsertMap.delete(id);
    deleteSet.add(id);
    if (deleteSet.size >= BATCH.MAX_BATCH) {
      clearTimeout(flushTimer); flushTimer = null;
      flushNow().catch(console.error);
    } else {
      scheduleFlush();
    }
  }

  async function flushNow() {
    flushTimer = null;
    if (!iframe) ensureIframe();
    const upserts = Array.from(upsertMap.values());
    const deletes = Array.from(deleteSet.values());
    if (!upserts.length && !deletes.length) return;

    try {
      if (upserts.length) {
        // Send as rows: each row is { patient: fullPatient }
        const rows = upserts.map(p => ({ patient: p }));
        await callBridge("upsert_rows", { rows });
      }
      if (deletes.length) {
        await callBridge("delete_ids", { ids: deletes });
      }
      upsertMap.clear();
      deleteSet.clear();
      // U.toast("Synced with Google Sheet.", "success");
    } catch (e) {
      console.error("Bulk flush failed:", e);
      U.toast(`Sync: bulk flush failed. ${e.message || e}`, "warn");
    }
  }

  /* ---------------- Snapshot (load all) ---------------- */

  async function loadSnapshot() {
    ensureIframe();
    try {
      const res = await callBridge("snapshot", {});
      // res = { headers, rows, patients }
      const patients = Array.isArray(res && res.patients) ? res.patients : [];
      APPLYING_REMOTE = true;

      // Replace local list with snapshot patients
      const ids = S.state.patients.map(p => p.id);
      ids.forEach(id => S.removePatient(id));
      patients.map(ensurePatientShape).forEach(p => S.addPatient(p));

      setInited(true);
      U.toast(`Loaded ${patients.length} patients from Google Sheet.`, "success");
    } catch (e) {
      console.error("Snapshot load failed:", e);
      U.toast(`Sync: snapshot failed. ${e.message || e}`, "warn");
    } finally {
      APPLYING_REMOTE = false;
    }
  }

  /* ---------------- Overwrite all (optional, for big imports) ---------------- */
  async function overwriteAll(patients) {
    ensureIframe();
    try {
      await callBridge("overwrite_all", { patients: patients || S.state.patients });
      // No need to re-pull; local is already the source of truth here.
    } catch (e) {
      console.error("Overwrite failed:", e);
      U.toast(`Sync: overwrite failed. ${e.message || e}`, "warn");
    }
  }

  /* ---------------- Wrap PR.state ---------------- */

  function wrapState() {
    const _add = S.addPatient;
    const _update = S.updatePatient;
    const _remove = S.removePatient;

    S.addPatient = function (partial) {
      const id = _add(partial);
      if (!APPLYING_REMOTE) enqueueUpsertById(id);
      return id;
    };

    S.updatePatient = function (id, patch) {
      const ok = _update(id, patch);
      if (ok && !APPLYING_REMOTE) enqueueUpsertById(id);
      return ok;
    };

    S.removePatient = function (id) {
      const removed = _remove(id);
      if (removed && !APPLYING_REMOTE) enqueueDelete(id);
      return removed;
    };
  }

  /* ---------------- Settings UI (add Web App URL field) ---------------- */

  function hookSettingsUI() {
    const dlg = document.getElementById("modalSettings");
    if (!dlg) return;

    if (!dlg.querySelector("#gasBridgeRow")) {
      const body = dlg.querySelector(".modal-body");
      const footer = dlg.querySelector(".modal-footer");
      const wrap = document.createElement("div");
      wrap.className = "grid-2";
      wrap.id = "gasBridgeRow";
      wrap.style.marginTop = "10px";
      wrap.innerHTML = `
        <div class="field" style="grid-column: 1 / -1">
          <label>Google Apps Script Web App URL (exec)</label>
          <input id="gasExec" type="text" placeholder="https://script.google.com/macros/s/.../exec" />
        </div>
        <div class="field" style="grid-column: 1 / -1">
          <small class="muted">This bridge uses an invisible iframe to call GAS without CORS issues (even from file://).</small>
        </div>
      `;
      body.insertBefore(wrap, footer);
    }

    const openBtn = document.getElementById("openSettings");
    const saveBtn = document.getElementById("saveSettings");

    const input = () => document.getElementById("gasExec");

    openBtn?.addEventListener("click", () => {
      const cur = getExecUrl();
      if (input()) input().value = cur || DEFAULT_EXEC_URL;
    });

    saveBtn?.addEventListener("click", () => {
      const url = (input()?.value || "").trim();
      setExecUrl(url || DEFAULT_EXEC_URL);
      U.toast("GAS Web App URL saved.", "success");
      // Recreate iframe with the new URL
      try {
        if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch {}
      iframe = null; iframeReady = false; readyQueue = [];
      ensureIframe();
      // If first time
      if (!isInited()) loadSnapshot();
    });
  }

  /* ---------------- Boot ---------------- */
  document.addEventListener("DOMContentLoaded", () => {
    wrapState();
    hookSettingsUI();
    // Ensure iframe and do first load if URL exists
    ensureIframe();
    if (!isInited()) loadSnapshot();
  });

  /* ---------------- Public API ---------------- */
  PR.syncGAS = {
    loadSnapshot,
    flushNow,
    overwriteAll,
    getExecUrl,
    setExecUrl,
  };
})();
