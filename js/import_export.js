
(() => {
  'use strict';

  // ===== storage.js =====
  const Storage = {
    key: 'palliative-rounds-v1',
    load(){
      try{
        const raw = localStorage.getItem(this.key);
        if(!raw) return null;
        return JSON.parse(raw);
      }catch(e){ console.warn('load error', e); return null; }
    },
    save(state){
      try{ localStorage.setItem(this.key, JSON.stringify(state)); }
      catch(e){ console.warn('save error', e); }
    },
    reset(){ localStorage.removeItem(this.key); }
  };
  function seed(){
    return {
      settings: { checklist: true, esas: true, activeDeptId: null },
      depts: [
        { id: crypto.randomUUID(), name: 'القسم A', color: '#7c5cff' },
        { id: crypto.randomUUID(), name: 'القسم B', color: '#16db93' },
        { id: crypto.randomUUID(), name: 'القسم C', color: '#00d4ff' }
      ],
      patients: []
    };
  }

  // ===== ui.js =====
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  function h(tag, props={}, ...children){
    const el = Object.assign(document.createElement(tag), props);
    for(const ch of children){
      if(ch == null) continue;
      if(typeof ch === 'string') el.appendChild(document.createTextNode(ch));
      else el.appendChild(ch);
    }
    return el;
  }
  function toast(msg){
    const t = h('div', { className: 'toast glass', textContent: msg });
    Object.assign(t.style, { position:'fixed', bottom:'20px', left:'50%', transform:'translateX(-50%)', padding:'10px 14px', borderRadius:'10px', zIndex:9999 });
    document.body.appendChild(t);
    setTimeout(()=>{ t.remove(); }, 1800);
  }
  function chip(label){ return h('span', { className:'esas-chip' }, label); }

  // ===== report.js =====
  function buildReport(state){
    const activeDeptId = state.settings.activeDeptId ?? state.depts[0]?.id;
    const depts = activeDeptId ? state.depts.filter(d=>d.id===activeDeptId) : state.depts;

    const root = h('div', { dir:'rtl', style:'font-family:Cairo,system-ui,sans-serif;padding:20px;background:#fff;color:#111' });
    root.appendChild(h('h2', { style:'text-align:center;margin:0 0 12px' }, 'تقرير الجولة اليومية – التلطيف'));
    root.appendChild(h('p', { style:'text-align:center;margin:0 0 20px;font-size:12px;color:#666' },
      new Date().toLocaleString('ar-EG')
    ));

    for(const dept of depts){
      root.appendChild(h('h3', { style:'margin:14px 0 8px;border-bottom:2px solid #eee;padding-bottom:6px' }, `القسم: ${dept.name}`));
      const table = h('table', { style:'width:100%; border-collapse: collapse; font-size: 13px;' });
      table.appendChild(h('thead',{},
        h('tr',{},
          ...['الاسم','العمر','التشخيص','التطور اليومي','الفحوصات','أعراض مختصرة','منجز'].map(th=>h('th',{style:'text-align:right;border-bottom:1px solid #ddd;padding:6px;background:#fafafa'}, th))
        )
      ));
      const tbody = h('tbody',{});
      const ps = state.patients.filter(p=>p.deptId===dept.id);
      if(ps.length===0){
        tbody.appendChild(h('tr',{}, h('td',{colSpan:7, style:'padding:8px;color:#777'},'لا يوجد مرضى.')));
      } else {
        for(const p of ps){
          const symptoms = [];
          if(state.settings.esas){
            const s = p.esas || {};
            const entries = [['ألم', s.pain], ['غثيان', s.nausea], ['ضيق نفس', s.dyspnea], ['إرهاق', s.fatigue]];
            for(const [k,v] of entries){ if(typeof v === 'number' && v>0) symptoms.push(`${k}:${v}/10`); }
          }
          tbody.appendChild(h('tr',{},
            h('td',{style:'border-bottom:1px solid #eee;padding:6px;white-space:nowrap'}, p.name),
            h('td',{style:'border-bottom:1px solid #eee;padding:6px'}, String(p.age ?? '')),
            h('td',{style:'border-bottom:1px solid #eee;padding:6px'}, p.dx ?? ''),
            h('td',{style:'border-bottom:1px solid #eee;padding:6px'}, p.progress ?? ''),
            h('td',{style:'border-bottom:1px solid #eee;padding:6px'}, p.labs ?? ''),
            h('td',{style:'border-bottom:1px solid #eee;padding:6px'}, symptoms.join(' • ')),
            h('td',{style:'border-bottom:1px solid #eee;padding:6px;text-align:center'}, p.done ? '✅' : '—')
          ));
        }
      }
      table.appendChild(tbody);
      root.appendChild(table);
    }
    return root;
  }

  function openPrintReport(state){
    const report = buildReport(state);
    const win = window.open('', '_blank');
    if(!win){ toast('افتح صلاحية النوافذ المنبثقة'); return; }
    win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير الجولة</title>
    <style>
      @page{ size:A4; margin: 14mm; }
      body{ font-family:Cairo,system-ui,sans-serif; color:#111; }
      table{ page-break-inside:auto }
      tr{ page-break-inside:avoid; page-break-after:auto }
      h2,h3{ break-after:avoid; }
    </style>
    </head><body></body></html>`);
    win.document.body.appendChild(report);
    win.document.close();
    win.focus();
    win.print();
  }

  function exportCSV(state){
    const rows = [['القسم','الاسم','العمر','التشخيص','التطور','الفحوصات','ألم','غثيان','ضيق نفس','إرهاق','منجز']];
    for(const dept of state.depts){
      const ps = state.patients.filter(p=>p.deptId===dept.id);
      for(const p of ps){
        const s = p.esas || {};
        rows.push([dept.name,p.name,p.age ?? '',p.dx ?? '', (p.progress??'').replaceAll('\\n',' '),(p.labs??'').replaceAll('\\n',' '), s.pain??'', s.nausea??'', s.dyspnea??'', s.fatigue??'', p.done ? 'yes':'no' ]);
      }
    }
    const csv = rows.map(r=>r.map(x=>`"${String(x).replaceAll('"','""')}"`).join(',')).join('\\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'palliative_rounds.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // ===== app.js (main) =====
  const state = Storage.load() ?? seed();
  function save(){ Storage.save(state); }
  function uid(){ return crypto.randomUUID(); }

  const deptList = $('#deptList');
  const patientsContainer = $('#patientsContainer');
  const searchInput = $('#searchInput');
  const csvInput = $('#csvInput');
  const btnAddDept = $('#btnAddDept');
  const btnAddPatient = $('#btnAddPatient');
  const btnReset = $('#btnReset');
  const toggleChecklist = $('#toggleChecklist');
  const toggleESAS = $('#toggleESAS');
  const btnReport = $('#btnGenerateReport');
  const btnCSV = $('#btnExportCSV');

  const modal = $('#patientModal');
  const modalTitle = $('#modalTitle');
  const fName = $('#fName');
  const fAge = $('#fAge');
  const fDx = $('#fDx');
  const fProgress = $('#fProgress');
  const fLabs = $('#fLabs');
  const sPain = $('#sPain');
  const sNausea = $('#sNausea');
  const sDyspnea = $('#sDyspnea');
  const sFatigue = $('#sFatigue');
  const fDone = $('#fDone');
  const btnDeletePatient = $('#btnDeletePatient');
  const esasBlock = $('#esasBlock');
  const closeModal = $('#closeModal');

  let editingId = null;

  function ensuresActiveDept(){
    if(!state.settings.activeDeptId && state.depts.length){
      state.settings.activeDeptId = state.depts[0].id;
    }
  }

  function renderDepts(){
    ensuresActiveDept();
    deptList.innerHTML = '';
    for(const d of state.depts){
      const item = h('div', { className: 'dept-item' + (d.id===state.settings.activeDeptId ? ' active':''), tabIndex:0 });
      const dot = h('span', { className:'dept-color' }); dot.style.background = d.color;
      const name = h('span', { textContent: d.name });
      const edit = h('button', { className:'btn tiny ghost', textContent:'تحرير' });
      const del = h('button', { className:'btn tiny ghost', textContent:'حذف' });
      item.append(dot, name, h('div',{className:'spacer'}), edit, del);
      item.addEventListener('click', (e)=>{
        if(e.target===edit || e.target===del) return;
        state.settings.activeDeptId = d.id; save(); render();
      });
      edit.addEventListener('click', (e)=>{
        e.stopPropagation();
        const newName = prompt('اسم القسم', d.name);
        if(!newName) return;
        d.name = newName;
        const newColor = prompt('لون HEX (اختياري)', d.color);
        if(newColor) d.color = newColor;
        save(); renderDepts();
      });
      del.addEventListener('click', (e)=>{
        e.stopPropagation();
        if(!confirm('حذف القسم؟ سيتم نقل مرضاه إلى أول قسم متاح.')) return;
        const keep = state.depts.find(x=>x.id!==d.id);
        for(const p of state.patients){ if(p.deptId===d.id) p.deptId = keep?.id ?? null; }
        state.depts = state.depts.filter(x=>x.id!==d.id);
        if(state.settings.activeDeptId===d.id) state.settings.activeDeptId = state.depts[0]?.id ?? null;
        save(); render();
      });
      deptList.appendChild(item);
    }
  }

  function renderPatients(){
    const q = (searchInput.value||'').trim();
    const activeId = state.settings.activeDeptId;
    const list = state.patients.filter(p=>(!activeId || p.deptId===activeId) && (!q || p.name.includes(q)));
    patientsContainer.innerHTML = '';
    const tpl = document.querySelector('#patientCardTpl');

    for(const p of list){
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.querySelector('.patient-name').textContent = p.name;
      node.querySelector('.tag.age').textContent = `العمر: ${p.age ?? ''}`;
      node.querySelector('.tag.dx').textContent = p.dx ?? '';
      node.querySelector('.progress').textContent = p.progress ?? '—';
      node.querySelector('.labs').textContent = p.labs ? `فحوصات: ${p.labs}` : '';

      const em = node.querySelector('.esas-mini'); em.innerHTML='';
      if(state.settings.esas && p.esas){
        const s = p.esas;
        if(s.pain>0) em.appendChild(chip(`ألم ${s.pain}/10`));
        if(s.nausea>0) em.appendChild(chip(`غثيان ${s.nausea}/10`));
        if(s.dyspnea>0) em.appendChild(chip(`ضيق نفس ${s.dyspnea}/10`));
        if(s.fatigue>0) em.appendChild(chip(`إرهاق ${s.fatigue}/10`));
      }

      const chk = node.querySelector('.chkDone');
      chk.checked = !!p.done;
      chk.addEventListener('change', ()=>{ p.done = chk.checked; save(); });

      node.querySelector('.btnEdit').addEventListener('click', ()=>openEdit(p.id));
      node.querySelector('.btnMove').addEventListener('click', ()=>movePatient(p.id));

      patientsContainer.appendChild(node);
    }
    if(list.length===0){
      patientsContainer.innerHTML = `<div class="glass" style="padding:16px;border-radius:12px;text-align:center;color:#cfd3ff">لا نتائج</div>`;
    }
  }

  function renderSettings(){
    toggleChecklist.checked = state.settings.checklist;
    toggleESAS.checked = state.settings.esas;
    esasBlock.classList.toggle('hidden', !state.settings.esas);
  }

  function render(){ renderDepts(); renderPatients(); renderSettings(); }

  function addDept(){
    const name = prompt('اسم القسم');
    if(!name) return;
    const color = prompt('لون HEX (اختياري)', '#7c5cff') || '#7c5cff';
    state.depts.push({ id: uid(), name, color });
    if(!state.settings.activeDeptId) state.settings.activeDeptId = state.depts[state.depts.length-1].id;
    save(); render();
  }

  function addPatient(){
    if(!state.settings.activeDeptId && state.depts.length){
      state.settings.activeDeptId = state.depts[0].id;
    }
    const deptId = state.settings.activeDeptId;
    const name = prompt('اسم المريض');
    if(!name) return;
    const age = Number(prompt('العمر')) || '';
    const dx = prompt('التشخيص') || '';
    const id = uid();
    state.patients.push({ id, deptId, name, age, dx, progress:'', labs:'', esas:{pain:0,nausea:0,dyspnea:0,fatigue:0}, done:false });
    save(); render(); openEdit(id);
  }

  function movePatient(id){
    const p = state.patients.find(x=>x.id===id); if(!p) return;
    const names = state.depts.map((d,i)=>`${i+1}. ${d.name}`).join('\\n');
    const sel = prompt('نقل إلى أي قسم؟\\n' + names);
    const idx = Number(sel)-1;
    if(isNaN(idx) || !state.depts[idx]) return;
    p.deptId = state.depts[idx].id; save(); render();
  }

  function openEdit(id){
    const p = state.patients.find(x=>x.id===id); if(!p) return;
    window.scrollTo({ top:0, behavior:'smooth' });
    editingId = id;
    modalTitle.textContent = `تحديث: ${p.name}`;
    fName.value = p.name||''; fAge.value = p.age||''; fDx.value = p.dx||'';
    fProgress.value = p.progress||''; fLabs.value = p.labs||'';
    sPain.value = p.esas?.pain ?? 0;
    sNausea.value = p.esas?.nausea ?? 0;
    sDyspnea.value = p.esas?.dyspnea ?? 0;
    sFatigue.value = p.esas?.fatigue ?? 0;
    updateSliderOutputs();
    fDone.checked = !!p.done;
    btnDeletePatient.onclick = ()=>{
      if(confirm('حذف المريض؟')){
        state.patients = state.patients.filter(x=>x.id!==id);
        save(); modal.close(); render();
      }
    };
    modal.showModal();
  }

  function updateSliderOutputs(){
    for(const el of [sPain,sNausea,sDyspnea,sFatigue]){
      const out = el.parentElement.querySelector('output');
      out.textContent = `${el.value}/10`;
    }
  }
  [sPain,sNausea,sDyspnea,sFatigue].forEach(el=>el.addEventListener('input', updateSliderOutputs));

  document.querySelector('#btnSavePatient').addEventListener('click', (e)=>{
    e.preventDefault();
    const p = state.patients.find(x=>x.id===editingId); if(!p) return;
    p.name = fName.value.trim(); p.age = Number(fAge.value)||''; p.dx = fDx.value.trim();
    p.progress = fProgress.value.trim(); p.labs = fLabs.value.trim();
    p.esas = { pain:Number(sPain.value), nausea:Number(sNausea.value), dyspnea:Number(sDyspnea.value), fatigue:Number(sFatigue.value) };
    p.done = fDone.checked;
    save(); modal.close(); render();
  });
  document.querySelector('#closeModal').addEventListener('click', ()=>modal.close());

  // Settings
  toggleChecklist.addEventListener('change', ()=>{ state.settings.checklist = toggleChecklist.checked; save(); render(); });
  toggleESAS.addEventListener('change', ()=>{ state.settings.esas = toggleESAS.checked; save(); render(); });

  btnAddDept.addEventListener('click', addDept);
  btnAddPatient.addEventListener('click', addPatient);
  searchInput.addEventListener('input', render);

  btnReset.addEventListener('click', ()=>{
    if(confirm('سيتم حذف البيانات المحلية فقط، هل تريد المتابعة؟')){
      Storage.reset();
      const fresh = seed();
      Object.assign(state, fresh);
      Storage.save(state);
      render();
    }
  });

  // CSV import
  const csvReader = new FileReader();
  csvReader.onload = () => {
    const text = csvReader.result || "";
  };
  // Using direct handler to avoid async top-level complexities
  document.querySelector('#csvInput').addEventListener('change', async (evt)=>{
    const file = evt.target.files?.[0]; if(!file) return;
    const text = await file.text();
    const lines = text.split(/\\r?\\n/).filter(Boolean);
    let count = 0;
    for(const line of lines){
      const parts = line.split(',').map(s=>s.trim().replace(/^"|"$|^'|'$/g,''));
      if(parts.length<1) continue;
      const [name, age, dx] = parts;
      if(!name) continue;
      state.patients.push({ id: uid(), deptId: state.settings.activeDeptId, name, age: Number(age)||'', dx: dx||'', progress:'', labs:'', esas:{pain:0,nausea:0,dyspnea:0,fatigue:0}, done:false });
      count++;
    }
    save(); render(); toast(`تم استيراد ${count} مريض`);
  });

  // Report & CSV
  btnReport.addEventListener('click', ()=>openPrintReport(state));
  btnCSV.addEventListener('click', ()=>exportCSV(state));

  // Initial render
  render();
})();
*** a/js/core.js
--- b/js/core.js
***************
-  function importCSVText(text) {
-    const lines = text.split(/\r?\n/).filter(Boolean);
-    if (!lines.length) return toast(i18n('emptyCSV', 'ملف CSV فارغ'));
-    // حاول اكتشاف رأس header
-    const first = lines[0].toLowerCase();
-    const hasHeader = ['name', 'age', 'mrn', 'diagnosis', 'dx'].some(k => first.includes(k));
-    const dataLines = hasHeader ? lines.slice(1) : lines;
-
-    let count = 0;
-    for (const line of dataLines) {
-      const parts = line.split(',').map(s => s.trim().replace(/^"|"$|^'|'$/g, ''));
-      if (parts.length < 1) continue;
-      // نحاول map مرن: name, age, mrn, dx
-      const [name, age, mrn, dx] = parts;
-      if (!name) continue;
-      App.state.patients.push({
-        id: uid(),
-        deptId: getActiveDeptId(),
-        name,
-        age: Number(age) || '',
-        mrn: mrn || '',
-        dx: dx || '',
-        progress: '', labs: '',
-        esas: {}, ctcae: {},
-        done: false
-      });
-      count++;
-    }
-    App.save(); renderAll(); toast(i18n('importedN', 'تم استيراد ') + count + i18n('patients', ' مريض'));
-  }
+  // === CSV Import (ذكي: يدعم Header EN/AR + ESAS/CTCAE) ===
+  function importCSVText(text) {
+    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
+    if (!lines.length) return toast(i18n('emptyCSV', 'ملف CSV فارغ'));
+
+    // Parser بسيط يدعم الاقتباسات المزدوجة
+    function parseLine(line) {
+      const out = [];
+      let cur = '', inQ = false;
+      for (let i = 0; i < line.length; i++) {
+        const ch = line[i];
+        if (inQ) {
+          if (ch === '"') {
+            if (line[i + 1] === '"') { cur += '"'; i++; }
+            else inQ = false;
+          } else cur += ch;
+        } else {
+          if (ch === '"') inQ = true;
+          else if (ch === ',') { out.push(cur); cur = ''; }
+          else cur += ch;
+        }
+      }
+      out.push(cur);
+      return out.map(s => s.trim());
+    }
+
+    const headerRaw = parseLine(lines[0]);
+    const hasHeader = headerRaw.some(h =>
+      /^(name|patient|الاسم|age|العمر|mrn|file|file no\.?|رقم الملف|diagnosis|dx|التشخيص|progress|daily progress|التطور اليومي|labs|tests|الفحوصات|done|منجز|esas_|ctcae_)/i.test(h)
+    );
+    const rows = (hasHeader ? lines.slice(1) : lines).map(parseLine);
+
+    // عند وجود هيدر: نبني خريطة فهارس ونقرأ كل الأعمدة
+    if (hasHeader) {
+      const idx = {};
+      headerRaw.forEach((h, i) => idx[h.toLowerCase()] = i);
+
+      let count = 0;
+      const activeDeptId = getActiveDeptId();
+
+      function pick(row, ...keys) {
+        for (const k of keys) {
+          const i = idx[k.toLowerCase()];
+          if (i != null) return row[i] ?? '';
+        }
+        return '';
+      }
+
+      for (const row of rows) {
+        const Name = String(pick(row, 'name','patient','الاسم')).trim();
+        if (!Name) continue;
+
+        const Age = pick(row, 'age','العمر');
+        const MRN = pick(row, 'mrn','file','file no.','رقم الملف');
+        const Dx  = pick(row, 'diagnosis','dx','التشخيص');
+        const Progress = pick(row, 'progress','daily progress','التطور اليومي');
+        const Labs = pick(row, 'labs','tests','الفحوصات');
+        const Done = pick(row, 'done','منجز');
+
+        const p = {
+          id: uid(),
+          deptId: activeDeptId,
+          name: Name,
+          age: Number(Age) || '',
+          mrn: String(MRN || '').trim(),
+          dx: String(Dx || '').trim(),
+          progress: String(Progress || '').trim(),
+          labs: String(Labs || '').trim(),
+          esas: {}, ctcae: {},
+          done: /^y(es)?|1|true|✓|✅$/i.test(String(Done).trim())
+        };
+
+        // ESAS (10 عناصر)
+        const ESAS_KEYS = ['pain','tiredness','drowsiness','nausea','appetite','dyspnea','depression','anxiety','wellbeing','constipation'];
+        ESAS_KEYS.forEach(k => {
+          const i = idx[('esas_' + k).toLowerCase()];
+          p.esas[k] = (i != null) ? (Number(row[i]) || 0) : 0;
+        });
+
+        // CTCAE (10 عناصر) — مع خريطة constipationAE -> constipation
+        const mapCt = { constipationae: 'constipation' };
+        const CTCAE_KEYS = ['mucositis','diarrhea','constipationAE','neuropathy','rash','fever','bleeding','infection','oralDryness','sleepDisturb'];
+        CTCAE_KEYS.forEach(k => {
+          const i = idx[('ctcae_' + k).toLowerCase()];
+          const real = mapCt[k.toLowerCase()] || k;
+          p.ctcae[real] = (i != null) ? (Number(row[i]) || 0) : 0;
+        });
+
+        App.state.patients.push(p);
+        count++;
+      }
+      App.save(); renderAll(); toast(i18n('importedN','تم استيراد ') + count + i18n('patients',' مريض'));
+      return;
+    }
+
+    // بدون هيدر: نحافظ على السلوك القديم (Name, Age, MRN, Dx)
+    let count = 0;
+    for (const fields of rows) {
+      const [name, age, mrn, dx] = fields;
+      if (!name) continue;
+      App.state.patients.push({
+        id: uid(),
+        deptId: getActiveDeptId(),
+        name,
+        age: Number(age) || '',
+        mrn: mrn || '',
+        dx: dx || '',
+        progress: '', labs: '',
+        esas: {}, ctcae: {},
+        done: false
+      });
+      count++;
+    }
+    App.save(); renderAll(); toast(i18n('importedN','تم استيراد ') + count + i18n('patients',' مريض'));
+  }
