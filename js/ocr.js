/* ------------------------------------------------------
   Palliative Rounds — ocr.js
   Lightweight OCR intake using Tesseract.js (optional)
   - Extracts rough fields from a photographed ward sheet
   - Maps to strict hospital headers
   - Lets user add parsed rows as new patients
-------------------------------------------------------*/

(function () {
  const U = PR.utils;
  const S = PR.state;

  // DOM in OCR modal
  const els = {
    dlg: document.getElementById("modalOCR"),
    file: document.getElementById("ocrFile"),
    run: document.getElementById("runOCR"),
    out: document.getElementById("ocrOutput"),
  };

  // Add an actions toolbar under output (created once)
  let toolbar, listWrap;

  function ensureToolbar() {
    if (!els.dlg || toolbar) return;
    toolbar = document.createElement("div");
    toolbar.style.display = "flex";
    toolbar.style.alignItems = "center";
    toolbar.style.justifyContent = "space-between";
    toolbar.style.marginTop = "10px";
    toolbar.style.gap = "8px";

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.gap = "8px";

    const parseBtn = btn("Parse & Preview", "fa-wand-magic-sparkles", () => {
      previewParsed();
    });
    parseBtn.classList.add("btn");
    const addAllBtn = btn("Add All", "fa-user-plus", () => addAllParsed());
    addAllBtn.classList.add("btn", "primary");
    addAllBtn.id = "ocrAddAll";

    left.appendChild(parseBtn);
    left.appendChild(addAllBtn);

    const hint = document.createElement("div");
    hint.className = "muted";
    hint.style.fontSize = "12px";
    hint.textContent = "Tip: Crop the photo to the patient table for better results.";

    toolbar.appendChild(left);
    toolbar.appendChild(hint);

    listWrap = document.createElement("div");
    listWrap.style.marginTop = "10px";
    listWrap.style.display = "grid";
    listWrap.style.gap = "8px";

    els.out?.parentElement?.appendChild(toolbar);
    els.out?.parentElement?.appendChild(listWrap);
  }

  function btn(text, icon, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn ghost";
    b.innerHTML = `<i class="fa-solid ${icon}"></i> ${text}`;
    b.addEventListener("click", onClick);
    return b;
  }

  /* ---------------- OCR Run ---------------- */
  els?.run?.addEventListener("click", async () => {
    if (!window.Tesseract || !window.Tesseract.recognize) {
      U.toast("OCR engine not available.", "error");
      return;
    }
    const file = els.file?.files?.[0];
    if (!file) {
      U.toast("Choose an image first.", "warn");
      return;
    }

    ensureToolbar();
    listWrap.innerHTML = "";
    setOut("Running OCR... This may take a moment.");

    try {
      const { data } = await window.Tesseract.recognize(file, "eng", {
        logger: (m) => {
          if (m.status && typeof m.progress === "number") {
            setOut(`${m.status} ${(m.progress * 100).toFixed(0)}%`);
          }
        },
      });
      const raw = (data?.text || "").trim();
      setOut(raw || "(No text detected)");
      // auto preview if text looks table-like
      if (raw && raw.split("\n").length > 4) previewParsed();
    } catch (e) {
      console.error(e);
      U.toast("OCR failed.", "error");
      setOut("(OCR failed)");
    }
  });

  function setOut(text) {
    if (els.out) els.out.textContent = text;
  }

  /* ---------------- Parsing Heuristics ----------------
     We try to split by lines, group into rows, and pull:
     - Patient Name
     - Patient Age
     - Cause Of Admission
     Best-effort only; user can edit before adding.
  -----------------------------------------------------*/
  function previewParsed() {
    ensureToolbar();
    listWrap.innerHTML = "";

    const text = els.out?.textContent || "";
    if (!text.trim()) {
      U.toast("No OCR text to parse.", "warn");
      return;
    }

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter((l) => l);

    // Try to detect header-like line indices (simple heuristic)
    const headerIdx = lines.findIndex((l) =>
      /(name|patient|age|diag|admission)/i.test(l)
    );
    const work = headerIdx >= 0 ? lines.slice(headerIdx + 1) : lines;

    // Join short spillover lines with next if they look truncated
    const normalized = [];
    for (let i = 0; i < work.length; i++) {
      const cur = work[i];
      const nxt = work[i + 1] || "";
      if (cur.length < 6 && nxt && /^[A-Za-z]/.test(nxt)) {
        normalized.push(cur + " " + nxt);
        i++;
      } else normalized.push(cur);
    }

    // Build tentative rows by splitting on separators or large spaces
    const rows = normalized
      .map((l) => {
        // split by pipe/comma/ tabs or 3+ spaces
        const cells = l.split(/\s{3,}|[|,]\s*/).map((c) => c.trim()).filter(Boolean);
        return cells.length ? cells : null;
      })
      .filter(Boolean);

    // Turn each row into a candidate object
    parsedBuffer = rows.map((cells, idx) => toCandidate(cells, idx)).filter(Boolean);

    if (!parsedBuffer.length) {
      U.toast("Couldn't parse rows. You can still copy from the OCR text.", "warn");
      return;
    }

    // Render candidates with edit + add
    parsedBuffer.forEach((row, i) => listWrap.appendChild(candidateCard(row, i)));
  }

  function toCandidate(cells, idx) {
    // Join line back to help regexes
    const line = cells.join(" | ");

    const candidate = {
      "Patient Code": `OCR-${Date.now().toString(36)}-${idx + 1}`,
      "Patient Name": "",
      "Patient Age": "",
      "Room": "",
      "Admitting Provider": "",
      "Cause Of Admission": "",
      "Diet": "",
      "Isolation": "",
      "Comments": "",
    };

    // Name: try "Name: X", or first token before age, or Title Case chunk
    const nameFromLabel = /name[:\-]?\s*([A-Za-z .,'-]{3,})/i.exec(line)?.[1];
    const ageMatch = /\b(\d{1,3})\s*(?:y|yrs|years|yo|year\s*old)\b/i.exec(line);
    const titleCaseMatch = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/.exec(line);

    candidate["Patient Name"] =
      (nameFromLabel && clean(nameFromLabel)) ||
      (titleCaseMatch && clean(titleCaseMatch[1])) ||
      "";

    // Age: from age pattern or an isolated 2-digit number
    candidate["Patient Age"] =
      (ageMatch && ageMatch[1]) ||
      (cells.map((c) => c.match(/^\d{1,3}$/)?.[0]).find(Boolean) || "");

    // Cause of Admission: look for "Dx" or "Diag" or "admission" or after name+age
    const coaLabel =
      /(?:cause of admission|admission reason|dx|diag)[:\-]?\s*(.+)$/i.exec(line)?.[1];
    candidate["Cause Of Admission"] = clean(
      coaLabel ||
        cells
          .slice(2)
          .join(" ")
          .replace(/(?:male|female|m|f)\b/i, "")
          .replace(/\b\d{1,3}\b/g, "")
    );

    // Room (simple pattern like A12, 12B, 305, B-07)
    const room =
      /(?:room|rm)[:\-]?\s*([A-Z]?\d{2,3}[A-Z]?|[A-Z]-\d{2,3})/i.exec(line)?.[1] || "";
    candidate["Room"] = room.toUpperCase();

    // Comments: keep the original line for reference
    candidate["Comments"] = clean(line);

    // Drop if we don't have at least a name or age
    if (!candidate["Patient Name"] && !candidate["Patient Age"]) return null;
    return candidate;
  }

  function clean(s) {
    return (s || "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s*[|]\s*/g, " / ")
      .trim();
  }

  /* ---------------- UI Cards ---------------- */
  let parsedBuffer = []; // array of candidate rows

  function candidateCard(row, idx) {
    const card = document.createElement("div");
    card.className = "reminder"; // reuse compact card style
    card.dataset.idx = String(idx);

    const header = document.createElement("div");
    header.style.display = "grid";
    header.style.gap = "6px";

    // Editable inputs for main fields
    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(2, 1fr)";
    grid.style.gap = "8px";

    const fields = [
      "Patient Code",
      "Patient Name",
      "Patient Age",
      "Room",
      "Admitting Provider",
      "Cause Of Admission",
      "Diet",
      "Isolation",
      "Comments",
    ];

    const editors = {};
    fields.forEach((key) => {
      const wrap = document.createElement("div");
      wrap.className = "field";
      const label = document.createElement("label");
      label.textContent = key;
      const input =
        key === "Comments" || key === "Cause Of Admission"
          ? document.createElement("textarea")
          : document.createElement("input");
      input.value = row[key] || "";
      input.rows = key === "Comments" ? 2 : key === "Cause Of Admission" ? 2 : 1;
      input.addEventListener("input", () => {
        parsedBuffer[idx][key] = input.value;
      });
      wrap.appendChild(label);
      wrap.appendChild(input);
      grid.appendChild(wrap);
      editors[key] = input;
    });

    header.appendChild(grid);

    const meta = document.createElement("div");
    meta.className = "muted";
    meta.style.fontSize = "12px";
    meta.textContent = "Review captured values. Edit before adding.";

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "6px";
    actions.style.alignItems = "center";
    const addBtn = btn("Add Patient", "fa-user-plus", () => addOne(idx));
    addBtn.classList.remove("ghost"); // default btn
    addBtn.classList.add("btn");
    const delBtn = btn("Remove", "fa-trash", () => {
      parsedBuffer.splice(idx, 1);
      card.remove();
    });
    delBtn.classList.add("icon-btn");

    actions.appendChild(addBtn);
    actions.appendChild(delBtn);

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.gap = "8px";
    right.style.alignItems = "center";

    card.innerHTML = "";
    card.appendChild(
      wrapRow([header], [actions]) // grid: text + actions
    );
    card.appendChild(meta);

    return card;
  }

  function wrapRow(leftNodes, rightNodes) {
    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr auto";
    row.style.gap = "10px";
    const left = document.createElement("div");
    const right = document.createElement("div");
    leftNodes.forEach((n) => left.appendChild(n));
    rightNodes.forEach((n) => right.appendChild(n));
    row.appendChild(left);
    row.appendChild(right);
    return row;
  }

  /* ---------------- Add to State ---------------- */

  function addOne(idx) {
    const row = parsedBuffer[idx];
    if (!row) return;
    const bio = sanitizeToBio(row);
    if (!bio["Patient Name"] && !bio["Patient Code"]) {
      U.toast("Missing key fields.", "warn");
      return;
    }
    const id = S.addPatient({ bio, section: PR.state.state.ui.currentSection });
    if (id) U.toast(`Added ${bio["Patient Name"] || bio["Patient Code"]}.`, "success");
  }

  function addAllParsed() {
    if (!parsedBuffer.length) {
      U.toast("Nothing to add.", "warn");
      return;
    }
    const rows = parsedBuffer.map(sanitizeToBio).filter((r) => r["Patient Code"] || r["Patient Name"]);
    if (!rows.length) {
      U.toast("Parsed rows are empty.", "warn");
      return;
    }
    rows.forEach((bio) => S.addPatient({ bio, section: PR.state.state.ui.currentSection }));
    U.toast(`Added ${rows.length} patient(s) from OCR.`, "success");
  }

  function sanitizeToBio(src) {
    // Ensure EXACT headers
    return {
      "Patient Code": (src["Patient Code"] || "").toString().trim(),
      "Patient Name": (src["Patient Name"] || "").toString().trim(),
      "Patient Age": (src["Patient Age"] || "").toString().trim(),
      "Room": (src["Room"] || "").toString().trim(),
      "Admitting Provider": (src["Admitting Provider"] || "").toString().trim(),
      "Cause Of Admission": (src["Cause Of Admission"] || "").toString().trim(),
      "Diet": (src["Diet"] || "").toString().trim(),
      "Isolation": (src["Isolation"] || "").toString().trim(),
      "Comments": (src["Comments"] || "").toString().trim(),
    };
  }

  // Public (optional)
  PR.ocr = {
    previewParsed,
  };
})();
