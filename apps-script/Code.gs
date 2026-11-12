/**
 * HealthWatch: Apps Script สำหรับเก็บผลตรวจลง Google Sheet และแจ้งเตือน LINE
 *
 * วิธีใช้
 * 1. นำเข้าไฟล์ data/mock-data.csv ลงชีตชื่อ "records" (หรือปล่อยว่างแล้วให้สคริปต์สร้างหัวตารางให้)
 * 2. แก้ค่าใน setupLineConfig() แล้วกด Run ฟังก์ชันนี้ 1 ครั้ง
 * 3. Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone)
 * 4. เอาลิงก์ /exec ไปใส่ใน config.js ของหน้าเว็บ
 */

const SHEET_NAME = "records";

// ==================== เกณฑ์ทั้งหมด (สำเนาของ CRITERIA ใน app.js ต้องตรงกันทุกตัวเลข) ====================
// ห้ามเปลี่ยนตัวเลขโดยไม่ถามเจ้าของโปรเจกต์ก่อน ตรวจสอบกับเอกสารอ้างอิงก่อนใช้
const CRITERIA = {
  hearing: {
    freqs: [500, 1000, 2000, 3000, 4000, 6000, 8000],
    evalFreqs: [500, 1000, 2000, 3000, 4000, 6000], // 8000 Hz บันทึกแต่ไม่ใช้คำนวณเกณฑ์
    abnormalShift: 15, // ประกาศกรมสวัสดิการและคุ้มครองแรงงาน เรื่อง หลักเกณฑ์และวิธีการจัดทำโครงการอนุรักษ์การได้ยินฯ พ.ศ. 2561
    retestDays: 30,
    notifyDays: 7,
    watchShift: 10, // กำหนดโดยโปรเจกต์ HealthWatch เพื่อเตือนก่อนถึงเกณฑ์ตามประกาศ
    osha: { freqs: [2000, 3000, 4000], shift: 10 }, // ข้อมูลเสริม: OSHA 29 CFR 1910.95(g)(10) STS
    notch: { freqs: [3000, 4000, 6000], lowRef: [1000, 2000], highRef: [8000], depth: 10, minLevel: 25 }, // ข้อมูลเสริม: Coles และคณะ (2000) + WHO (1991)
  },
  lung: { ratioMin: 70, fvcMin: 80, fev1DropAbnormal: 15, fev1DropWatch: 8 },
};

const freqSuffix_ = (f) => (f < 1000 ? String(f) : f / 1000 + "k");
const hearingKey_ = (side, f) => side + freqSuffix_(f);
const freqLabel_ = (f) => f.toLocaleString("en-US");
const EARS = [["r", "หูขวา"], ["l", "หูซ้าย"]];
const HEARING_FIELDS = EARS.flatMap((e) => CRITERIA.hearing.freqs.map((f) => hearingKey_(e[0], f)));
const HEADERS = ["record_id", "emp_id", "dept", "year", "test_type", ...HEARING_FIELDS, "fvc_pct", "fev1_pct", "fev1_fvc", "note", "created_at"];
const NUM_FIELDS = ["year", ...HEARING_FIELDS, "fvc_pct", "fev1_pct", "fev1_fvc"];

