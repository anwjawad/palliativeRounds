/**
 * app_sync_indicator.js
 * يضيف بادج أسفل الشاشة لعرض حالة المزامنة
 * + زر Force Sync Now
 */

(function () {
  if (window.PR_SYNC_INDICATOR) return;

  const INDICATOR_ID = "sync-indicator";
  let indicatorEl, statusEl, forceBtn;

  function init() {
    indicatorEl = document.createElement("div");
    indicatorEl.id = INDICATOR_ID;
    indicatorEl.style.cssText = `
      position: fixed;
      bottom: 8px;
      right: 12px;
      padding: 6px 10px;
      background: #222;
      color: #eee;
      font-size: 13px;
      border-radius: 4px;
      opacity: 0.8;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    statusEl = document.createElement("span");
    statusEl.textContent = "…";
    indicatorEl.appendChild(statusEl);

    forceBtn = document.createElement("button");
    forceBtn.textContent = "Sync Now";
    forceBtn.style.cssText = `
      background: #444;
      color: #fff;
      border: none;
      border-radius: 3px;
      padding: 2px 6px;
      cursor: pointer;
      font-size: 12px;
    `;
    forceBtn.onclick = () => {
      setStatus("Forcing sync…");
      try {
        PR_AUTOSYNC.runSync().then(() => {
          setStatus("All changes saved • " + fmtTime(new Date()));
        }).catch(err => {
          console.error("[SyncIndicator] Force sync error:", err);
          setStatus("Error (see console)");
        });
      } catch (e) {
        console.error("[SyncIndicator] Force sync failed:", e);
        setStatus("Error");
      }
    };
    indicatorEl.appendChild(forceBtn);

    document.body.appendChild(indicatorEl);

    // ربط مع persist() لمعرفة وقت التغييرات
    const origPersist = PR.state.persist.bind(PR.state);
    PR.state.persist = function patchedPersist(...keys) {
      setStatus("Saving…");
      return origPersist(...keys);
    };

    // اعتراض AutoSync بعد النجاح
    const origRunSync = PR_AUTOSYNC.runSync.bind(PR_AUTOSYNC);
    PR_AUTOSYNC.runSync = async function patchedRunSync() {
      setStatus("Saving…");
      try {
        await origRunSync();
        setStatus("All changes saved • " + fmtTime(new Date()));
      } catch (err) {
        setStatus("Offline / Retry");
        throw err;
      }
    };
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function fmtTime(d) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  window.PR_SYNC_INDICATOR = { init };

  document.addEventListener("DOMContentLoaded", init);
})();