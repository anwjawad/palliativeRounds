/* ------------------------------------------------------
   Palliative Rounds — app.js
   App bootstrap, cross-module glue, and UX polish
-------------------------------------------------------*/

(function () {
  const U = PR.utils;
  const S = PR.state;

  // Cache modal fields that are saved here (HPI + assessment/meds)
  const els = {
    modalUpdate: document.getElementById("modalUpdate"),
    updateSaveBtn: document.getElementById("updateSaveBtn"),

    hpiCauseInput: document.getElementById("hpiCauseInput"),
    hpiPrevTxInput: document.getElementById("hpiPrevTxInput"),
    hpiCurrTxInput: document.getElementById("hpiCurrTxInput"),
    hpiInitInput: document.getElementById("hpiInitInput"),

    patientAssessment: document.getElementById("patientAssessment"),
    medicationList: document.getElementById("medicationList"),

    modalSettings: document.getElementById("modalSettings"),
    themeSelect: document.getElementById("themeSelect"),
    fontSizeSelect: document.getElementById("fontSizeSelect"),
  };

  /* -------------------- Init -------------------- */
  function init() {
    // Restore persisted state (seeds demo data if empty)
    S.restore();

    // Try cloud load if ready
    (async () => {
      try {
        if (PR.cloud?.ready) {
          const cloud = await PR.cloud.loadAll();
          if (cloud && typeof cloud === "object") {
            PR.state.state = cloud;
            PR.state.persist();
            PR.ui?.renderAll?.();
            PR.utils?.toast?.("Cloud state synced.", "success");
          }
        }
      } catch {}
    })();


    // Save/close behavior for Update modal (collect HPI + assessment/meds)
    els.updateSaveBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      const p = S.getCurrentPatient();
      if (!p) return;

      const hpiPatch = {
        cause: (els.hpiCauseInput?.value || "").trim(),
        previous: (els.hpiPrevTxInput?.value || "").trim(),
        current: (els.hpiCurrTxInput?.value || "").trim(),
        initial: (els.hpiInitInput?.value || "").trim(),
      };

      const patientAssessment = (els.patientAssessment?.value || "").trim();
      const medicationList = (els.medicationList?.value || "").trim();

      S.updatePatient(p.id, { hpi: hpiPatch, patientAssessment, medicationList });

      // Let other modules (ESAS / CTCAE / Labs) handle their own saves (already listening on the same button)

      // Small delay so their toasts show first, then we close.
      setTimeout(() => {
        U.toast("All changes saved.", "success");
        U.closeDialog(els.modalUpdate);
      }, 60);
    });

    // Persist on unload (extra safety)
    window.addEventListener("beforeunload", () => {
      S.persist(); // flush all keys
    });

    // Follow system theme in "auto" mode live
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    mql.addEventListener?.("change", () => {
      if ((S.state.settings.theme || "auto") === "auto") {
        document.documentElement.classList.toggle("theme-light", mql.matches);
      }
    });

    // Accessibility: close dialogs with Escape if needed (polyfill safety)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll("dialog[open]").forEach((d) => {
          try { d.close(); } catch { d.removeAttribute("open"); }
        });
      }
    });

    // Quality-of-life: focus search on "/" key
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const search = document.getElementById("patientSearch");
        if (search && document.activeElement !== search) {
          e.preventDefault();
          search.focus();
          search.select?.();
        }
      }
    });
  }

  // Boot
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init)
    : init();
})();