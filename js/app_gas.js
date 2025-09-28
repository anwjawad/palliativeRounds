/**
 * app_gas.js
 * Bootstrap + CRUD عبر Google Apps Script (نمط DPYD)
 *
 * كيف يشتغل؟
 * - عند DOMContentLoaded: ننفّذ PR_GAS.bootstrap()
 * - نسترجع من GAS: Patients + Reminders + Settings + UI (+ReferenceRanges/Metadata اختياري)
 * - نكتبها داخل PR.state.state ثم PR.state.persist() ثم PR.ui.renderAll()
 * - نوفر دوال upsert/delete تشتغل على GAS ثم تحدث الحالة محلياً وتعيد الرسم
 *
 * المتطلّبات:
 * - ملف js/sheets_api.js مضاف ومضبوط WEBAPP_URL (مع FORCE_JSONP=true على GitHub Pages)
 * - وجود كائنات: PR, PR.state, PR.ui (من تطبيقك الحالي)
 */

(function () {
  // حارس بسيط لعدم التكرار
  if (window.PR_GAS) return;

  const PR_GAS = {
    ready: false,

    async bootstrap() {
      try {
        // 1) استرجاع حالة محلية حالية (لو عندك بيانات قبل) لعرض فوري
        safeRestoreLocal();

        // 2) حمل من GAS (Server-of-record)
        const [patients, reminders, settings, ui] = await Promise.all([
          safeList(PatientsAPI, "list"),
          safeList(RemindersAPI, "list"),
          safeGet(SettingsAPI, "get"),
          safeGet(UIAPI, "get"),
        ]);

        // 3) اكتب في الحالة المركزية
        const st = getState();
        if (Array.isArray(patients)) st.patients = normalizePatients(patients);
        if (Array.isArray(reminders)) st.reminders = normalizeReminders(reminders);
        if (settings && typeof settings === "object") st.settings = { ...(st.settings || {}), ...settings };
        if (ui && typeof ui === "object") st.ui = { ...(st.ui || {}), ...ui };

        // 4) خزّن محليًا ثم أعِد الرسم
        persist("patients", "reminders", "settings", "ui");
        renderAll();

        this.ready = true;
        log("GAS bootstrap done.");
      } catch (err) {
        console.error("[PR_GAS.bootstrap] failed:", err);
        // لو فشل السيرفر، نظهر البيانات المحلية الموجودة، على الأقل
        renderAll();
      }
    },

    // ---------- عمليات المرضى (CRUD) ----------
    async upsertPatient(patient) {
      // patient: كائن يطابق سكيمتك (نفس أسماء الأعمدة)
      const res = await PatientsAPI.save(patient);
      const id = res?.id || patient?.id;
      // تحدّيث الحالة محليًا
      const st = getState();
      const list = st.patients || (st.patients = []);
      const ix = list.findIndex(p => String(p.id) === String(id));
      const merged = { ...(ix >= 0 ? list[ix] : {}), ...patient, id };
      if (ix >= 0) list[ix] = merged; else list.unshift(merged);

      persist("patients");
      renderAll();
      return { ok: true, id };
    },

    async deletePatient(id) {
      if (!id) throw new Error("deletePatient: missing id");
      await PatientsAPI.remove(id);
      const st = getState();
      st.patients = (st.patients || []).filter(p => String(p.id) !== String(id));
      // لو عندك تذكيرات مربوطة بالمريض، احذفها محليًا (الخادم لا يعمل Cascade افتراضيًا)
      st.reminders = (st.reminders || []).filter(r => String(r.forPatientId || "") !== String(id));
      persist("patients", "reminders");
      renderAll();
      return { ok: true };
    },

    // ---------- التذكيرات ----------
    async upsertReminder(rem) {
      const res = await RemindersAPI.save(rem);
      const id = res?.id || rem?.id;
      const st = getState();
      const list = st.reminders || (st.reminders = []);
      const ix = list.findIndex(r => String(r.id) === String(id));
      const merged = { ...(ix >= 0 ? list[ix] : {}), ...rem, id };
      if (ix >= 0) list[ix] = merged; else list.unshift(merged);
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

    // ---------- إعدادات/واجهة ----------
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

  // ==========================================
  // أدوات مساعدة (تتكامل مع تطبيقك الحالي)
  // ==========================================

  function log(...args) {
    console.log("[PR_GAS]", ...args);
  }

  function getState() {
    // PR.state.state موجود في تطبيقك (state.js)
    if (!window.PR || !PR.state || !PR.state.state) {
      window.PR = window.PR || {};
      PR.state = PR.state || {};
      PR.state.state = PR.state.state || {};
    }
    const st = PR.state.state;
    st.patients = st.patients || [];
    st.reminders = st.reminders || [];
    st.settings = st.settings || {};
    st.ui = st.ui || {};
    return st;
  }

  function persist(...keys) {
    // إن كانت عندك persist جزئية، مرّر أسماء المجموعات
    if (PR.state && typeof PR.state.persist === "function") {
      try { PR.state.persist(...keys); } catch (e) { console.warn("persist warn:", e); }
    }
  }

  function renderAll() {
    // يستدعي راسم الواجهة في تطبيقك
    if (PR.ui && typeof PR.ui.renderAll === "function") {
      try { PR.ui.renderAll(); } catch (e) { console.warn("renderAll warn:", e); }
    }
  }

  function safeRestoreLocal() {
    // استرجاع سريع من التخزين المحلي إن كان متاح
    try {
      if (PR.state && typeof PR.state.restore === "function") {
        PR.state.restore();
      }
    } catch (e) {
      console.warn("local restore warn:", e);
    }
  }

  async function safeList(api, fn) {
    try { return await api[fn](); } catch (e) { console.warn(fn + " failed:", e); return []; }
  }

  async function safeGet(api, fn) {
    try { return await api[fn](); } catch (e) { console.warn(fn + " failed:", e); return {}; }
  }

  // Normalizers — (مكان واحد لو حاب تطبّع أنواع/تحويلات معينة)
  function normalizePatients(items) {
    // مثال: تحويل done/ctcae.enabled إلى Boolean بوضوح
    return (items || []).map(x => ({
      ...x,
      done: toBool(x.done),
      ["ctcae.enabled"]: toBool(x["ctcae.enabled"]),
    }));
  }
  function normalizeReminders(items) {
    return (items || []).map(x => ({ ...x, done: toBool(x.done) }));
  }
  function toBool(v) {
    if (typeof v === "boolean") return v;
    const s = String(v || "").toLowerCase().trim();
    return s === "true" || s === "1" || s === "yes";
  }

  // ==========================================
  // تشغيل تلقائي عند DOMContentLoaded
  // ==========================================

  document.addEventListener("DOMContentLoaded", () => {
    // إذا بدك تمنع الإقلاع القديم لديك، احرص أن يكون هذا السكربت مُضمَّناً بعد app.js
    PR_GAS.bootstrap();
  });
})();