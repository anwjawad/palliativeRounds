/* ------------------------------------------------------
 Palliative Rounds — state.js (fixed)
 Centralized state with per-patient updates, proper section assignment,
 robust events, and persistence.
-------------------------------------------------------*/
(function () {
  window.PR = window.PR || {};
  const LS_KEY = "PR_STATE_V1";

  const S = {
    state: {
      patients: [],
      reminders: [],
      settings: {
        // يمكن أن تضيف إعداداتك الافتراضية هنا
        defaultSection: "A",
      },
      ui: {
        currentSection: "A",
        currentPatientId: null,
      },
    },

    /* ------------- Events Bus ------------- */
    _listeners: {},
    on(evt, cb) {
      (this._listeners[evt] = this._listeners[evt] || []).push(cb);
    },
    off(evt, cb) {
      const arr = this._listeners[evt] || [];
      const i = arr.indexOf(cb);
      if (i >= 0) arr.splice(i, 1);
    },
    emit(evt, payload) {
      const arr = this._listeners[evt] || [];
      for (const cb of arr) {
        try { cb(payload); } catch (e) { console.error(e); }
      }
    },

    /* ------------- Persistence ------------- */
    persist() {
      try {
        const { patients, reminders, settings, ui } = this.state;
        localStorage.setItem(LS_KEY, JSON.stringify({ patients, reminders, settings, ui }));
      } catch (e) {
        console.error("persist failed:", e);
      }
    },
    _load() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          this.state.patients = Array.isArray(parsed.patients) ? parsed.patients.map(this.ensureSchema) : [];
          this.state.reminders = Array.isArray(parsed.reminders) ? parsed.reminders : [];
          this.state.settings = { ...(this.state.settings || {}), ...(parsed.settings || {}) };
          this.state.ui = { ...(this.state.ui || {}), ...(parsed.ui || {}) };
        }
      } catch (e) {
        console.error("load failed:", e);
      }
    },

    /* ------------- Helpers ------------- */
    _nowISO() { return new Date().toISOString(); },
    _uuid() {
      return (crypto && crypto.randomUUID) ? crypto.randomUUID()
        : ("id_" + Math.random().toString(36).slice(2) + Date.now().toString(36));
    },
    ensureSchema(p0) {
      const p = p0 || {};
      p.id = p.id || S._uuid();
      p.section = p.section || "A";
      p.updatedAt = p.updatedAt || S._nowISO();
      p.bio = p.bio || {};
      p.hpi = p.hpi || {};
      p.vitals = p.vitals || {};
      // الحقول التي تسبب المشكلة يجب أن تكون على مستوى المريض
      p.assessment = (typeof p.assessment === "string") ? p.assessment : "";       // Patient assessment
      p.medications = Array.isArray(p.medications) ? p.medications : [];           // List of medication
      // مجموعات بيانات أخرى
      p.ctcae = Array.isArray(p.ctcae) ? p.ctcae : [];
      p.esas = Array.isArray(p.esas) ? p.esas : [];
      p.labs = Array.isArray(p.labs) ? p.labs : [];
      p.notes = Array.isArray(p.notes) ? p.notes : [];
      p.timeline = Array.isArray(p.timeline) ? p.timeline : [];
      p.attachments = Array.isArray(p.attachments) ? p.attachments : [];
      p.meds = Array.isArray(p.meds) ? p.meds : []; // إن كان المشروع يستخدم مجموعة meds منفصلة
      return p;
    },

    /* ------------- Query ------------- */
    getCurrentPatient() {
      const id = this.state.ui.currentPatientId;
      if (!id) return null;
      return this.state.patients.find(x => x.id === id) || null;
    },
    getPatientById(id) {
      return this.state.patients.find(x => x.id === id) || null;
    },

    /* ------------- Mutations ------------- */
    setCurrentSection(section) {
      if (!section) return;
      this.state.ui.currentSection = section;
      this.persist();
      this.emit("section:changed", section);
    },
    setCurrentPatient(id) {
      const p = this.getPatientById(id);
      this.state.ui.currentPatientId = p ? p.id : null;
      this.persist();
      this.emit("current:changed", this.getCurrentPatient());
    },
    addPatient(bioOrPatient = {}) {
      const section = this.state.ui.currentSection || this.state.settings.defaultSection || "A";
      let newPatient;
      if (bioOrPatient && (bioOrPatient.bio || bioOrPatient.id)) {
        newPatient = this.ensureSchema({ ...bioOrPatient });
        if (!newPatient.section) newPatient.section = section; // احترام القسم الحالي
      } else {
        newPatient = this.ensureSchema({ bio: { ...(bioOrPatient || {}) }, section });
      }
      newPatient.updatedAt = this._nowISO();
      this.state.patients.push(newPatient);
      this.state.ui.currentPatientId = newPatient.id; // الانتقال عليه مباشرة
      this.persist();
      this.emit("patients:changed", this.state.patients);
      this.emit("current:changed", newPatient);
      return newPatient;
    },
    updatePatientById(id, patch = {}) {
      const idx = this.state.patients.findIndex(x => x.id === id);
      if (idx === -1) return null;
      const merged = { ...this.ensureSchema(this.state.patients[idx]), ...patch, updatedAt: this._nowISO() };
      this.state.patients[idx] = merged;
      this.persist();
      this.emit("patients:changed", this.state.patients);
      if (this.state.ui.currentPatientId === id) this.emit("current:changed", merged);
      return merged;
    },
    updateCurrentPatient(patch = {}) {
      const cur = this.getCurrentPatient();
      if (!cur) return null;
      return this.updatePatientById(cur.id, patch);
    },

    /* ------------- CSV helpers used by import_export.js ------------- */
    importRows(rows) {
      // rows هي صفوف CSV بترتيب PR.constants.HOSPITAL_HEADERS
      let count = 0;
      for (const r of rows) {
        // حوّل الـrow إلى bio
        const bio = { ...r };
        // احترم القسم الحالي أثناء الاستيراد (ومع ذلك import_export.js صار يقدر يجهّز section لاحقًا)
        this.addPatient({ bio, section: this.state.ui.currentSection || this.state.settings.defaultSection || "A" });
        count++;
      }
      return count;
    },
    exportRows() {
      // يعتمد على HOSPITAL_HEADERS لو متوفرة
      const headers = (window.PR && PR.constants && PR.constants.HOSPITAL_HEADERS) || [];
      if (!headers.length) {
        // رجّع دمج بسيط لكل bio
        return this.state.patients.map(p => ({ ...(p.bio || {}) }));
      }
      return this.state.patients.map(p => {
        const row = {};
        for (const h of headers) row[h] = (p.bio && (p.bio[h] ?? "")) || "";
        return row;
      });
    },
  };

  // init
  S._load();
  // تأكيد السكيمات للمرضى المحفوظين
  S.state.patients = (S.state.patients || []).map(S.ensureSchema);

  window.PR.state = S;
})();