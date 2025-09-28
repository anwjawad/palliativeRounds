/**
 * sheets_api.js
 * واجهة التعامل مع Google Apps Script WebApp (PalliativeRoundsDB)
 *
 * يدعم:
 *   - fetch (للـ http/https)
 *   - JSONP (للـ file://)
 *
 * يوفّر دوال:
 *   PatientsAPI.list()
 *   PatientsAPI.save(patient)
 *   PatientsAPI.remove(id)
 *
 *   RemindersAPI.list()
 *   RemindersAPI.save(reminder)
 *   RemindersAPI.remove(id)
 *
 *   SettingsAPI.get()
 *   SettingsAPI.save(obj)
 *
 *   UIAPI.get()
 *   UIAPI.save(obj)
 *
 *   ReferenceRangesAPI.list()
 *   ReferenceRangesAPI.save(items)
 *
 *   MetadataAPI.get()
 *   MetadataAPI.save(obj)
 */

// ---------- إعداد ----------

// عدّل هذا بالرابط اللي أخدته من Deploy → Web app بالـ Google Apps Script:
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbz_ja78AXDQSiZeOKLmadElea7osfo2-3E-F8_lJfwMcmzY2jTuFV-rYNauVlBa9v1uww/exec";

// هل الصفحة شغالة من file:// ؟
const IS_FILE_PROTOCOL = location.protocol === "file:";

// ---------- أدوات ----------

async function callSheetsAPI(params = {}, payload = null) {
  if (IS_FILE_PROTOCOL) {
    return callJSONP(params, payload);
  } else {
    return callFetch(params, payload);
  }
}

async function callFetch(params, payload) {
  const url = new URL(WEBAPP_URL);
  url.search = new URLSearchParams(params).toString();

  const opts = payload
    ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    : { method: "GET" };

  const res = await fetch(url.toString(), opts);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.json();
}

function callJSONP(params, payload) {
  return new Promise((resolve, reject) => {
    const cbName = "cb_" + Math.random().toString(36).slice(2);
    params.callback = cbName;
    if (payload) params.body = JSON.stringify(payload);

    const url = WEBAPP_URL + "?" + new URLSearchParams(params).toString();
    const script = document.createElement("script");
    script.src = url;

    window[cbName] = (data) => {
      resolve(data);
      cleanup();
    };

    script.onerror = () => {
      reject(new Error("JSONP load error"));
      cleanup();
    };

    function cleanup() {
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    document.body.appendChild(script);
  });
}

// ---------- Patients ----------

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

// ---------- Reminders ----------

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

// ---------- Settings ----------

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

// ---------- UI ----------

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

// ---------- ReferenceRanges ----------

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

// ---------- Metadata ----------

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
