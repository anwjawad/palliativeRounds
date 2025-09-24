/* ------------------------------------------------------
   Palliative Rounds — ctcae.js
   CTCAE (8 requested items). Toggle + grades 0–4.
-------------------------------------------------------*/

(function () {
  const U = PR.utils;
  const S = PR.state;
  const C = PR.constants;

  const els = {
    ctcaeInputs: U.$("#ctcaeInputs"),
    ctcaeEnableInput: U.$("#ctcaeEnableInput"),
    updateSaveBtn: U.$("#updateSaveBtn"),
  };

  /* ---------------- Build CTCAE grid ---------------- */
  function buildCTCAEGrid() {
    if (!els.ctcaeInputs) return;
    els.ctcaeInputs.innerHTML = "";

    C.CTCAE_ITEMS.forEach(({ key, label }) => {
      const row = U.h("div", { class: "ctcae-row" });
      row.appendChild(U.h("div", { class: "label" }, label));

      C.CTCAE_GRADES.forEach((g) => {
        const id = `ctcae_${key}_${g}`;
        const wrap = U.h("label", { class: "ctcae-pill", for: id });
        const input = U.h("input", {
          type: "radio",
          name: `ctcae_${key}`,
          id,
          value: g,
        });
        const span = U.h("span", {}, String(g));
        const bg = U.h("div", { class: "bg", "aria-hidden": "true" });
        wrap.appendChild(input);
        wrap.appendChild(span);
        wrap.appendChild(bg);
        row.appendChild(wrap);
      });

      els.ctcaeInputs.appendChild(row);
    });
  }

  /* ---------------- Load ---------------- */
  function loadCTCAE(p) {
    if (!p) return;
    const enabled = !!p.ctcae.enabled;
    els.ctcaeEnableInput.checked = enabled;
    els.ctcaeInputs.classList.toggle("disabled", !enabled);

    C.CTCAE_ITEMS.forEach(({ key }) => {
      const val = p.ctcae.items?.[key]?.grade;
      U.$$(`input[name="ctcae_${key}"]`, els.ctcaeInputs).forEach(
        (inp) => (inp.checked = false)
      );
      if (val != null) {
        const target = U.$(
          `input[name="ctcae_${key}"][value="${val}"]`,
          els.ctcaeInputs
        );
        if (target) target.checked = true;
      }
    });
  }

  /* ---------------- Read ---------------- */
  function readCTCAE() {
    const enabled = els.ctcaeEnableInput.checked;
    const items = {};
    C.CTCAE_ITEMS.forEach(({ key, label }) => {
      const checked = U.$(`input[name="ctcae_${key}"]:checked`, els.ctcaeInputs);
      items[key] = {
        label,
        grade: checked ? Number(checked.value) : null,
      };
    });
    return { enabled, items };
  }

  /* ---------------- Events ---------------- */

  // When Update modal opens, build if not yet & load values
  document.addEventListener("modal:update:open", () => {
    ensureBuilt();
    const p = S.getCurrentPatient();
    loadCTCAE(p);
  });

  // Enable toggle
  els.ctcaeEnableInput?.addEventListener("change", () => {
    els.ctcaeInputs.classList.toggle("disabled", !els.ctcaeEnableInput.checked);
  });

  // Save CTCAE with Update modal Save button
  els.updateSaveBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const p = S.getCurrentPatient();
    if (!p) return;
    const ctcae = readCTCAE();
    S.updatePatient(p.id, { ctcae });
    U.toast("CTCAE saved.", "success");
  });

  /* ---------------- Helpers ---------------- */
  let built = false;
  function ensureBuilt() {
    if (built) return;
    buildCTCAEGrid();
    built = true;
  }

  // Public
  PR.ctcae = { buildCTCAEGrid, loadCTCAE, readCTCAE };
})();
