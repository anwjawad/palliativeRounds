/**
 * app_mapping.js
 * يحوّل بين شكل بيانات التطبيق وشكل Google Sheet (الهيدر الحرفي).
 *
 * الفكرة:
 *  - toSheetPatient(appPatient)  => كائن مفاتيحه مطابقة لهيدر الشيت حرفيًا
 *  - fromSheetPatient(row)       => كائن مناسب للتطبيق + يُبقي أيضًا المفاتيح الحرفية
 *
 * ملاحظة: نحاول قراءة القيم من عدة مسارات محتملة:
 *   - flat:    patient["Patient Name"]
 *   - camel:   patient.patientName
 *   - nested:  patient.bio?.patientName  أو patient.hpi?.cause  الخ
 */

(function () {
  if (window.PR_MAP) return;

  // أدوات مساعدة
  function get(obj, path, fallback = "") {
    // path ممكن يكون "bio.patientName" أو "Patient Name" (حرفي)
    if (!obj) return fallback;
    if (path.includes(".")) {
      const parts = path.split(".");
      let cur = obj;
      for (const k of parts) {
        if (cur && Object.prototype.hasOwnProperty.call(cur, k)) {
          cur = cur[k];
        } else {
          return fallback;
        }
      }
      return cur ?? fallback;
    }
    return (obj[path] !== undefined ? obj[path] : fallback);
  }

  function pickFirst(obj, candidates, fallback = "") {
    for (const p of candidates) {
      const v = get(obj, p);
      if (v !== undefined && v !== null && String(v) !== "") return v;
    }
    return fallback;
  }

  function toBool(v) {
    if (typeof v === "boolean") return v;
    const s = String(v || "").toLowerCase().trim();
    return s === "true" || s === "1" || s === "yes";
  }

  // ---- تحويل مريض من نموذج التطبيق -> نموذج الشيت
  function toSheetPatient(p) {
    const out = {};

    // مفاتيح عامة
    out["id"]        = pickFirst(p, ["id"], "");
    out["section"]   = pickFirst(p, ["section", "ui.currentSection"], "");
    out["done"]      = toBool(pickFirst(p, ["done", "status.done"], false));
    out["updatedAt"] = pickFirst(p, ["updatedAt", "meta.updatedAt"], "");

    // Bio (الأسماء حرفيًا)
    out["Patient Code"]        = pickFirst(p, ['Patient Code', 'patientCode', 'bio.patientCode'], "");
    out["Patient Name"]        = pickFirst(p, ['Patient Name', 'patientName', 'bio.patientName'], "");
    out["Patient Age"]         = pickFirst(p, ['Patient Age', 'patientAge', 'bio.patientAge', 'age'], "");
    out["Room"]                = pickFirst(p, ['Room', 'bio.room'], "");
    out["Admitting Provider"]  = pickFirst(p, ['Admitting Provider', 'bio.admittingProvider'], "");
    out["Cause Of Admission"]  = pickFirst(p, ['Cause Of Admission', 'bio.causeOfAdmission'], "");
    out["Diet"]                = pickFirst(p, ['Diet', 'bio.diet'], "");
    out["Isolation"]           = pickFirst(p, ['Isolation', 'bio.isolation'], "");
    out["Comments"]            = pickFirst(p, ['Comments', 'bio.comments'], "");

    // HPI
    out["hpi.cause"]   = pickFirst(p, ['hpi.cause', 'HPI.cause'], "");
    out["hpi.previous"]= pickFirst(p, ['hpi.previous', 'HPI.previous'], "");
    out["hpi.current"] = pickFirst(p, ['hpi.current', 'HPI.current'], "");
    out["hpi.initial"] = pickFirst(p, ['hpi.initial', 'HPI.initial'], "");

    // ESAS
    out["esas.Pain"]                = pickFirst(p, ['esas.Pain', 'esas.pain', 'ESAS.pain'], "");
    out["esas.Tiredness"]           = pickFirst(p, ['esas.Tiredness', 'esas.tiredness', 'ESAS.tiredness'], "");
    out["esas.Drowsiness"]          = pickFirst(p, ['esas.Drowsiness', 'esas.drowsiness', 'ESAS.drowsiness'], "");
    out["esas.Nausea"]              = pickFirst(p, ['esas.Nausea', 'esas.nausea', 'ESAS.nausea'], "");
    out["esas.Lack of Appetite"]    = pickFirst(p, ['esas.Lack of Appetite', 'esas.lackOfAppetite', 'ESAS.lackOfAppetite'], "");
    out["esas.Shortness of Breath"] = pickFirst(p, ['esas.Shortness of Breath', 'esas.shortnessOfBreath', 'ESAS.shortnessOfBreath'], "");
    out["esas.Depression"]          = pickFirst(p, ['esas.Depression', 'esas.depression', 'ESAS.depression'], "");
    out["esas.Anxiety"]             = pickFirst(p, ['esas.Anxiety', 'esas.anxiety', 'ESAS.anxiety'], "");
    out["esas.Wellbeing"]           = pickFirst(p, ['esas.Wellbeing', 'esas.wellbeing', 'ESAS.wellbeing'], "");

    // CTCAE
    out["ctcae.enabled"]               = toBool(pickFirst(p, ['ctcae.enabled', 'ctcaeEnabled'], false));
    out["ctcae.diarrhea"]              = pickFirst(p, ['ctcae.diarrhea'], "");
    out["ctcae.constipation"]          = pickFirst(p, ['ctcae.constipation'], "");
    out["ctcae.mucositis"]             = pickFirst(p, ['ctcae.mucositis'], "");
    out["ctcae.peripheral_neuropathy"] = pickFirst(p, ['ctcae.peripheral_neuropathy', 'ctcae.peripheralNeuropathy'], "");
    out["ctcae.sleep_disturbance"]     = pickFirst(p, ['ctcae.sleep_disturbance', 'ctcae.sleepDisturbance'], "");
    out["ctcae.xerostomia"]            = pickFirst(p, ['ctcae.xerostomia'], "");
    out["ctcae.dysphagia"]             = pickFirst(p, ['ctcae.dysphagia'], "");
    out["ctcae.odynophagia"]           = pickFirst(p, ['ctcae.odynophagia'], "");

    // Labs
    out["labs.WBC"]                    = pickFirst(p, ['labs.WBC', 'labs.wbc'], "");
    out["labs.HGB"]                    = pickFirst(p, ['labs.HGB', 'labs.hgb'], "");
    out["labs.PLT"]                    = pickFirst(p, ['labs.PLT', 'labs.plt'], "");
    out["labs.ANC"]                    = pickFirst(p, ['labs.ANC', 'labs.anc'], "");
    out["labs.CRP"]                    = pickFirst(p, ['labs.CRP', 'labs.crp'], "");
    out["labs.Albumin"]                = pickFirst(p, ['labs.Albumin', 'labs.albumin'], "");
    out["labs.Sodium (Na)"]            = pickFirst(p, ['labs.Sodium (Na)', 'labs.na'], "");
    out["labs.Potassium (K)"]          = pickFirst(p, ['labs.Potassium (K)', 'labs.k'], "");
    out["labs.Chloride (Cl)"]          = pickFirst(p, ['labs.Chloride (Cl)', 'labs.cl'], "");
    out["labs.Calcium (Ca)"]           = pickFirst(p, ['labs.Calcium (Ca)', 'labs.ca'], "");
    out["labs.Phosphorus (Ph)"]        = pickFirst(p, ['labs.Phosphorus (Ph)', 'labs.ph'], "");
    out["labs.Alkaline Phosphatase (ALP)"] = pickFirst(p, ['labs.Alkaline Phosphatase (ALP)', 'labs.alp'], "");
    out["labs.Creatinine (Scr)"]       = pickFirst(p, ['labs.Creatinine (Scr)', 'labs.scr'], "");
    out["labs.BUN"]                    = pickFirst(p, ['labs.BUN', 'labs.bun'], "");
    out["labs.Total Bile"]             = pickFirst(p, ['labs.Total Bile', 'labs.totalBile'], "");
    out["labs.Other"]                  = pickFirst(p, ['labs.Other', 'labs.other'], "");
    out["labs.crpTrend"]               = pickFirst(p, ['labs.crpTrend'], "");
    out["labs.other"]                  = pickFirst(p, ['labs.other'], "");

    // Notes
    out["latestNotes"]      = pickFirst(p, ['latestNotes', 'notes.latest', 'notes'], "");
    out["patientAssessment"]= pickFirst(p, ['patientAssessment', 'notes.assessment'], "");
    out["medicationList"]   = pickFirst(p, ['medicationList', 'notes.medications'], "");

    return out;
  }

  // من سطر الشيت (مسطّح) -> كائن للتطبيق (نُبقي المسطّح ونضيف camelCase)
  function fromSheetPatient(row) {
    const p = { ...(row || {}) };

    // مفاتيح camelCase المساعدة (لا تغيّر شغلك الحالي؛ بس تسهّل الوصول)
    p.patientCode = p["Patient Code"] ?? p.patientCode;
    p.patientName = p["Patient Name"] ?? p.patientName;
    p.patientAge  = p["Patient Age"] ?? p.patientAge;
    p.room        = p["Room"] ?? p.room;

    // مجموعات منطقية إن حبيت تستخدمها في الواجهة
    p.bio = {
      patientCode: p["Patient Code"] || "",
      patientName: p["Patient Name"] || "",
      patientAge:  p["Patient Age"]  || "",
      room:        p["Room"]         || "",
      admittingProvider: p["Admitting Provider"] || "",
      causeOfAdmission: p["Cause Of Admission"]  || "",
      diet: p["Diet"] || "",
      isolation: p["Isolation"] || "",
      comments: p["Comments"] || ""
    };

    p.hpi = {
      cause:   p["hpi.cause"]   || "",
      previous:p["hpi.previous"]|| "",
      current: p["hpi.current"] || "",
      initial: p["hpi.initial"] || ""
    };

    p.esas = {
      pain: p["esas.Pain"] || "",
      tiredness: p["esas.Tiredness"] || "",
      drowsiness: p["esas.Drowsiness"] || "",
      nausea: p["esas.Nausea"] || "",
      lackOfAppetite: p["esas.Lack of Appetite"] || "",
      shortnessOfBreath: p["esas.Shortness of Breath"] || "",
      depression: p["esas.Depression"] || "",
      anxiety: p["esas.Anxiety"] || "",
      wellbeing: p["esas.Wellbeing"] || ""
    };

    p.ctcae = {
      enabled: !!p["ctcae.enabled"],
      diarrhea: p["ctcae.diarrhea"] || "",
      constipation: p["ctcae.constipation"] || "",
      mucositis: p["ctcae.mucositis"] || "",
      peripheralNeuropathy: p["ctcae.peripheral_neuropathy"] || "",
      sleepDisturbance: p["ctcae.sleep_disturbance"] || "",
      xerostomia: p["ctcae.xerostomia"] || "",
      dysphagia: p["ctcae.dysphagia"] || "",
      odynophagia: p["ctcae.odynophagia"] || ""
    };

    p.labs = {
      WBC: p["labs.WBC"] || "",
      HGB: p["labs.HGB"] || "",
      PLT: p["labs.PLT"] || "",
      ANC: p["labs.ANC"] || "",
      CRP: p["labs.CRP"] || "",
      Albumin: p["labs.Albumin"] || "",
      na: p["labs.Sodium (Na)"] || "",
      k:  p["labs.Potassium (K)"] || "",
      cl: p["labs.Chloride (Cl)"] || "",
      ca: p["labs.Calcium (Ca)"] || "",
      ph: p["labs.Phosphorus (Ph)"] || "",
      alp: p["labs.Alkaline Phosphatase (ALP)"] || "",
      scr: p["labs.Creatinine (Scr)"] || "",
      bun: p["labs.BUN"] || "",
      totalBile: p["labs.Total Bile"] || "",
      other: p["labs.Other"] || "",
      crpTrend: p["labs.crpTrend"] || ""
    };

    p.notes = {
      latest: p["latestNotes"] || "",
      assessment: p["patientAssessment"] || "",
      medications: p["medicationList"] || ""
    };

    return p;
  }

  window.PR_MAP = { toSheetPatient, fromSheetPatient };
})();