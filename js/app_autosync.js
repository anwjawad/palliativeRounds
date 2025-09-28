/**
 * app_autosync.js
 * Auto Save/Sync مع GAS + دعم Force/Seed
 *
 * الجديد:
 *  - لا نأخذ snapshot ابتدائيًا. نأخذ اللقطة فقط بعد مزامنة ناجحة.
 *  - runSync(options) يدعم { forceAll: true } لدفع كل البيانات بغض النظر عن snapshot.
 *  - seedAll(): يفرض push كامل (مفيد عندما تكون Google Sheet فارغة).
 */

(function () {
  if (window.PR_AUTOSYNC) return;

  const AUTOSYNC_DEBOUNCE_MS = 1200;
  const ENABLE_DELETE_DETECTION = true;
  const STORAGE_SNAPSHOT_KEY = "PR_AUTOSYNC_LAST_SYNC_SNAPSHOT_V1";
  const K = { PATIENTS: "patients", REMINDERS: "reminders", SETTINGS: "settings", UI: "ui" };

  const queue = new Set();
  let debounceTimer = null;
  let syncing = false;

  // لقطة آخر مزامنة "ناجحة" فقط
  let lastSynced = loadSnapshot() || { patients: [], reminders: [], settings: {}, ui: {} };

  const AutoSync = {
    init() {
      ensureState();
      wrapPersist();
      console.log("[AutoSync] initialized");
    },
    scheduleSync,
    runSync,
    seedAll
  };

  // يفرض مزامنة كاملة (للاستخدام عندما تكون الشيت فارغة)
  async function seedAll() {
    // نظّف اللقطة حتى نعتبر كل المحلي غير متزامن
    lastSynced = { patients: [], reminders: [], settings: {}, ui: {} };
    try { localStorage.removeItem(STORAGE_SNAPSHOT_KEY); } catch {}
    // ادفع كل شيء الآن
    await runSync({ forceAll: true });
  }

  function wrapPersist() {
    const S = PR.state;
    if (!S || typeof S.persist !== "function") {
      console.warn("[AutoSync] PR.state.persist not found.");
      return;
    }
    const original = S.persist.bind(S);

    S.persist = function patchedPersist(...keys) {
      const res = original(...keys);

      if (!keys || !keys.length) {
        queue.add(K.PATIENTS); queue.add(K.REMINDERS); queue.add(K.SETTINGS); queue.add(K.UI);
      } else {
        keys.forEach(k => {
          const kk = String(k || "").toLowerCase();
          if (kk.includes("patient")) queue.add(K.PATIENTS);
          else if (kk.includes("reminder")) queue.add(K.REMINDERS);
          else if (kk.includes("setting")) queue.add(K.SETTINGS);
          else if (kk === "ui") queue.add(K.UI);
        });
      }

      scheduleSync();
      return res;
    };
  }

  function scheduleSync() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSync(), AUTOSYNC_DEBOUNCE_MS);
  }

  async function runSync(options = {}) {
    if (syncing) {
      // لو هناك مزامنة قيد التنفيذ، أعد الجدولة
      return scheduleSync();
    }
    if (!options.forceAll && queue.size === 0) return;

    syncing = true;
    const keys = options.forceAll ? [K.SETTINGS, K.UI, K.PATIENTS, K.REMINDERS] : Array.from(queue);
    queue.clear();

    const force = !!options.forceAll;

    try {
      const st = getState();

      if (keys.includes(K.SETTINGS)) await SettingsAPI.save(st.settings || {});
      if (keys.includes(K.UI)) await UIAPI.save(st.ui || {});

      if (keys.includes(K.PATIENTS)) await syncPatientsSelective(st.patients || [], { force });
      if (keys.includes(K.REMINDERS)) await syncRemindersSelective(st.reminders || [], { force });

      // ✅ خذ لقطة فقط بعد نجاح المزامنة
      captureSnapshotFromState();

      console.log("[AutoSync] synced:", keys.join(", "));
    } catch (err) {
      console.error("[AutoSync] sync error:", err);
      // اسمح للمؤشرات/البادج أن ترى الخطأ
      setTimeout(scheduleSync, AUTOSYNC_DEBOUNCE_MS * 2);
      throw err;
    } finally {
      syncing = false;
    }
  }

  // ---------- Selective Sync ----------

  function tsToMs(s) {
    if (!s) return 0;
    try { return new Date(String(s).replace(" ", "T")).getTime() || 0; } catch { return 0; }
  }

  async function syncPatientsSelective(current, { force }) {
    const curById = indexById(current);
    const lastById = indexById(lastSynced.patients || []);

    for (const id of Object.keys(curById)) {
      const cur = curById[id];
      const last = lastById[id];
      if (force || !last) {
        await PatientsAPI.save(cur);
      } else {
        const tCur = tsToMs(cur.updatedAt);
        const tLast = tsToMs(last.updatedAt);
        if (tCur > tLast) {
          await PatientsAPI.save(cur);
        }
      }
    }

    if (ENABLE_DELETE_DETECTION && !force) {
      for (const id of Object.keys(lastById)) {
        if (!curById[id]) {
          try { await PatientsAPI.remove(id); } catch {}
        }
      }
    }
  }

  async function syncRemindersSelective(current, { force }) {
    const curById = indexById(current);
    const lastById = indexById(lastSynced.reminders || []);

    for (const id of Object.keys(curById)) {
      const cur = curById[id];
      const last = lastById[id];
      if (force || !last) {
        await RemindersAPI.save(cur);
      } else {
        const tCur = tsToMs(cur.createdAt);
        const tLast = tsToMs(last.createdAt);
        if (tCur > tLast || JSON.stringify(cur) !== JSON.stringify(last)) {
          await RemindersAPI.save(cur);
        }
      }
    }

    if (ENABLE_DELETE_DETECTION && !force) {
      for (const id of Object.keys(lastById)) {
        if (!curById[id]) {
          try { await RemindersAPI.remove(id); } catch {}
        }
      }
    }
  }

  // ---------- Snapshot & Utils ----------

  function getState() {
    window.PR = window.PR || {};
    PR.state = PR.state || {};
    PR.state.state = PR.state.state || { patients: [], reminders: [], settings: {}, ui: {} };
    return PR.state.state;
  }

  function captureSnapshotFromState() {
    const st = getState();
    const snap = {
      patients: shallowCloneArray(st.patients),
      reminders: shallowCloneArray(st.reminders),
      settings: { ...(st.settings || {}) },
      ui: { ...(st.ui || {}) },
    };
    lastSynced = snap;
    try { localStorage.setItem(STORAGE_SNAPSHOT_KEY, JSON.stringify(snap)); } catch {}
  }

  function loadSnapshot() {
    try {
      const t = localStorage.getItem(STORAGE_SNAPSHOT_KEY);
      return t ? JSON.parse(t) : null;
    } catch { return null; }
  }

  function indexById(list) {
    const m = {};
    (list || []).forEach(x => {
      const id = String(x?.id || "").trim();
      if (id) m[id] = x;
    });
    return m;
  }

  function shallowCloneArray(arr) {
    return (arr || []).map(x => ({ ...(x || {}) }));
  }

  function ensureState() {
    getState();
  }

  // كشف عام
  window.PR_AUTOSYNC = { scheduleSync, runSync, seedAll };
})();