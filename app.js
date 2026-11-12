const HW = (() => {
  // v2: เปลี่ยนเป็นออดิโอแกรม 7 ความถี่ ข้อมูลที่กรอกเพิ่มในรูปแบบเดิม (3 ความถี่) จะไม่ถูกนำมาใช้
  const LS_KEY = "healthwatch-demo-records-v2";
  const LEVELS = ["ปกติ", "เฝ้าระวัง", "ผิดปกติ"];
  const TEST_NAMES = { hearing: "การได้ยิน", lung: "สมรรถภาพปอด" };

  // ==================== เกณฑ์ทั้งหมดของระบบ ====================
  // ทุกตัวเลขที่ใช้ตัดสินผลอยู่ที่นี่ที่เดียว (Code.gs มีสำเนา CRITERIA ที่ต้องตรงกัน)
  // ห้ามเปลี่ยนตัวเลขโดยไม่ถามเจ้าของโปรเจกต์ก่อน (ดู CLAUDE.md)
  // ตรวจสอบกับเอกสารอ้างอิงก่อนใช้: ชื่อและข้อกำหนดของแหล่งอ้างอิงด้านล่างเรียบเรียงเพื่อการศึกษา
  const CRITERIA = {
    hearing: {
      // ความถี่ที่บันทึก (Hz) และชื่อฟิลด์ต่อท้าย เช่น r500, l4k
      freqs: [500, 1000, 2000, 3000, 4000, 6000, 8000],
      // ความถี่ที่ใช้ตัดสินผล 8000 Hz บันทึกและแสดงในกราฟ แต่ไม่ใช้คำนวณเกณฑ์
      evalFreqs: [500, 1000, 2000, 3000, 4000, 6000],
      // เกณฑ์หลัก: เทียบกับผลครั้งแรก (baseline) หูข้างใดแย่ลงตั้งแต่ 15 dB ที่ความถี่ใดความถี่หนึ่ง = ผิดปกติ
      abnormalShift: 15,
      retestDays: 30, // ต้องตรวจซ้ำเพื่อยืนยันภายใน 30 วัน
      notifyDays: 7, // ต้องแจ้งผลให้ลูกจ้างทราบภายใน 7 วัน
      source: "ประกาศกรมสวัสดิการและคุ้มครองแรงงาน เรื่อง หลักเกณฑ์และวิธีการจัดทำโครงการอนุรักษ์การได้ยินในสถานประกอบกิจการ พ.ศ. 2561", // ตรวจสอบกับเอกสารอ้างอิงก่อนใช้
      // เฝ้าระวัง: แย่ลง 10–14 dB ที่ความถี่ใดความถี่หนึ่ง (ค่าที่โปรเจกต์นี้กำหนดเองเพื่อเตือนล่วงหน้า ไม่ได้มาจากประกาศ)
      watchShift: 10,
      watchSource: "กำหนดโดยโปรเจกต์ HealthWatch เพื่อเตือนก่อนถึงเกณฑ์ตามประกาศ",
      // ข้อมูลเสริม ไม่ใช้ตัดสินผลหลัก: OSHA Standard Threshold Shift ค่าเฉลี่ย 2000/3000/4000 Hz แย่ลงตั้งแต่ 10 dB
      osha: {
        freqs: [2000, 3000, 4000],
        shift: 10,
        source: "OSHA 29 CFR 1910.95(g)(10) Standard Threshold Shift", // ตรวจสอบกับเอกสารอ้างอิงก่อนใช้
      },
      // ข้อมูลเสริม: รอยบุ๋ม (notch) ที่ 3000–6000 Hz ซึ่งเป็นลักษณะของการสูญเสียการได้ยินจากเสียงดัง
      // ระดับการได้ยินที่ 3k, 4k หรือ 6k แย่กว่าทั้งความถี่ต่ำ (1k หรือ 2k) และ 8k อย่างน้อย 10 dB
      // และก้นรอยบุ๋มต้องเกิน 25 dB HL (เริ่มสูญเสียการได้ยินตาม WHO 1991) เพื่อไม่นับรอยบุ๋มเล็ก ๆ ในคนที่ได้ยินปกติ
      notch: {
        freqs: [3000, 4000, 6000],
        lowRef: [1000, 2000],
        highRef: [8000],
        depth: 10,
        minLevel: 25, // เงื่อนไขนี้โปรเจกต์เพิ่มเอง ไม่ได้มาจาก Coles
        minLevelSource: "WHO (1991) Report of the informal working group on prevention of deafness and hearing impairment: ระดับ > 25 dB HL = เริ่มสูญเสียการได้ยิน", // ตรวจสอบกับเอกสารอ้างอิงก่อนใช้
        source: "Coles RRA และคณะ (2000) Guidelines on the diagnosis of noise-induced hearing loss for medicolegal purposes, Clin Otolaryngol 25:264–273", // ตรวจสอบกับเอกสารอ้างอิงก่อนใช้
      },
      // ช่วงแกนตั้งของออดิโอแกรม (dB HL)
      chartRange: [-10, 90],
    },
    lung: {
      ratioMin: 70, // FEV1/FVC ต่ำกว่า 70% = ผิดปกติ (อุดกั้น)
      fvcMin: 80, // FVC ต่ำกว่า 80% ของค่าคาดคะเน = ผิดปกติ (จำกัดการขยายตัว)
      fev1DropAbnormal: 15, // FEV1 ลดลงจากปีแรกตั้งแต่ 15% = ผิดปกติ
      fev1DropWatch: 8, // FEV1 ลดลงจากปีแรกตั้งแต่ 8% = เฝ้าระวัง
      source: "ATS/ERS Standardization of Spirometry (2005, ปรับปรุง 2019) และ ACOEM Spirometry in the Occupational Health Setting (2011)", // ตรวจสอบกับเอกสารอ้างอิงก่อนใช้
    },
    cluster: {
      minAbnormal: 3, // แผนกมีคนผิดปกติตั้งแต่ 3 คน
      minRate: 0.2, // และคิดเป็น 20% ขึ้นไปของคนที่ตรวจ
      source: "กำหนดโดยโปรเจกต์ HealthWatch",
    },
  };

  // ชื่อฟิลด์ของแต่ละความถี่: 500 → "500", 1000 → "1k", 2000 → "2k" ...
  const freqSuffix = (f) => (f < 1000 ? String(f) : f / 1000 + "k");
  const hearingKey = (side, f) => side + freqSuffix(f);
  const freqLabel = (f) => f.toLocaleString("en-US");
  const EARS = [["r", "หูขวา"], ["l", "หูซ้าย"]];
  const HEARING_FIELDS = EARS.flatMap(([s]) => CRITERIA.hearing.freqs.map((f) => hearingKey(s, f)));
  const NUM_FIELDS = ["year", ...HEARING_FIELDS, "fvc_pct", "fev1_pct", "fev1_fvc"];

  // ลิงก์ Apps Script มาได้ 3 ทาง เรียงตามลำดับ:
  //   1. window.HW_API_URL จาก config.js หรือ config.local.js (ไฟล์ในเครื่อง ไม่ขึ้น GitHub)
  //   2. ลิงก์แชร์ ?api=<ลิงก์ /exec> เปิดครั้งเดียวแล้วเบราว์เซอร์จำไว้ (?api=off = เลิกใช้ กลับโหมดสาธิต)
  //   3. ว่างทั้งหมด = โหมดสาธิต
  const API_KEY = "healthwatch-api-url";
  const API_RE = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
  (function readSharedApiLink() {
    let params;
    try { params = new URLSearchParams(location.search); } catch (e) { return; }
    const v = (params.get("api") || "").trim();
    if (!v) return;
    try {
      if (v === "off") localStorage.removeItem(API_KEY);
      else if (API_RE.test(v)) localStorage.setItem(API_KEY, v);
    } catch (e) { /* เบราว์เซอร์ไม่ให้เก็บข้อมูล ใช้โหมดสาธิตต่อ */ }
    // ลบลิงก์ออกจากแถบที่อยู่ ไม่ให้ติดไปตอนคัดลอกลิงก์หน้าอื่นส่งต่อ
    params.delete("api");
    const q = params.toString();
    try { history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash); } catch (e) { /* ไม่เป็นไร */ }
  })();
  function storedApiUrl() {
    try { return localStorage.getItem(API_KEY) || ""; } catch (e) { return ""; }
  }
  const apiUrl = () => ((window.HW_API_URL || "").trim() || storedApiUrl()).trim();
  const isDemo = () => !apiUrl();

  function normalize(r) {
    const out = { ...r };
    NUM_FIELDS.forEach((k) => {
      out[k] = out[k] === "" || out[k] == null ? null : Number(out[k]);
    });
    out.emp_id = String(out.emp_id).trim();
    return out;
  }

  // ข้อผิดพลาดที่บอกผู้ใช้ได้ว่าเกิดอะไรและต้องแก้ยังไง (title = เกิดอะไร, steps = วิธีแก้ทีละข้อ)
  class HwError extends Error {
    constructor(title, steps, detail) {
      super(title);
      this.title = title;
      this.steps = steps || [];
      this.detail = detail || "";
    }
  }

  const STEP_DEMO = 'ถ้ายังไม่พร้อมเชื่อม Google Sheet ให้แก้ config.js เป็น window.HW_API_URL = "" เพื่อใช้โหมดสาธิตไปก่อน';
  const STEP_TEST_LINK = "ลองเปิดลิงก์ใน config.js ต่อท้ายด้วย ?action=list ในแท็บใหม่ ต้องเห็นข้อความที่ขึ้นต้นด้วย {\"ok\":true";
  const STEP_ACCESS = "ใน Apps Script ไปที่ Deploy → Manage deployments ตรวจว่า Execute as: Me และ Who has access: Anyone";
  const TIMEOUT_MS = 20000;

  function checkApiUrl() {
    const url = apiUrl();
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
      throw new HwError("ลิงก์ Apps Script ใน config.js ไม่ถูกต้อง", [
        "ลิงก์ต้องขึ้นต้นด้วย https://script.google.com/ และลงท้ายด้วย /exec",
        "ถ้าลิงก์ลงท้ายด้วย /dev หรือ /edit แปลว่าก๊อปผิดลิงก์ ให้ไปที่ Deploy → Manage deployments แล้วก๊อปลิงก์ Web app",
        STEP_DEMO,
      ], "ลิงก์ที่ตั้งไว้: " + url);
    }
    return url;
  }

  // เรียก Apps Script แล้วแปลงทุกความผิดพลาดเป็น HwError ภาษาไทยพร้อมวิธีแก้
  async function callApi(url, options) {
    if (navigator.onLine === false) {
      throw new HwError("เครื่องนี้ไม่ได้ต่ออินเทอร์เน็ต", ["ตรวจ Wi-Fi หรือสายแลน แล้วกดลองใหม่", STEP_DEMO]);
    }
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    let res;
    try {
      res = await fetch(url, { ...options, signal: ctrl ? ctrl.signal : undefined });
    } catch (e) {
      if (e && e.name === "AbortError") {
        throw new HwError("Apps Script ตอบช้าเกิน " + TIMEOUT_MS / 1000 + " วินาที", [
          "รอสักครู่แล้วกดลองใหม่ ครั้งแรกของวัน Apps Script อาจช้ากว่าปกติ",
          "ถ้าช้าทุกครั้ง ตรวจว่าชีต records ไม่ได้มีข้อมูลมากผิดปกติ",
        ]);
      }
      throw new HwError("เชื่อมต่อ Apps Script ไม่ได้", [
        "ตรวจว่าเครื่องต่ออินเทอร์เน็ตอยู่",
        STEP_ACCESS,
        STEP_TEST_LINK,
        "ถ้าเพิ่งแก้ Code.gs ต้อง Deploy → Manage deployments → แก้ไข → New version ทุกครั้ง",
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (res.status === 404) {
      throw new HwError("ไม่พบ Web App ที่ลิงก์ใน config.js", [
        "ลิงก์อาจพิมพ์ผิดหรือ deployment ถูกลบไปแล้ว",
        "ไปที่ Deploy → Manage deployments ก๊อปลิงก์ Web app ใหม่มาวางใน config.js",
      ]);
    }
    if (!res.ok) {
      throw new HwError("Apps Script ตอบกลับด้วยรหัสผิดพลาด " + res.status, [STEP_ACCESS, STEP_TEST_LINK]);
    }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) {
      throw new HwError("Apps Script ตอบกลับเป็นหน้าเว็บแทนข้อมูล", [
        "มักเกิดจากยังไม่ได้อนุญาตให้ทุกคนเข้าถึง: " + STEP_ACCESS,
        "ตรวจว่าวางโค้ดจาก apps-script/Code.gs ครบทั้งไฟล์ และกด Deploy เป็น New version แล้ว",
      ]);
    }
    if (!data || data.ok !== true) {
      // ข้อผิดพลาดจากข้อมูลที่กรอก (เช่น ข้อมูลซ้ำ) แสดงตามที่ Apps Script ส่งมา
      if (data && data.code === "invalid") throw new HwError(data.error);
      throw new HwError("Apps Script แจ้งข้อผิดพลาด", [
        "ตรวจว่าชีตชื่อ records และแถวแรกเป็นหัวตารางตาม data/mock-data.csv",
        "ดูรายละเอียดเพิ่มที่ Apps Script → Executions",
      ], data && data.error ? String(data.error) : "");
    }
    return data;
  }

  async function loadRecords() {
    if (isDemo()) {
      try {
        const saved = localStorage.getItem(LS_KEY);
        if (saved) return JSON.parse(saved).map(normalize);
      } catch (e) { /* ข้อมูลในเบราว์เซอร์เสียหรือเปิดไม่ได้ ใช้ข้อมูลตั้งต้นแทน */ }
      return (window.HW_MOCK || []).map(normalize);
    }
    const data = await callApi(checkApiUrl() + "?action=list");
    if (!Array.isArray(data.records)) {
      throw new HwError("Apps Script ส่งข้อมูลกลับมาไม่ครบ", ["ตรวจว่าวางโค้ด Code.gs เวอร์ชันล่าสุดและ Deploy เป็น New version แล้ว"]);
    }
    return data.records.map(normalize);
  }

  async function saveRecord(rec) {
    if (isDemo()) {
      const all = await loadRecords();
      all.push(rec);
      let persisted = true;
      try { localStorage.setItem(LS_KEY, JSON.stringify(all)); } catch (e) { persisted = false; }
      return { ok: true, demo: true, persisted };
    }
    // ส่งเป็น text/plain เพื่อให้เป็น simple request ไม่ติด CORS preflight ของ Apps Script
    return callApi(checkApiUrl(), { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(rec) });
  }

  // ---------- ตรวจข้อมูลก่อนบันทึก (Code.gs มี validate_ ที่ใช้เกณฑ์เดียวกัน ต้องแก้ให้ตรงกัน) ----------
  const EMP_RE = /^[A-Z0-9][A-Z0-9-]{1,19}$/;
  const RANGES = {
    hearing: { fields: HEARING_FIELDS, min: -10, max: 120, msg: "ระดับการได้ยินต้องอยู่ระหว่าง -10 ถึง 120 dB HL" },
    fvc_pct: { min: 1, max: 200, msg: "FVC ต้องอยู่ระหว่าง 1 ถึง 200% ของค่าคาดคะเน" },
    fev1_pct: { min: 1, max: 200, msg: "FEV1 ต้องอยู่ระหว่าง 1 ถึง 200% ของค่าคาดคะเน" },
    fev1_fvc: { min: 1, max: 100, msg: "FEV1/FVC ต้องอยู่ระหว่าง 1 ถึง 100% (เกิน 100% เป็นไปไม่ได้ ตรวจว่ากรอกสลับกับช่อง FVC หรือไม่)" },
  };

  // คืน null ถ้าข้อมูลถูกต้อง หรือ { field, error } บอกช่องที่ผิดและวิธีแก้
  function validateRecord(rec, records) {
    const emp = String(rec.emp_id || "").trim();
    if (!emp) return { field: "emp_id", error: "กรอกรหัสพนักงานก่อนบันทึก" };
    if (!EMP_RE.test(emp)) {
      return { field: "emp_id", error: "รหัสพนักงานใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และขีด ยาว 2–20 ตัว เช่น E-0001 (ห้ามใช้ชื่อจริงเพื่อปกป้องข้อมูลสุขภาพ)" };
    }
    const dept = String(rec.dept || "").trim();
    if (!dept) return { field: "dept", error: "เลือกแผนกก่อนบันทึก" };
    // กันสูตรใน Google Sheet (ข้อความที่ขึ้นต้นด้วย = + - @ จะถูกตีความเป็นสูตร)
    if (dept.length > 50 || /^[=+\-@]/.test(dept)) return { field: "dept", error: "ชื่อแผนกไม่ถูกต้อง ห้ามขึ้นต้นด้วย = + - @ และยาวไม่เกิน 50 ตัวอักษร" };
    const year = Number(rec.year);
    const maxYear = new Date().getFullYear() + 543 + 1;
    if (!Number.isInteger(year)) return { field: "year", error: "กรอกปีเป็นตัวเลข พ.ศ. เช่น 2569" };
    if (year >= 1900 && year <= 2200) return { field: "year", error: `ปี ${year} ดูเหมือนเป็น ค.ศ. ให้บวก 543 เป็น พ.ศ. เช่น 2026 → 2569` };
    if (year < 2500 || year > maxYear) return { field: "year", error: `ปีที่ตรวจต้องอยู่ระหว่าง พ.ศ. 2500 ถึง ${maxYear}` };
    if (rec.test_type !== "hearing" && rec.test_type !== "lung") return { field: "test_type", error: "เลือกประเภทการตรวจก่อนบันทึก" };

    const checks = rec.test_type === "hearing"
      ? RANGES.hearing.fields.map((f) => [f, RANGES.hearing])
      : ["fvc_pct", "fev1_pct", "fev1_fvc"].map((f) => [f, RANGES[f]]);
    for (const [f, r] of checks) {
      const v = rec[f];
      if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return { field: f, error: "กรอกค่าผลตรวจให้ครบทุกช่องเป็นตัวเลข" };
      if (Number(v) < r.min || Number(v) > r.max) return { field: f, error: r.msg };
    }
    if (rec.test_type === "lung" && Number(rec.fev1_pct) > Number(rec.fvc_pct) * 1.5) {
      return { field: "fev1_pct", error: "FEV1 สูงกว่า FVC มากผิดปกติ ตรวจว่ากรอกสลับช่องหรือไม่" };
    }
    if ((records || []).some((r) => r.emp_id === emp && r.year === year && r.test_type === rec.test_type)) {
      return { field: "emp_id", error: `${emp} มีผลตรวจ${TEST_NAMES[rec.test_type]}ปี ${year} อยู่แล้ว ถ้าต้องการแก้ไขให้แก้ในชีต records โดยตรง` };
    }
    return null;
  }

  // แสดงกล่องข้อผิดพลาดพร้อมวิธีแก้และปุ่มลองใหม่ ไว้บนสุดของ container
  function renderError(container, err) {
    if (!container) return;
    const e = err instanceof HwError ? err
      : new HwError("เกิดข้อผิดพลาดที่ไม่คาดคิด", ["กดลองใหม่ หรือโหลดหน้าเว็บใหม่", "ถ้ายังเกิดซ้ำ ให้แจ้งผู้ดูแลระบบพร้อมข้อความด้านล่าง"], err && err.message ? err.message : String(err));
    const box = document.createElement("div");
    box.className = "error-box";
    box.setAttribute("role", "alert");
    box.innerHTML = `<strong>${escapeHtml(e.title)}</strong>` +
      (e.detail ? `<p>${escapeHtml(e.detail)}</p>` : "") +
      (e.steps.length ? `<p>วิธีแก้</p><ol>${e.steps.map((s) => "<li>" + escapeHtml(s) + "</li>").join("")}</ol>` : "") +
      '<button type="button" class="btn">ลองใหม่</button>';
    box.querySelector("button").addEventListener("click", () => location.reload());
    container.prepend(box);
  }

  // Chart.js โหลดจาก CDN ถ้าไม่มีอินเทอร์เน็ตจะไม่มีกราฟ ให้แสดงข้อความแทนแต่ส่วนอื่นยังใช้ได้
  function chartsAvailable() {
    if (typeof window.Chart === "function") return true;
    document.querySelectorAll(".chart-box").forEach((b) => {
      b.innerHTML = '<p class="empty chart-missing">โหลดกราฟไม่ได้ เพราะเครื่องนี้ไม่ได้ต่ออินเทอร์เน็ตหรือเว็บ cdn.jsdelivr.net ถูกบล็อก ตัวเลขและตารางยังใช้งานได้ตามปกติ ต่ออินเทอร์เน็ตแล้วโหลดหน้าใหม่เพื่อดูกราฟ</p>';
      b.style.height = "auto";
    });
    return false;
  }

  function resetDemo() {
    try { localStorage.removeItem(LS_KEY); } catch (e) { /* ไม่มีข้อมูลให้ลบ */ }
  }

  const isNum = (v) => typeof v === "number" && !Number.isNaN(v);

  // ค่าเฉลี่ยของความถี่ที่กำหนด แยกหูขวา/ซ้าย (ใช้กับเกณฑ์ OSHA)
  function hearingAvg(r, freqs = CRITERIA.hearing.osha.freqs) {
    const avg = (side) => {
      const v = freqs.map((f) => r[hearingKey(side, f)]);
      return v.every(isNum) ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    return { right: avg("r"), left: avg("l") };
  }

  // การเปลี่ยนแปลงเทียบกับ baseline ทุกความถี่ทุกหู (ค่าบวก = ได้ยินแย่ลง)
  function hearingShifts(rec, base) {
    const out = [];
    EARS.forEach(([side, earName]) => {
      CRITERIA.hearing.freqs.forEach((f) => {
        const k = hearingKey(side, f);
        if (isNum(rec[k]) && isNum(base[k])) {
          out.push({ side, earName, freq: f, shift: rec[k] - base[k], evaluated: CRITERIA.hearing.evalFreqs.includes(f) });
        }
      });
    });
    return out;
  }

  // หารอยบุ๋มที่ 3k–6k (ข้อมูลเสริม) คืนรายการหูที่พบ พร้อมความถี่ที่ลึกที่สุด
  function detectNotch(rec) {
    const n = CRITERIA.hearing.notch;
    const found = [];
    EARS.forEach(([side, earName]) => {
      const v = (f) => rec[hearingKey(side, f)];
      const low = n.lowRef.map(v).filter(isNum);
      const high = n.highRef.map(v).filter(isNum);
      if (!low.length || !high.length) return;
      const lowBest = Math.min(...low);
      const highBest = Math.min(...high);
      let deepest = null;
      n.freqs.forEach((f) => {
        const x = v(f);
        if (isNum(x) && x > n.minLevel && x - lowBest >= n.depth && x - highBest >= n.depth && (!deepest || x > deepest.level)) {
          deepest = { freq: f, level: x };
        }
      });
      if (deepest) found.push({ side, earName, freq: deepest.freq, depth: Math.min(deepest.level - lowBest, deepest.level - highBest) });
    });
    return found;
  }

  const listShifts = (arr) => arr.map((s) => `${s.shift > 0 ? "+" : ""}${s.shift} dB ที่ ${freqLabel(s.freq)} Hz`).join(", ");

  function history(records, empId, type) {
    return records
      .filter((r) => r.emp_id === empId && r.test_type === type)
      .sort((a, b) => a.year - b.year);
  }

  function baselineFor(rec, records) {
    const earlier = history(records, rec.emp_id, rec.test_type).filter(
      (r) => r.year < rec.year && r.record_id !== rec.record_id
    );
    return earlier.length ? earlier[0] : null;
  }

  function evaluate(rec, records) {
    const base = baselineFor(rec, records);
    let level = 0;
    const reasons = [];
    const actions = []; // สิ่งที่ต้องทำต่อตามกฎหมาย
    const info = []; // ข้อมูลเสริม ไม่ใช้ตัดสินผล
    let change = null;
    let shifts = [];

    if (rec.test_type === "hearing") {
      const H = CRITERIA.hearing;
      if (base) {
        shifts = hearingShifts(rec, base);
        const evald = shifts.filter((s) => s.evaluated);
        change = evald.length ? Math.max(...evald.map((s) => s.shift)) : null;
        const bad = evald.filter((s) => s.shift >= H.abnormalShift);
        const watch = evald.filter((s) => s.shift >= H.watchShift && s.shift < H.abnormalShift);
        if (bad.length) {
          level = 2;
          EARS.forEach(([side, earName]) => {
            const e = bad.filter((s) => s.side === side);
            if (e.length) reasons.push(`${earName}แย่ลง ${listShifts(e)} เทียบกับปี ${base.year} (เกณฑ์ตั้งแต่ ${H.abnormalShift} dB ตามประกาศกรมสวัสดิการฯ)`);
          });
          actions.push(`ตรวจการได้ยินซ้ำภายใน ${H.retestDays} วัน เพื่อยืนยันผล`);
          actions.push(`แจ้งผลให้ลูกจ้างทราบภายใน ${H.notifyDays} วัน`);
        } else if (watch.length) {
          level = 1;
          EARS.forEach(([side, earName]) => {
            const e = watch.filter((s) => s.side === side);
            if (e.length) reasons.push(`${earName}แย่ลง ${listShifts(e)} เทียบกับปี ${base.year} (ยังไม่ถึงเกณฑ์ ${H.abnormalShift} dB)`);
          });
        }
        // ข้อมูลเสริม: OSHA STS
        const cur = hearingAvg(rec);
        const b = hearingAvg(base);
        const sts = [cur.right - b.right, cur.left - b.left].filter(isNum);
        if (sts.length) {
          const worst = Math.max(...sts);
          info.push(`OSHA: ค่าเฉลี่ย 2,000/3,000/4,000 Hz เปลี่ยน ${worst > 0 ? "+" : ""}${worst.toFixed(1)} dB ` +
            (worst >= H.osha.shift ? `เข้าเกณฑ์ Standard Threshold Shift (${H.osha.shift} dB)` : `ไม่ถึงเกณฑ์ STS (${H.osha.shift} dB)`));
        }
      }
      detectNotch(rec).forEach((n) => info.push(`${n.earName}มีรอยบุ๋มที่ ${freqLabel(n.freq)} Hz ลึก ${n.depth} dB ลักษณะเข้าได้กับการสูญเสียการได้ยินจากเสียงดัง`));
    } else {
      const L = CRITERIA.lung;
      if (rec.fev1_fvc < L.ratioMin) {
        level = 2;
        reasons.push(`FEV1/FVC ${rec.fev1_fvc}% ต่ำกว่า ${L.ratioMin}% เข้าได้กับการอุดกั้นทางเดินหายใจ`);
      }
      if (rec.fvc_pct < L.fvcMin) {
        level = 2;
        reasons.push(`FVC ${rec.fvc_pct}% ของค่าคาดคะเน ต่ำกว่า ${L.fvcMin}% เข้าได้กับการจำกัดการขยายตัวของปอด`);
      }
      if (base) {
        change = ((base.fev1_pct - rec.fev1_pct) / base.fev1_pct) * 100;
        if (change >= L.fev1DropAbnormal) {
          level = 2;
          reasons.push(`FEV1 ลดลง ${change.toFixed(1)}% เทียบกับปี ${base.year} (เกณฑ์ ${L.fev1DropAbnormal}%)`);
        } else if (change >= L.fev1DropWatch) {
          level = Math.max(level, 1);
          reasons.push(`FEV1 ลดลง ${change.toFixed(1)}% เทียบกับปี ${base.year}`);
        }
      }
    }
    return { level, label: LEVELS[level], reasons, actions, info, change, shifts, baseYear: base ? base.year : null };
  }

  function years(records) {
    return [...new Set(records.map((r) => r.year))].sort((a, b) => a - b);
  }

  function employees(records) {
    const map = new Map();
    records.forEach((r) => map.set(r.emp_id, r.dept));
    return map;
  }

  function evaluatedForYear(records, year, type) {
    return records
      .filter((r) => r.year === year && (type === "all" || r.test_type === type))
      .map((r) => ({ rec: r, result: evaluate(r, records) }));
  }

  function deptSummary(evaluated) {
    const out = {};
    evaluated.forEach(({ rec, result }) => {
      const key = rec.dept;
      out[key] = out[key] || { dept: key, counts: [0, 0, 0], byType: {} };
      out[key].counts[result.level]++;
      const t = (out[key].byType[rec.test_type] = out[key].byType[rec.test_type] || { tested: 0, abnormal: 0 });
      t.tested++;
      if (result.level === 2) t.abnormal++;
    });
    return Object.values(out);
  }

  function clusterAlerts(summary) {
    const alerts = [];
    summary.forEach((d) => {
      Object.entries(d.byType).forEach(([type, t]) => {
        const rate = t.abnormal / t.tested;
        if (t.abnormal >= CRITERIA.cluster.minAbnormal && rate >= CRITERIA.cluster.minRate) {
          alerts.push({ dept: d.dept, type, abnormal: t.abnormal, tested: t.tested, rate });
        }
      });
    });
    return alerts.sort((a, b) => b.rate - a.rate);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderDemoBanner(el) {
    if (!el) return;
    if (isDemo()) {
      el.innerHTML =
        'โหมดสาธิต: ตอนนี้ใช้ข้อมูลสมมติ 60 คน ยังไม่ได้เชื่อม Google Sheet ' +
        '<button type="button" class="link-btn" id="resetDemo">ล้างข้อมูลที่กรอกเพิ่ม</button>';
      el.hidden = false;
      document.getElementById("resetDemo").addEventListener("click", () => {
        resetDemo();
        location.reload();
      });
    } else {
      el.hidden = true;
    }
  }

  // สร้าง HTML มาตรการแก้ไขตามลำดับชั้นการควบคุม เนื้อหามาจาก data/controls.js
  function renderControls(type, open) {
    const all = window.HW_CONTROLS;
    const c = all && all[type];
    if (!c) return "";
    const levels = all.levels
      .map((lv, i) => {
        const items = c.measures[lv.key] || [];
        if (!items.length) return "";
        return `<li class="hoc-level"><span class="hoc-name"><span class="hoc-step">${i + 1}</span>${escapeHtml(lv.name)}</span>` +
          `<span class="hoc-desc">${escapeHtml(lv.desc)}</span>` +
          `<ul>${items.map((t) => "<li>" + escapeHtml(t) + "</li>").join("")}</ul></li>`;
      })
      .join("");
    const refs = (c.refs || [])
      .map((r) => "<li>" + escapeHtml(r.name) + (r.note ? ` <span class="hoc-note">(${escapeHtml(r.note)})</span>` : "") + "</li>")
      .join("");
    return `<details class="controls"${open ? " open" : ""}>
      <summary>มาตรการแก้ไขสำหรับ${escapeHtml(c.hazard)} เรียงจากได้ผลมากไปน้อย</summary>
      <ol class="hoc">${levels}</ol>
      ${refs ? `<p class="hoc-ref-title">กฎหมายและมาตรฐานที่เกี่ยวข้อง</p><ul class="hoc-refs">${refs}</ul>` : ""}
    </details>`;
  }

  // ---------- การเข้าสู่ระบบด้วย PIN ----------
  // หมายเหตุ: ทั้งหมดนี้ทำงานในเบราว์เซอร์ ผู้ใช้ที่เปิด DevTools ข้ามได้ ใช้สาธิตการแบ่งสิทธิ์เท่านั้น
  // ระบบจริงต้องตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ และไม่ส่งข้อมูลรายคนมาให้บทบาทหัวหน้าแผนกตั้งแต่แรก
  const SESSION_KEY = "healthwatch-session";
  const ROLES = { officer: "จป. / แพทย์", head: "หัวหน้าแผนก" };
  const DEFAULT_PINS = { officer: "1234", head: "5678" };
  let memSession = null; // ใช้แทนเมื่อเบราว์เซอร์ไม่ให้ใช้ sessionStorage

  function pins() {
    const p = window.HW_PINS || {};
    return {
      officer: String(p.officer || DEFAULT_PINS.officer).trim(),
      head: String(p.head || DEFAULT_PINS.head).trim(),
    };
  }

  function getSession() {
    let s = memSession;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) s = JSON.parse(raw);
    } catch (e) { /* ใช้ค่าในหน่วยความจำ */ }
    if (!s || !ROLES[s.role] || (s.role === "head" && !s.dept)) return null;
    return s;
  }

  function login(role, pin, dept) {
    if (!ROLES[role]) return { ok: false, error: "เลือกบทบาทก่อนเข้าสู่ระบบ" };
    if (role === "head" && !dept) return { ok: false, error: "เลือกแผนกของคุณก่อนเข้าสู่ระบบ" };
    if (String(pin).trim() !== pins()[role]) return { ok: false, error: "PIN ไม่ถูกต้อง" };
    const s = { role, dept: role === "head" ? dept : null };
    memSession = s;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* ใช้ค่าในหน่วยความจำ */ }
    return { ok: true, session: s };
  }

  function logout() {
    memSession = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ไม่มีข้อมูลให้ลบ */ }
    location.href = "login.html";
  }

  // รับเฉพาะหน้าในโปรเจกต์ กันการพาไปเว็บอื่นผ่านพารามิเตอร์ next
  function safeNext(next) {
    return /^(index|record|person)\.html(\?[^#]*)?$/.test(next || "") ? next : "index.html";
  }

  // เรียกตอนเริ่มทุกหน้า คืนค่า session ถ้ามีสิทธิ์ ถ้าไม่มีจะพาไปหน้าเข้าสู่ระบบหรือแสดงข้อความไม่มีสิทธิ์ แล้วคืน null
  function requireLogin(allowed) {
    const s = getSession();
    if (!s) {
      const here = location.pathname.split("/").pop() + location.search;
      location.replace("login.html?next=" + encodeURIComponent(safeNext(here)));
      return null;
    }
    renderUserBox(s);
    if (allowed && allowed.indexOf(s.role) < 0) {
      const main = document.querySelector("main");
      if (main) {
        main.innerHTML = '<div class="panel denied"><h1>ไม่มีสิทธิ์เข้าหน้านี้</h1>' +
          "<p>บทบาท" + escapeHtml(ROLES[s.role]) + "ดูได้เฉพาะตัวเลขสรุปและกราฟของแผนกตัวเองในหน้าภาพรวม " +
          "เพื่อปกป้องข้อมูลสุขภาพรายบุคคลของพนักงาน</p>" +
          '<p><a href="index.html">กลับไปหน้าภาพรวม</a></p></div>';
      }
      return null;
    }
    return s;
  }

  function renderUserBox(s) {
    const bar = document.querySelector(".topbar-inner");
    if (!bar || bar.querySelector(".userbox")) return;
    if (s.role !== "officer") {
      const rec = bar.querySelector('.nav a[href="record.html"]');
      if (rec) rec.remove();
    }
    const box = document.createElement("div");
    box.className = "userbox";
    const roleText = ROLES[s.role] + (s.dept ? " · แผนก" + s.dept : "");
    box.innerHTML = '<span class="role-chip" title="' + escapeHtml("บทบาทปัจจุบัน: " + roleText) + '">' + escapeHtml(roleText) + "</span>" +
      '<button type="button" class="btn-ghost">ออกจากระบบ</button>';
    box.querySelector("button").addEventListener("click", logout);
    bar.appendChild(box);
  }

  function chartColors() {
    const css = getComputedStyle(document.documentElement);
    const v = (n) => css.getPropertyValue(n).trim();
    return { ok: v("--ok"), watch: v("--watch"), bad: v("--bad"), ink: v("--ink"), muted: v("--muted"), line: v("--line"), surface: v("--surface"), earR: v("--ear-r"), earL: v("--ear-l") };
  }

  // ---------- ลูกเล่นการเคลื่อนไหว (ปิดเองเมื่อผู้ใช้ตั้งค่าลดการเคลื่อนไหว) ----------
  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  // นับเลขขึ้นจากค่าเดิมไปค่าใหม่ ถ้าไม่ใช่ตัวเลข (เช่น "–") แสดงทันที
  function countUp(el, value) {
    if (!el) return;
    const card = el.closest(".vital");
    if (card) { card.classList.remove("pop"); void card.offsetWidth; card.classList.add("pop"); }
    const from = Number(el.textContent);
    if (typeof value !== "number" || reducedMotion() || !Number.isFinite(from) || from === value) { el.textContent = value; return; }
    const start = performance.now();
    const dur = 600;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (value - from) * eased);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ระลอกคลื่นตรงจุดที่กดปุ่ม
  function addRipple(ev) {
    const target = ev.target.closest && ev.target.closest(".btn, .btn-ghost, .nav a");
    if (!target || target.disabled || reducedMotion()) return;
    const r = target.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const dot = document.createElement("span");
    dot.className = "ripple";
    dot.style.width = dot.style.height = size + "px";
    dot.style.left = (ev.clientX - r.left - size / 2) + "px";
    dot.style.top = (ev.clientY - r.top - size / 2) + "px";
    target.appendChild(dot);
    dot.addEventListener("animationend", () => dot.remove());
  }

  // ส่วนที่มี class reveal ค่อย ๆ ปรากฏเมื่อเลื่อนมาถึง
  function initMotion() {
    document.addEventListener("pointerdown", addRipple);
    if (reducedMotion() || !("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("js-motion");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target;
        el.classList.add("in");
        io.unobserve(el);
        // ปรากฏเสร็จแล้วคืน transition เดิมของการ์ด (เช่น ยกขึ้นตอนชี้) ไม่ให้ช้าตาม delay
        setTimeout(() => { el.classList.remove("reveal", "in"); el.style.transitionDelay = ""; }, 900);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll(".reveal").forEach((el, i) => {
      el.style.transitionDelay = Math.min(i % 4, 3) * 70 + "ms";
      io.observe(el);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMotion);
  else initMotion();

  return {
    LEVELS, TEST_NAMES, isDemo, loadRecords, saveRecord, evaluate, history, hearingAvg,
    years, employees, evaluatedForYear, deptSummary, clusterAlerts, escapeHtml, renderDemoBanner, renderControls, chartColors,
    ROLES, pins, getSession, login, logout, safeNext, requireLogin,
    HwError, validateRecord, renderError, chartsAvailable, countUp, reducedMotion,
    CRITERIA, EARS, HEARING_FIELDS, hearingKey, freqLabel, hearingShifts, detectNotch,
  };
})();
