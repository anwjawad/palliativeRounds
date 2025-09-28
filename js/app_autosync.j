/**
 * app_autosync.js
 * Auto Save/Sync لكل تغيير يحدث في التطبيق إلى Google Apps Script.
 *
 * يعمل كالتالي:
 * - يلفّ PR.state.persist() ليكتشف ما الذي تغيّر (patients/reminders/settings/ui).
 * - يجمع الدلتا ويعمل Sync إلى GAS بدوال APIs (PatientsAPI/RemindersAPI/SettingsAPI/UIAPI).
 * - يعتمد Debounce (افتراضي 1200ms) لدمج التغييرات المتقاربة.
 * - يدعم كشف الحذف بمقارنة آخر نسخة مزامنة (اختياري).
 *
 * المتطلبات:
 *  - js/sheets_api.js (WEBAPP_URL مضبوط + FORCE_JSONP=true على GitHub Pages)
 *  - js/app_gas.js (لتشغيل bootstrap الأولي)
 *  - وجود PR.state.state وPR.state.persist في تطبيقك.
 */

(function () {
  if (window.PR_AUTOSYNC) return;

  const AUTOSYNC_DEBOUNCE_MS = 1200;          // دمج التغييرات السريعة
  const ENABLE_DELETE_DETECTION = true;       // كشف الحذف من الفرق مع آخر نسخة مُزامنة
  const CONSOLE_PREFIX = "[AutoSync]";
  const STORAGE_SNAPSHOT_KEY = "PR_AUTOSYNC_LAST_SYNC_SNAPSHOT_V1";

  // مفاتيح الحالة
  const K = { PATIENTS: "patients", REMINDERS: "reminders", SETTINGS: "settings", UI: "ui" };

  // طابور مزامنة
  const queue = new Set();     // مجموعة مفاتيح تغيّرت
  let debounceTimer = null;
  let syncing = false;

  // آخر لقطة مزامنة (للكشف عن الحذف)
  let lastSynced = loadSnapshot() || { patients: [], reminders: [], settings: {}, ui: {} };

  const AutoSync = {
    init() {
      ensureState();
      // لفّ persist
      wrapPersist();
      // مباشرةً بعد تحميل الصفحة: خُذ لقطة حالية (بعد bootstrap)
      document.addEventListener("DOMContentLoaded", () => {
        // انتظر لحظات بعد PR_GAS.bootstrap()
        setTimeout(captureSnapshotFromState, 2000);
      });
      log("initialized.");
    }
  };

  function wrapPersist() {
    const S = PR.state;
    if (!S || typeof S.persist !== "function") {
      console.warn(CONSOLE_PREFIX, "PR.state.persist غير موجود. لن يعمل AutoSync.");
      return;
    }
    const originalPersist = S.persist.bind(S);

    S.persist = function wrappedPersist(...keys) {
      // 1) نفّذ الحفظ المحلي الأصلي
      const res = originalPersist(...keys);

      // 2) حدّد ما الذي تغيّر
      if (!keys || !keys.length) {
        // إن لم تُحدّد، افترض الكل
        queue.add(K.PATIENTS);
        queue.add(K.REMINDERS);
        queue.add(K.SETTINGS);
        queue.add(K.UI);
      } else {
        keys.forEach(k => {
          if (!k) return;
          const kk = String(k).toLowerCase();
          if (kk.includes("patient")) queue.add(K.PATIENTS);
          else if (kk.includes("reminder")) queue.add(K.REMINDERS);
          else if (kk.includes("setting")) queue.add(K.SETTINGS);
          else if (kk === "ui") queue.add(K.UI);
        });
      }

      // 3) فعّل الـ debounce
      scheduleSync();

      return res;
    };
  }

  function scheduleSync() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSync, AUTOSYNC_DEBOUNCE_MS);
  }

  async function runSync() {
    if (syncing) {
      // لو مزامنة شغّالة، أعد المحاولة لاحقًا
      return scheduleSync();
    }
    if (queue.size === 0) return;

    syncing = true;
    const keys = Array.from(queue);
    queue.clear();

    try {
      const st = getState();

      // حضّر دلتا
      if (keys.includes(K.SETTINGS)) {
        await syncSettings(st.settings || {});
      }
      if (keys.includes(K.UI)) {
        await syncUI(st.ui || {});
      }
      if (keys.includes(K.PATIENTS)) {
        await syncPatients(st.patients || []);
      }
      if (keys.includes(K.REMINDERS)) {
        await syncReminders(st.reminders || []);
      }

      // بعد النجاح، احفظ لقطة
      captureSnapshotFromState();
      log("synced:", keys.join(", "));
    } catch (err) {
      console.error(CONSOLE_PREFIX, "sync error:", err);
      // في حال الخطأ، أعد جدولة المزامنة (بهدوء)
      setTimeout(scheduleSync, AUTOSYNC_DEBOUNCE_MS * 2);
    } finally {
      syncing = false;
    }
  }

  // ---------- مزامنة الوحدات ----------

  async function syncSettings(obj) {
    // صف واحد
    await SettingsAPI.save(obj || {});
  }

  async function syncUI(obj) {
    // صف واحد
    await UIAPI.save(obj || {});
  }

  async function syncPatients(currentList) {
    const byId = indexById(currentList);
    const lastById = indexById(lastSynced.patients || []);

    // upsert لكل الموجود حاليًا (جديد + تحديث)
    for (const id of Object.keys(byId)) {
      const cur = byId[id];
      await PatientsAPI.save(cur);
    }

    // حذف إن مفعّل
    if (ENABLE_DELETE_DETECTION) {
      for (const id of Object.keys(lastById)) {
        if (!byId[id]) {
          await safeDeletePatient(id);
        }
      }
    }
  }

  async function syncReminders(currentList) {
    const byId = indexById(currentList);
    const lastById = indexById(lastSynced.reminders || []);

    for (const id of Object.keys(byId)) {
      await RemindersAPI.save(byId[id]);
    }

    if (ENABLE_DELETE_DETECTION) {
      for (const id of Object.keys(lastById)) {
        if (!byId[id]) {
          await safeDeleteReminder(id);
        }
      }
    }
  }

  async function safeDeletePatient(id) {
    try { await PatientsAPI.remove(id); } catch (e) { /* تجاهل إن لم يوجد */ }
  }
  async function safeDeleteReminder(id) {
    try { await RemindersAPI.remove(id); } catch (e) { /* تجاهل إن لم يوجد */ }
  }

  // ---------- أدوات حالة/لقطات ----------

  function getState() {
    ensureState();
    return PR.state.state;
  }

  function ensureState() {
    window.PR = window.PR || {};
    PR.state = PR.state || {};
    PR.state.state = PR.state.state || { patients: [], reminders: [], settings: {}, ui: {} };
  }

  function indexById(list) {
    const map = {};
    (list || []).forEach(x => {
      const id = String((x && x.id) || "").trim();
      if (id) map[id] = x;
    });
    return map;
  }

  function captureSnapshotFromState() {
    const st = getState();
    const snap = {
      patients: cloneShallowArrayByIds(st.patients),
      reminders: cloneShallowArrayByIds(st.reminders),
      settings: { ...(st.settings || {}) },
      ui: { ...(st.ui || {}) },
    };
    lastSynced = snap;
    try {
      localStorage.setItem(STORAGE_SNAPSHOT_KEY, JSON.stringify(snap));
    } catch (e) {
      // ignore
    }
  }

  function loadSnapshot() {
    try {
      const t = localStorage.getItem(STORAGE_SNAPSHOT_KEY);
      if (!t) return null;
      return JSON.parse(t);
    } catch {
      return null;
    }
  }

  function cloneShallowArrayByIds(arr) {
    return (arr || []).map(x => ({ ...(x || {}) }));
  }

  function log(...args) {
    console.log(CONSOLE_PREFIX, ...args);
  }

  // تشغيل
  AutoSync.init();

  // كشف عام
  window.PR_AUTOSYNC = { runSync, scheduleSync };
})();