/**
 * app_gas.js
 * Bootstrap + Merge ذكي حسب updatedAt + تكامل مع PR.state/PR.ui
 *
 * المتطلبات:
 *  - js/sheets_api.js مضبوط (WEBAPP_URL, FORCE_JSONP=true على GitHub Pages)
 *  - وجود PR.state.state و PR.ui.renderAll() في تطبيقك الحالي
 */

(function () {
  if (window.PR_GAS) return;

  const PR_GAS = {
    ready: false,

    async bootstrap() {
      try {
        // 1) استرجاع محلي سريع لعرض فوري
        safeRestoreLocal();

        // 2) جلب من السيرفر (GAS)
        const [srvPatients, srvReminders, srvSettings, srvUI] = await Promise.all([
          safeList(PatientsAPI, "list"),
          safeList(RemindersAPI, "list"),
          safeGet(SettingsAPI, "get"),
          safeGet(UIAPI, "get"),
        ]);

        // 3) دمج مع الحالة المحلية حسب السياسة:
        //    - Patients: per-id الأحدث حسب updatedAt يفوز
        //    - Reminders: إن وُجد id على الجهتين، السيرفر يُفضَّل (لا يوجد updatedAt)
        //    - Settings/UI: السيرفر يطغى فقط للحقل الذي يملك قيمة غير فارغة
        const st = getState();

        // Patients
        st.patients = mergePatientsByUpdatedAt(st.patients || [], srvPatients || []);

        // Reminders
        st.reminders = mergeRemindersPreferServer(st.reminders || [], srvReminders || []);

        // Settings (حقل بحقل)
        st.settings = mergeObjFieldsPreferServer(st.settings || {}, srvSettings || {});

        // UI (حقل بحقل)
        st.ui = mergeObjFieldsPreferServer(st.ui || {}, srvUI || {});

        // 4) خزّن محليًا ثم ارسم
        persist("patients", "reminders", "settings", "ui");
        renderAll();

        this.ready = true;
        console.log("[PR_GAS] bootstrap done.");
      } catch (err) {
        console.error("[PR_GAS.bootstrap] failed:", err);
        // لو فشل السيرفر، اعرض المحلي كما هو
        renderAll();
      }
    },

    // ========== عمليات مريحة يمكن استدعاؤها من الواجهة (اختياري) ==========
    async upsertPatient(patient) {
      const res = await PatientsAPI.save(patient);
      const id = res?.id || patient?.id;
      // حدّث الحالة محليًا
      const st = getState();
      const arr = st.patients || (st.patients = []);
      const ix = arr.findIndex(p => String(p.id) === String(id));
      const merged = { ...(ix >= 0 ? arr[ix] : {}), ...patient, id };
      arr[ix >= 0 ? ix : (arr.unshift(merged), 0)] = merged;
      persist("patients");
      renderAll();
      return { ok: true, id };
    },

    async deletePatient(id) {
      if (!id) throw new Error("deletePatient: missing id");
      await PatientsAPI.remove(id);
      const st = getState();
      st.patients = (st.patients || []).filter(p => String(p.id) !== String(id));
      st.reminders = (st.reminders || []).filter(r => String(r.forPatientId || "") !== String(id));
      persist("patients", "reminders");
      renderAll();
      return { ok: true };
    },

    async upsertReminder(rem) {
      const res = await RemindersAPI.save(rem);
      const id = res?.id || rem?.id;
      const st = getState();
      const arr = st.reminders || (st.reminders = []);
      const ix = arr.findIndex(r => String(r.id) === String(id));
      const merged = { ...(ix >= 0 ? arr[ix] : {}), ...rem, id };
      arr[ix >= 0 ? ix : (arr.unshift(merged), 0)] = merged;
      persist("reminders");
      renderAll();
      return { ok: true, id };
    },

    async deleteReminder(id) {
      if (!id) throw new Error("deleteReminder: missing id");
      await RemindersAPI.remove(id);
      const st = getState();
      st.reminders = (st.reminders || []).filter(r => String(r.id) !== String(id));
      persist("reminders");
      renderAll();
      return { ok: true };
    },

    async saveSettings(obj) {
      await SettingsAPI.save(obj || {});
      const st = getState();
      st.settings = { ...(st.settings || {}), ...(obj || {}) };
      persist("settings");
      renderAll();
      return { ok: true };
    },

    async saveUI(obj) {
      await UIAPI.save(obj || {});
      const st = getState();
      st.ui = { ...(st.ui || {}), ...(obj || {}) };
      persist("ui");
      renderAll();
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
    try { PR.state?.restore?.(); } catch (e) { /* ignore */ }
  }

  async function safeList(api, fn) {
    try { return await api[fn](); } catch (e) { console.warn(fn + " failed:", e); return []; }
  }
  async function safeGet(api, fn) {
    try { return await api[fn](); } catch (e) { console.warn(fn + " failed:", e); return {}; }
  }

  // ---------- Merge Logic ----------

  // updatedAt صيغة: "YYYY-MM-DD HH:mm"
  function tsToMs(s) {
    if (!s) return 0;
    try {
      // تحويل مبدئي: "YYYY-MM-DD HH:mm" -> "YYYY-MM-DDTHH:mm"
      return new Date(String(s).replace(" ", "T")).getTime() || 0;
    } catch { return 0; }
  }

  function mergePatientsByUpdatedAt(localList, serverList) {
    const L = indexById(localList);
    const S = indexById(serverList);
    const ids = new Set([...Object.keys(L), ...Object.keys(S)]);
    const out = [];

    ids.forEach(id => {
      const a = L[id]; // local
      const b = S[id]; // server
      if (a && b) {
        // كلاهما موجود: الأحدث يفوز
        const ta = tsToMs(a.updatedAt);
        const tb = tsToMs(b.updatedAt);
        out.push(tb > ta ? b : a);
      } else if (b) {
        // موجود على السيرفر فقط
        out.push(b);
      } else if (a) {
        // موجود محليًا فقط (سيدفعه AutoSync لاحقًا)
        out.push(a);
      }
    });

    // اختياري: فرز تنازلي حسب updatedAt للعرض
    out.sort((x, y) => tsToMs(y.updatedAt) - tsToMs(x.updatedAt));
    return out;
  }

  function mergeRemindersPreferServer(localList, serverList) {
    const L = indexById(localList);
    const S = indexById(serverList);
    const ids = new Set([...Object.keys(L), ...Object.keys(S)]);
    const out = [];

    ids.forEach(id => {
      const a = L[id];
      const b = S[id];
      if (a && b) {
        // لا يوجد updatedAt في السكيمة؛ السيرفر يُفضَّل
        out.push(b);
      } else if (b) {
        out.push(b);
      } else if (a) {
        out.push(a); // سيدفع لاحقًا
      }
    });

    return out;
  }

  function mergeObjFieldsPreferServer(localObj, serverObj) {
    const out = { ...(localObj || {}) };
    Object.keys(serverObj || {}).forEach(k => {
      const v = serverObj[k];
      // إذا السيرفر لديه قيمة "غير فارغة"، يطغى
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        out[k] = v;
      }
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

  // تشغيل تلقائي
  document.addEventListener("DOMContentLoaded", () => {
    PR_GAS.bootstrap();
  });
})();