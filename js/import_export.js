/* ------------------------------------------------------
   Palliative Rounds — import_export.js
   CSV import/export (strict headers) + PDF handoff
-------------------------------------------------------*/

(function () {
  const U = PR.utils;
  const S = PR.state;
  const { HOSPITAL_HEADERS } = PR.constants;

  /* ===================== CSV IMPORT ===================== */

  // Fired from ui.js when the hidden input changes
  document.addEventListener("csv:import", () => {
    const input = document.getElementById("csvImport");
    if (!input || !input.files || !input.files[0]) {
      U.toast("No CSV file selected.", "warn");
      return;
    }
    const file = input.files[0];
    if (!/\.csv$/i.test(file.name)) {
      U.toast("Please select a .csv file.", "warn");
      input.value = "";
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => (h || "").trim(),
      complete: (res) => {
        try {
          const { data, meta } = res;

          // Validate headers EXACTLY as provided (order + labels)
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

          // Normalize rows to only required headers
          const rows = data
            .map((row) => {
              const obj = {};
              required.forEach((h) => (obj[h] = (row[h] ?? "").toString().trim()));
              // ignore completely empty rows
              const hasAny = Object.values(obj).some((v) => v !== "");
              return hasAny ? obj : null;
            })
            .filter(Boolean);

          if (!rows.length) {
            U.toast("CSV has no usable rows.", "warn");
            return resetFile(input);
          }

          const count = S.importRows(rows);
          U.toast(`Imported ${count} patient(s).`, "success");
          // reset file input so the same file can be re-imported if needed
          resetFile(input);
        } catch (err) {
          console.error(err);
          U.toast("Failed to import CSV.", "error");
          resetFile(input);
        }
      },
      error: (err) => {
        console.error(err);
        U.toast("Could not parse CSV file.", "error");
        resetFile(input);
      },
    });
  });

  function sameHeaders(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function resetFile(input) {
    // clear selection to allow re-choosing the same file
    try {
      input.value = "";
    } catch {}
  }

  /* ===================== CSV EXPORT ===================== */

  document.addEventListener("csv:export", () => {
    try {
      const rows = S.exportRows();
      const csv = Papa.unparse(rows, {
        columns: HOSPITAL_HEADERS,
        header: true,
      });
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

  /* ===================== PDF EXPORT (handoff) =====================
     The actual PDF composition lives in reports.js.
     If reports.js is not yet loaded or errors, fail gracefully.
  ==================================================================*/

  document.addEventListener("pdf:export", () => {
    try {
      if (PR.reports && typeof PR.reports.exportPDF === "function") {
        PR.reports.exportPDF();
      } else {
        // fallback: quick list PDF with basic roster
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
        .sort((a, b) => a.bio["Patient Name"].localeCompare(b.bio["Patient Name"]))
        .forEach((p) => {
          const line = `${p.bio["Patient Code"] || "—"} — ${p.bio["Patient Name"] || "—"} — Room ${p.bio["Room"] || "—"} — Section ${p.section} — Updated ${p.updatedAt || "—"}`;
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
})();
