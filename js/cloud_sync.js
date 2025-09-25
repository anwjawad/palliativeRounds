// cloud_sync.js — Google Drive appDataFolder sync (client-only)
(function () {
  const SCOPES = "https://www.googleapis.com/auth/drive.appdata";
  const CLIENT_ID = "308165100455-rvdphpnblnc7b3v9nscfht5ve6jplape.apps.googleusercontent.com";
  const API_KEY = "AIzaSyDId_gso-NTeIN-ZqCI6CB7EUv7p3Pv4LM";

  let ready = false, fileId = null, saving = false;
  const FILE_NAME = "palliative_rounds_state.json";

  async function init() {
    await new Promise(r => gapi.load("client:auth2", r));
    await gapi.client.init({
      apiKey: API_KEY,
      clientId: CLIENT_ID,
      scope: SCOPES,
      discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"]
    });

    document.getElementById("enableCloud")?.addEventListener("click", enableSync);

    const auth = gapi.auth2.getAuthInstance();
    if (auth.isSignedIn.get()) {
      ready = true;
      await ensureFile();
      try {
        const cloud = await loadAll();
        if (cloud && typeof cloud === "object") {
          PR.state.state = cloud;
          PR.state.persist();
          PR.ui?.renderAll?.();
          PR.utils?.toast?.("Cloud state loaded.", "success");
        }
      } catch {}
    }
  }

  async function enableSync() {
    const auth = gapi.auth2.getAuthInstance();
    if (!auth.isSignedIn.get()) await auth.signIn();
    ready = true;
    await ensureFile();
    try {
      const cloud = await loadAll();
      if (cloud && typeof cloud === "object") {
        PR.state.state = cloud;
        PR.state.persist();
        PR.ui?.renderAll?.();
        PR.utils?.toast?.("Cloud state synced.", "success");
      }
    } catch (e) {
      console.warn("Initial cloud load failed", e);
    }
  }

  async function ensureFile() {
    const res = await gapi.client.drive.files.list({
      spaces: "appDataFolder",
      q: `name='${FILE_NAME}' and trashed=false`,
      fields: "files(id,name)"
    });
    if (res.result.files?.length) {
      fileId = res.result.files[0].id;
      return;
    }
    const meta = { name: FILE_NAME, parents: ["appDataFolder"] };
    const blob = new Blob([JSON.stringify(PR.state.state || {}, null, 2)], { type: "application/json" });
    fileId = await uploadNew(meta, blob);
  }

  async function uploadNew(meta, blob) {
    const boundary = "-------314159265358979323846";
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelim = "\r\n--" + boundary + "--";
    const metaPart = JSON.stringify(meta);
    const content = await blob.text();
    const body = delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      metaPart + delimiter +
      'Content-Type: application/json\r\n\r\n' +
      content + closeDelim;

    const res = await gapi.client.request({
      path: "/upload/drive/v3/files",
      method: "POST",
      params: { uploadType: "multipart" },
      headers: { "Content-Type": 'multipart/related; boundary="' + boundary + '"' },
      body
    });
    return res.result.id;
  }

  async function saveAll(stateObj) {
    if (!ready || !fileId || saving) return;
    try {
      saving = true;
      await gapi.client.request({
        path: "/upload/drive/v3/files/" + fileId,
        method: "PATCH",
        params: { uploadType: "media" },
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stateObj || {}, null, 2)
      });
    } finally {
      saving = false;
    }
  }

  async function loadAll() {
    if (!ready || !fileId) return null;
    const res = await gapi.client.drive.files.get({ fileId, alt: "media" });
    return res.result;
  }

  window.PR = window.PR || {};
  window.PR.cloud = {
    get ready(){ return ready; },
    saveAll,
    loadAll
  };

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init)
    : init();
})();
