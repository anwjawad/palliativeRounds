/**
 * app_sync_indicator.js
 * Badge صغير يوضّح حالة المزامنة مع GAS:
 *  - Saving…
 *  - All changes saved
 *  - Offline: will retry
 *
 * يعتمد على ملفات:
 *  - js/sheets_api.js
 *  - js/app_gas.js
 *  - js/app_autosync.js   (يُفضّل أن تُحمّل هذه قبله)
 *
 * كيف يعمل؟
 * - يحقن Badge أعلى يمين الشاشة.
 * - يلفّ (monkey-patch) دوال PR_AUTOSYNC.scheduleSync/runSync لإطلاق أحداث،
 *   ثم يحدّث الحالة بناءً على: autosync:scheduled / :started / :success / :error
 * - يلتقط حدث "bootstrap" من PR_GAS (نطلقه هنا بمجرد DOMReady + بعد 2 ثواني fallback).
 *
 * API:
 *   window.PR_SYNC.getStatus()  -> { state: 'idle'|'scheduled'|'syncing'|'error', lastSuccessAt, lastError }
 */

(function () {
  if (window.PR_SYNC) return;

  // ====== DOM ======
  const BADGE_ID = "pr-sync-badge";

  function ensureBadge() {
    if (document.getElementById(BADGE_ID)) return;
    const el = document.createElement("div");
    el.id = BADGE_ID;
    el.setAttribute("aria-live", "polite");
    el.style.position = "fixed";
    el.style.top = "12px";
    el.style.right = "12px";
    el.style.zIndex = "99999";
    el.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    el.style.fontSize = "12px";
    el.style.padding = "6px 10px";
    el.style.borderRadius = "14px";
    el.style.boxShadow = "0 2px 8px rgba(0,0,0,.15)";
    el.style.userSelect = "none";
    el.style.cursor = "default";
    el.style.transition = "opacity .2s ease";
    el.style.opacity = "0.9";
    setBadgeTheme(el);
    el.textContent = "Loading cloud…";
    document.body.appendChild(el);

    // دبل-كليك ينسخ آخر حالة للذاكرة (debug خفيف)
    el.addEventListener("dblclick", () => {
      const s = JSON.stringify(state, null, 2);
      try { navigator.clipboard.writeText(s); } catch {}
      toast("Sync status copied to clipboard");
    });
  }

  function setBadgeTheme(el) {
    const isDark = matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
    el.style.background = isDark ? "rgba(40,40,45,.95)" : "rgba(255,255,255,.95)";
    el.style.color = isDark ? "#E6E6E6" : "#333";
    el.style.border = isDark ? "1px solid rgba(255,255,255,.12)" : "1px solid rgba(0,0,0,.08)";
  }

  function setBadge(text, tone) {
    ensureBadge();
    const el = document.getElementById(BADGE_ID);
    el.textContent = text;
    if (tone === "ok") {
      el.style.borderColor = "rgba(0,160,120,.35)";
      el.style.boxShadow = "0 2px 12px rgba(0,160,120,.25)";
    } else if (tone === "warn") {
      el.style.borderColor = "rgba(245,170,0,.45)";
      el.style.boxShadow = "0 2px 12px rgba(245,170,0,.28)";
    } else if (tone === "err") {
      el.style.borderColor = "rgba(220,75,75,.45)";
      el.style.boxShadow = "0 2px 12px rgba(220,75,75,.28)";
    } else {
      el.style.borderColor = "rgba(0,0,0,.08)";
      el.style.boxShadow = "0 2px 8px rgba(0,0,0,.15)";
    }
  }

  function toast(msg) {
    console.log("[SYNC]", msg);
  }

  // ====== حالة منطقية عامة ======
  const state = {
    // 'idle' | 'scheduled' | 'syncing' | 'error'
    syncState: "idle",
    lastSuccessAt: null, // Date ISO string
    lastError: null
  };

  function updateState(next) {
    Object.assign(state, next || {});
    render();
  }

  function render() {
    const s = state.syncState;
    if (s === "syncing") {
      setBadge("Saving…", "warn");
    } else if (s === "scheduled") {
      setBadge("Pending save…", "warn");
    } else if (s === "error") {
      setBadge("Offline: will retry", "err");
    } else {
      // idle
      const when = state.lastSuccessAt ? " • " + fmtTime(state.lastSuccessAt) : "";
      setBadge("All changes saved" + when, "ok");
    }
  }

  function fmtTime(iso) {
    try {
      const d = new Date(iso);
      const pad = (n) => (n < 10 ? "0" + n : "" + n);
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return "";
    }
  }

  // ====== ربط مع AutoSync عبر monkey-patch ======
  function patchAutoSync() {
    if (!window.PR_AUTOSYNC) {
      // جرّب لاحقًا
      setTimeout(patchAutoSync, 400);
      return;
    }

    // لفّ scheduleSync لنعرف أنه في تغييرات قادمة
    const origSchedule = PR_AUTOSYNC.scheduleSync?.bind(PR_AUTOSYNC);
    if (origSchedule) {
      PR_AUTOSYNC.scheduleSync = function patchedSchedule() {
        updateState({ syncState: "scheduled" });
        dispatch("autosync:scheduled");
        return origSchedule();
      };
    }

    // لفّ runSync لبداية/نهاية المزامنة
    const origRun = PR_AUTOSYNC.runSync?.bind(PR_AUTOSYNC);
    if (origRun) {
      PR_AUTOSYNC.runSync = async function patchedRun() {
        updateState({ syncState: "syncing" });
        dispatch("autosync:started");
        try {
          const r = await origRun();
          updateState({ syncState: "idle", lastSuccessAt: new Date().toISOString(), lastError: null });
          dispatch("autosync:success");
          return r;
        } catch (e) {
          updateState({ syncState: "error", lastError: e?.message || String(e) });
          dispatch("autosync:error", { error: e });
          throw e;
        }
      };
    }

    // أول ريندر
    render();
  }

  // ====== إشارات/أحداث عامة ======
  function dispatch(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, { detail }));
    } catch { /* ignore */ }
  }

  // ====== Bootstrap indicator (إشارة عند انتهاء تحميل GAS) ======
  function waitForBootstrap() {
    // لما يكتمل PR_GAS.bootstrap()، راح تكون الحالة idle (بعد أول مزامنة)
    // نطلق حدثًا يدويًا للمهتمين:
    setTimeout(() => {
      dispatch("gas:bootstrap:maybe-done");
    }, 2500);
  }

  // ====== كشف API خارجي ======
  window.PR_SYNC = {
    getStatus() {
      return {
        state: state.syncState,
        lastSuccessAt: state.lastSuccessAt,
        lastError: state.lastError
      };
    }
  };

  // ====== تشغيل ======
  document.addEventListener("DOMContentLoaded", () => {
    ensureBadge();
    patchAutoSync();
    waitForBootstrap();

    // تحديث ألوان البادج مع تغيّر ثيم النظام
    try {
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        const el = document.getElementById(BADGE_ID);
        if (el) setBadgeTheme(el);
      });
    } catch {}
  });
})();