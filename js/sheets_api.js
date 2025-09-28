/**
 * sheets_api.js (improved)
 * واجهة التعامل مع Google Apps Script WebApp (PalliativeRoundsDB)
 *
 * يدعم:
 *   - fetch (للـ http/https)
 *   - JSONP (للـ file://)
 *
 * دوال:
 *   PatientsAPI.list/save/remove
 *   RemindersAPI.list/save/remove
 *   SettingsAPI.get/save
 *   UIAPI.get/save
 *   ReferenceRangesAPI.list/save
 *   MetadataAPI.get/save
 */

// ==================== إعداد ====================
// ضع هنا رابط الـ Web App من GAS (ينتهي بـ /exec)
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbz_ja78AXDQSiZeOKLmadElea7osfo2-3E-F8_lJfwMcmzY2jTuFV-rYNauVlBa9v1uww/exec";

// هل الصفحة شغالة من file:// ؟
const IS_FILE_PROTOCOL = typeof location !== "undefined" && location.protocol === "file:";

// تحقق مبكر من صحة الرابط
(function validateWebAppUrl() {
  if (typeof WEBAPP_URL !== "string" || !WEBAPP_URL.trim()) {
    console.error("sheets_api.js: WEBAPP_URL is empty. Paste your GAS Web App /exec URL.");
    return;
  }
  const url = WEBAPP_URL.trim();
  const looksValid = /^https?:\/\/.+\/exec(\?.*)?$/.test(url);
  if (!looksValid) {
    console.warn(
      "sheets_api.js: WEBAPP_URL might be invalid. It should be a GAS Web App URL ending with /exec. Current:",
      url
    );
  }
})();

// ==================== أدوات أساسية ====================

async function callSheetsAPI(params = {}, payload = null) {
  if (IS_FILE_PROTOCOL) {
    return callJSONP(params, payload);
  } else {
    return callFetch(params, payload);
  }
}

async function callFetch(params, payload) {
  if (!WEBAPP_URL || !WEBAPP_URL.trim()) {
    throw new Error("WEBAPP_URL is not set. Please paste your GAS Web App /exec URL.");
  }
  let base = WEBAPP_URL.trim();
  // إزالة أي مسافات/أسطر زائدة
  base = base.replace(/\s+/g, "");

  let u;
  try {
    u = new URL(base);
  } catch (e) {
    throw new Error("Invalid WEBAPP_URL: " + base);
  }

  const sp = new URLSearchParams(params);
  u.search = sp.toString();

  const opts = payload
    ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    : { method: "GET" };

  const res = await fetch(u.toString(), opts);
  if (!res.ok) {
    const txt = await safeText(res);
    throw new Error(`HTTP ${res.status} - ${txt || res.statusText}`);
  }
  return await res.json();
}

async function safeText(res) {
  try { return await res.text(); } catch { return ""; }
}

function callJSONP(params, payload) {
  if (!WEBAPP_URL || !WEBAPP_URL.trim()) {
    return Promise.reject(new Error("WEBAPP_URL is not set. Please paste your GAS Web App /exec URL."));
  }
  return new Promise((resolve, reject) => {
    const cbName = "cb_" + Math.random().toString(36).slice(2);
    const allParams = { ...params, callback: cbName };
    if (payload) allParams.body = JSON.stringify(payload);

    const url = WEBAPP_URL.trim() + "?" + new URLSearchParams(allParams).toString();
    const script = document.createElement("script");
    script.src = url;

    let done = false;
    window[cbName] = (data) => {
      if (done) return;
      done = true;
      resolve(data);
      cleanup();
    };

    script.onerror = () => {
      if (done) return;
      done = true;
      reject(new Error("JSONP load error"));
      cleanup();
    };

    function cleanup() {
      try { delete window[cbName]; } catch {}
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    document.body.appendChild(script);
  });
}

// ==================== Patients ====================

const PatientsAPI = {
  async list() {
    const res = await callSheetsAPI({ action: "listPatients" });
    if (!res.ok) throw new Error(res.error || "listPatients failed");
    return res.items;
  },
  async save(patient) {
    const res = await callSheetsAPI({ action: "savePatient" }, patient);
    if (!res.ok) throw new Error(res.error || "savePatient failed");
    return res;
  },
  async remove(id) {
    const res = await callSheetsAPI({ action: "deletePatient" }, { id });
    if (!res.ok) throw new Error(res.error || "deletePatient failed");
    return res;
  },
};

// ==================== Reminders ====================

const RemindersAPI = {
  async list() {
    const res = await callSheetsAPI({ action: "listReminders" });
    if (!res.ok) throw new Error(res.error || "listReminders failed");
    return res.items;
  },
  async save(rem) {
    const res = await callSheetsAPI({ action: "saveReminder" }, rem);
    if (!res.ok) throw new Error(res.error || "saveReminder failed");
    return res;
  },
  async remove(id) {
    const res = await callSheetsAPI({ action: "deleteReminder" }, { id });
    if (!res.ok) throw new Error(res.error || "deleteReminder failed");
    return res;
  },
};

// ==================== Settings ====================

const SettingsAPI = {
  async get() {
    const res = await callSheetsAPI({ action: "getSettings" });
    if (!res.ok) throw new Error(res.error || "getSettings failed");
    return res.item;
  },
  async save(obj) {
    const res = await callSheetsAPI({ action: "saveSettings" }, obj);
    if (!res.ok) throw new Error(res.error || "saveSettings failed");
    return res;
  },
};

// ==================== UI ====================

const UIAPI = {
  async get() {
    const res = await callSheetsAPI({ action: "getUI" });
    if (!res.ok) throw new Error(res.error || "getUI failed");
    return res.item;
  },
  async save(obj) {
    const res = await callSheetsAPI({ action: "saveUI" }, obj);
    if (!res.ok) throw new Error(res.error || "saveUI failed");
    return res;
  },
};

// ==================== ReferenceRanges ====================

const ReferenceRangesAPI = {
  async list() {
    const res = await callSheetsAPI({ action: "getReferenceRanges" });
    if (!res.ok) throw new Error(res.error || "getReferenceRanges failed");
    return res.items;
  },
  async save(items) {
    const res = await callSheetsAPI({ action: "saveReferenceRanges" }, { items });
    if (!res.ok) throw new Error(res.error || "saveReferenceRanges failed");
    return res;
  },
};

// ==================== Metadata ====================

const MetadataAPI = {
  async get() {
    const res = await callSheetsAPI({ action: "getMetadata" });
    if (!res.ok) throw new Error(res.error || "getMetadata failed");
    return res.item;
  },
  async save(obj) {
    const res = await callSheetsAPI({ action: "saveMetadata" }, obj);
    if (!res.ok) throw new Error(res.error || "saveMetadata failed");
    return res;
  },
};
