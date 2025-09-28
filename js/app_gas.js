/**
 * app_gas.js
 * Bootstrap + Merge by updatedAt + Auto Seed عندما تكون Google Sheet فارغة
 */

(function () {
  if (window.PR_GAS) return;

  const PR_GAS = {
    ready: false,

    async bootstrap() {
      try {
        // 1) استرجاع محلي سريع
        safeRestoreLocal();

        // 2) جلب من السيرفر
        const [srvPatients, srvReminders, srvSettings, srvUI] = await Promise.all([
          safeList(PatientsAPI, "list"),
          safeList(RemindersAPI, "list"),
          safeGet(SettingsAPI, "get"),
          safeGet(UIAPI, "get"),
        ]);

        // 3) دمج
        const st = getState();
        const beforeLocalPatients = (st.patients || []).length;

        st.patients   = mergePatientsByUpdatedAt(st.patients || [], srvPatients || []);
        st.reminders  = mergeRemindersPreferServer(st.reminders || [], srvReminders || []);
        st.settings   = mergeObjFieldsPreferServer(st.settings || {}, srvSettings || {});
        st.ui         = mergeObjFieldsPreferServer(st.ui || {}, srvUI || {});

        // 4) حفظ محلي ورسم
        persist("patients", "reminders", "settings", "ui");
        renderAll();
        this.ready = true;
        console.log("[PR_GAS] bootstrap done.");

        // 5) ✅ Seed تلقائي: إذا السيرفر رجّع صفر مرضى ولكن محليًا في مرضى
        const serverEmpty = Array.isArray(srvPatients) && srvPatients.length === 0;
        const localHasPatients = (st.patients || []).length > 0;
        if (serverEmpty && localHasPatients) {
          console.log("[PR_GAS] server empty — seeding all local data to Google Sheet…");
          try { await PR_AUTOSYNC.seedAll(); } catch (e) { console.warn("seedAll failed:", e); }
        }
      } catch (err) {
        console.error("[PR_GAS.bootstrap] failed:", err);
        renderAll();
      }
    },

    // (واجهات اختيارية — لم تتغير)
    async upsertPatient(patient) {
      const res = await PatientsAPI.save(patient);
      const id = res?.id || patient?.id;
      const st = getState();
      const arr = st.patients || (st.patients = []);
      const ix = arr.findIndex(p => String(p.id) === String(id));
      const merged = { ...(ix >= 0 ? arr[ix] : {}), ...patient, id };
      if (ix >= 0) arr[ix] = merged; else arr.unshift(merged);
      persist("patients"); renderAll();
      return { ok: true, id };
    },
    async deletePatient(id) {
      if (!id) throw new Error("deletePatient: missing id");
      await PatientsAPI.remove(id);
      const st = getState();
      st.patients = (st.patients || []).filter(p => String(p.id) !== String(id));
      st.reminders = (st.reminders || []).filter(r => String(r.forPatientId || "") !== String(id));
      persist("patients","reminders"); renderAll();
      return { ok: true };
    },
    async upsertReminder(rem) {
      const res = await RemindersAPI.save(rem);
      const id = res?.id || rem?.id;
      const st = getState();
      const arr = st.reminders || (st.reminders = []);
      const ix = arr.findIndex(r => String(r.id) === String(id));
      const merged = { ...(ix >= 0 ? arr[ix] : {}), ...rem, id };
      if (ix >= 0) arr[ix] = merged; else arr.unshift(merged);
      persist("reminders"); renderAll();
      return { ok: true, id };
    },
    async deleteReminder(id) {
      if (!id) throw new Error("deleteReminder: missing id");
      await RemindersAPI.remove(id);
      const st = getState();
      st.reminders = (st.reminders || []).filter(r => String(r.id) !== String(id));
      persist("reminders"); renderAll();
      return { ok: true };
    },
    async saveSettings(obj) {
      await SettingsAPI.save(obj || {});
      const st = getState();
      st.settings = { ...(st.settings || {}), ...(obj || {}) };
      persist("settings"); renderAll();
      return { ok: true };
    },
    async saveUI(obj) {
      await UIAPI.save(obj || {});
      const st = getState();
      st.ui = { ...(st.ui || {}), ...(obj || {}) };
      persist("ui"); renderAll();
      return { ok: true };
    },
  };

  window.PR_GAS = PR_GAS;

  // ====================== Helpers ======================

  function getState() {
    window.PR = window.PR || {};
    PR.state = PR.state || {};
    PR.state.state = PR.state.state || {};
    const st = PR.state.state;
    st.patients = st.patients || [];
    st.reminders = st.reminders || [];
    st.settings = st.settings || {};
    st.ui = st.ui || {};
    return st;
  }

  function persist(...keys) {
    if (PR.state && typeof PR.state.persist === "function") {
      try { PR.state.persist(...keys); } catch (e) { console.warn("[PR_GAS] persist warn:", e); }
    }
  }

  function renderAll() {
    if (PR.ui && typeof PR.ui.renderAll === "function") {
      try { PR.ui.renderAll(); } catch (e) { console.warn("[PR_GAS] renderAll warn:", e); }
    }
  }

  function safeRestoreLocal() {
    try { PR.state?.restore?.(); } catch (e) {}
  }

  async function safeList(api, fn) {
    try { return await api[fn](); } catch (e) { console.warn(fn + " failed:", e); return []; }
  }
  async function safeGet(api, fn) {
    try { return await api[fn](); } catch (e) { console.warn(fn + " failed:", e); return {}; }
  }

  // ---------- Merge Logic ----------

  function tsToMs(s) {
    if (!s) return 0;
    try { return new Date(String(s).replace(" ", "T")).getTime() || 0; } catch { return 0; }
  }

  function mergePatientsByUpdatedAt(localList, serverList) {
    const L = indexById(localList);
    const S = indexById(serverList);
    const ids = new Set([...Object.keys(L), ...Object.keys(S)]);
    const out = [];
    ids.forEach(id => {
      const a = L[id], b = S[id];
      if (a && b) {
        out.push(tsToMs(b.updatedAt) > tsToMs(a.updatedAt) ? b : a);
      } else if (b) out.push(b);
      else if (a) out.push(a);
    });
    out.sort((x, y) => tsToMs(y.updatedAt) - tsToMs(x.updatedAt));
    return out;
  }

  function mergeRemindersPreferServer(localList, serverList) {
    const L = indexById(localList);
    const S = indexById(serverList);
    const ids = new Set([...Object.keys(L), ...Object.keys(S)]);
    const out = [];
    ids.forEach(id => {
      const a = L[id], b = S[id];
      if (a && b) out.push(b);
      else if (b) out.push(b);
      else if (a) out.push(a);
    });
    return out;
  }

  function mergeObjFieldsPreferServer(localObj, serverObj) {
    const out = { ...(localObj || {}) };
    Object.keys(serverObj || {}).forEach(k => {
      const v = serverObj[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") out[k] = v;
    });
    return out;
  }

  function indexById(list) {
    const m = {};
    (list || []).forEach(x => {
      const id = String(x?.id || "").trim();
      if (id) m[id] = x;
    });
    return m;
  }

  document.addEventListener("DOMContentLoaded", () => {
    PR_GAS.bootstrap();
  });
})();