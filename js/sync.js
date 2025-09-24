/* ------------------------------------------------------
   Palliative Rounds — sync.js
   Two-way sync with Google Sheets (GAS Web App)
   - No changes to core app logic (we wrap PR.state).
   - Uses text/plain for POST to avoid CORS preflight.
-------------------------------------------------------*/

(function () {
  const U = PR.utils;
  const S = PR.state;

  const K = {
    gasUrlKey: "gas_url",
    lastVerKey: "gas_last_ver",
  };

  let APPLYING_REMOTE = false;

  const getGASUrl = () => (U.load(K.gasUrlKey, "") || "").trim();
  const setGASUrl = (url) => U.save(K.gasUrlKey, (url || "").trim());
  const getLastVersion = () => Number(U.load(K.lastVerKey, 0) || 0);
  const setLastVersion = (v) => U.save(K.lastVerKey, Number(v) || 0);

  /* ------------ Transport helpers ------------ */
  async function gasGet(path, params = {}) {
    const base = getGASUrl();
    if (!base) throw new Error("GAS URL not set");
    const url = new URL(base.replace(/\/+$/, "") + "/" + String(path).replace(/^\/+/, ""));
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    const res = await fetch(url.toString(), { method: "GET", mode: "cors", redirect: "follow" });
    if (!res.ok) throw await httpError(res);
    return res.json();
  }

  // NOTE: text/plain to avoid CORS preflight headaches on some deployments
  async function gasPost(action, payload) {
    const base = getGASUrl();
    if (!base) throw new Error("GAS URL not set");
    const res = await fetch(base, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload }),
      credentials: "omit",
    });
    if (!res.ok) throw await httpError(res);
    // try parse JSON, otherwise raise
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { throw new Error(`GAS returned non-JSON: ${text.slice(0,160)}`); }
  }

  async function httpError(res) {
    let snippet = "";
    try { snippet = (await res.text()).slice(0, 200); } catch (_) {}
    return new Error(`HTTP ${res.status} ${res.statusText} – ${snippet}`);
  }

  /* ------------ Push (mirror local) ------------ */
  async function pushUpsertById(id) {
    try {
      const p = S.state.patients.find((x) => x.id === id);
      if (!p) return;
      await gasPost("upsert_patient", { patient: p });
    } catch (e) {
      console.error(e);
      U.toast(`Sync: failed to push update. ${e.message || e}`, "warn");
    }
  }
  async function pushDelete(id) {
    try {
      await gasPost("delete_patient", { id });
    } catch (e) {
      console.error(e);
      U.toast(`Sync: failed to push delete. ${e.message || e}`, "warn");
    }
  }

  /* ------------ Pull (incremental) ------------ */
  async function pullChangesOnce() {
    const base = getGASUrl();
    if (!base) return;
    try {
      const since = getLastVersion();
      const data = await gasGet("changes", { since });
      if (!data || typeof data.version === "undefined") return;
      const { version, upserts = [], deletes = [] } = data;

      if (!upserts.length && !deletes.length) {
        setLastVersion(version);
        return;
      }

      APPLYING_REMOTE = true;

      // apply upserts
      upserts.forEach((remoteP) => {
        const local = S.state.patients.find((x) => x.id === remoteP.id);
        if (!local) {
          S.addPatient(remoteP); // state.js ensures schema
        } else {
          S.updatePatient(remoteP.id, remoteP);
        }
      });

      // apply deletes
      deletes.forEach((id) => {
        if (S.state.patients.some((x) => x.id === id)) S.removePatient(id);
      });

      setLastVersion(version);
    } catch (e) {
      console.error("Sync pull failed:", e);
    } finally {
      APPLYING_REMOTE = false;
    }
  }

  // Poll every 5s
  let pollTimer = null;
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(pullChangesOnce, 5000);
    pullChangesOnce();
  }

  /* ------------ Wrap state methods (no logic change) ------------ */
  function wrapStateMethods() {
    const _add = S.addPatient;
    const _update = S.updatePatient;
    const _remove = S.removePatient;

    S.addPatient = function (partial) {
      const id = _add(partial);
      if (!APPLYING_REMOTE) pushUpsertById(id);
      return id;
    };

    S.updatePatient = function (id, patch) {
      const ok = _update(id, patch);
      if (ok && !APPLYING_REMOTE) pushUpsertById(id);
      return ok;
    };

    S.removePatient = function (id) {
      const removed = _remove(id);
      if (removed && !APPLYING_REMOTE) pushDelete(id);
      return removed;
    };
  }

  /* ------------ Settings injection (GAS URL) ------------ */
  function hookSettingsUI() {
    const dlg = document.getElementById("modalSettings");
    if (!dlg) return;

    if (!dlg.querySelector("#gasUrlRow")) {
      const body = dlg.querySelector(".modal-body");
      const footer = dlg.querySelector(".modal-footer");
      const wrap = document.createElement("div");
      wrap.className = "grid-2";
      wrap.id = "gasUrlRow";
      wrap.style.marginTop = "8px";
      wrap.innerHTML = `
        <div class="field" style="grid-column: 1 / -1">
          <label>Google Apps Script Web App URL</label>
          <input id="gasUrlInput" type="text" placeholder="https://script.google.com/macros/s/AKfycbx.../exec" />
        </div>
      `;
      body.insertBefore(wrap, footer);
    }

    const openBtn = document.getElementById("openSettings");
    const saveBtn = document.getElementById("saveSettings");
    const input = () => document.getElementById("gasUrlInput");

    openBtn?.addEventListener("click", () => {
      const cur = getGASUrl();
      if (input()) input().value = cur || "";
    });

    saveBtn?.addEventListener("click", () => {
      const url = input()?.value?.trim() || "";
      setGASUrl(url);
      if (url) {
        U.toast("GAS URL saved. Sync enabled.", "success");
        startPolling();
      } else {
        U.toast("GAS URL cleared. Sync disabled.", "warn");
      }
    });
  }

  /* ------------ Boot ------------ */
  document.addEventListener("DOMContentLoaded", () => {
    wrapStateMethods();
    hookSettingsUI();
    if (getGASUrl()) startPolling();
  });

  PR.sync = { start: startPolling, pullOnce: pullChangesOnce, getGASUrl, setGASUrl };
})();