// ใส่ค่าจริงแทน ใส่_... แล้วกด Run ฟังก์ชันนี้ 1 ครั้ง (ช่องที่ยังเป็น ใส่_... จะไม่ถูกเขียนทับ จึงรันซ้ำได้ปลอดภัย)
// LINE_RECIPIENT_ID: "ALL" = ทุกคนที่แอดบอท, "Uxxx" = คนเดียว, "Uxxx,Uyyy" = หลายคน (ดูคำอธิบายที่ lineRequest_)
function setupLineConfig() {
  const values = {
    LINE_CHANNEL_ACCESS_TOKEN: "ใส่_CHANNEL_ACCESS_TOKEN",
    LINE_RECIPIENT_ID: "ใส่_USER_ID_หรือ_ALL",
  };
  const props = PropertiesService.getScriptProperties();
  Object.keys(values).forEach((k) => {
    if (values[k].indexOf("ใส่_") !== 0) props.setProperty(k, values[k].trim());
  });
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  // ชีตรุ่นเก่ามีแค่ 3 ความถี่ (r2k..l4k) ถ้าบันทึกต่อคอลัมน์จะเลื่อน จึงหยุดและบอกวิธีแก้
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const missing = HEADERS.filter((h) => h !== "created_at" && head.indexOf(h) < 0);
  if (missing.length) {
    throw new Error("หัวตารางในชีต records เป็นรูปแบบเก่า ขาดคอลัมน์ " + missing.join(", ") +
      " ให้นำเข้า data/mock-data.csv ใหม่ (ไฟล์ → นำเข้า → แทนที่ชีตปัจจุบัน)");
  }
  return sh;
}

function readRecords_() {
  const values = getSheet_().getDataRange().getValues();
  const head = values.shift().map(String);
  return values.filter((row) => row[0] !== "").map((row) => {
    const o = {};
    head.forEach((h, i) => { o[h] = row[i]; });
    NUM_FIELDS.forEach((k) => { o[k] = o[k] === "" || o[k] === null ? null : Number(o[k]); });
    o.emp_id = String(o.emp_id).trim();
    return o;
  });
}

// เปลี่ยนทุกครั้งที่แก้โค้ด ใช้เช็กว่า Deploy เวอร์ชันใหม่แล้วหรือยัง (เปิด /exec?action=version)
const SCRIPT_VERSION = "2569-11-12-line-diag";

