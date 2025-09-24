/* ------------------------------------------------------
   Palliative Rounds — labs.js
   Build Labs inputs (3 groups) + load/save to state
-------------------------------------------------------*/

(function () {
  const U = PR.utils;
  const S = PR.state;
  const C = PR.constants;

  const els = {
    // Modal containers for inputs
    labsInputs1: U.$("#labsInputs1"),
    labsInputs2: U.$("#labsInputs2"),
    labsInputs3: U.$("#labsInputs3"),
    labCRPTrend: U.$("#labCRPTrend"),
    labOther: U.$("#labOther"),
    // Save button inside Update modal
    updateSaveBtn: U.$("#updateSaveBtn"),
  };

  /* ================= Build Inputs ================= */
  function buildLabInputs() {
    if (!els.labsInputs1 || !els.labsInputs2 || !els.labsInputs3) return;

    // Clear
    els.labsInputs1.innerHTML = "";
    els.labsInputs2.innerHTML = "";
    els.labsInputs3.innerHTML = "";

    // Helpers
    const buildGroup = (container, keys) => {
      keys.forEach((name) => {
        const id = `lab_${slug(name)}`;
        const ref = C.REF_RANGES[name] ? `Ref: ${C.REF_RANGES[name]}` : "";
        const field = U.h("div", { class: "field" }, [
          U.h("label", { for: id }, name),
          U.h("input", {
            id,
            type: "text",
            placeholder: "Normal Result",
            ...(ref ? { "data-ref": ref, title: ref } : {}),
          }),
        ]);
        container.appendChild(field);
      });
    };

    buildGroup(els.labsInputs1, C.LAB_GROUPS.group1);
    buildGroup(els.labsInputs2, C.LAB_GROUPS.group2);
    buildGroup(els.labsInputs3, C.LAB_GROUPS.group3);

    // Hints for compact entry
    if (els.labCRPTrend) els.labCRPTrend.placeholder = "e.g., 45→36→28 mg/L";
    if (els.labOther)
      els.labOther.placeholder = "LDH=280; INR=1.1; AST=42";
  }

  /* ================= Load ================= */
  function loadLabs(p) {
    if (!p) return;

    const setVal = (name, v) => {
      const input = U.$(`#lab_${slug(name)}`);
      if (input) input.value = v == null ? "" : String(v);
    };

    // Groups
    C.LAB_GROUPS.group1.forEach((k) => setVal(k, p.labs?.group1?.[k]));
    C.LAB_GROUPS.group2.forEach((k) => setVal(k, p.labs?.group2?.[k]));
    C.LAB_GROUPS.group3.forEach((k) => setVal(k, p.labs?.group3?.[k]));

    // Extras
    if (els.labCRPTrend) els.labCRPTrend.value = p.labs?.crpTrend || "";
    if (els.labOther) els.labOther.value = p.labs?.other || "";
  }

  /* ================= Read ================= */
  function readLabs() {
    const getVal = (name) => {
      const el = U.$(`#lab_${slug(name)}`);
      return el ? el.value.trim() : "";
    };

    const toGroup = (keys) =>
      keys.reduce((acc, k) => ((acc[k] = getVal(k) || null), acc), {});

    return {
      group1: toGroup(C.LAB_GROUPS.group1),
      group2: toGroup(C.LAB_GROUPS.group2),
      group3: toGroup(C.LAB_GROUPS.group3),
      crpTrend: (els.labCRPTrend?.value || "").trim(),
      other: (els.labOther?.value || "").trim(),
    };
  }

  /* ================= Events ================= */

  // Build once and load values whenever Update modal opens
  document.addEventListener("modal:update:open", () => {
    ensureBuilt();
    loadLabs(S.getCurrentPatient());
  });

  // Save into state alongside other sections when hitting Save in modal
  els.updateSaveBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const p = S.getCurrentPatient();
    if (!p) return;
    const labs = readLabs();
    S.updatePatient(p.id, { labs });
    U.toast("Labs saved.", "success");
    // ui.js will refresh cards after state update
  });

  /* ================= Helpers ================= */
  let built = false;
  function ensureBuilt() {
    if (built) return;
    buildLabInputs();
    built = true;
  }

  function slug(s) {
    return (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  // Public (optional)
  PR.labs = { buildLabInputs, loadLabs, readLabs };
})();
