/**
 * sheets_api.js — GAS WebApp client with JSONP & verbose logging
 * استبدل هذا الملف بالكامل في js/sheets_api.js
 *
 * كيف أختبر؟
 *  1) ضع رابط /exec في WEBAPP_URL
 *  2) افتح Console ونفّذ:
 *       PatientsAPI.list().then(console.log).catch(console.error)
 *       PatientsAPI.save({"Patient Name":"FromApp","updatedAt":"2025-09-28 14:10"}).then(console.log)
 *  3) يجب أن ترى في Network طلبات إلى script.google.com مع action=...
 */

//////////////////// الإعداد ////////////////////
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbyMJH0C9a9wbwhW0UwfnOPtlCWmdH7Oucng0yGgi1pugdNFt8TFmrvB3FIMvHcfXIt3qA/exec";
const FORCE_JSONP = true; // على GitHub Pages خليه true
////////////////////////////////////////////////

const LOG_PREFIX = "[sheets_api]";
const IS_FILE_PROTOCOL = typeof location !== "undefined" && location.protocol === "file:";

(function validateWebAppUrl() {
  if (!WEBAPP_URL || typeof WEBAPP_URL !== "string") {
    console.error(LOG_PREFIX, "WEBAPP_URL is empty! Paste your GAS Web App /exec URL.");
    return;
  }
  const looks = /^https?:\/\/.+\/exec(\?.*)?$/i.test(WEBAPP_URL.trim());
  if (!looks) {
    console.warn(LOG_PREFIX, "WEBAPP_URL might be invalid. Must end with /exec. Current:", WEBAPP_URL);
  }
})();

//////////////////// نواة الاستدعاء ////////////////////

async function callSheetsAPI(params = {}, payload = null) {
  // إجبار JSONP أو العمل من file://
  if (FORCE_JSONP || IS_FILE_PROTOCOL) {
    console.debug(LOG_PREFIX, "→ JSONP", params, payload);
    return callJSONP(params, payload);
  }
  // جرِّب fetch أولًا ثم اسقط لِـ JSONP عند أي فشل (CORS/غيره)
  try {
    console.debug(LOG_PREFIX, "→ fetch", params, payload);
    return await callFetch(params, payload);
  } catch (e) {
    console.warn(LOG_PREFIX, "fetch failed → fallback to JSONP:", e?.message || e);
    return callJSONP(params, payload);
  }
}

async function callFetch(params, payload) {
  const base = (WEBAPP_URL || "").trim();
  let u;
  try { u = new URL(base); } catch { throw new Error("Invalid WEBAPP_URL"); }
  const sp = new URLSearchParams(params);
  u.search = sp.toString();

  const opts = payload
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    : { method: "GET" };

  const res = await fetch(u.toString(), opts);
  const txt = await res.text();
  if (!res.ok) {
    console.error(LOG_PREFIX, "HTTP error", res.status, txt);
    throw new Error(`HTTP ${res.status}`);
  }
  try {
    const json = JSON.parse(txt);
    console.debug(LOG_PREFIX, "fetch OK:", params.action, json);
    return json;
  } catch {
    console.error(LOG_PREFIX, "Invalid JSON:", txt.slice(0, 120));
    throw new Error("Invalid JSON");
  }
}

function callJSONP(params, payload) {
  const base = (WEBAPP_URL || "").trim();
  if (!base) return Promise.reject(new Error("WEBAPP_URL not set"));
  return new Promise((resolve, reject) => {
    const cbName = "jsonp_cb_" + Math.random().toString(36).slice(2);
    const allParams = { ...params, callback: cbName };
    if (payload) {
      // JSONP = GET فقط ⇒ نمرّر body كسلسلة JSON في الاستعلام
      allParams.body = JSON.stringify(payload);
    }
    const url = base + "?" + new URLSearchParams(allParams).toString();

    console.debug(LOG_PREFIX, "JSONP URL:", url);

    const script = document.createElement("script");
    script.src = url;
    script.async = true;

    let finished = false;

    window[cbName] = (data) => {
      if (finished) return; finished = true;
      console.debug(LOG_PREFIX, "JSONP OK:", params.action, data);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (finished) return; finished = true;
      console.error(LOG_PREFIX, "JSONP load error for", url);
      cleanup();
      reject(new Error("JSONP load error"));
    };

    function cleanup() {
      try { delete window[cbName]; } catch {}
      try { script.remove(); } catch {}
    }

    document.body.appendChild(script);
  });
}

