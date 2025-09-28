/**
 * app_gas.js — Bootstrap + Merge-by-updatedAt + Mapping
 */
(function () {
  if (window.PR_GAS) return;

  const PR_GAS = {
    ready: false,

    async bootstrap() {
      try {
        safeRestoreLocal();

        const [srvPatients, srvReminders, srvSettings, srvUI] = await Promise.all([
          safeList(PatientsAPI, "list"),
          safeList(RemindersAPI, "list"),
          safeGet(SettingsAPI, "get"),
          safeGet(UIAPI, "get"),
        ]);

        const st = getState();

        // حوّل سطور السيرفر إلى نموذج التطبيق
        const srvPatientsApp = (srvPatients || []).map(PR_MAP.fromSheetPatient);

        // دمج مرضى حسب updatedAt
        st.patients = mergePatientsByUpdatedAt(st.patients || [], srvPatientsApp || []);

        // Reminders: نفضّل السيرفر عند التعارض
        st.reminders = mergeRemindersPreferServer(st.reminders || [], srvReminders || []);

        // Settings/UI: دمج حقل بحقل، السيرفر يطغى عند وجود قيمة
        st.settings = mergeObjFieldsPreferServer(st.settings || {}, srvSettings || {});
        st.ui       = mergeObjFieldsPreferServer(st.ui || {}, srvUI || {});

        persist("patients", "reminders", "settings", "ui");
        renderAll();
        this.ready = true;
        console.log("[PR_GAS] bootstrap done.");

        // Seed تلقائي: لو السيرفر فاضي ومحليًا فيه مرضى
        if ((srvPatients || []).length === 0 && (st.patients || []).length > 0) {
          console.log("[PR_GAS] server empty — seeding local patients to Google Sheet…");
          try { await PR_AUTOSYNC.seedAll(); } catch (e) { console.warn("seedAll failed:", e); }
        }
      } catch (err) {
        console.error("[PR_GAS.bootstrap] failed:", err);
        renderAll();
      }
    },

    async upsertPatient(patient) {
      const payload = PR_MAP.toSheetPatient(patient);
      const res = await PatientsAPI.save(payload);
      const id = res?.id || patient?.id;

      const st = getState();
      const arr = st.patients || (st.patients = []);
      const ix = arr.findIndex(p => String(p.id) === String(id));
      const merged = { ...(ix >= 0 ? arr[ix] : {}), ...patient, id };
      if (ix >= 0) arr[ix] = merged; else arr.unshift(merged);
      persist("patients"); renderAll();
      return { ok: true, id };
    },

    async deletePatient(id) {
      if (!id) throw new Error("deletePatient: missing id");
      await PatientsAPI.remove(id);
      const st = getState();
      st.patients = (st.patients || []).filter(p => String(p.id) !== String(id));
      st.reminders = (st.reminders || []).filter(r => String(r.forPatientId || "") !== String(id));
      persist("patients","reminders"); renderAll();
      return { ok: true };
    },

    async upsertReminder(rem) {
      const res = await RemindersAPI.save(rem);
      const id = res?.id || rem?.id;
      const st = getState();
      const arr = st.reminders || (st.reminders = []);
      const ix = arr.findIndex(r => String(r.id) === String(id));
      const merged = { ...(ix >= 0 ? arr[ix] : {}), ...rem, id };
      if (ix >= 0) arr[ix] = merged; else arr.unshift(merged);
      persist("reminders"); renderAll();
      return { ok: true, id };
    },

    async deleteReminder(id) {
      if (!id) throw new Error("deleteReminder: missing id");
      await RemindersAPI.remove(id);
      const st = getState();
      st.reminders = (st.reminders || []).filter(r => String(r.id) !== String(id));
      persist("reminders"); renderAll();
      return { ok: true };
    },

    async saveSettings(obj) {
      await SettingsAPI.save(obj || {});
      const st = getState();
      st.settings = { ...(st.settings || {}), ...(obj || {}) };
      persist("settings"); renderAll();
      return { ok: true };
    },

    async saveUI(obj) {
      await UIAPI.save(obj || {});
      const st = getState();
      st.ui = { ...(st.ui || {}), ...(obj || {}) };
      persist("ui"); renderAll();
      return { ok: true };
    },
  };

  window.PR_GAS = PR_GAS;

  // ===== Helpers =====
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
  function persist(...keys) { try { PR.state?.persist?.(...keys); } catch (e) { console.warn("[PR_GAS] persist warn:", e); } }
  function renderAll() { try { PR.ui?.renderAll?.(); } catch (e) { console.warn("[PR_GAS] renderAll warn:", e); } }
  function safeRestoreLocal() { try { PR.state?.restore?.(); } catch {} }
  async function safeList(api, fn) { try { return await api[fn](); } catch (e) { console.warn(fn+" failed:", e); return []; } }
  async function safeGet(api, fn)  { try { return await api[fn](); } catch (e) { console.warn(fn+" failed:", e); return {}; } }

  function tsToMs(s){ if(!s) return 0; try{ return new Date(String(s).replace(" ","T")).getTime()||0;}catch{return 0;} }
  function mergePatientsByUpdatedAt(localList, serverList) {
    const L = indexById(localList), S = indexById(serverList);
    const ids = new Set([...Object.keys(L), ...Object.keys(S)]);
    const out = [];
    ids.forEach(id => {
      const a = L[id], b = S[id];
      if (a && b) out.push( tsToMs(b.updatedAt) > tsToMs(a.updatedAt) ? b : a );
      else if (b) out.push(b);
      else if (a) out.push(a);
    });
    out.sort((x,y)=>tsToMs(y.updatedAt)-tsToMs(x.updatedAt));
    return out;
  }
  function mergeRemindersPreferServer(localList, serverList){
    const L=indexById(localList), S=indexById(serverList);
    const ids=new Set([...Object.keys(L),...Object.keys(S)]), out=[];
    ids.forEach(id=>{ const a=L[id], b=S[id]; if(a&&b) out.push(b); else if(b) out.push(b); else if(a) out.push(a); });
    return out;
  }
  function mergeObjFieldsPreferServer(localObj, serverObj){
    const out={...(localObj||{})};
    Object.keys(serverObj||{}).forEach(k=>{
      const v=serverObj[k];
      if(v!==undefined && v!==null && String(v).trim()!=="") out[k]=v;
    });
    return out;
  }
  function indexById(list){ const m={}; (list||[]).forEach(x=>{ const id=String(x?.id||"").trim(); if(id) m[id]=x; }); return m; }

  document.addEventListener("DOMContentLoaded", () => PR_GAS.bootstrap());
})();