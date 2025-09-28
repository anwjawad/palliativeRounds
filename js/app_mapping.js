/**
 * app_mapping.js (smart)
 * يحوّل بين كائن المريض في التطبيق <-> الأعمدة الحرفية في Google Sheet.
 * - يطبّع أسماء المفاتيح (lowercase, إزالة مسافات/نقاط/أقواس/شرطات/أندرلاين)
 * - عند الإرسال: يحاول إيجاد كل عمود عبر aliases + التطبيع + التفتيش داخل الكائنات المتداخلة
 * - عند القراءة من الشيت: يبني كائن مناسب للواجهة ويترك المفاتيح الحرفية كما هي
 */

(function () {
  if (window.PR_MAP) return;

  // الهيدر الرسمي المطلوب (Patients)
  const COLS = [
    'id','section','done','updatedAt',
    'Patient Code','Patient Name','Patient Age','Room',
    'Admitting Provider','Cause Of Admission','Diet','Isolation','Comments',
    'hpi.cause','hpi.previous','hpi.current','hpi.initial',
    'esas.Pain','esas.Tiredness','esas.Drowsiness','esas.Nausea',
    'esas.Lack of Appetite','esas.Shortness of Breath','esas.Depression',
    'esas.Anxiety','esas.Wellbeing',
    'ctcae.enabled','ctcae.diarrhea','ctcae.constipation','ctcae.mucositis',
    'ctcae.peripheral_neuropathy','ctcae.sleep_disturbance','ctcae.xerostomia',
    'ctcae.dysphagia','ctcae.odynophagia',
    'labs.WBC','labs.HGB','labs.PLT','labs.ANC','labs.CRP','labs.Albumin',
    'labs.Sodium (Na)','labs.Potassium (K)','labs.Chloride (Cl)','labs.Calcium (Ca)',
    'labs.Phosphorus (Ph)','labs.Alkaline Phosphatase (ALP)',
    'labs.Creatinine (Scr)','labs.BUN','labs.Total Bile','labs.Other',
    'labs.crpTrend','labs.other',
    'latestNotes','patientAssessment','medicationList'
  ];

  // طبيع المفاتيح: يحولها لصيغة موحّدة للمقارنة
  function normKey(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[.\-_/()]/g, '')
      .replace(/of|the/g, ''); // يبسط شوي
  }

  // اصنع قاموس للهيدر الموحّد → اسم العمود الحرفي
  const CANON = {};
  COLS.forEach(c => CANON[normKey(c)] = c);

  // ترميزات شائعة (aliases) → تُربط باسم العمود الحرفي
  const ALIASES = {
    // مفاتيح عامة
    id: 'id',
    section: 'section',
    done: 'done',
    updatedat: 'updatedAt',
    // Bio
    patientcode: 'Patient Code',
    patientname: 'Patient Name',
    patientage: 'Patient Age',
    room: 'Room',
    admittingprovider: 'Admitting Provider',
    causeadmission: 'Cause Of Admission',
    causeofadmission: 'Cause Of Admission',
    diet: 'Diet',
    isolation: 'Isolation',
    comments: 'Comments',
    // HPI
    hpicause: 'hpi.cause',
    hpiprevious: 'hpi.previous',
    hpicurrent: 'hpi.current',
    hpiinitial: 'hpi.initial',
    // ESAS
    esaspain: 'esas.Pain',
    esastiredness: 'esas.Tiredness',
    esasdrowsiness: 'esas.Drowsiness',
    esasnausea: 'esas.Nausea',
    esaslackofappetite: 'esas.Lack of Appetite',
    esasshortnessofbreath: 'esas.Shortness of Breath',
    esasdepression: 'esas.Depression',
    esasanxiety: 'esas.Anxiety',
    esaswellbeing: 'esas.Wellbeing',
    // CTCAE
    ctcaeenabled: 'ctcae.enabled',
    ctcaediarrhea: 'ctcae.diarrhea',
    ctcaeconstipation: 'ctcae.constipation',
    ctcaemucositis: 'ctcae.mucositis',
    ctcaeperipheralneuropathy: 'ctcae.peripheral_neuropathy',
    ctcaesleepdisturbance: 'ctcae.sleep_disturbance',
    ctcaexerostomia: 'ctcae.xerostomia',
    ctcaedysphagia: 'ctcae.dysphagia',
    ctcaeodynophagia: 'ctcae.odynophagia',
    // Labs
    labswbc: 'labs.WBC',
    labshgb: 'labs.HGB',
    labsplt: 'labs.PLT',
    labsanc: 'labs.ANC',
    labscrp: 'labs.CRP',
    labsalbumin: 'labs.Albumin',
    labssodiumna: 'labs.Sodium (Na)',
    labspotassiumk: 'labs.Potassium (K)',
    labschloridecl: 'labs.Chloride (Cl)',
    labscalciumca: 'labs.Calcium (Ca)',
    labsphosphorusph: 'labs.Phosphorus (Ph)',
    labsalkalinephosphatasealp: 'labs.Alkaline Phosphatase (ALP)',
    labscreatininescr: 'labs.Creatinine (Scr)',
    labsbun: 'labs.BUN',
    labstotalbile: 'labs.Total Bile',
    labsother: 'labs.Other',
    labscrptrend: 'labs.crpTrend',
    labsother2: 'labs.other', // احتياطي لو في مفتاح اسمه other ثاني
    // Notes
    latestnotes: 'latestNotes',
    patientassessment: 'patientAssessment',
    medicationlist: 'medicationList',
  };

  function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  // نفرد (flatten) كائن المريض مع مسارات مفاتيح (a.b.c) ونضيف نسخة مسطّحة بلا نقاط
  function flatten(obj, prefix = '', out = {}) {
    if (!isObject(obj)) return out;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const path = prefix ? `${prefix}.${k}` : k;
      out[path] = v;
      if (isObject(v)) flatten(v, path, out);
    }
    return out;
  }

  function toBool(v) {
    if (typeof v === 'boolean') return v;
    const s = String(v || '').toLowerCase().trim();
    return s === 'true' || s === '1' || s === 'yes';
  }

  // ====== الإرسال: من نموذج التطبيق -> نموذج الشيت ======
  function toSheetPatient(appPatient) {
    const out = {};
    // 1) ابني جدول مفاتيح كثيف للتطابق
    const flat = flatten(appPatient);
    // كمان ضيف النسخ المسطحة من مفاتيح فيها نقاط: ex: bio.patientName → biopatientname
    const flat2 = {};
    for (const [k, v] of Object.entries(flat)) flat2[normKey(k)] = v;

    // 2) لكل عمود في الشيت، حاول تجيبه من:
    //    أ) مفتاح مطابق تمامًا (لو كان أصلا محفوظًا حرفيًا)
    //    ب) ALIASES
    //    ج) CANON (نفس الاسم بعد التطبيع)
    for (const col of COLS) {
      let val = '';

      // (أ) لو موجود حرفيًا داخل الكائن الأصلي
      if (Object.prototype.hasOwnProperty.call(appPatient, col)) {
        val = appPatient[col];
      } else {
        const nk = normKey(col);
        // (ب) ابحث في aliases بطرق معقولة: إذا كان لديك patientName مثلًا
        // نجرّب مباشرة عبر ALIASES ثم عبر CANON
        let candidateCol = ALIASES[nk] || CANON[nk] || null;

        if (candidateCol && Object.prototype.hasOwnProperty.call(appPatient, candidateCol)) {
          val = appPatient[candidateCol];
        } else {
          // (ج) ابحث في flat2 بنسخته المطَبَّعة
          // جرّب مباشرة nk، ولو ما لقيت، جرّب بعض الأسماء المتوقعة
          // مثال: "Patient Name" → nk=patientname
          val = flat2[nk];
          if (val === undefined) {
            // محاولات إضافية شائعة
            const fallbacks = [];
            // bio.patientName → biopatientname
            if (nk === 'patientname') fallbacks.push('biopatientname');
            if (nk === 'patientage') fallbacks.push('biopatientage', 'age');
            if (nk === 'room') fallbacks.push('bioroom');
            if (nk === 'admittingprovider') fallbacks.push('bioadmittingprovider','provider','admitting');
            if (nk === 'causeadmission' || nk === 'causeofadmission') fallbacks.push('biocauseofadmission','biocauseadmission');
            if (nk === 'diet') fallbacks.push('biodiet');
            if (nk === 'isolation') fallbacks.push('bioisolation');
            if (nk === 'comments') fallbacks.push('biocomments','notes');

            // HPI
            if (nk === 'hpicause') fallbacks.push('hpicauses','hpi_cause');
            if (nk === 'hpiprevious') fallbacks.push('hpiprev','hpi_previous');
            if (nk === 'hpicurrent') fallbacks.push('hpicur','hpi_current');
            if (nk === 'hpiinitial') fallbacks.push('hpiinit','hpi_initial');

            // ESAS (lower variants)
            if (nk.startsWith('esas')) {
              // أمثلة: esaspain ← esaspain
              fallbacks.push(nk);
            }

            // Labs شائعة
            if (nk === 'labswbc') fallbacks.push('wbc');
            if (nk === 'labshgb') fallbacks.push('hgb');
            if (nk === 'labsplt') fallbacks.push('plt');
            if (nk === 'labsanc') fallbacks.push('anc');
            if (nk === 'labscrp') fallbacks.push('crp');
            if (nk === 'labsalbumin') fallbacks.push('albumin');

            for (const fb of fallbacks) {
              if (flat2[fb] !== undefined) { val = flat2[fb]; break; }
            }
          }
        }
      }

      // Booleans محددة
      if (col === 'done' || col === 'ctcae.enabled') val = toBool(val);

      // صيغة التاريخ/الوقت لـ updatedAt — ابقي ما يأتينا أو حرّف لو Date
      if (col === 'updatedAt' && val instanceof Date) {
        val = fmtTime(val);
      }

      out[col] = (val === undefined || val === null) ? '' : val;
    }

    // ضمان وجود id
    if (!String(out.id || '').trim()) {
      out.id = genId('pt');
    }
    // ضمان updatedAt بسيط
    if (!String(out.updatedAt || '').trim()) {
      out.updatedAt = fmtTime(new Date());
    }

    return out;
  }

  // ====== القراءة: من سطر الشيت -> كائن تطبيق (مع تنظيم مساعد) ======
  function fromSheetPatient(row) {
    const p = { ...(row || {}) };

    p.bio = {
      patientCode: p['Patient Code'] || '',
      patientName: p['Patient Name'] || '',
      patientAge:  p['Patient Age']  || '',
      room:        p['Room']         || '',
      admittingProvider: p['Admitting Provider'] || '',
      causeOfAdmission:  p['Cause Of Admission'] || '',
      diet: p['Diet'] || '',
      isolation: p['Isolation'] || '',
      comments: p['Comments'] || ''
    };

    p.hpi = {
      cause:   p['hpi.cause']    || '',
      previous:p['hpi.previous'] || '',
      current: p['hpi.current']  || '',
      initial: p['hpi.initial']  || ''
    };

    p.esas = {
      pain: p['esas.Pain'] || '',
      tiredness: p['esas.Tiredness'] || '',
      drowsiness: p['esas.Drowsiness'] || '',
      nausea: p['esas.Nausea'] || '',
      lackOfAppetite: p['esas.Lack of Appetite'] || '',
      shortnessOfBreath: p['esas.Shortness of Breath'] || '',
      depression: p['esas.Depression'] || '',
      anxiety: p['esas.Anxiety'] || '',
      wellbeing: p['esas.Wellbeing'] || ''
    };

    p.ctcae = {
      enabled: !!p['ctcae.enabled'],
      diarrhea: p['ctcae.diarrhea'] || '',
      constipation: p['ctcae.constipation'] || '',
      mucositis: p['ctcae.mucositis'] || '',
      peripheralNeuropathy: p['ctcae.peripheral_neuropathy'] || '',
      sleepDisturbance: p['ctcae.sleep_disturbance'] || '',
      xerostomia: p['ctcae.xerostomia'] || '',
      dysphagia: p['ctcae.dysphagia'] || '',
      odynophagia: p['ctcae.odynophagia'] || ''
    };

    p.labs = {
      WBC: p['labs.WBC'] || '',
      HGB: p['labs.HGB'] || '',
      PLT: p['labs.PLT'] || '',
      ANC: p['labs.ANC'] || '',
      CRP: p['labs.CRP'] || '',
      Albumin: p['labs.Albumin'] || '',
      na: p['labs.Sodium (Na)'] || '',
      k:  p['labs.Potassium (K)'] || '',
      cl: p['labs.Chloride (Cl)'] || '',
      ca: p['labs.Calcium (Ca)'] || '',
      ph: p['labs.Phosphorus (Ph)'] || '',
      alp: p['labs.Alkaline Phosphatase (ALP)'] || '',
      scr: p['labs.Creatinine (Scr)'] || '',
      bun: p['labs.BUN'] || '',
      totalBile: p['labs.Total Bile'] || '',
      other: p['labs.Other'] || '',
      crpTrend: p['labs.crpTrend'] || ''
    };

    p.notes = {
      latest: p['latestNotes'] || '',
      assessment: p['patientAssessment'] || '',
      medications: p['medicationList'] || ''
    };

    return p;
  }

  // Utilities
  function genId(prefix) { return (prefix||'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }
  function pad(n){ return n<10?'0'+n:''+n; }
  function fmtTime(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }

  window.PR_MAP = { toSheetPatient, fromSheetPatient };
})();