//////////////////// واجهات الداتا ////////////////////

const PatientsAPI = {
  async list() {
    const res = await callSheetsAPI({ action: "listPatients" });
    if (!res || !res.ok) throw new Error(res?.error || "listPatients failed");
    return res.items || [];
  },
  async save(patientObj) {
    const res = await callSheetsAPI({ action: "savePatient" }, patientObj);
    if (!res || !res.ok) throw new Error(res?.error || "savePatient failed");
    return res; // { ok:true, id:..., created|updated:true }
  },
  async remove(id) {
    const res = await callSheetsAPI({ action: "deletePatient" }, { id });
    if (!res || !res.ok) throw new Error(res?.error || "deletePatient failed");
    return res;
  },
};

const RemindersAPI = {
  async list() {
    const res = await callSheetsAPI({ action: "listReminders" });
    if (!res || !res.ok) throw new Error(res?.error || "listReminders failed");
    return res.items || [];
  },
  async save(rem) {
    const res = await callSheetsAPI({ action: "saveReminder" }, rem);
    if (!res || !res.ok) throw new Error(res?.error || "saveReminder failed");
    return res;
  },
  async remove(id) {
    const res = await callSheetsAPI({ action: "deleteReminder" }, { id });
    if (!res || !res.ok) throw new Error(res?.error || "deleteReminder failed");
    return res;
  },
};

const SettingsAPI = {
  async get() {
    const res = await callSheetsAPI({ action: "getSettings" });
    if (!res || !res.ok) throw new Error(res?.error || "getSettings failed");
    return res.item || {};
  },
  async save(obj) {
    const res = await callSheetsAPI({ action: "saveSettings" }, obj);
    if (!res || !res.ok) throw new Error(res?.error || "saveSettings failed");
    return res;
  },
};

const UIAPI = {
  async get() {
    const res = await callSheetsAPI({ action: "getUI" });
    if (!res || !res.ok) throw new Error(res?.error || "getUI failed");
    return res.item || {};
  },
  async save(obj) {
    const res = await callSheetsAPI({ action: "saveUI" }, obj);
    if (!res || !res.ok) throw new Error(res?.error || "saveUI failed");
    return res;
  },
};

const ReferenceRangesAPI = {
  async list() {
    const res = await callSheetsAPI({ action: "getReferenceRanges" });
    if (!res || !res.ok) throw new Error(res?.error || "getReferenceRanges failed");
    return res.items || [];
  },
  async save(items) {
    const res = await callSheetsAPI({ action: "saveReferenceRanges" }, { items });
    if (!res || !res.ok) throw new Error(res?.error || "saveReferenceRanges failed");
    return res;
  },
};

const MetadataAPI = {
  async get() {
    const res = await callSheetsAPI({ action: "getMetadata" });
    if (!res || !res.ok) throw new Error(res?.error || "getMetadata failed");
    return res.item || {};
  },
  async save(obj) {
    const res = await callSheetsAPI({ action: "saveMetadata" }, obj);
    if (!res || !res.ok) throw new Error(res?.error || "saveMetadata failed");
    return res;
  },
};

//////////////////// اختبارات سريعة (اختياري) ////////////////////
// ارفع التعليق لتشوف لوج واضح فور التحميل:
// document.addEventListener("DOMContentLoaded", async () => {
//   try {
//     console.log(LOG_PREFIX, "ping listPatients…");
//     const items = await PatientsAPI.list();
//     console.log(LOG_PREFIX, "patients:", items.length);
//   } catch (e) {
//     console.error(LOG_PREFIX, "startup test error:", e);
//   }
// });