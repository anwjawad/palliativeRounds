/* ------------------------------------------------------
   Palliative Rounds — reports.js
   Generate print-ready report preview + export to PDF
-------------------------------------------------------*/

(function () {
  const U = PR.utils;
  const S = PR.state;
  const C = PR.constants;

  /* ===================== Wiring ===================== */

  // Receive "Generate" click from ui.js
  document.addEventListener("report:generate", (e) => {
    const opts = e.detail || {
      bio: true,
      hpi: true,
      esas: true,
      ctcae: true,
      labs: true,
    };
    const p = S.getCurrentPatient();
    if (!p) {
      U.toast("Please select a patient first.", "warn");
      return;
    }
    openReportPreview(p, opts);
  });

  // Export hook used by import_export.js
  function exportPDF() {
    const p = S.getCurrentPatient();
    if (!p) {
      U.toast("Please select a patient first.", "warn");
      return;
    }

    // Prefer the last used options if a preview is open; else export all main sections.
    const dlg = document.getElementById("modalReport");
    const opts = dlg?._opts || {
      bio: true, hpi: true, esas: true, ctcae: true, labs: true,
    };

    const doc = buildPdfDocument(p, opts);
    const stamp = new Date().toISOString().slice(0, 10);
    doc.save(`${safeName(p.bio["Patient Name"] || "patient")}_report_${stamp}.pdf`);
    U.toast("PDF exported.", "success");
  }

  /* ===================== Preview Modal ===================== */

  function openReportPreview(patient, opts) {
    // Ensure a single modal instance
    let dlg = document.getElementById("modalReport");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "modalReport";
      dlg.className = "modal";
      dlg.innerHTML = `
        <form method="dialog" class="modal-body">
          <header class="modal-header">
            <h3><i class="fa-regular fa-file-lines"></i> Report Preview</h3>
            <div style="display:flex; gap:8px; align-items:center">
              <button id="reportPrint" class="btn ghost"><i class="fa-solid fa-print"></i> Print</button>
              <button id="reportExportPdf" class="btn primary"><i class="fa-solid fa-file-pdf"></i> Export PDF</button>
              <button class="icon-btn close" value="cancel" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
            </div>
          </header>
          <div id="reportContainer" class="report"></div>
          <footer class="modal-footer">
            <span class="muted">Note: This preview is optimized for printing and PDF export.</span>
          </footer>
        </form>
      `;
      document.body.appendChild(dlg);

      // Buttons
      dlg.querySelector("#reportPrint").addEventListener("click", (ev) => {
        ev.preventDefault();
        window.print();
      });
      dlg.querySelector("#reportExportPdf").addEventListener("click", (ev) => {
        ev.preventDefault();
        exportPDF();
      });
    }

    dlg._opts = opts; // remember last used options

    // Build preview HTML
    const wrap = dlg.querySelector("#reportContainer");
    wrap.innerHTML = "";
    wrap.appendChild(buildReportHTML(patient, opts));

    U.openDialog(dlg);
  }

  /* ===================== HTML Builder ===================== */

  function buildReportHTML(p, opts) {
    const root = document.createElement("div");

    // Title
    root.appendChild(
      sectionHeader(`${p.bio["Patient Name"] || "Unnamed"} — Clinical Report`)
    );

    // Meta row (code / room / updated)
    root.appendChild(row("Patient Code", val(p.bio["Patient Code"])));
    root.appendChild(row("Room", val(p.bio["Room"])));
    root.appendChild(row("Last Updated", val(p.updatedAt)));

    // Biographical block (strict hospital headers)
    if (opts.bio) {
      root.appendChild(sectionHeader("Biographical Data"));
      C.HOSPITAL_HEADERS.forEach((h) => {
        root.appendChild(row(h, val(p.bio[h])));
      });
    }

    // HPI block
    if (opts.hpi) {
      root.appendChild(sectionHeader("HPI"));
      root.appendChild(row("Cause of Admission", val(p.hpi.cause)));
      root.appendChild(row("Previous Treatment", val(p.hpi.previous)));
      root.appendChild(row("Current Treatment", val(p.hpi.current)));
      root.appendChild(row("Initial Assessment", val(p.hpi.initial)));

      // Assessment & meds (from Update Status modal)
      if (p.patientAssessment || p.medicationList) {
        root.appendChild(sectionHeader("Assessment & Medications"));
        if (p.patientAssessment) root.appendChild(row("Patient Assessment", val(p.patientAssessment)));
        if (p.medicationList) root.appendChild(row("Medication List", val(p.medicationList)));
      }
    }

    // ESAS block
    if (opts.esas) {
      root.appendChild(sectionHeader("ESAS (1–10)"));
      C.ESAS_FIELDS.forEach((k) => {
        const v = p.esas?.[k];
        root.appendChild(row(k, v == null ? "—" : String(v)));
      });
    }

    // CTCAE block (only if enabled in patient & requested)
    if (opts.ctcae && p.ctcae?.enabled) {
      root.appendChild(sectionHeader("CTCAE (Selected Items)"));
      C.CTCAE_ITEMS.forEach(({ key, label }) => {
        const g = p.ctcae.items?.[key]?.grade;
        root.appendChild(row(label, g == null ? "—" : `Grade ${g}`));
      });

      // Compact inline guide link for reference (no bulk)
      const guide = document.createElement("div");
      guide.className = "muted";
      guide.style.fontSize = "12px";
      guide.textContent = "Reference: NCI CTCAE v5.0.";
      const a = document.createElement("a");
      a.href =
        "https://ctep.cancer.gov/protocoldevelopment/electronic_applications/ctc.htm";
      a.textContent = "Open official page";
      a.target = "_blank";
      a.rel = "noopener";
      guide.appendChild(document.createTextNode(" "));
      guide.appendChild(a);
      root.appendChild(guide);
    }

    // Labs block
    if (opts.labs) {
      root.appendChild(sectionHeader("Laboratory Results"));

      // Helper to get default when missing
      const gv = (k) => S.getLabValue(p, k);

      // Group 1
      root.appendChild(row("WBC", gv("WBC")));
      root.appendChild(row("HGB", gv("HGB")));
      root.appendChild(row("PLT", gv("PLT")));
      root.appendChild(row("ANC", gv("ANC")));
      root.appendChild(row("CRP", gv("CRP")));
      root.appendChild(row("Albumin", gv("Albumin")));
      root.appendChild(row("CRP Trend", p.labs?.crpTrend || "—"));

      // Group 2
      root.appendChild(row("Sodium (Na)", gv("Sodium (Na)")));
      root.appendChild(row("Potassium (K)", gv("Potassium (K)")));
      root.appendChild(row("Chloride (Cl)", gv("Chloride (Cl)")));
      root.appendChild(row("Calcium (Ca)", gv("Calcium (Ca)")));
      root.appendChild(row("Phosphorus (Ph)", gv("Phosphorus (Ph)")));
      root.appendChild(row("Alkaline Phosphatase (ALP)", gv("Alkaline Phosphatase (ALP)")));

      // Group 3
      root.appendChild(row("Creatinine (Scr)", gv("Creatinine (Scr)")));
      root.appendChild(row("BUN", gv("BUN")));
      root.appendChild(row("Total Bile", gv("Total Bile")));
      root.appendChild(row("Other", p.labs?.other || "—"));
    }

    // Latest notes (if any)
    if (p.latestNotes) {
      root.appendChild(sectionHeader("Latest Notes"));
      root.appendChild(row("Notes", val(p.latestNotes)));
    }

    return root;
  }

  function sectionHeader(txt) {
    const h = document.createElement("h3");
    h.textContent = txt;
    return h;
  }

  function row(k, v) {
    const r = document.createElement("div");
    r.className = "row";
    const a = document.createElement("span");
    a.textContent = k;
    const b = document.createElement("div");
    b.textContent = v;
    r.appendChild(a);
    r.appendChild(b);
    return r;
  }

  function val(x) {
    if (x == null || x === "") return "—";
    return String(x);
  }

  function safeName(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  /* ===================== PDF Builder ===================== */

  function buildPdfDocument(p, opts) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      U.toast("PDF library not available.", "error");
      throw new Error("jsPDF missing");
    }
    const doc = new window.jspdf.jsPDF({ unit: "pt" });
    const margin = 44;
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    let y = margin;

    const addH = (text) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      y = addTextWrapped(doc, text, margin, y, width - margin * 2) + 8;
    };
    const addRow = (k, v) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const kWidth = 160;
      const xLeft = margin;
      const xRight = margin + kWidth + 10;
      const maxRight = width - margin;
      const lineH = 16;

      // Key
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120);
      doc.text(k, xLeft, y);
      doc.setTextColor(20);

      // Value (wrap)
      const wrapped = doc.splitTextToSize(v || "—", maxRight - xRight);
      // page break
      if (y + (wrapped.length * lineH) > height - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(wrapped, xRight, y);
      y += wrapped.length * lineH - (wrapped.length > 0 ? 0 : lineH);
      y += 6;
    };

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(`${p.bio["Patient Name"] || "Unnamed"} — Clinical Report`, margin, y);
    y += 22;

    // Meta
    addRow("Patient Code", p.bio["Patient Code"] || "—");
    addRow("Room", p.bio["Room"] || "—");
    addRow("Last Updated", p.updatedAt || "—");

    // Bio
    if (opts.bio) {
      addH("Biographical Data");
      C.HOSPITAL_HEADERS.forEach((h) => addRow(h, p.bio[h] || "—"));
    }

    // HPI
    if (opts.hpi) {
      addH("HPI");
      addRow("Cause of Admission", p.hpi.cause || "—");
      addRow("Previous Treatment", p.hpi.previous || "—");
      addRow("Current Treatment", p.hpi.current || "—");
      addRow("Initial Assessment", p.hpi.initial || "—");
      if (p.patientAssessment || p.medicationList) addH("Assessment & Medications");
      if (p.patientAssessment) addRow("Patient Assessment", p.patientAssessment);
      if (p.medicationList) addRow("Medication List", p.medicationList);
    }

    // ESAS
    if (opts.esas) {
      addH("ESAS (1–10)");
      C.ESAS_FIELDS.forEach((k) =>
        addRow(k, p.esas?.[k] == null ? "—" : String(p.esas[k]))
      );
    }

    // CTCAE
    if (opts.ctcae && p.ctcae?.enabled) {
      addH("CTCAE (Selected Items)");
      C.CTCAE_ITEMS.forEach(({ key, label }) => {
        const g = p.ctcae.items?.[key]?.grade;
        addRow(label, g == null ? "—" : `Grade ${g}`);
      });
      addRow("Reference", "NCI CTCAE v5.0 — ctep.cancer.gov");
    }

    // Labs
    if (opts.labs) {
      const gv = (k) => S.getLabValue(p, k);
      addH("Laboratory Results");
      // Group 1 + extras
      ["WBC", "HGB", "PLT", "ANC", "CRP", "Albumin"].forEach((k) => addRow(k, gv(k)));
      addRow("CRP Trend", p.labs?.crpTrend || "—");
      // Group 2
      [
        "Sodium (Na)",
        "Potassium (K)",
        "Chloride (Cl)",
        "Calcium (Ca)",
        "Phosphorus (Ph)",
        "Alkaline Phosphatase (ALP)",
      ].forEach((k) => addRow(k, gv(k)));
      // Group 3
      ["Creatinine (Scr)", "BUN", "Total Bile"].forEach((k) => addRow(k, gv(k)));
      addRow("Other", p.labs?.other || "—");
    }

    return doc;
  }

  function addTextWrapped(doc, text, x, y, maxWidth) {
    const lines = doc.splitTextToSize(text, maxWidth);
    lines.forEach((ln, i) => doc.text(ln, x, y + i * 18));
    return y + (lines.length - 1) * 18;
  }

  /* ===================== Public API ===================== */
  PR.reports = { exportPDF, openReportPreview };
})();
