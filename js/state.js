/* ------------------------------------------------------
   Palliative Rounds — state.js
   Centralized app state, schema, persistence & events
-------------------------------------------------------*/

(function () {
  const { save, load, uid, fmtTime } = PR.utils;
  const {
    HOSPITAL_HEADERS,
    ESAS_FIELDS,
    CTCAE_ITEMS,
    CTCAE_GRADES,
    LAB_GROUPS,
    LAB_DEFAULT,
  } = PR.constants;

  /* =============== Simple Event Bus =============== */
  const listeners = {};
  const on = (evt, fn) => ((listeners[evt] ??= []).push(fn), () => off(evt, fn));
  const off = (evt, fn) =>
    (listeners[evt] = (listeners[evt] || []).filter((h) => h !== fn));
  const emit = (evt, payload) => (listeners[evt] || []).forEach((h) => h(payload));

  /* =============== Schema Helpers =============== */

  // Blank ESAS (1–10; null means not selected)
  const blankESAS = () =>
    ESAS_FIELDS.reduce((acc, k) => ((acc[k] = null), acc), {});

  // Blank CTCAE (grades 0–4; null means not selected; enable flag)
  const blankCTCAE = () => {
    const o = { enabled: false, items: {} };
    CTCAE_ITEMS.forEach(({ key, label }) => {
      o.items[key] = { label, grade: null };
    });
    return o;
  };

  // Blank Labs grouped + extras
  const blankLabs = () => {
    const make = (keys) =>
      keys.reduce((acc, k) => ((acc[k] = null), acc), {});
    return {
      group1: make(LAB_GROUPS.group1),
      group2: make(LAB_GROUPS.group2),
      group3: make(LAB_GROUPS.group3),
      crpTrend: "",
      other: "",
    };
  };

  // Blank HPI
  const blankHPI = () => ({
    cause: "",
    previous: "",
    current: "",
    initial: "",
  });

  // Biographical data with exact hospital headers (do not rename keys)
  const blankBio = () => ({
    "Patient Code": "",
    "Patient Name": "",
    "Patient Age": "",
    "Room": "",
    "Admitting Provider": "",
    "Cause Of Admission": "",
    "Diet": "",
    "Isolation": "",
    "Comments": "",
  });

  // Patient shell
  const newPatient = (partial = {}) => ({
    id: uid("pt"),
    section: "A", // A/B/C – user tabs
    done: false,
    updatedAt: fmtTime(new Date()),
    bio: { ...blankBio(), ...(partial.bio || {}) },
    hpi: { ...blankHPI(), ...(partial.hpi || {}) },
    esas: { ...blankESAS(), ...(partial.esas || {}) },
    ctcae: partial.ctcae ? partial.ctcae : blankCTCAE(),
    labs: partial.labs ? partial.labs : blankLabs(),
    latestNotes: partial.latestNotes || "",
    patientAssessment: partial.patientAssessment || "",
    medicationList: partial.medicationList || "",
  });

  const ensureSchema = (p) => {
    // Ensure forward-compatibility if schema evolves
    p.bio = { ...blankBio(), ...(p.bio || {}) };
    p.hpi = { ...blankHPI(), ...(p.hpi || {}) };
    p.esas = { ...blankESAS(), ...(p.esas || {}) };
    if (!p.ctcae) p.ctcae = blankCTCAE();
    else {
      const base = blankCTCAE();
      p.ctcae.enabled = !!p.ctcae.enabled;
      // migrate items
      Object.keys(base.items).forEach((k) => {
        const cur = p.ctcae.items?.[k];
        base.items[k].grade =
          cur && CTCAE_GRADES.includes(Number(cur.grade))
            ? Number(cur.grade)
            : (cur?.grade === 0 ? 0 : null);
      });
      p.ctcae.items = base.items;
    }
    if (!p.labs) p.labs = blankLabs();
    else {
      ["group1", "group2", "group3"].forEach((g) => {
        p.labs[g] = { ...blankLabs()[g], ...(p.labs[g] || {}) };
      });
      p.labs.crpTrend = p.labs.crpTrend || "";
      p.labs.other = p.labs.other || "";
    }
    p.section = p.section || "A";
    p.done = !!p.done;
    p.updatedAt = p.updatedAt || fmtTime(new Date());
    p.latestNotes = p.latestNotes || "";
    p.patientAssessment = p.patientAssessment || "";
    p.medicationList = p.medicationList || "";
    return p;
  };

  /* =============== Persistence Keys =============== */
  const K = {
    patients: "patients",
    reminders: "reminders",
    settings: "settings",
    ui: "ui",
  };

  /* =============== In-memory State =============== */
  const state = {
    patients: [],
    reminders: [],
    settings: {
      theme: "auto", // auto | light | dark (handled in ui.js via prefers-color-scheme)
      fontSize: "base", // base | lg | xl
    },
    ui: {
      currentSection: "A",
      currentPatientId: null,
      search: "",
    },
  };

  /* =============== CRUD: Patients =============== */
  const addPatient = (partial) => {
    const p = ensureSchema(newPatient(partial));
    state.patients.push(p);
    persist("patients");
    emit("patients:changed", state.patients);
    return p.id;
  };

  const updatePatient = (id, patch) => {
    const idx = state.patients.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    const cur = state.patients[idx];
    const merged = ensureSchema({
      ...cur,
      ...patch,
      bio: patch.bio ? { ...cur.bio, ...patch.bio } : cur.bio,
      hpi: patch.hpi ? { ...cur.hpi, ...patch.hpi } : cur.hpi,
      esas: patch.esas ? { ...cur.esas, ...patch.esas } : cur.esas,
      ctcae: patch.ctcae ? { ...cur.ctcae, ...patch.ctcae } : cur.ctcae,
      labs: patch.labs ? deepMerge(cur.labs, patch.labs) : cur.labs,
    });
    merged.updatedAt = fmtTime(new Date());
    state.patients[idx] = merged;
    persist("patients");
    emit("patient:updated", merged);
    if (state.ui.currentPatientId === id) emit("current:changed", merged);
    return true;
  };

  const deepMerge = (a, b) => {
    const o = { ...a };
    Object.keys(b || {}).forEach((k) => {
      if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) {
        o[k] = deepMerge(a[k] || {}, b[k]);
      } else {
        o[k] = b[k];
      }
    });
    return o;
  };

  const removePatient = (id) => {
    const idx = state.patients.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    const [removed] = state.patients.splice(idx, 1);
    if (state.ui.currentPatientId === id) state.ui.currentPatientId = null;
    persist("patients");
    emit("patients:changed", state.patients);
    return removed;
  };

  const setSection = (id, section) => updatePatient(id, { section });

  const setCurrentPatient = (id) => {
    state.ui.currentPatientId = id;
    persist("ui");
    emit("current:changed", getCurrentPatient());
  };

  const getCurrentPatient = () =>
    state.patients.find((p) => p.id === state.ui.currentPatientId) || null;

  const markDone = (id, done = true) => updatePatient(id, { done });

  const progress = () => {
    const pts = state.patients.filter((p) => p.section === state.ui.currentSection);
    if (!pts.length) return 0;
    const doneCount = pts.filter((p) => p.done).length;
    return Math.round((doneCount / pts.length) * 100);
  };

  const searchPatients = (q = "") => {
    const s = q.trim().toLowerCase();
    const sect = state.ui.currentSection;
    return state.patients
      .filter((p) => p.section === sect)
      .filter((p) => {
        if (!s) return true;
        const blob = [
          p.bio["Patient Code"],
          p.bio["Patient Name"],
          p.bio["Patient Age"],
          p.bio["Room"],
          p.bio["Admitting Provider"],
          p.bio["Cause Of Admission"],
          p.bio["Diet"],
          p.bio["Isolation"],
          p.bio["Comments"],
        ]
          .join(" ")
          .toLowerCase();
        return blob.includes(s);
      })
      .sort((a, b) => a.bio["Patient Name"].localeCompare(b.bio["Patient Name"]));
  };

  /* =============== Labs helpers =============== */
  const getLabValue = (patient, key) => {
    const { labs } = patient || {};
    if (!labs) return LAB_DEFAULT;
    for (const g of ["group1", "group2", "group3"]) {
      if (key in labs[g]) {
        return labs[g][key] == null || labs[g][key] === ""
          ? LAB_DEFAULT
          : String(labs[g][key]);
      }
    }
    if (key === "CRP Trend") return labs.crpTrend || "";
    if (key === "Other") return labs.other || "";
    return LAB_DEFAULT;
  };

  /* =============== CSV Import/Export =============== */
  const importRows = (rows) => {
    // rows: array of objects with EXACT HOSPITAL_HEADERS keys
    const createdIds = [];
    rows.forEach((row) => {
      const bio = blankBio();
      HOSPITAL_HEADERS.forEach((h) => (bio[h] = row[h] ?? ""));
      const id = addPatient({ bio });
      createdIds.push(id);
    });
    emit("import:done", createdIds);
    return createdIds.length;
  };

  const exportRows = () => {
    // Export exactly hospital headers + keep for round-trip
    return state.patients.map((p) => ({ ...p.bio }));
  };

  /* =============== Reminders =============== */
  const addReminder = (text, forPatientId = null) => {
    const r = {
      id: uid("rem"),
      text,
      forPatientId,
      createdAt: fmtTime(new Date()),
      done: false,
    };
    state.reminders.push(r);
    persist("reminders");
    emit("reminders:changed", state.reminders);
    return r.id;
  };

  const toggleReminder = (id, done) => {
    const r = state.reminders.find((x) => x.id === id);
    if (!r) return false;
    r.done = done ?? !r.done;
    persist("reminders");
    emit("reminders:changed", state.reminders);
    return true;
  };

  const removeReminder = (id) => {
    const i = state.reminders.findIndex((x) => x.id === id);
    if (i === -1) return false;
    state.reminders.splice(i, 1);
    persist("reminders");
    emit("reminders:changed", state.reminders);
    return true;
  };

  /* =============== Settings / UI =============== */
  const setSettings = (patch) => {
    state.settings = { ...state.settings, ...patch };
    persist("settings");
    emit("settings:changed", state.settings);
  };

  const setUI = (patch) => {
    state.ui = { ...state.ui, ...patch };
    persist("ui");
    if ("currentSection" in patch) emit("section:changed", state.ui.currentSection);
    if ("currentPatientId" in patch) emit("current:changed", getCurrentPatient());
  };

  /* =============== Persistence =============== */
  const persist = (which) => {
    switch (which) {
      case "patients":
        save(K.patients, state.patients);
        break;
      case "reminders":
        save(K.reminders, state.reminders);
        break;
      case "settings":
        save(K.settings, state.settings);
        break;
      case "ui":
        save(K.ui, state.ui);
        break;
      default:
        save(K.patients, state.patients);
        save(K.reminders, state.reminders);
        save(K.settings, state.settings);
        save(K.ui, state.ui);
    }
  
  try { PR.cloud?.ready && PR.cloud.saveAll(state); } catch {}
};

  const restore = () => {
    state.patients = (load(K.patients, []) || []).map(ensureSchema);
    state.reminders = load(K.reminders, []) || [];
    state.settings = { ...state.settings, ...(load(K.settings, {}) || {}) };
    state.ui = { ...state.ui, ...(load(K.ui, {}) || {}) };

    // Seed demo data if first run
    if (!state.patients.length) {
      const demo = [
        {
          bio: {
            "Patient Code": "P-001",
            "Patient Name": "John Carter",
            "Patient Age": "67",
            "Room": "A12",
            "Admitting Provider": "Dr. Smith",
            "Cause Of Admission": "Dyspnea, infection",
            "Diet": "Soft",
            "Isolation": "None",
            "Comments": "N/A",
          },
          hpi: {
            cause: "Dyspnea with productive cough.",
            previous: "Chemo (FOLFOX) completed 6m ago.",
            current: "Piperacillin/Tazobactam; O2 2L NC.",
            initial: "RR 22, SpO2 93% on air.",
          },
          labs: {
            group1: { WBC: "10.2", HGB: "12.8", PLT: "210", ANC: "6.2", CRP: "24", Albumin: "3.4" },
            group2: { "Sodium (Na)": "139", "Potassium (K)": "4.0", "Chloride (Cl)": "103", "Calcium (Ca)": "9.1", "Phosphorus (Ph)": "3.2", "Alkaline Phosphatase (ALP)": "110" },
            group3: { "Creatinine (Scr)": "1.0", BUN: "18", "Total Bile": "0.8", Other: "" },
            crpTrend: "38→32→24",
            other: "",
          },
          section: "A",
          latestNotes: "Slept better; SOB improving.",
        },
        {
          bio: {
            "Patient Code": "P-002",
            "Patient Name": "Maria Lopez",
            "Patient Age": "58",
            "Room": "B07",
            "Admitting Provider": "Dr. Chen",
            "Cause Of Admission": "Pain control",
            "Diet": "Regular",
            "Isolation": "None",
            "Comments": "",
          },
          section: "B",
        },
      ];
      demo.forEach((d) => addPatient(d));
      emit("seed:demo", true);
    }

    emit("restored", true);
  };

  /* =============== Public API =============== */
  PR.state = {
    state,
    // events
    on, off, emit,
    // patients
    addPatient,
    updatePatient,
    removePatient,
    setSection,
    setCurrentPatient,
    getCurrentPatient,
    markDone,
    progress,
    searchPatients,
    // labs helpers
    getLabValue,
    // csv
    importRows,
    exportRows,
    // reminders
    addReminder,
    toggleReminder,
    removeReminder,
    // settings/ui
    setSettings,
    setUI,
    // lifecycle
    restore,
    persist,
    // schema
    blankESAS,
    blankCTCAE,
    blankLabs,
    blankHPI,
    blankBio,
    newPatient,
    ensureSchema,
  };
})();
