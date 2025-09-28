/**
 * sheets_api.js (with CORS-safe auto-fallback)
 * واجهة التعامل مع Google Apps Script WebApp (PalliativeRoundsDB)
 *
 * يعمل على:
 *   - GitHub Pages / أي أصل https: يحاول fetch أولاً، وإن فشل (CORS) يسقط على JSONP تلقائياً.
 *   - file:// : يستعمل JSONP مباشرة.
 *
 * دوال:
 *   PatientsAPI.list/save/remove
 *   RemindersAPI.list/save/remove
 *   SettingsAPI.get/save
 *   UIAPI.get/save
 *   ReferenceRangesAPI.list/save
 *   MetadataAPI.get/save
 */

/* ==================== إعداد ==================== */
// ضع هنا رابط الـ Web App من GAS (الذي ينتهي بـ /exec)
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbyMJH0C9a9wbwhW0UwfnOPtlCWmdH7Oucng0yGgi1pugdNFt8TFmrvB3FIMvHcfXIt3qA/exec";

// إجبار JSONP (مفيد على GitHub Pages لتجنب CORS نهائياً)
const FORCE_JSONP = true;

// هل الصفحة تعمل من file:// ؟
const IS_FILE_PROTOCOL = typeof location !== "undefined" && location.protocol === "file:";

/* تحقق مبكر من صحة الرابط */
(function validateWebAppUrl() {
  if (typeof WEBAPP_URL !== "string" || !WEBAPP_URL.trim()) {
    console.error("sheets_api.js: WEBAPP_URL is empty. Paste your GAS Web App /exec URL.");
    return;
  }
  const url = WEBAPP_URL.trim();
  const looksValid = /^https?:\/\/.+\/exec(\?.*)?$/.test(url);
  if (!looksValid) {
    console.warn(
      "sheets_api.js: WEBAPP_URL might be invalid. It should end with /exec. Current:",
      url
    );
  }
})();

/* ==================== أدوات أساسية ==================== */

async function callSheetsAPI(params = {}, payload = null) {
  // نقرر وسيلة النقل
  if (FORCE_JSONP || IS_FILE_PROTOCOL) {
    return callJSONP(params, payload);
  }
  // جرّب fetch أولاً، وإن فشل (CORS) اسقط على JSONP
  try {
    return await callFetch(params, payload);
  } catch (err) {
    console.warn("[sheets_api] fetch failed, falling back to JSONP →", err?.message || err);
    return callJSONP(params, payload);
  }
}

async function callFetch(params, payload) {
  const base = (WEBAPP_URL || "").trim();
  if (!base) throw new Error("WEBAPP_URL is not set.");
  let u;
  try { u = new URL(base); } catch (e) { throw new Error("Invalid WEBAPP_URL: " + base); }

  const sp = new URLSearchParams(params);
  u.search = sp.toString();

  const opts = payload
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    : { method: "GET" };

  const res = await fetch(u.toString(), opts);
  if (!res.ok) {
    const txt = await safeText(res);
    throw new Error(`HTTP ${res.status} - ${txt || res.statusText}`);
  }
  return res.json();
}

async function safeText(res) { try { return await res.text(); } catch { return ""; } }

function callJSONP(params, payload) {
  const base = (WEBAPP_URL || "").trim();
  if (!base) return Promise.reject(new Error("WEBAPP_URL is not set."));
  return new Promise((resolve, reject) => {
    const cbName = "cb_" + Math.random().toString(36).slice(2);
    const allParams = { ...params, callback: cbName };
    if (payload) {
      // JSONP هو GET فقط — نمرر الـ payload كسلسلة JSON في الاستعلام
      allParams.body = JSON.stringify(payload);
    }
    const url = base + "?" + new URLSearchParams(allParams).toString();
    const script = document.createElement("script");
    script.src = url;

    let done = false;
    window[cbName] = (data) => {
      if (done) return; done = true;
      resolve(data);
      cleanup();
    };
    script.onerror = () => {
      if (done) return; done = true;
      reject(new Error("JSONP load error"));
      cleanup();
    };
    function cleanup() {
      try { delete window[cbName]; } catch {}
      script.remove();
    }
    document.body.appendChild(script);
  });
}

/* ==================== Patients ==================== */

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

/* ==================== Reminders ==================== */

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

/* ==================== Settings ==================== */

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

/* ==================== UI ==================== */

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

/* ==================== ReferenceRanges ==================== */

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

/* ==================== Metadata ==================== */

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
