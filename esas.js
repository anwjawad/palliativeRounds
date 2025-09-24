/* ------------------------------------------------------
   Palliative Rounds — esas.js
   ESAS builder (1–10 radios), load/save, and clearing
-------------------------------------------------------*/

(function () {
  const U = PR.utils;
  const S = PR.state;
  const C = PR.constants;

  const els = {
    esasInputs: U.$("#esasInputs"),
    esasClearBtn: U.$("#esasClearBtn"),
    modalUpdate: U.$("#modalUpdate"),
    updateSaveBtn: U.$("#updateSaveBtn"),
  };

  /* ---------------- Build ESAS grid ---------------- */
  function buildESASGrid() {
    if (!els.esasInputs) return;
    els.esasInputs.innerHTML = "";

    C.ESAS_FIELDS.forEach((fieldKey) => {
      const row = U.h("div", { class: "esas-row" });

      // Label cell
      row.appendChild(U.h("div", { class: "label" }, fieldKey));

      // Radio cells 1..10
      for (let n = 1; n <= 10; n++) {
        const id = `esas_${slug(fieldKey)}_${n}`;
        const wrap = U.h("label", { class: "esas-radio", for: id });
        const input = U.h("input", {
          type: "radio",
          name: `esas_${slug(fieldKey)}`,
          id,
          value: String(n),
        });
        const span = U.h("span", {}, String(n));
        const bg = U.h("div", { class: "bg", "aria-hidden": "true" });
        wrap.appendChild(input);
        wrap.appendChild(span);
        wrap.appendChild(bg);
        row.appendChild(wrap);
      }

      els.esasInputs.appendChild(row);
    });
  }

  /* ---------------- Load values into radios ---------------- */
  function loadESAS(p) {
    if (!p) return;
    // Clear all first
    C.ESAS_FIELDS.forEach((k) => {
      const name = `esas_${slug(k)}`;
      U.$$( `input[name="${name}"]`, els.esasInputs ).forEach((inp) => (inp.checked = false));
      const val = p.esas?.[k];
      if (val != null) {
        const target = U.$(`input[name="${name}"][value="${val}"]`, els.esasInputs);
        if (target) target.checked = true;
      }
    });
  }

  /* ---------------- Read radios into object ---------------- */
  function readESAS() {
    const out = S.blankESAS();
    C.ESAS_FIELDS.forEach((k) => {
      const name = `esas_${slug(k)}`;
      const checked = U.$(`input[name="${name}"]:checked`, els.esasInputs);
      out[k] = checked ? Number(checked.value) : null;
    });
    return out;
  }

  /* ---------------- Clear ---------------- */
  function clearESAS() {
    U.$$("input[type=radio]", els.esasInputs).forEach((i) => (i.checked = false));
  }

  /* ---------------- Events ---------------- */

  // When Update modal opens, (re)build if needed and load values
  document.addEventListener("modal:update:open", (e) => {
    ensureBuilt();
    const p = S.getCurrentPatient();
    loadESAS(p);
  });

  // Clear button
  els.esasClearBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    clearESAS();
  });

  // Save button in Update modal commits ESAS to state
  els.updateSaveBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const p = S.getCurrentPatient();
    if (!p) return;

    const esas = readESAS();
    S.updatePatient(p.id, { esas });
    U.toast("ESAS saved.", "success");

    // Let other modules also save their parts; ui/app will close modal.
    // We don't close the modal here to allow cumulative saves.
  });

  /* ---------------- Helpers ---------------- */
  let built = false;
  function ensureBuilt() {
    if (built) return;
    buildESASGrid();
    built = true;
  }

  function slug(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  // Public (if needed elsewhere)
  PR.esas = { buildESASGrid, loadESAS, readESAS, clearESAS };
})();
