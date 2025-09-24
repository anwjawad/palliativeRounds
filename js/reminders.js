/* ------------------------------------------------------
   Palliative Rounds — reminders.js
   Minimal reminders: add, toggle, remove, list render
-------------------------------------------------------*/

(function () {
  const U = PR.utils;
  const S = PR.state;

  /* ------------ Cache DOM ------------ */
  const els = {
    list: document.getElementById("remindersList"),
    addQuick: document.getElementById("addReminderQuick"),
    addForPatient: document.getElementById("reminderBtn"),
  };

  /* ------------ Init ------------ */
  function init() {
    if (!els.list) return;

    // Render on startup & whenever reminders change
    S.on("reminders:changed", render);
    S.on("patients:changed", render); // patient names may change
    S.on("current:changed", () => {
      // Enable/disable "Add Reminder" depending on selection (handled by ui.js as well)
      render();
    });

    // Add generic reminder
    els.addQuick?.addEventListener("click", () => {
      promptNewReminder(null);
    });

    // Add reminder for current patient
    els.addForPatient?.addEventListener("click", () => {
      const p = S.getCurrentPatient();
      if (!p) {
        U.toast("Select a patient first.", "warn");
        return;
      }
      promptNewReminder(p.id);
    });

    // Delegated actions in the list
    U.on(els.list, "click", ".reminder .toggle", function () {
      const id = this.closest(".reminder")?.dataset.id;
      const r = getById(id);
      if (!r) return;
      S.toggleReminder(id, !r.done);
    });

    U.on(els.list, "click", ".reminder .delete", function () {
      const id = this.closest(".reminder")?.dataset.id;
      if (!id) return;
      S.removeReminder(id);
      U.toast("Reminder removed.", "success");
    });

    render();
  }

  /* ------------ UI ------------ */
  function render() {
    els.list.innerHTML = "";

    const reminders = S.state.reminders.slice().sort((a, b) => {
      // undone on top; then newest first
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

    if (!reminders.length) {
      els.list.appendChild(
        U.h("div", { class: "muted", style: "font-size:13px" }, "No reminders yet.")
      );
      return;
    }

    reminders.forEach((r) => {
      const p = r.forPatientId ? PR.state.state.patients.find((x) => x.id === r.forPatientId) : null;
      const name = p?.bio?.["Patient Name"];
      const chip = name ? U.h("span", { class: "chip", title: "Linked to patient" }, name) : null;

      const card = U.h("div", { class: "reminder", dataset: { id: r.id } }, [
        U.h("div", {}, [
          U.h("div", { style: "display:flex; align-items:center; gap:8px; flex-wrap:wrap" }, [
            chip,
            U.h("span", { class: r.done ? "muted" : "" }, U.esc(r.text || "")),
          ]),
          U.h(
            "div",
            { class: "muted", style: "font-size:12px; margin-top:4px" },
            r.createdAt ? `Created ${r.createdAt}` : ""
          ),
        ]),
        U.h("div", { style: "display:flex; gap:6px; align-items:center" }, [
          U.h(
            "button",
            {
              class: "btn tiny ghost toggle",
              title: r.done ? "Mark as not done" : "Mark as done",
            },
            [
              U.h("i", {
                class: r.done
                  ? "fa-regular fa-square-check"
                  : "fa-regular fa-square",
              }),
              " ",
              r.done ? "Done" : "Todo",
            ]
          ),
          U.h(
            "button",
            { class: "icon-btn delete", title: "Remove" },
            U.h("i", { class: "fa-solid fa-trash" })
          ),
        ]),
      ]);

      if (r.done) card.style.opacity = 0.6;
      els.list.appendChild(card);
    });
  }

  function promptNewReminder(forPatientId) {
    const p = forPatientId
      ? PR.state.state.patients.find((x) => x.id === forPatientId)
      : null;
    const who = p ? ` for ${p.bio["Patient Name"]}` : "";
    const text = window.prompt(`Reminder${who}:`, "");
    if (!text) return;
    S.addReminder(text.trim(), forPatientId || null);
    U.toast("Reminder added.", "success");
  }

  function getById(id) {
    return PR.state.state.reminders.find((r) => r.id === id);
  }

  // Boot
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init)
    : init();

  // Public (optional)
  PR.reminders = { render };
})();
