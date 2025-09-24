/* ------------------------------------------------------
   Palliative Rounds — utils.js
   Small helper utilities, constants, and UI primitives
-------------------------------------------------------*/

(function () {
  const NS = "palliative_rounds_v1"; // storage namespace/version

  /* ---------------- DOM Helpers ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const on = (el, evt, selectorOrHandler, handler) => {
    // direct
    if (typeof selectorOrHandler === "function") {
      el.addEventListener(evt, selectorOrHandler);
      return;
    }
    // delegated
    el.addEventListener(evt, (e) => {
      const target = e.target.closest(selectorOrHandler);
      if (target && el.contains(target)) handler.call(target, e);
    });
  };

  const h = (tag, props = {}, children = []) => {
    const el = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === "class") el.className = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function")
        el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, "");
      else if (v === false || v == null) {/* skip */}
      else el.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children])
      .filter(Boolean)
      .forEach((ch) =>
        el.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch)
      );
    return el;
  };

  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
  const debounce = (fn, ms = 250) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  };

  /* ---------------- Storage ---------------- */
  const save = (key, val) =>
    localStorage.setItem(`${NS}:${key}`, JSON.stringify(val));
  const load = (key, fallback = null) => {
    try {
      const raw = localStorage.getItem(`${NS}:${key}`);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  const remove = (key) => localStorage.removeItem(`${NS}:${key}`);

  /* ---------------- IDs & Time ---------------- */
  const uid = (prefix = "id") =>
    `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;

  const fmtTime = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;

  /* ---------------- Toasts ---------------- */
  const toastsEl = document.getElementById("toasts");
  const toast = (msg, type = "success", ttl = 3500) => {
    if (!toastsEl) return;
    const el = h("div", { class: `toast ${type}` }, [
      h("i", { class: typeIcon(type) }),
      h("div", {}, msg),
      h(
        "button",
        { class: "icon-btn close", title: "Dismiss", onClick: () => el.remove() },
        h("i", { class: "fa-solid fa-xmark" })
      ),
    ]);
    toastsEl.appendChild(el);
    if (ttl > 0) setTimeout(() => el.remove(), ttl);
  };
  const typeIcon = (t) => {
    switch (t) {
      case "success":
        return "fa-solid fa-circle-check";
      case "warn":
        return "fa-solid fa-triangle-exclamation";
      case "error":
        return "fa-solid fa-circle-exclamation";
      default:
        return "fa-regular fa-bell";
    }
  };

  /* ---------------- Dialog helpers ---------------- */
  const openDialog = (dlg) => {
    if (!dlg) return;
    try {
      dlg.showModal();
    } catch {
      // Safari polyfill behavior: add open attr
      dlg.setAttribute("open", "");
    }
  };
  const closeDialog = (dlg) => {
    if (!dlg) return;
    try {
      dlg.close();
    } catch {
      dlg.removeAttribute("open");
    }
  };

  /* ---------------- CSV mapping ---------------- */
  // Exact hospital headers (do not change labels)
  const HOSPITAL_HEADERS = [
    "Patient Code",
    "Patient Name",
    "Patient Age",
    "Room",
    "Admitting Provider",
    "Cause Of Admission",
    "Diet",
    "Isolation",
    "Comments",
  ];

  /* ---------------- ESAS & CTCAE ---------------- */
  // ESAS (complete set, 1–10 choices)
  const ESAS_FIELDS = [
    "Pain",
    "Tiredness",
    "Drowsiness",
    "Nausea",
    "Lack of Appetite",
    "Shortness of Breath",
    "Depression",
    "Anxiety",
    "Wellbeing",
  ];

  // CTCAE — only requested items. Grades 0–4 (we allow 0 meaning none)
  const CTCAE_ITEMS = [
    { key: "diarrhea", label: "Diarrhea" },
    { key: "constipation", label: "Constipation" }, // corrected spelling
    { key: "mucositis", label: "Mucositis / Stomatitis" },
    { key: "peripheral_neuropathy", label: "Peripheral Neuropathy" },
    { key: "sleep_disturbance", label: "Sleep Disturbance" },
    { key: "xerostomia", label: "Xerostomia" },
    { key: "dysphagia", label: "Dysphagia" },
    { key: "odynophagia", label: "Odynophagia" },
  ];
  const CTCAE_GRADES = [0, 1, 2, 3, 4];

  /* ---------------- Lab Groups & Reference Ranges ----------------
     NOTE: Reference ranges are typical adult values and may vary by lab.
     Shown as compact tooltips to save space in the UI.
  -----------------------------------------------------------------*/
  const LAB_GROUPS = {
    group1: [
      "WBC",
      "HGB",
      "PLT",
      "ANC",
      "CRP",
      "Albumin",
    ],
    group2: [
      "Sodium (Na)",
      "Potassium (K)",
      "Chloride (Cl)",
      "Calcium (Ca)",
      "Phosphorus (Ph)",
      "Alkaline Phosphatase (ALP)",
    ],
    group3: [
      "Creatinine (Scr)",
      "BUN",
      "Total Bile",
      "Other",
    ],
  };

  const REF_RANGES = {
    "WBC": "4.0–11.0 x10^9/L",
    "HGB": "M: 13.5–17.5 g/dL, F: 12.0–16.0 g/dL",
    "PLT": "150–400 x10^9/L",
    "ANC": "1.5–8.0 x10^9/L",
    "CRP": "< 5 mg/L",
    "Albumin": "3.5–5.0 g/dL",

    "Sodium (Na)": "135–145 mmol/L",
    "Potassium (K)": "3.5–5.0 mmol/L",
    "Chloride (Cl)": "98–107 mmol/L",
    "Calcium (Ca)": "8.5–10.5 mg/dL",
    "Phosphorus (Ph)": "2.5–4.5 mg/dL",
    "Alkaline Phosphatase (ALP)": "44–147 U/L",

    "Creatinine (Scr)": "0.6–1.3 mg/dL",
    "BUN": "7–20 mg/dL",
    "Total Bile": "0.3–1.2 mg/dL (total bilirubin)",
    "Other": "Custom",
  };

  // default display when not filled
  const LAB_DEFAULT = "Normal Result";

  /* ---------------- Theme / Preferences ---------------- */
  const applyTheme = (prefs) => {
    const root = document.documentElement;
    root.classList.remove("theme-light", "font-lg", "font-xl");
    if (prefs.theme === "light") root.classList.add("theme-light");
    if (prefs.fontSize === "lg") root.classList.add("font-lg");
    if (prefs.fontSize === "xl") root.classList.add("font-xl");
  };

  /* ---------------- Safe text helpers ---------------- */
  const esc = (s) =>
    (s ?? "")
      .toString()
      .replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  /* ---------------- Exported API ---------------- */
  window.PR = window.PR || {};
  window.PR.utils = {
    $, $$, on, h, clamp, debounce,
    save, load, remove,
    uid, fmtTime,
    toast, openDialog, closeDialog,
    esc,
    applyTheme,
  };
  window.PR.constants = {
    NS,
    HOSPITAL_HEADERS,
    ESAS_FIELDS,
    CTCAE_ITEMS,
    CTCAE_GRADES,
    LAB_GROUPS,
    REF_RANGES,
    LAB_DEFAULT,
  };
})();
