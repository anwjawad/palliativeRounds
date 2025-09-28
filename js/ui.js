/* ------------------------------------------------------
 Palliative Rounds — ui.js (auto-switch section fix)
 Keeps full behaviors + fixes:
 - assessment/meds saved per current patient
 - add/import respect currentSection
 - if current section is empty (and no search), auto-switch to first section with patients
 - render patient list with simple innerHTML
-------------------------------------------------------*/
(function () {
  const U = PR.utils;
  const S = PR.state;
  const C = PR.constants;

  /* ---------- Cache DOM ---------- */
  const el = {
    // Tabs / sections
    tabs: U.$(".tabs"),
    tabBtns: U.$$(".tab"),
    clearSectionBtn: U.$("#clearSectionBtn"),

    // Left: roster & search
    patientSearch: U.$("#patientSearch"),
    patientList: U.$("#patientList"),
    progressPct: U.$("#progressPct"),
    progressFill: U.$("#progressFill"),

    // Center: header & actions
    currentPatientName: U.$("#currentPatientName"),
    editPatientBtn: U.$("#editPatientBtn"),
    markDoneBtn: U.$("#markDoneBtn"),
    reminderBtn: U.$("#reminderBtn"),

    // Bio (center)
    bioCode: U.$("#bioCode"),
    bioName: U.$("#bioName"),
    bioAge: U.$("#bioAge"),
    bioRoom: U.$("#bioRoom"),
    bioProvider: U.$("#bioProvider"),
    bioCOA: U.$("#bioCOA"),
    bioDiet: U.$("#bioDiet"),
    bioIso: U.$("#bioIso"),
    bioComments: U.$("#bioComments"),

    // HPI (center)
    hpiCause: U.$("#hpiCause"),
    hpiPrevTx: U.$("#hpiPrevTx"),
    hpiCurrTx: U.$("#hpiCurrTx"),
    hpiInit: U.$("#hpiInit"),

    // ESAS & CTCAE summaries
    esasSummary: U.$("#esasSummary"),
    ctcaeSummary: U.$("#ctcaeSummary"),
    toggleCTCAE: U.$("#toggleCTCAE"),

    // Labs summaries
    labsGroup1: U.$("#labsGroup1"),
    labsGroup2: U.$("#labsGroup2"),
    labsGroup3: U.$("#labsGroup3"),

    // Latest notes (compact)
    latestNotes: U.$("#latestNotes"),

    // Right: quick actions
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

    // Quick add form
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

    // Update modal (HPI)
    hpiCauseInput: U.$("#hpiCauseInput"),
    hpiPrevTxInput: U.$("#hpiPrevTxInput"),
    hpiCurrTxInput: U.$("#hpiCurrTxInput"),
    hpiInitInput: U.$("#hpiInitInput"),

    // Update modal (Assessment + Meds)
    patientAssessmentInput: U.$("#patientAssessmentInput"),
    medicationListInput: U.$("#medicationListInput"),

    // Update modal save/cancel
    updateSave: U.$("#updateSave"),

    // Preferences
    themeSelect: U.$("#themeSelect"),
    fontSizeSelect: U.$("#fontSizeSelect"),
    saveSettings: U.$("#saveSettings"),
  };

  /* ---------- Section Names (rename tabs, local persistence only) ---------- */
  const SECTION_NAMES_KEY = "section_names";
  function loadSectionNames() {
    return PR.utils.load(SECTION_NAMES_KEY, { A: "Section A", B: "Section B", C: "Section C" }) || { A: "Section A", B: "Section B", C: "Section C" };
  }
  function saveSectionNames(map) { PR.utils.save(SECTION_NAMES_KEY, map); }
  function applySectionNames() {
    const names = loadSectionNames();
    el.tabBtns.forEach((btn) => {
      const code = btn.dataset.section;
      const name = names[code] || `Section ${code}`;
      btn.innerHTML = ` ${PR.utils.esc(name)}`;
    });
  }

  /* ---------- Init ---------- */
  function init() {
    bindGlobalEvents();

    // Listeners from state
    S.on("restored", () => { maybeAutoSwitchSection(); renderAll(); });
    S.on("patients:changed", () => { maybeAutoSwitchSection(); renderPatientList(); renderProgress(); });
    S.on("section:changed", () => { highlightActiveTab(); renderPatientList(); renderProgress(); });
    S.on("current:changed", renderCurrentPatient);
    S.on("patient:updated", () => { renderCurrentPatient(); renderPatientList(); });
    S.on("settings:changed", applySettings);

    // Apply preferences immediately + section names
    applySettings(S.state.settings);
    applySectionNames();

    // First paint
    maybeAutoSwitchSection();
    renderAll();
  }

  function renderAll() {
    highlightActiveTab();
    renderPatientList();
    renderProgress();
    renderCurrentPatient();
  }

  /* ---------- Auto switch if current section empty ---------- */
  function maybeAutoSwitchSection() {
    // لا تغيّر القسم إذا المستخدم يبحث (عشان ما نربكه)
    if ((el.patientSearch?.value || "").trim()) return;

    const sect = S.state.ui.currentSection || "A";
    const hasInCurrent = S.state.patients.some((p) => p.section === sect);
    if (hasInCurrent) return;

    // دور على أول قسم فيه مرضى
    const sections = ["A", "B", "C", "D", "E"];
    const found = sections.find((s) => S.state.patients.some((p) => p.section === s));
    if (found && found !== sect) {
      S.setUI({ currentSection: found });
    }
  }

  /* ---------- Events ---------- */
  function bindGlobalEvents() {
    // Tabs switching
    U.on(el.tabs, "click", ".tab", function () {
      const section = this.dataset.section;
      S.setUI({ currentSection: section, search: "" });
      if (el.patientSearch) el.patientSearch.value = "";
    });

    // Rename section (double click)
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

    // Clear current section
    el.clearSectionBtn?.addEventListener("click", () => {
      const sect = S.state.ui.currentSection;
      const pts = S.state.patients.filter((p) => p.section === sect);
      if (!pts.length) { U.toast("No patients to clear in this section.", "warn"); return; }
      const ok = window.confirm(`Clear all patients in ${sect}? This cannot be undone.`);
      if (!ok) return;
      pts.map((p) => p.id).forEach((id) => S.removePatient(id));
      U.toast("Section cleared.", "success");
    });

    // Search
    el.patientSearch?.addEventListener(
      "input",
      U.debounce((e) => { S.setUI({ search: e.target.value }); renderPatientList(); }, 150)
    );

    // Quick Add modal
    el.addQuickPatient?.addEventListener("click", () => { resetQuickAddForm(); U.openDialog(el.modalQuickPatient); });

    el.qpSave?.addEventListener("click", (e) => {
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

    // Open Update modal (populate current values)
    el.editPatientBtn?.addEventListener("click", () => {
      const p = S.getCurrentPatient();
      if (!p) return;
      // HPI
      if (el.hpiCauseInput) el.hpiCauseInput.value = p.hpi.cause || "";
      if (el.hpiPrevTxInput) el.hpiPrevTxInput.value = p.hpi.previous || "";
      if (el.hpiCurrTxInput) el.hpiCurrTxInput.value = p.hpi.current || "";
      if (el.hpiInitInput) el.hpiInitInput.value = p.hpi.initial || "";
      // Assessment & Meds
      if (el.patientAssessmentInput) el.patientAssessmentInput.value = p.patientAssessment || "";
      if (el.medicationListInput) el.medicationListInput.value = p.medicationList || "";
      // Open dialog
      U.openDialog(el.modalUpdate);
      // notify modules to populate their parts
      document.dispatchEvent(new CustomEvent("modal:update:open", { detail: { patientId: p.id } }));
    });

    // Save Update modal
    el.updateSave?.addEventListener("click", (e) => {
      e.preventDefault();
      const p = S.getCurrentPatient();
      if (!p) return;
      const patch = {
        hpi: {
          cause: el.hpiCauseInput?.value.trim() || "",
          previous: el.hpiPrevTxInput?.value.trim() || "",
          current: el.hpiCurrTxInput?.value.trim() || "",
          initial: el.hpiInitInput?.value.trim() || "",
        },
        patientAssessment: el.patientAssessmentInput?.value || "",
        medicationList: el.medicationListInput?.value || "",
      };
      S.updatePatient(p.id, patch);
      U.closeDialog(el.modalUpdate);
      U.toast("Patient updated.", "success");
    });

    // Mark done toggle
    el.markDoneBtn?.addEventListener("click", () => {
      const p = S.getCurrentPatient();
      if (!p) return;
      S.markDone(p.id, !p.done);
      U.toast(p.done ? "Marked as not done." : "Marked as done.", "success");
    });

    // Toggle CTCAE enable
    el.toggleCTCAE?.addEventListener("change", (e) => {
      const p = S.getCurrentPatient();
      if (!p) return;
      S.updatePatient(p.id, { ctcae: { ...p.ctcae, enabled: e.target.checked } });
      renderCTCAESummary(S.getCurrentPatient());
      U.toast(e.target.checked ? "CTCAE enabled." : "CTCAE disabled.", "success");
      if (el.includeCTCAE) el.includeCTCAE.checked = e.target.checked; // sync report option
    });

    // OCR
    el.ocrOpen?.addEventListener("click", () => U.openDialog(el.modalOCR));

    // Import/Export triggers (logic lives in import_export.js)
    el.csvImport?.addEventListener("change", () => document.dispatchEvent(new Event("csv:import")));
    el.exportCSV?.addEventListener("click", () => document.dispatchEvent(new Event("csv:export")));
    el.exportPDF?.addEventListener("click", () => document.dispatchEvent(new Event("pdf:export")));

    // Report generation (handled in reports.js)
    el.generateReport?.addEventListener("click", () => {
      const opts = {
        bio: el.includeBiographical?.checked,
        hpi: el.includeHPI?.checked,
        esas: el.includeESAS?.checked,
        ctcae: el.includeCTCAE?.checked,
        labs: el.includeLabs?.checked,
      };
      document.dispatchEvent(new CustomEvent("report:generate", { detail: opts }));
    });

    // Patient list interactions
    el.patientList?.addEventListener("click", (e) => {
      const item = e.target.closest(".patient-item");
      if (!item) return;
      const id = item.dataset.id;
      if (!id) return;
      // clicked on checkbox area?
      if (e.target.closest(".check")) {
        const p = S.state.patients.find((x) => x.id === id);
        if (p) S.markDone(id, !p.done);
      } else {
        S.setCurrentPatient(id);
      }
    });

    // Delete patient (trash icon)
    el.patientList?.addEventListener("click", (e) => {
      const trash = e.target.closest(".delete-patient");
      if (!trash) return;
      e.stopPropagation();
      const item = trash.closest(".patient-item");
      const id = item?.dataset.id;
      if (!id) return;
      const p = S.state.patients.find((x) => x.id === id);
      const name = p?.bio?.["Patient Name"] || "this patient";
      const ok = window.confirm(`Delete ${name}? This cannot be undone.`);
      if (!ok) return;
      S.removePatient(id);
      U.toast("Patient removed.", "success");
    });

    // From import_export.js
    document.addEventListener("import:done", () => {
      maybeAutoSwitchSection();
      renderPatientList();
      renderProgress();
    });
  }

  /* ---------- Rendering ---------- */
  function highlightActiveTab() {
    el.tabBtns.forEach((b) =>
      b.classList.toggle("active", b.dataset.section === S.state.ui.currentSection)
    );
  }

  function renderPatientList() {
    if (!el.patientList) return;

    const sect = S.state.ui.currentSection;
    const pts = S.searchPatients(S.state.ui.search).filter((p) => p.section === sect);

    if (!pts.length) {
      // لو القسم الحالي فاضي، أعرض رسالة بسيطة
      el.patientList.innerHTML = `<li class="muted" style="padding:8px 4px;">No patients in this section.</li>`;
      return;
    }

    const curId = S.state.ui.currentPatientId;
    el.patientList.innerHTML = pts
      .map((p) => {
        const name = (p.bio["Patient Name"] || "Unnamed");
        const code = (p.bio["Patient Code"] || "");
        const room = (p.bio["Room"] || "—");
        const updated = (p.updatedAt || "");
        const isActive = p.id === curId ? " active" : "";
        const isDone = p.done ? " done" : "";
        return `
          <li class="patient-item${isActive}${isDone}" data-id="${p.id}">
            <div class="check" title="${p.done ? "Done" : "Mark as done"}">
              ${p.done ? `<i class="fa-solid fa-check"></i>` : ``}
            </div>
            <div class="info">
              <div class="name">${U.esc(name)}</div>
              <div class="meta">${U.esc(code)} • Room ${U.esc(room)}</div>
            </div>
            <div class="meta-right">
              <span class="updated">${U.esc(updated)}</span>
              <button class="icon-btn delete-patient" title="Delete patient">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </li>`;
      })
      .join("");
  }

  function renderProgress() {
    const pct = S.progress();
    if (el.progressPct) el.progressPct.textContent = `${pct}%`;
    if (el.progressFill) el.progressFill.style.width = `${pct}%`;
  }

  function renderCurrentPatient() {
    const p = S.getCurrentPatient();
    const has = !!p;

    if (el.editPatientBtn) el.editPatientBtn.disabled = !has;
    if (el.markDoneBtn) el.markDoneBtn.disabled = !has;
    if (el.reminderBtn) el.reminderBtn.disabled = !has;
    if (el.toggleCTCAE) el.toggleCTCAE.disabled = !has;

    if (!p) {
      if (el.currentPatientName) el.currentPatientName.textContent = "No patient selected";
      [ el.bioCode, el.bioName, el.bioAge, el.bioRoom, el.bioProvider, el.bioCOA, el.bioDiet, el.bioIso, el.bioComments ]
        .forEach((n) => n && (n.textContent = "—"));

      if (el.hpiCause) el.hpiCause.textContent = "—";
      if (el.hpiPrevTx) el.hpiPrevTx.textContent = "—";
      if (el.hpiCurrTx) el.hpiCurrTx.textContent = "—";
      if (el.hpiInit) el.hpiInit.textContent = "—";

      if (el.esasSummary) el.esasSummary.innerHTML = "";
      if (el.ctcaeSummary) {
        el.ctcaeSummary.innerHTML = 'CTCAE is currently disabled. Toggle "Enable" to record grades.';
        el.ctcaeSummary.classList.add("is-disabled");
      }
      if (el.toggleCTCAE) el.toggleCTCAE.checked = false;

      if (el.labsGroup1) el.labsGroup1.innerHTML = "";
      if (el.labsGroup2) el.labsGroup2.innerHTML = "";
      if (el.labsGroup3) el.labsGroup3.innerHTML = "";

      if (el.latestNotes) el.latestNotes.textContent = "No notes yet.";
      return;
    }

    if (el.currentPatientName) el.currentPatientName.textContent = p.bio["Patient Name"] || "Unnamed";

    // Bio
    if (el.bioCode) el.bioCode.textContent = p.bio["Patient Code"] || "—";
    if (el.bioName) el.bioName.textContent = p.bio["Patient Name"] || "—";
    if (el.bioAge) el.bioAge.textContent = p.bio["Patient Age"] || "—";
    if (el.bioRoom) el.bioRoom.textContent = p.bio["Room"] || "—";
    if (el.bioProvider) el.bioProvider.textContent = p.bio["Admitting Provider"] || "—";
    if (el.bioCOA) el.bioCOA.textContent = p.bio["Cause Of Admission"] || "—";
    if (el.bioDiet) el.bioDiet.textContent = p.bio["Diet"] || "—";
    if (el.bioIso) el.bioIso.textContent = p.bio["Isolation"] || "—";
    if (el.bioComments) el.bioComments.textContent = p.bio["Comments"] || "—";

    // HPI
    if (el.hpiCause) el.hpiCause.textContent = p.hpi.cause || "—";
    if (el.hpiPrevTx) el.hpiPrevTx.textContent = p.hpi.previous || "—";
    if (el.hpiCurrTx) el.hpiCurrTx.textContent = p.hpi.current || "—";
    if (el.hpiInit) el.hpiInit.textContent = p.hpi.initial || "—";

    // ESAS & CTCAE
    renderESASSummary(p);
    renderCTCAESummary(p);

    // Labs
    renderLabs(p);

    // Notes (compact) — تشمل Assessment & Meds
    if (el.latestNotes) {
      el.latestNotes.innerHTML = "";
      const blocks = [];
      if (p.latestNotes) blocks.push(sectionBlock("Notes", p.latestNotes));
      if (p.patientAssessment) blocks.push(sectionBlock("Patient Assessment", p.patientAssessment));
      if (p.medicationList) blocks.push(sectionBlock("Medication List", p.medicationList));
      if (!blocks.length) el.latestNotes.textContent = "No notes yet.";
      else blocks.forEach((b) => el.latestNotes.appendChild(b));
    }

    // CTCAE toggle
    if (el.toggleCTCAE) el.toggleCTCAE.checked = !!p.ctcae.enabled;
  }

  function renderESASSummary(p) {
    if (!el.esasSummary) return;
    el.esasSummary.innerHTML = "";
    C.ESAS_FIELDS.forEach((k) => {
      const val = p.esas[k];
      const label = `${k}: ${val == null ? "—" : val}`;
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.title = k;
      chip.textContent = label;
      el.esasSummary.appendChild(chip);
    });
  }

  function renderCTCAESummary(p) {
    if (!el.ctcaeSummary) return;
    el.ctcaeSummary.innerHTML = "";
    const enabled = !!p.ctcae.enabled;
    el.ctcaeSummary.classList.toggle("is-disabled", !enabled);
    if (!enabled) {
      el.ctcaeSummary.innerHTML =
        'CTCAE is currently disabled. Toggle "Enable" to record grades.';
      return;
    }
    const list = document.createElement("div");
    list.className = "keyvals compact";
    C.CTCAE_ITEMS.forEach(({ key, label }) => {
      const g = p.ctcae.items[key]?.grade;
      const v = g == null ? "—" : `G${g}`;
      const row = document.createElement("div");
      row.className = "kv";
      const l = document.createElement("span");
      l.textContent = label;
      const s = document.createElement("strong");
      s.textContent = v;
      row.appendChild(l); row.appendChild(s);
      list.appendChild(row);
    });
    el.ctcaeSummary.appendChild(list);
  }

  function renderLabs(p) {
    const makeKV = (name, value) => {
      const row = document.createElement("div");
      row.className = "kv";
      const l = document.createElement("span");
      const ref = C.REF_RANGES?.[name];
      if (ref) l.setAttribute("data-ref", `Ref: ${ref}`);
      l.textContent = name;
      const v = document.createElement("strong");
      v.textContent = value;
      row.appendChild(l); row.appendChild(v);
      return row;
    };
    const v = (k) => S.getLabValue(p, k);

    if (el.labsGroup1) {
      el.labsGroup1.innerHTML = "";
      C.LAB_GROUPS.group1.forEach((k) => el.labsGroup1.appendChild(makeKV(k, v(k))));
    }
    if (el.labsGroup2) {
      el.labsGroup2.innerHTML = "";
      C.LAB_GROUPS.group2.forEach((k) => el.labsGroup2.appendChild(makeKV(k, v(k))));
    }
    if (el.labsGroup3) {
      el.labsGroup3.innerHTML = "";
      C.LAB_GROUPS.group3.forEach((k) => el.labsGroup3.appendChild(makeKV(k, v(k))));
    }
  }

  function sectionBlock(title, txt) {
    const wrap = document.createElement("div");
    const head = document.createElement("div");
    head.className = "muted";
    head.style.cssText = "font-size:12px;margin-bottom:4px";
    head.textContent = title;
    const body = document.createElement("div");
    body.textContent = txt;
    wrap.appendChild(head); wrap.appendChild(body);
    return wrap;
  }

  /* ---------- Helpers ---------- */
  function resetQuickAddForm() {
    if (!el.qpCode) return;
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
    if ((st || S.state.settings).theme === "auto") {
      const mql = window.matchMedia("(prefers-color-scheme: light)");
      document.documentElement.classList.toggle("theme-light", mql.matches);
    }
  }

  // Expose minimal UI API
  PR.ui = { renderAll: renderAll, renderCurrentPatient, renderPatientList, renderProgress };

  // Boot
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();