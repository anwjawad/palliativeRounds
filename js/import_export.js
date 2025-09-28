/* ------------------------------------------------------
 Palliative Rounds — import_export.js
 CSV import/export + PDF handoff + FULL JSON import/export (auto-injected UI)
 CSV import asks for a Section for the newly imported rows
 JSON import supports MERGE (OK) or REPLACE (Cancel)
-------------------------------------------------------*/
(function () {
  const U = PR.utils;
  const S = PR.state;
  const { HOSPITAL_HEADERS } = PR.constants;

  /* =====================================================
     UI INJECTION (JSON controls) — no edits to index.html/ui.js needed
  ===================================================== */
  function injectJSONControls() {
    const exportPDF = document.getElementById("exportPDF");
    if (!exportPDF || exportPDF.dataset.jsonInjected) return;

    // Hidden input for JSON import
    const jsonInput = document.createElement("input");
    jsonInput.type = "file";
    jsonInput.accept = ".json,application/json";
    jsonInput.id = "jsonImport";
    jsonInput.style.display = "none";

    // Visible buttons
    const exportBtn = document.createElement("button");
    exportBtn.id = "exportJSON";
    exportBtn.className = "btn";
    exportBtn.textContent = "Export JSON";

    const importLbl = document.createElement("label");
    importLbl.className = "btn";
    importLbl.setAttribute("for", "jsonImport");
    importLbl.textContent = "Import JSON";

    // Insert next to Export PDF
    const container = exportPDF.parentNode || document.body;
    container.insertBefore(jsonInput, exportPDF.nextSibling);
    container.insertBefore(exportBtn, jsonInput.nextSibling);
    container.insertBefore(importLbl, exportBtn.nextSibling);

    // Wire events
    jsonInput.addEventListener("change", onJSONImportFileChosen);
    exportBtn.addEventListener("click", () => document.dispatchEvent(new Event("json:export")));

    exportPDF.dataset.jsonInjected = "1";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectJSONControls);
  } else {
    injectJSONControls();
  }

  /* ===================== Small helpers ===================== */
  function sameHeaders(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function resetFile(input) {
    try { input.value = ""; } catch {}
  }
  function toISO(d) {
    if (!d) return null;
    try { return new Date(d).toISOString(); } catch { return null; }
  }
  function newer(a, b) {
    // returns true if a is newer than b by ISO date
    const ia = toISO(a), ib = toISO(b);
    if (!ib && ia) return true;
    if (!ia && ib) return false;
    if (!ia && !ib) return false;
    return ia > ib;
  }
  function getPatientKey(p) {
    return (
      p?.id ||
      p?.bio?.["Patient Code"] ||
      p?.bio?.["Patient ID"] ||
      p?.bio?.["MRN"] ||
      p?.bio?.["Patient Name"] ||
      p?.bio?.name ||
      null
    );
  }
  function cryptoSafeHash(obj) {
    // light, stable-ish hash if no key found
    try {
      const str = JSON.stringify(obj);
      let h = 0, i, chr;
      for (i = 0; i < str.length; i++) {
        chr = str.charCodeAt(i);
        h = (h << 5) - h + chr;
        h |= 0;
      }
      return "h" + Math.abs(h);
    } catch {
      return "h" + Math.floor(Math.random() * 1e9);
    }
  }
  function arrayDedupeBy(arr, keyFn) {
    const map = new Map();
    for (const x of arr || []) {
      try {
        const k = keyFn(x);
        if (!map.has(k)) map.set(k, x);
        else {
          const prev = map.get(k);
          const ua = x?.updatedAt || x?.date || x?.timestamp;
          const ub = prev?.updatedAt || prev?.date || prev?.timestamp;
          map.set(k, newer(ua, ub) ? x : prev);
        }
      } catch { /* ignore */ }
    }
    return Array.from(map.values());
  }
  function mergeArraysByDate(a = [], b = []) {
    return arrayDedupeBy([...(a || []), ...(b || [])], (x) =>
      x?.id || x?.code || x?.name || x?.date || JSON.stringify(x)
    );
  }

  /* ===================== CSV IMPORT ===================== */
  document.addEventListener("csv:import", () => {
    const input = document.getElementById("csvImport");
    if (!input || !input.files || !input.files[0]) {
      U.toast("No CSV file selected.", "warn");
      return;
    }
    const file = input.files[0];
    if (!/\.csv$/i.test(file.name)) {
      U.toast("Please select a .csv file.", "warn");
      return resetFile(input);
    }

    // Capture existing keys BEFORE import (to detect newly added patients)
    const preKeys = new Set((S.state.patients || []).map((p) => getPatientKey(p) || cryptoSafeHash(p)));

    // Ask user which Section to assign the NEWLY imported rows to
    const defaultSection =
      (S.state?.ui?.currentSection) ||
      (S.state?.settings?.defaultSection) ||
      "";
    const chosenSection = window.prompt(
      "Import CSV: which Section should the NEW patients be assigned to?\n" +
      "- Leave blank to keep whatever section the app assigns.\n" +
      "- Example: A, B, Oncology, ICU, ...",
      defaultSection
    );
    // NOTE: if user cancels prompt (returns null), we still proceed with import but without forcing a section.

    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => (h || "").trim(),
      complete: (res) => {
        try {
          const { data, meta } = res;
          const incoming = (meta.fields || []).map((h) => h.trim());
          const required = [...HOSPITAL_HEADERS];
          if (!sameHeaders(incoming, required)) {
            const expectedPreview = required.join(" | ");
            const gotPreview = incoming.join(" | ");
            U.toast(
              `CSV headers must match exactly.\nExpected:\n${expectedPreview}\nReceived:\n${gotPreview}`,
              "error",
              6500
            );
            return resetFile(input);
          }
          const rows = data
            .map((row) => {
              const obj = {};
              required.forEach((h) => (obj[h] = (row[h] ?? "").toString().trim()));
              const hasAny = Object.values(obj).some((v) => v !== "");
              return hasAny ? obj : null;
            })
            .filter(Boolean);

          if (!rows.length) {
            U.toast("CSV has no usable rows.", "warn");
            return resetFile(input);
          }

          const importedCount = S.importRows(rows);

          // Assign SECTION to only the newly added patients
          const sectionToApply = (chosenSection || "").trim();
          if (sectionToApply) {
            const nowISO = new Date().toISOString();
            let applied = 0;
            for (const p of S.state.patients || []) {
              const key = getPatientKey(p) || cryptoSafeHash(p);
              if (!preKeys.has(key)) {
                p.section = sectionToApply;
                // update freshness
                p.updatedAt = newer(nowISO, p.updatedAt) ? nowISO : p.updatedAt;
                applied++;
              }
            }
            if (applied > 0) {
              // notify UI listeners
              S.emit("patients:changed", S.state.patients);
            }
          }

          // Done
          U.toast(`Imported ${importedCount} patient(s).${(chosenSection && chosenSection.trim()) ? ` Section: ${chosenSection.trim()}` : ""}`, "success");
          resetFile(input);
        } catch (err) {
          console.error(err);
          U.toast("Failed to import CSV.", "error");
          resetFile(input);
        } finally {
          // Persist after any changes
          try { S.persist(); } catch {}
        }
      },
      error: (err) => {
        console.error(err);
        U.toast("Could not parse CSV file.", "error");
        resetFile(input);
      },
    });
  });

  /* ===================== CSV EXPORT ===================== */
  document.addEventListener("csv:export", () => {
    try {
      const rows = S.exportRows();
      const csv = Papa.unparse(rows, { columns: HOSPITAL_HEADERS, header: true });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `patients_${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      U.toast("CSV exported.", "success");
    } catch (e) {
      console.error(e);
      U.toast("Failed to export CSV.", "error");
    }
  });

  /* ===================== PDF EXPORT (handoff) ===================== */
  document.addEventListener("pdf:export", () => {
    try {
      if (PR.reports && typeof PR.reports.exportPDF === "function") {
        PR.reports.exportPDF();
      } else {
        quickRosterPDF();
      }
    } catch (e) {
      console.error(e);
      U.toast("Failed to export PDF.", "error");
    }
  });

  function quickRosterPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      U.toast("PDF library not available.", "error");
      return;
    }
    const doc = new window.jspdf.jsPDF({ unit: "pt" });
    const margin = 40;
    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Palliative Rounds — Patient Roster", margin, y);
    y += 24;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const pts = PR.state.state.patients;
    if (!pts.length) {
      doc.text("No patients.", margin, y);
    } else {
      pts
        .slice()
        .sort((a, b) => (a?.bio?.["Patient Name"] || "").localeCompare(b?.bio?.["Patient Name"] || ""))
        .forEach((p) => {
          const line = `${p?.bio?.["Patient Code"] || "—"} — ${p?.bio?.["Patient Name"] || "—"} — Room ${
            p?.bio?.["Room"] || "—"
          } — Section ${p?.section || "—"} — Updated ${p?.updatedAt || "—"}`;
          const lines = doc.splitTextToSize(line, doc.internal.pageSize.getWidth() - margin * 2);
          if (y + lines.length * 16 > doc.internal.pageSize.getHeight() - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(lines, margin, y);
          y += lines.length * 16 + 6;
        });
    }
    const stamp = new Date().toISOString().slice(0, 10);
    doc.save(`patients_roster_${stamp}.pdf`);
    U.toast("PDF exported.", "success");
  }

  /* ===================== JSON EXPORT ===================== */
  document.addEventListener("json:export", () => {
    try {
      const snapshot = {
        patients: S.state.patients,
        reminders: S.state.reminders,
        settings: S.state.settings,
        ui: S.state.ui,
        _meta: { app: "PalliativeRounds", version: 1, exportedAt: new Date().toISOString() },
      };
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `palliative_rounds_${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      U.toast("JSON exported.", "success");
    } catch (e) {
      console.error(e);
      U.toast("Failed to export JSON.", "error");
    }
  });

  /* ===================== JSON IMPORT (MERGE or REPLACE) ===================== */
  function onJSONImportFileChosen() {
    const input = document.getElementById("jsonImport");
    if (!input || !input.files || !input.files[0]) {
      U.toast("No JSON file selected.", "warn");
      return;
    }
    const file = input.files[0];
    if (!/\.json$/i.test(file.name)) {
      U.toast("Please select a .json file.", "warn");
      return resetFile(input);
    }

    // Prompt user: OK = MERGE, Cancel = REPLACE
    const doMerge = window.confirm(
      "Import mode:\n\nOK = MERGE into existing data (safe)\nCancel = REPLACE everything with file contents"
    );

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result || "{}");
        if (!parsed || typeof parsed !== "object") throw new Error("Invalid JSON root.");
        const incoming = {
          patients: Array.isArray(parsed.patients) ? parsed.patients : [],
          reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
          settings: typeof parsed.settings === "object" && parsed.settings ? parsed.settings : {},
          ui: typeof parsed.ui === "object" && parsed.ui ? parsed.ui : {},
        };

        incoming.patients = incoming.patients.map((p) => S.ensureSchema(p));

        if (doMerge) {
          mergeIntoState(incoming);
        } else {
          replaceState(incoming);
        }

        S.persist(); // save all keys + trigger any cloud saves if enabled

        // refresh UI listeners
        S.emit("patients:changed", S.state.patients);
        S.emit("reminders:changed", S.state.reminders);
        S.emit("settings:changed", S.state.settings);
        S.emit("section:changed", S.state.ui.currentSection);
        S.emit("current:changed", S.getCurrentPatient());

        U.toast(doMerge ? "JSON merged successfully." : "JSON imported (replaced) successfully.", "success");
      } catch (e) {
        console.error(e);
        U.toast("Failed to import JSON.", "error");
      } finally {
        resetFile(input);
      }
    };
    reader.onerror = () => {
      U.toast("Could not read JSON file.", "error");
      resetFile(input);
    };
    reader.readAsText(file);
  }

  /* ===================== Replace logic ===================== */
  function replaceState(incoming) {
    S.state.patients = incoming.patients;
    S.state.reminders = incoming.reminders;
    S.state.settings = { ...S.state.settings, ...incoming.settings };
    S.state.ui = { ...S.state.ui, ...incoming.ui };
  }

  /* ===================== Merge logic ===================== */
  function mergeIntoState(incoming) {
    // ---- Patients
    const byKey = new Map();
    const curr = (S.state.patients || []).map((p) => S.ensureSchema(p));
    for (const p of curr) {
      const k = getPatientKey(p) || cryptoSafeHash(p);
      byKey.set(k, p);
    }
    for (const newP0 of incoming.patients || []) {
      const newP = S.ensureSchema(newP0);
      const k = getPatientKey(newP) || cryptoSafeHash(newP);
      const oldP = byKey.get(k);
      if (!oldP) {
        byKey.set(k, newP);
        continue;
      }
      const takeIncoming = newer(newP.updatedAt, oldP.updatedAt);

      const merged = takeIncoming ? { ...oldP, ...newP } : { ...newP, ...oldP };

      // Merge known list-like fields safely (dedupe by id/date)
      merged.labs = mergeArraysByDate(oldP.labs, newP.labs);
      merged.ctcae = mergeArraysByDate(oldP.ctcae, newP.ctcae);
      merged.esas = mergeArraysByDate(oldP.esas, newP.esas);
      merged.attachments = mergeArraysByDate(oldP.attachments, newP.attachments);
      merged.timeline = mergeArraysByDate(oldP.timeline, newP.timeline);
      merged.meds = mergeArraysByDate(oldP.meds, newP.meds);
      merged.notes = mergeArraysByDate(oldP.notes, newP.notes);

      merged.bio = mergeObjectByFreshness(oldP.bio, newP.bio);
      merged.hpi = mergeObjectByFreshness(oldP.hpi, newP.hpi);
      merged.vitals = mergeObjectByFreshness(oldP.vitals, newP.vitals);

      if (takeIncoming) {
        merged.section = newP.section ?? oldP.section;
        merged.current = newP.current ?? oldP.current;
      } else {
        merged.section = oldP.section ?? newP.section;
        merged.current = oldP.current ?? newP.current;
      }

      merged.updatedAt = newer(newP.updatedAt, oldP.updatedAt) ? newP.updatedAt : oldP.updatedAt;

      byKey.set(k, merged);
    }
    S.state.patients = Array.from(byKey.values());

    // ---- Reminders
    S.state.reminders = arrayDedupeBy(
      [...(S.state.reminders || []), ...(incoming.reminders || [])],
      (r) => r?.id || r?.text || r?.due || JSON.stringify(r)
    );

    // ---- Settings/UI (shallow merge, prefer incoming values)
    S.state.settings = { ...(S.state.settings || {}), ...(incoming.settings || {}) };
    S.state.ui = { ...(S.state.ui || {}), ...(incoming.ui || {}) };
  }

  function mergeObjectByFreshness(a, b) {
    if (!a && !b) return {};
    if (!a) return { ...b };
    if (!b) return { ...a };
    const out = { ...a };
    for (const k of Object.keys(b)) {
      const va = a[k], vb = b[k];
      const ua = (va && va.updatedAt) || (a.updatedAt);
      const ub = (vb && vb.updatedAt) || (b.updatedAt);
      out[k] = newer(ub, ua) ? vb : (va ?? vb);
    }
    out.updatedAt = newer(b.updatedAt, a.updatedAt) ? b.updatedAt : a.updatedAt;
    return out;
  }
})();