function json_(obj) {
  obj.version = SCRIPT_VERSION;
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// หมายเหตุด้านความปลอดภัย: ตอนนี้ doGet/doPost ไม่ได้ตรวจสิทธิ์ ใครมีลิงก์ /exec ก็อ่านข้อมูลทั้งหมดได้
// PIN ในหน้าเว็บ (config.js) ไม่ปลอดภัยพอ ระบบจริงต้องตรวจสิทธิ์ที่นี่ เช่น รับ token แล้วตรวจบทบาท
// ส่งข้อมูลรายคนเฉพาะ จป./แพทย์ และส่งเฉพาะตัวเลขสรุปของแผนกให้หัวหน้าแผนก
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "list";
    if (action === "version") return json_({ ok: true });
    if (action !== "list") return json_({ ok: false, error: "ไม่รู้จักคำสั่ง " + action });
    return json_({ ok: true, records: readRecords_() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ตรวจข้อมูลก่อนบันทึก ใช้เกณฑ์เดียวกับ validateRecord() ใน app.js ถ้าแก้ฝั่งหนึ่งต้องแก้อีกฝั่งให้ตรงกัน
// (ไม่ใช่เกณฑ์ประเมินสุขภาพ เป็นแค่ช่วงค่าที่เป็นไปได้ของข้อมูล)
const EMP_RE = /^[A-Z0-9][A-Z0-9-]{1,19}$/;
const RANGES = {
  hearing: { fields: HEARING_FIELDS, min: -10, max: 120, msg: "ระดับการได้ยินต้องอยู่ระหว่าง -10 ถึง 120 dB HL" },
  fvc_pct: { min: 1, max: 200, msg: "FVC ต้องอยู่ระหว่าง 1 ถึง 200% ของค่าคาดคะเน" },
  fev1_pct: { min: 1, max: 200, msg: "FEV1 ต้องอยู่ระหว่าง 1 ถึง 200% ของค่าคาดคะเน" },
  fev1_fvc: { min: 1, max: 100, msg: "FEV1/FVC ต้องอยู่ระหว่าง 1 ถึง 100% (เกิน 100% เป็นไปไม่ได้ ตรวจว่ากรอกสลับกับช่อง FVC หรือไม่)" },
};

function validate_(rec, records) {
  const emp = String(rec.emp_id || "").trim();
  if (!emp) return "กรอกรหัสพนักงานก่อนบันทึก";
  if (!EMP_RE.test(emp)) return "รหัสพนักงานใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และขีด ยาว 2–20 ตัว เช่น E-0001 (ห้ามใช้ชื่อจริงเพื่อปกป้องข้อมูลสุขภาพ)";
  const dept = String(rec.dept || "").trim();
  if (!dept) return "เลือกแผนกก่อนบันทึก";
  if (dept.length > 50 || /^[=+\-@]/.test(dept)) return "ชื่อแผนกไม่ถูกต้อง ห้ามขึ้นต้นด้วย = + - @ และยาวไม่เกิน 50 ตัวอักษร";
  const year = Number(rec.year);
  const maxYear = new Date().getFullYear() + 543 + 1;
  if (!Number.isInteger(year)) return "กรอกปีเป็นตัวเลข พ.ศ. เช่น 2569";
  if (year >= 1900 && year <= 2200) return "ปี " + year + " ดูเหมือนเป็น ค.ศ. ให้บวก 543 เป็น พ.ศ. เช่น 2026 → 2569";
  if (year < 2500 || year > maxYear) return "ปีที่ตรวจต้องอยู่ระหว่าง พ.ศ. 2500 ถึง " + maxYear;
  if (rec.test_type !== "hearing" && rec.test_type !== "lung") return "เลือกประเภทการตรวจก่อนบันทึก";
  const checks = rec.test_type === "hearing"
    ? RANGES.hearing.fields.map((f) => [f, RANGES.hearing])
    : ["fvc_pct", "fev1_pct", "fev1_fvc"].map((f) => [f, RANGES[f]]);
  for (let i = 0; i < checks.length; i++) {
    const v = rec[checks[i][0]];
    const r = checks[i][1];
    if (v === null || v === undefined || v === "" || isNaN(Number(v))) return "กรอกค่าผลตรวจให้ครบทุกช่องเป็นตัวเลข";
    if (Number(v) < r.min || Number(v) > r.max) return r.msg;
  }
  if (rec.test_type === "lung" && Number(rec.fev1_pct) > Number(rec.fvc_pct) * 1.5) return "FEV1 สูงกว่า FVC มากผิดปกติ ตรวจว่ากรอกสลับช่องหรือไม่";
  if (records.some((r) => r.emp_id === emp && r.year === year && r.test_type === rec.test_type)) {
    return emp + " มีผลตรวจ" + (rec.test_type === "hearing" ? "การได้ยิน" : "สมรรถภาพปอด") + "ปี " + year + " อยู่แล้ว ถ้าต้องการแก้ไขให้แก้ในชีต records โดยตรง";
  }
  return "";
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    // ถ้ามีคนบันทึกพร้อมกันหลายคน รอคิวได้ไม่เกิน 10 วินาที
    locked = lock.tryLock(10000);
    if (!locked) return json_({ ok: false, error: "มีคนกำลังบันทึกพร้อมกันหลายคน รอสักครู่แล้วกดบันทึกอีกครั้ง" });
    if (!e || !e.postData || !e.postData.contents) return json_({ ok: false, code: "invalid", error: "ไม่ได้รับข้อมูลผลตรวจ กรอกฟอร์มให้ครบแล้วกดบันทึกอีกครั้ง" });
    let rec;
    try { rec = JSON.parse(e.postData.contents); } catch (parseErr) {
      return json_({ ok: false, code: "invalid", error: "ข้อมูลที่ส่งมาอ่านไม่ได้ ให้บันทึกจากหน้าเว็บ HealthWatch เท่านั้น" });
    }
    rec.emp_id = String(rec.emp_id || "").trim().toUpperCase();
    rec.dept = String(rec.dept || "").trim();
    rec.note = "";
    const records = readRecords_();
    const invalid = validate_(rec, records);
    if (invalid) return json_({ ok: false, code: "invalid", error: invalid });

    rec.created_at = new Date();
    // เขียนตามลำดับหัวตารางจริงของชีต เผื่อมีคนสลับคอลัมน์
    const sh = getSheet_();
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    sh.appendRow(head.map((h) => (rec[h] === null || rec[h] === undefined ? "" : rec[h])));

    NUM_FIELDS.forEach((k) => { rec[k] = rec[k] === "" || rec[k] === null || rec[k] === undefined ? null : Number(rec[k]); });
    records.push(rec);
    const result = evaluate_(rec, records);
    let lineSent = false;
    let lineError = "";
    if (result.level === 2) {
      // บอกสาเหตุให้หน้าเว็บแสดง เมื่อส่ง LINE ไม่สำเร็จ (ไม่ส่ง token กลับไป)
      try {
        const lr = lineRequest_(buildMessage_(rec, result));
        if (!lr) lineError = "ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN หรือ LINE_RECIPIENT_ID";
        else if (lr.getResponseCode() === 200) lineSent = true;
        else lineError = "LINE ตอบกลับรหัส " + lr.getResponseCode() + ": " + lr.getContentText().slice(0, 200);
      } catch (lineErr) {
        lineError = "เรียก LINE ไม่สำเร็จ: " + String(lineErr).slice(0, 200);
      }
    }
    return json_({ ok: true, level: result.level, reasons: result.reasons, actions: result.actions, lineSent: lineSent, lineError: lineError });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

// ===== ตรรกะประเมินผล ต้องให้ผลเหมือน evaluate() ใน app.js ทุกตัวอักษร (ทดสอบด้วยข้อมูลสมมติทั้งชุด) =====
const isNum_ = (v) => typeof v === "number" && !isNaN(v);

function hearingAvg_(r) {
  const freqs = CRITERIA.hearing.osha.freqs;
  const avg = (side) => {
    const v = freqs.map((f) => r[hearingKey_(side, f)]);
    return v.every(isNum_) ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return { right: avg("r"), left: avg("l") };
}

function hearingShifts_(rec, base) {
  const out = [];
  EARS.forEach(([side, earName]) => {
    CRITERIA.hearing.freqs.forEach((f) => {
      const k = hearingKey_(side, f);
      if (isNum_(rec[k]) && isNum_(base[k])) {
        out.push({ side: side, earName: earName, freq: f, shift: rec[k] - base[k], evaluated: CRITERIA.hearing.evalFreqs.indexOf(f) >= 0 });
      }
    });
  });
  return out;
}

function detectNotch_(rec) {
  const n = CRITERIA.hearing.notch;
  const found = [];
  EARS.forEach(([side, earName]) => {
    const v = (f) => rec[hearingKey_(side, f)];
    const low = n.lowRef.map(v).filter(isNum_);
    const high = n.highRef.map(v).filter(isNum_);
    if (!low.length || !high.length) return;
    const lowBest = Math.min(...low);
    const highBest = Math.min(...high);
    let deepest = null;
    n.freqs.forEach((f) => {
      const x = v(f);
      if (isNum_(x) && x > n.minLevel && x - lowBest >= n.depth && x - highBest >= n.depth && (!deepest || x > deepest.level)) {
        deepest = { freq: f, level: x };
      }
    });
    if (deepest) found.push({ side: side, earName: earName, freq: deepest.freq, depth: Math.min(deepest.level - lowBest, deepest.level - highBest) });
  });
  return found;
}

const listShifts_ = (arr) => arr.map((s) => (s.shift > 0 ? "+" : "") + s.shift + " dB ที่ " + freqLabel_(s.freq) + " Hz").join(", ");

function evaluate_(rec, records) {
  const earlier = records
    .filter((r) => r.emp_id === rec.emp_id && r.test_type === rec.test_type && r.year < rec.year && r.record_id !== rec.record_id)
    .sort((a, b) => a.year - b.year);
  const base = earlier.length ? earlier[0] : null;
  let level = 0;
  const reasons = [];
  const actions = [];
  const info = [];
  if (rec.test_type === "hearing") {
    const H = CRITERIA.hearing;
    if (base) {
      const evald = hearingShifts_(rec, base).filter((s) => s.evaluated);
      const bad = evald.filter((s) => s.shift >= H.abnormalShift);
      const watch = evald.filter((s) => s.shift >= H.watchShift && s.shift < H.abnormalShift);
      if (bad.length) {
        level = 2;
        EARS.forEach(([side, earName]) => {
          const e = bad.filter((s) => s.side === side);
          if (e.length) reasons.push(earName + "แย่ลง " + listShifts_(e) + " เทียบกับปี " + base.year + " (เกณฑ์ตั้งแต่ " + H.abnormalShift + " dB ตามประกาศกรมสวัสดิการฯ)");
        });
        actions.push("ตรวจการได้ยินซ้ำภายใน " + H.retestDays + " วัน เพื่อยืนยันผล");
        actions.push("แจ้งผลให้ลูกจ้างทราบภายใน " + H.notifyDays + " วัน");
      } else if (watch.length) {
        level = 1;
        EARS.forEach(([side, earName]) => {
          const e = watch.filter((s) => s.side === side);
          if (e.length) reasons.push(earName + "แย่ลง " + listShifts_(e) + " เทียบกับปี " + base.year + " (ยังไม่ถึงเกณฑ์ " + H.abnormalShift + " dB)");
        });
      }
      const cur = hearingAvg_(rec);
      const b = hearingAvg_(base);
      const sts = [cur.right - b.right, cur.left - b.left].filter(isNum_);
      if (sts.length) {
        const worst = Math.max(...sts);
        info.push("OSHA: ค่าเฉลี่ย 2,000/3,000/4,000 Hz เปลี่ยน " + (worst > 0 ? "+" : "") + worst.toFixed(1) + " dB " +
          (worst >= H.osha.shift ? "เข้าเกณฑ์ Standard Threshold Shift (" + H.osha.shift + " dB)" : "ไม่ถึงเกณฑ์ STS (" + H.osha.shift + " dB)"));
      }
    }
    detectNotch_(rec).forEach((n) => info.push(n.earName + "มีรอยบุ๋มที่ " + freqLabel_(n.freq) + " Hz ลึก " + n.depth + " dB ลักษณะเข้าได้กับการสูญเสียการได้ยินจากเสียงดัง"));
  } else {
    const L = CRITERIA.lung;
    if (rec.fev1_fvc < L.ratioMin) { level = 2; reasons.push("FEV1/FVC " + rec.fev1_fvc + "% ต่ำกว่า " + L.ratioMin + "% เข้าได้กับการอุดกั้นทางเดินหายใจ"); }
    if (rec.fvc_pct < L.fvcMin) { level = 2; reasons.push("FVC " + rec.fvc_pct + "% ของค่าคาดคะเน ต่ำกว่า " + L.fvcMin + "% เข้าได้กับการจำกัดการขยายตัวของปอด"); }
    if (base) {
      const d = ((base.fev1_pct - rec.fev1_pct) / base.fev1_pct) * 100;
      if (d >= L.fev1DropAbnormal) { level = 2; reasons.push("FEV1 ลดลง " + d.toFixed(1) + "% เทียบกับปี " + base.year + " (เกณฑ์ " + L.fev1DropAbnormal + "%)"); }
      else if (d >= L.fev1DropWatch) { level = Math.max(level, 1); reasons.push("FEV1 ลดลง " + d.toFixed(1) + "% เทียบกับปี " + base.year); }
    }
  }
  return { level: level, reasons: reasons, actions: actions, info: info };
}

// มาตรการแก้ไขฉบับย่อตามลำดับชั้นการควบคุมอันตราย (Hierarchy of Controls)
// สำเนาจาก line ใน data/controls.js (Apps Script อ่านไฟล์ของหน้าเว็บไม่ได้) ถ้าแก้ฝั่งหนึ่งต้องแก้อีกฝั่งให้ตรงกัน
// ตรวจสอบกับเอกสารอ้างอิงก่อนใช้: ชื่อกฎหมายและเนื้อหามาตรการต้องเทียบกับต้นฉบับก่อนนำไปใช้จริง
const CONTROLS_LEVELS = [
  ["elimination", "กำจัด"],
  ["substitution", "ทดแทน"],
  ["engineering", "วิศวกรรม"],
  ["administrative", "บริหาร"],
  ["ppe", "PPE"],
];
const CONTROLS_LINE = {
  hearing: {
    hazard: "เสียงดัง",
    elimination: "ตัดขั้นตอนที่เกิดเสียงกระแทก หรือแยกเครื่องจักรไปห้องที่ไม่มีคน",
    substitution: "เปลี่ยนเป็นเครื่องจักรรุ่นเสียงเบา",
    engineering: "ครอบเก็บเสียง แผงกั้นเสียง ยางรองฐานเครื่อง",
    administrative: "วัดเสียงและ dosimeter ทบทวนโครงการอนุรักษ์การได้ยิน ลดเวลาสัมผัส",
    ppe: "ที่อุดหูหรือครอบหูที่ลดเสียงได้พอ และตรวจการใส่",
    ref: "กฎกระทรวงฯ ความร้อน แสงสว่าง และเสียง พ.ศ. 2559", // ตรวจสอบกับเอกสารอ้างอิงก่อนใช้
  },
  lung: {
    hazard: "ฝุ่นหรือสารเคมี",
    elimination: "ตัดขั้นตอนที่ก่อฝุ่นหรือไอระเหย เลิกใช้สารที่ไม่จำเป็น",
    substitution: "เปลี่ยนเป็นสีสูตรน้ำหรือสารที่อันตรายน้อยกว่า",
    engineering: "ระบบระบายอากาศเฉพาะที่ (LEV) ปิดคลุมกระบวนการ ใช้วิธีเปียก",
    administrative: "วัดความเข้มข้นในอากาศ อบรมตาม SDS ห้ามใช้ลมเป่าทำความสะอาด",
    ppe: "หน้ากากที่เหมาะกับชนิดสาร พร้อม fit test",
    ref: "กฎกระทรวงฯ สารเคมีอันตราย พ.ศ. 2556", // ตรวจสอบกับเอกสารอ้างอิงก่อนใช้
  },
};

function controlsText_(type) {
  const c = CONTROLS_LINE[type];
  if (!c) return "";
  return "มาตรการแก้ไข (" + c.hazard + ") เรียงจากได้ผลมากไปน้อย\n" +
    CONTROLS_LEVELS.map((lv, i) => (i + 1) + ". " + lv[1] + ": " + c[lv[0]]).join("\n") + "\n" +
    "อ้างอิง: " + c.ref;
}

function buildMessage_(rec, result) {
  const name = rec.test_type === "hearing" ? "การได้ยิน" : "สมรรถภาพปอด";
  return "HealthWatch: พบผลตรวจผิดปกติ\n" +
    "พนักงาน: " + rec.emp_id + " (แผนก" + rec.dept + ")\n" +
    "การตรวจ: " + name + " ปี " + rec.year + "\n" +
    "เหตุผล: " + result.reasons.join(", ") + "\n" +
    ((result.actions || []).length ? "ต้องทำ: " + result.actions.join(" และ ") + "\n" : "") +
    ((result.info || []).length ? "ข้อมูลเสริม: " + result.info.join(", ") + "\n" : "") +
    "ควรส่งพบแพทย์อาชีวเวชศาสตร์และตรวจสภาพแวดล้อมการทำงานของแผนกนี้\n\n" +
    controlsText_(rec.test_type);
}

// ผู้รับ (LINE_RECIPIENT_ID) ใส่ได้ 3 แบบ
//   "ALL"                 = ส่งหาทุกคนที่แอดบอทเป็นเพื่อน (broadcast) ไม่ต้องหา ID ใคร
//   "Uxxx" หรือ "Cxxx"    = ส่งหาคนเดียว (User ID) หรือกลุ่มเดียว (Group ID)
//   "Uxxx,Uyyy"           = ส่งหาหลายคน คั่นด้วยจุลภาค (สูงสุด 500 คน)
// หมายเหตุ: ALL ใครแอดบอทก็ได้ข้อความ ใช้กับข้อมูลสมมติได้ ระบบจริงควรระบุ ID หรือใช้กลุ่ม
function lineRequest_(text) {
  const props = PropertiesService.getScriptProperties();
  const token = (props.getProperty("LINE_CHANNEL_ACCESS_TOKEN") || "").trim();
  const to = (props.getProperty("LINE_RECIPIENT_ID") || "").trim();
  if (!token || !to || token.indexOf("ใส่_") === 0 || to.indexOf("ใส่_") === 0) return null;
  const messages = [{ type: "text", text: text }];
  let path, body;
  if (to.toUpperCase() === "ALL") {
    path = "broadcast"; body = { messages: messages };
  } else {
    const ids = to.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length > 1) { path = "multicast"; body = { to: ids, messages: messages }; }
    else { path = "push"; body = { to: ids[0], messages: messages }; }
  }
  return UrlFetchApp.fetch("https://api.line.me/v2/bot/message/" + path, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
}

function sendLine_(text) {
  const res = lineRequest_(text);
  return !!res && res.getResponseCode() === 200;
}

function testLine() {
  Logger.log(sendLine_("ทดสอบจาก HealthWatch: ถ้าเห็นข้อความนี้แปลว่าตั้งค่า LINE ถูกต้องแล้ว"));
}

// เปลี่ยนเป็นส่งหาทุกคนที่แอดบอท (เปลี่ยนเฉพาะผู้รับ token เดิมไม่หาย) รันครั้งเดียว
function useLineBroadcast() {
  PropertiesService.getScriptProperties().setProperty("LINE_RECIPIENT_ID", "ALL");
  Logger.log("ตั้งค่าแล้ว: ส่งแจ้งเตือนหาทุกคนที่แอดบอท HealthWatch เป็นเพื่อน");
}

// ใช้เมื่อ testLine ขึ้น false: บอกสาเหตุทีละข้อ (ไม่แสดง token ในบันทึก)
function checkLine() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("LINE_CHANNEL_ACCESS_TOKEN");
  const to = props.getProperty("LINE_RECIPIENT_ID");
  if (!token) return Logger.log("ไม่พบ LINE_CHANNEL_ACCESS_TOKEN ในพร็อพเพอร์ตี้ของสคริปต์ ตรวจว่าชื่อตรงทุกตัวอักษรและกดบันทึกแล้ว");
  if (!to) return Logger.log("ไม่พบ LINE_RECIPIENT_ID ในพร็อพเพอร์ตี้ของสคริปต์ ตรวจว่าชื่อตรงทุกตัวอักษรและกดบันทึกแล้ว");
  if (token.indexOf("ใส่_") === 0 || to.indexOf("ใส่_") === 0) return Logger.log("ค่ายังเป็นตัวอย่าง ใส่_... (ใส่ค่าจริงในบรรทัด setupLineConfig แล้วรันฟังก์ชันนั้น)");
  const mode = to.trim().toUpperCase() === "ALL" ? "ทุกคนที่แอดบอท (broadcast)"
    : to.indexOf(",") >= 0 ? to.split(",").length + " คน (multicast)" : "คนเดียว/กลุ่มเดียว ขึ้นต้นด้วย " + to.trim().slice(0, 1) + " ยาว " + to.trim().length + " ตัวอักษร (ควรเป็น U หรือ C และ 33)";
  Logger.log("token ยาว " + token.trim().length + " ตัวอักษร | ส่งหา: " + mode);
  const res = lineRequest_("ทดสอบจาก HealthWatch (checkLine)");
  Logger.log("LINE ตอบกลับรหัส " + res.getResponseCode() + ": " + res.getContentText());
}
