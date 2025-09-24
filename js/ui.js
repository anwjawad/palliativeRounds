/* ------------------------------------------------------
   Palliative Rounds — ui.js
   View rendering + core UI interactions (no data logic)
-------------------------------------------------------*/

(function () {
  const U = PR.utils;
  const S = PR.state;
  const C = PR.constants;

  /* ---------- Cache DOM ---------- */
  const el = {
    tabs: U.$(".tabs"),
    tabBtns: U.$$(".tab"),
    patientSearch: U.$("#patientSearch"),
    patientList: U.$("#patientList"),
    progressPct: U.$("#progressPct"),
    progressFill: U.$("#progressFill"),

    // center pane
    currentPatientName: U.$("#currentPatientName"),
    editPatientBtn: U.$("#editPatientBtn"),
    markDoneBtn: U.$("#markDoneBtn"),
    reminderBtn: U.$("#reminderBtn"),

    // bio cards
    bioCode: U.$("#bioCode"),
    bioName: U.$("#bioName"),
    bioAge: U.$("#bioAge"),
    bioRoom: U.$("#bioRoom"),
    bioProvider: U.$("#bioProvider"),
    bioCOA: U.$("#bioCOA"),
    bioDiet: U.$("#bioDiet"),
    bioIso: U.$("#bioIso"),
    bioComments: U.$("#bioComments"),

    // HPI card
    hpiCause: U.$("#hpiCause"),
    hpiPrevTx: U.$("#hpiPrevTx"),
    hpiCurrTx: U.$("#hpiCurrTx"),
    hpiInit: U.$("#hpiInit"),

    // ESAS summary
    esasSummary: U.$("#esasSummary"),

    // CTCAE summary and toggle
    ctcaeSummary: U.$("#ctcaeSummary"),
    toggleCTCAE: U.$("#toggleCTCAE"),

    // Labs groups
    labsGroup1: U.$("#labsGroup1"),
    labsGroup2: U.$("#labsGroup2"),
    labsGroup3: U.$("#labsGroup3"),

    latestNotes: U.$("#latestNotes"),

    // Quick actions (right)
    includeBiographical: U.$("#includeBiographical"),
    includeHPI: U.$("#includeHPI"),
    includeESAS: U.$("#includeESAS"),
    includeCTCAE: U.$("#includeCTCAE"),
    includeLabs: U.$("#includeLabs"),
    generateReport: U.$("#generateReport"),

    // Topbar actions
    addQuickPatient: U.$("#addQuickPatient"),
    csvImport: U.$("#csvImport"),
    ocrOpen: U.$("#ocrOpen"),
    exportCSV: U.$("#exportCSV"),
    exportPDF: U.$("#exportPDF"),
    openSettings: U.$("#openSettings"),

    // Modals
    modalQuickPatient: U.$("#modalQuickPatient"),
    modalUpdate: U.$("#modalUpdate"),
    modalOCR: U.$("#modalOCR"),
    modalSettings: U.$("#modalSettings"),

    // Quick add form (subset)
    qpCode: U.$("#qpCode"),
    qpName: U.$("#qpName"),
    qpAge: U.$("#qpAge"),
    qpRoom: U.$("#qpRoom"),
    qpProvider: U.$("#qpProvider"),
    qpCOA: U.$("#qpCOA"),
    qpDiet: U.$("#qpDiet"),
    qpIso: U.$("#qpIso"),
    qpComments: U.$("#qpComments"),
    qpSave: U.$("#qpSave"),

    // Update modal key fields (HPI only; ESAS/CTCAE/Labs managed in their files)
    hpiCauseInput: U.$("#hpiCauseInput"),
    hpiPrevTxInput: U.$("#hpiPrevTxInput"),
    hpiCurrTxInput: U.$("#hpiCurrTxInput"),
    hpiInitInput: U.$("#hpiInitInput"),

    // Preferences
    themeSelect: U.$("#themeSelect"),
    fontSizeSelect: U.$("#fontSizeSelect"),
    saveSettings: U.$("#saveSettings"),

    // New additions for requested features
    clearSectionBtn: U.$("#clearSectionBtn"),
  };

  /* ---------- Section Names (rename tabs, local persistence only) ---------- */
  const SECTION_NAMES_KEY = "section_names";
  function loadSectionNames() {
    return PR.utils.load(SECTION_NAMES_KEY, { A: "Section A", B: "Section B", C: "Section C" }) || { A: "Section A", B: "Section B", C: "Section C" };
  }
  function saveSectionNames(map) {
    PR.utils.save(SECTION_NAMES_KEY, map);
  }
  function applySectionNames() {
    const names = loadSectionNames();
    el.tabBtns.forEach((btn) => {
      const code = btn.dataset.section;
      const name = names[code] || `Section ${code}`;
      // keep the icon, replace the text after it
      btn.innerHTML = `<i class="fa-solid fa-layer-group"></i> ${PR.utils.esc(name)}`;
    });
  }

  /* ---------- Init ---------- */
  function init() {
    bindGlobalEvents();
    S.on("restored", renderAll);
    S.on("patients:changed", () => {
      renderPatientList();
      renderProgress();
    });
    S.on("section:changed", () => {
      highlightActiveTab();
      renderPatientList();
      renderProgress();
    });
    S.on("current:changed", renderCurrentPatient);
    S.on("patient:updated", () => {
      renderCurrentPatient();
      renderPatientList(); // meta can change
    });
    S.on("settings:changed", applySettings);
    S.on("reminders:changed", () => {
      // right pane updated by reminders.js; no-op here
    });

    // apply existing preferences immediately
    applySettings(S.state.settings);
    // apply custom section names (non-invasive)
    applySectionNames();

    // initial draws
    renderAll();
  }

  function renderAll() {
    highlightActiveTab();
    renderPatientList();
    renderProgress();
    renderCurrentPatient();
  }

  /* ---------- Events ---------- */
  function bindGlobalEvents() {
    // Tabs (switch section)
    U.on(el.tabs, "click", ".tab", function () {
      const section = this.dataset.section;
      S.setUI({ currentSection: section, search: "" });
      el.patientSearch.value = "";
    });

    // Rename section on double-click (pure UI; persisted locally)
    U.on(el.tabs, "dblclick", ".tab", function () {
      const code = this.dataset.section;
      const names = loadSectionNames();
      const current = names[code] || `Section ${code}`;
      const next = window.prompt("Rename section:", current);
      if (!next) return;
      names[code] = next.trim() || current;
      saveSectionNames(names);
      applySectionNames();
      U.toast("Section renamed.", "success");
    });

    // Clear current section (delete all patients in that section)
    el.clearSectionBtn?.addEventListener("click", () => {
      const sect = S.state.ui.currentSection;
      const pts = S.state.patients.filter((p) => p.section === sect);
      if (!pts.length) {
        U.toast("No patients to clear in this section.", "warn");
        return;
      }
      const ok = window.confirm(`Clear all patients in ${sect}? This cannot be undone.`);
      if (!ok) return;
      // remove one by one using existing state API (no logic changes)
      pts.map((p) => p.id).forEach((id) => S.removePatient(id));
      U.toast("Section cleared.", "success");
    });

    // Search
    el.patientSearch.addEventListener(
      "input",
      U.debounce((e) => {
        S.setUI({ search: e.target.value });
        renderPatientList();
      }, 150)
    );

    // Quick Add
    el.addQuickPatient.addEventListener("click", () => {
      resetQuickAddForm();
      U.openDialog(el.modalQuickPatient);
    });
    el.qpSave.addEventListener("click", (e) => {
      e.preventDefault();
      const bio = {
        "Patient Code": el.qpCode.value.trim(),
        "Patient Name": el.qpName.value.trim(),
        "Patient Age": el.qpAge.value.trim(),
        "Room": el.qpRoom.value.trim(),
        "Admitting Provider": el.qpProvider.value.trim(),
        "Cause Of Admission": el.qpCOA.value.trim(),
        "Diet": el.qpDiet.value.trim(),
        "Isolation": el.qpIso.value.trim(),
        "Comments": el.qpComments.value.trim(),
      };
      if (!bio["Patient Code"] || !bio["Patient Name"]) {
        U.toast("Please fill Patient Code & Patient Name.", "warn");
        return;
      }
      const id = S.addPatient({ bio, section: S.state.ui.currentSection });
      S.setCurrentPatient(id);
      U.closeDialog(el.modalQuickPatient);
      U.toast("Patient added.", "success");
    });

    // Open Update modal (populate basic HPI; other sections handled by their modules)
    el.editPatientBtn.addEventListener("click", () => {
      const p = S.getCurrentPatient();
      if (!p) return;
      el.hpiCauseInput.value = p.hpi.cause || "";
      el.hpiPrevTxInput.value = p.hpi.previous || "";
      el.hpiCurrTxInput.value = p.hpi.current || "";
      el.hpiInitInput.value = p.hpi.initial || "";
      U.openDialog(el.modalUpdate);
      // other modules (esas.js / ctcae.js / labs.js) will populate their areas on dialog open
      document.dispatchEvent(new CustomEvent("modal:update:open", { detail: { patientId: p.id } }));
    });

    // Mark done
    el.markDoneBtn.addEventListener("click", () => {
      const p = S.getCurrentPatient();
      if (!p) return;
      S.markDone(p.id, !p.done);
      U.toast(p.done ? "Marked as not done." : "Marked as done.", "success");
    });

    // Toggle CTCAE from summary card (enables inputs when opening Update modal too)
    el.toggleCTCAE.addEventListener("change", (e) => {
      const p = S.getCurrentPatient();
      if (!p) return;
      S.updatePatient(p.id, { ctcae: { ...p.ctcae, enabled: e.target.checked } });
      renderCTCAESummary(S.getCurrentPatient()); // refresh view
      U.toast(e.target.checked ? "CTCAE enabled." : "CTCAE disabled.", "success");
      el.includeCTCAE.checked = e.target.checked; // sync report option
    });

    // OCR modal
    el.ocrOpen.addEventListener("click", () => U.openDialog(el.modalOCR));

    // Import/Export (actual logic in import_export.js)
    el.csvImport.addEventListener("change", () =>
      document.dispatchEvent(new Event("csv:import"))
    );
    el.exportCSV.addEventListener("click", () =>
      document.dispatchEvent(new Event("csv:export"))
    );
    el.exportPDF.addEventListener("click", () =>
      document.dispatchEvent(new Event("pdf:export"))
    );

    // Report Generation (handled in reports.js; we just emit intent)
    el.generateReport.addEventListener("click", () => {
      const opts = {
        bio: el.includeBiographical.checked,
        hpi: el.includeHPI.checked,
        esas: el.includeESAS.checked,
        ctcae: el.includeCTCAE.checked,
        labs: el.includeLabs.checked,
      };
      document.dispatchEvent(new CustomEvent("report:generate", { detail: opts }));
    });

    // Settings
    el.openSettings.addEventListener("click", () => {
      const st = S.state.settings;
      el.themeSelect.value = st.theme;
      el.fontSizeSelect.value = st.fontSize;
      U.openDialog(el.modalSettings);
    });
    el.saveSettings.addEventListener("click", (e) => {
      e.preventDefault();
      S.setSettings({
        theme: el.themeSelect.value,
        fontSize: el.fontSizeSelect.value,
      });
      U.closeDialog(el.modalSettings);
      U.toast("Preferences saved.", "success");
    });

    // Patient list clicks (select / toggle done)
    U.on(el.patientList, "click", ".patient-item", function (e) {
      const id = this.dataset.id;
      S.setCurrentPatient(id);
      // if click on checkbox area, toggle done
      if (e.target.closest(".check")) {
        const p = S.getCurrentPatient();
        if (p) S.markDone(p.id, !p.done);
      }
    });

    // NEW: Delete a single patient (icon button)
    U.on(el.patientList, "click", ".delete-patient", function (e) {
      e.stopPropagation();
      const item = this.closest(".patient-item");
      const id = item?.dataset.id;
      if (!id) return;
      const p = S.state.patients.find((x) => x.id === id);
      const name = p?.bio?.["Patient Name"] || "this patient";
      const ok = window.confirm(`Delete ${name}? This cannot be undone.`);
      if (!ok) return;
      S.removePatient(id);
      U.toast("Patient removed.", "success");
    });
  }

  /* ---------- Rendering ---------- */
  function highlightActiveTab() {
    el.tabBtns.forEach((b) =>
      b.classList.toggle("active", b.dataset.section === S.state.ui.currentSection)
    );
  }

  function renderPatientList() {
    const pts = S.searchPatients(S.state.ui.search);
    el.patientList.innerHTML = "";
    if (!pts.length) {
      el.patientList.appendChild(
        U.h("li", { class: "muted", style: "padding:8px 4px;" }, "No patients yet.")
      );
      return;
    }
    const curId = S.state.ui.currentPatientId;
    pts.forEach((p) => {
      const rightMeta = U.h(
        "div",
        { class: "meta", style: "display:flex; align-items:center; gap:8px;" },
        [
          U.h("span", {}, p.updatedAt ? `Updated ${p.updatedAt}` : ""),
          U.h(
            "button",
            { class: "icon-btn delete-patient", title: "Delete patient" },
            U.h("i", { class: "fa-solid fa-trash" })
          ),
        ]
      );

      const li = U.h("li", { class: "patient-item", dataset: { id: p.id } }, [
        U.h(
          "div",
          { class: "check", title: p.done ? "Done" : "Mark as done" },
          p.done ? U.h("i", { class: "fa-solid fa-check" }) : null
        ),
        U.h("div", {}, [
          U.h("div", { class: "name" }, p.bio["Patient Name"] || "Unnamed"),
          U.h(
            "div",
            { class: "meta" },
            `${p.bio["Patient Code"] || "—"} • Room ${p.bio["Room"] || "—"}`
          ),
        ]),
        rightMeta,
      ]);
      if (p.done) li.classList.add("done");
      if (p.id === curId) li.classList.add("active");
      el.patientList.appendChild(li);
    });
  }

  function renderProgress() {
    const pct = S.progress();
    el.progressPct.textContent = `${pct}%`;
    el.progressFill.style.width = `${pct}%`;
  }

  function renderCurrentPatient() {
    const p = S.getCurrentPatient();

    const has = !!p;
    el.editPatientBtn.disabled = !has;
    el.markDoneBtn.disabled = !has;
    el.reminderBtn.disabled = !has;
    el.toggleCTCAE.disabled = !has;

    if (!p) {
      el.currentPatientName.textContent = "No patient selected";
      // wipe cards
      [
        el.bioCode, el.bioName, el.bioAge, el.bioRoom, el.bioProvider, el.bioCOA,
        el.bioDiet, el.bioIso, el.bioComments,
      ].forEach((n) => (n.textContent = "—"));
      el.hpiCause.textContent = "—";
      el.hpiPrevTx.textContent = "—";
      el.hpiCurrTx.textContent = "—";
      el.hpiInit.textContent = "—";
      el.esasSummary.innerHTML = "";
      el.ctcaeSummary.innerHTML =
        '<p class="muted">CTCAE is currently disabled. Toggle "Enable" to record grades.</p>';
      el.ctcaeSummary.classList.add("is-disabled");
      el.toggleCTCAE.checked = false;
      el.labsGroup1.innerHTML = "";
      el.labsGroup2.innerHTML = "";
      el.labsGroup3.innerHTML = "";
      el.latestNotes.textContent = "No notes yet.";
      return;
    }

    el.currentPatientName.textContent = p.bio["Patient Name"] || "Unnamed";

    // Bio
    el.bioCode.textContent = p.bio["Patient Code"] || "—";
    el.bioName.textContent = p.bio["Patient Name"] || "—";
    el.bioAge.textContent = p.bio["Patient Age"] || "—";
    el.bioRoom.textContent = p.bio["Room"] || "—";
    el.bioProvider.textContent = p.bio["Admitting Provider"] || "—";
    el.bioCOA.textContent = p.bio["Cause Of Admission"] || "—";
    el.bioDiet.textContent = p.bio["Diet"] || "—";
    el.bioIso.textContent = p.bio["Isolation"] || "—";
    el.bioComments.textContent = p.bio["Comments"] || "—";

    // HPI
    el.hpiCause.textContent = p.hpi.cause || "—";
    el.hpiPrevTx.textContent = p.hpi.previous || "—";
    el.hpiCurrTx.textContent = p.hpi.current || "—";
    el.hpiInit.textContent = p.hpi.initial || "—";

    // ESAS (chips)
    renderESASSummary(p);

    // CTCAE
    renderCTCAESummary(p);

    // Labs
    renderLabs(p);

    // Notes (include assessment & meds compactly)
    el.latestNotes.innerHTML = "";
    const blocks = [];
    if (p.latestNotes) blocks.push(sectionBlock("Notes", p.latestNotes));
    if (p.patientAssessment) blocks.push(sectionBlock("Patient Assessment", p.patientAssessment));
    if (p.medicationList) blocks.push(sectionBlock("Medication List", p.medicationList));
    if (!blocks.length) {
      el.latestNotes.textContent = "No notes yet.";
    } else {
      blocks.forEach((b) => el.latestNotes.appendChild(b));
    }

    // Sync CTCAE toggle to patient
    el.toggleCTCAE.checked = !!p.ctcae.enabled;
  }

  function renderESASSummary(p) {
    el.esasSummary.innerHTML = "";
    C.ESAS_FIELDS.forEach((k) => {
      const val = p.esas[k];
      const label = `${k}: ${val == null ? "—" : val}`;
      const chip = U.h("span", { class: "chip", title: k }, label);
      el.esasSummary.appendChild(chip);
    });
  }

  function renderCTCAESummary(p) {
    el.ctcaeSummary.innerHTML = "";
    const enabled = !!p.ctcae.enabled;
    el.ctcaeSummary.classList.toggle("is-disabled", !enabled);
    if (!enabled) {
      el.ctcaeSummary.innerHTML =
        '<p class="muted">CTCAE is currently disabled. Toggle "Enable" to record grades.</p>';
      return;
    }
    const list = U.h("div", { class: "keyvals compact" });
    C.CTCAE_ITEMS.forEach(({ key, label }) => {
      const g = p.ctcae.items[key]?.grade;
      const v = g == null ? "—" : `G${g}`;
      list.appendChild(
        U.h("div", { class: "kv" }, [U.h("span", {}, label), U.h("strong", {}, v)])
      );
    });
    el.ctcaeSummary.appendChild(list);
  }

  function renderLabs(p) {
    const makeKV = (name, value) => {
      const ref = C.REF_RANGES[name] ? { "data-ref": `Ref: ${C.REF_RANGES[name]}` } : {};
      return U.h("div", { class: "kv" }, [
        U.h("span", ref, name),
        U.h("strong", {}, value),
      ]);
    };
    const v = (k) => S.getLabValue(p, k);

    // Group 1
    el.labsGroup1.innerHTML = "";
    C.LAB_GROUPS.group1.forEach((k) => el.labsGroup1.appendChild(makeKV(k, v(k))));

    // Group 2
    el.labsGroup2.innerHTML = "";
    C.LAB_GROUPS.group2.forEach((k) => el.labsGroup2.appendChild(makeKV(k, v(k))));

    // Group 3
    el.labsGroup3.innerHTML = "";
    C.LAB_GROUPS.group3.forEach((k) => el.labsGroup3.appendChild(makeKV(k, v(k))));
  }

  function sectionBlock(title, txt) {
    return U.h("div", {}, [
      U.h("div", { class: "muted", style: "font-size:12px;margin-bottom:4px" }, title),
      U.h("div", {}, U.esc(txt)),
    ]);
  }

  /* ---------- Helpers ---------- */
  function resetQuickAddForm() {
    el.qpCode.value = "";
    el.qpName.value = "";
    el.qpAge.value = "";
    el.qpRoom.value = "";
    el.qpProvider.value = "";
    el.qpCOA.value = "";
    el.qpDiet.value = "";
    el.qpIso.value = "";
    el.qpComments.value = "";
  }

  function applySettings(st) {
    U.applyTheme(st || S.state.settings);
    // auto theme: follow prefers-color-scheme unless user forces
    if ((st || S.state.settings).theme === "auto") {
      const mql = window.matchMedia("(prefers-color-scheme: light)");
      document.documentElement.classList.toggle("theme-light", mql.matches);
    }
  }

  // Expose minimal API (if other modules need to trigger refresh)
  PR.ui = {
    renderAll,
    renderCurrentPatient,
    renderPatientList,
    renderProgress,
  };

  // Boot
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init)
    : init();
})();
