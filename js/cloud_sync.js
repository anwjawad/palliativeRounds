// cloud_sync.js — GIS Drive sync + visible debug copy in My Drive
(function () {
  const SCOPES = "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file";
  const CLIENT_ID = "308165100455-rvdphpnblnc7b3v9nscfht5ve6jplape.apps.googleusercontent.com";
  const API_KEY = "AIzaSyDId_gso-NTeIN-ZqCI6CB7EUv7p3Pv4LM";

  let ready = false, fileId = null, saving = false;
  let tokenClient = null;
  const FILE_NAME = "palliative_rounds_state.json";

  async function init() {
    await new Promise(r => gapi.load("client", r));
    await gapi.client.init({
      apiKey: API_KEY,
      discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"]
    });

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp && resp.access_token) {
          gapi.client.setToken({ access_token: resp.access_token });
          afterAuthorized().catch(console.error);
        } else {
          console.warn("No access token returned", resp);
        }
      }
    });

    document.getElementById("enableCloud")?.addEventListener("click", () => {
      tokenClient.requestAccessToken({ prompt: "consent" });
    });
  }

  async function afterAuthorized() {
    ready = true;
    await ensureFile();
    try {
      const cloud = await loadAll();
      if (cloud && typeof cloud === "object") {
        PR.state.state = cloud;
        PR.state.persist();
        PR.ui?.renderAll?.();
        PR.utils?.toast?.("Cloud state synced from Drive.", "success");
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
      const bodyStr = JSON.stringify(stateObj || {}, null, 2);
      await gapi.client.request({
        path: "/upload/drive/v3/files/" + fileId,
        method: "PATCH",
        params: { uploadType: "media" },
        headers: { "Content-Type": "application/json" },
        body: bodyStr
      });
      PR.utils?.toast?.("Cloud sync saved ✓", "success");
      await saveDebugCopy(bodyStr);
    } finally {
      saving = false;
    }
  }

  async function loadAll() {
    if (!ready || !fileId) return null;
    const res = await gapi.client.drive.files.get({ fileId, alt: "media" });
    return res.result;
  }

  // === Visible debug copy in My Drive: /PalliativeRounds/state_debug.json ===
  async function ensureDebugFolder() {
    const res = await gapi.client.drive.files.list({
      q: "name='PalliativeRounds' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents",
      fields: "files(id,name)",
      spaces: "drive"
    });
    if (res.result.files?.length) return res.result.files[0].id;
    const meta = { name: "PalliativeRounds", mimeType: "application/vnd.google-apps.folder", parents: ["root"] };
    const created = await gapi.client.drive.files.create({ resource: meta, fields: "id" });
    return created.result.id;
  }

  async function saveDebugCopy(bodyStr) {
    try {
      const folderId = await ensureDebugFolder();
      const res = await gapi.client.drive.files.list({
        q: `name='state_debug.json' and trashed=false and '${folderId}' in parents`,
        fields: "files(id,name)",
        spaces: "drive"
      });
      if (res.result.files?.length) {
        const fid = res.result.files[0].id;
        await gapi.client.request({
          path: "/upload/drive/v3/files/" + fid,
          method: "PATCH",
          params: { uploadType: "media" },
          headers: { "Content-Type": "application/json" },
          body: bodyStr
        });
      } else {
        const boundary = "-------314159265358979323846";
        const delimiter = "\r\n--" + boundary + "\r\n";
        const closeDelim = "\r\n--" + boundary + "--";
        const meta = JSON.stringify({ name: "state_debug.json", parents: [folderId] });
        const body = delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' + meta +
          delimiter + 'Content-Type: application/json\r\n\r\n' + bodyStr + closeDelim;
        await gapi.client.request({
          path: "/upload/drive/v3/files",
          method: "POST",
          params: { uploadType: "multipart" },
          headers: { "Content-Type": 'multipart/related; boundary="' + boundary + '"' },
          body
        });
      }
    } catch (e) {
      console.warn("Debug copy save failed", e);
    }
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