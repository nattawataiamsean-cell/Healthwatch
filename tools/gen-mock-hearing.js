// สร้างข้อมูลการได้ยินสมมติ 7 ความถี่ใหม่ (ข้อมูลปอดคงเดิม)
// ไม่จำเป็นต่อการใช้งานเว็บ ใช้เฉพาะตอนต้องการสร้างข้อมูลสมมติใหม่ (ต้องมี Node.js)
// วิธีใช้ (รันจากโฟลเดอร์ healthwatch): node tools/gen-mock-hearing.js . [--write]
// ไม่ใส่ --write = ดูสรุปผลอย่างเดียว, ใส่ --write = เขียนทับ data/mock-data.js และ data/mock-data.csv
// อ่านข้อมูลปอดและรายชื่อจาก data/mock-data.js เดิม แล้วสร้างผลการได้ยินใหม่ด้วย seed คงที่ (รันซ้ำได้ผลเหมือนเดิม)
const fs = require("fs");
const dir = process.argv[2];
const write = process.argv.includes("--write");
global.window = {};
eval(fs.readFileSync(dir + "/data/mock-data.js", "utf8"));
const src = window.HW_MOCK;

// PRNG แบบกำหนด seed เพื่อให้สร้างซ้ำได้ผลเหมือนเดิม
let seed = 20261111;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const r5 = (x) => Math.round(x / 5) * 5;
const clamp = (x) => Math.max(-10, Math.min(120, x));

const FREQS = [500, 1000, 2000, 3000, 4000, 6000, 8000];
const suf = (f) => (f < 1000 ? String(f) : f / 1000 + "k");
const KEYS = ["r", "l"].flatMap((s) => FREQS.map((f) => s + suf(f)));
// รูปร่างของรอยบุ๋มจากเสียงดัง: ลึกที่สุด 4k รองลงมา 6k และ 3k ฟื้นขึ้นที่ 8k
const NOTCH = { 500: 0, 1000: 0, 2000: 0.15, 3000: 0.6, 4000: 1.0, 6000: 0.75, 8000: 0.25 };
// ระดับการได้ยินปกติ: ความถี่สูงแย่กว่าเล็กน้อยตามธรรมชาติ แต่ไม่มีรอยบุ๋ม
const BASE_SHAPE = { 500: 5, 1000: 5, 2000: 5, 3000: 5, 4000: 10, 6000: 10, 8000: 10 };
const NOISE = [-5, 0, 0, 0, 0, 0, 0, 0, 5]; // ความคลาดเคลื่อนของการตรวจซ้ำ

const hearing = src.filter((r) => r.test_type === "hearing");
const people = {};
hearing.forEach((r) => { (people[r.emp_id] = people[r.emp_id] || { dept: r.dept, years: [] }).years.push(r.year); });

const profile = {};
Object.entries(people).forEach(([emp, p]) => {
  const base = {};
  const off = pick([-5, 0, 0, 5]);
  FREQS.forEach((f) => { const b = BASE_SHAPE[f] + off + pick([0, 0, 0, 5]); base["r" + suf(f)] = b; base["l" + suf(f)] = clamp(b + pick([-5, 0, 0, 0, 5])); });
  let k = 0;
  if (p.dept === "ปั๊มโลหะ") {
    k = pick([0.2, 0.35, 0.6, 0.8, 1.0, 1.1, 1.2, 1.4, 1.6]); // 0.25 = ใส่ที่ครอบหูสม่ำเสมอ
    // เคยสัมผัสเสียงดังมาก่อนเริ่มงาน baseline ที่ 4k จึงสูงกว่าคนทั่วไปเล็กน้อย
    base.r4k += 5; base.l4k += 5;
  }
  profile[emp] = { base, k, ear: { r: 0.85 + rnd() * 0.3, l: 0.9 + rnd() * 0.3 }, first: Math.min(...p.years) };
});

// กรณีตัวอย่างนอกแผนกปั๊มโลหะ (เปลี่ยนเล็กน้อย = เฝ้าระวัง)
const special = {};
const nonStamp = Object.keys(people).filter((e) => people[e].dept === "ประกอบชิ้นส่วน");
if (nonStamp.length) special[nonStamp[2]] = { 2569: { l6k: 10, l4k: 5 } };
const paint = Object.keys(people).filter((e) => people[e].dept === "พ่นสี");
if (paint.length) special[paint[4]] = { 2568: { r4k: 10 }, 2569: { r4k: 10, r3k: 5 } };

const out = src.map((r) => {
  const o = { record_id: r.record_id, emp_id: r.emp_id, dept: r.dept, year: r.year, test_type: r.test_type };
  KEYS.forEach((k) => (o[k] = ""));
  o.fvc_pct = r.fvc_pct; o.fev1_pct = r.fev1_pct; o.fev1_fvc = r.fev1_fvc; o.note = r.note || "";
  if (r.test_type !== "hearing") return o;
  const p = profile[r.emp_id];
  const t = r.year - p.first;
  const S = p.k * t * 5;
  ["r", "l"].forEach((s) => FREQS.forEach((f) => {
    const key = s + suf(f);
    let v = p.base[key] + S * NOTCH[f] * p.ear[s];
    if (t > 0) v += pick(NOISE);
    const sp = special[r.emp_id] && special[r.emp_id][r.year];
    if (sp && sp[key]) v += sp[key];
    o[key] = clamp(r5(v));
  }));
  return o;
});

// สรุปผลด้วย evaluate() จริงของโปรเจกต์
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.sessionStorage = global.localStorage;
global.document = { querySelector: () => null, querySelectorAll: () => [] };
window.HW_MOCK = out;
eval(fs.readFileSync(dir + "/app.js", "utf8").replace("const HW =", "global.HW ="));
const recs = out.map((r) => ({ ...r, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === "" ? null : v])) }));
for (const y of [2567, 2568, 2569]) {
  const ev = HW.evaluatedForYear(recs, y, "hearing");
  const by = {};
  ev.forEach(({ rec, result }) => { (by[rec.dept] = by[rec.dept] || [0, 0, 0])[result.level]++; });
  console.log(y, JSON.stringify(by), "alerts:", JSON.stringify(HW.clusterAlerts(HW.deptSummary(HW.evaluatedForYear(recs, y, "all"))).map((a) => a.dept + "/" + a.type + " " + a.abnormal + "/" + a.tested)));
}
const notchCount = recs.filter((r) => r.test_type === "hearing" && r.year === 2569 && HW.detectNotch(r).length);
console.log("2569 notch:", notchCount.map((r) => r.emp_id + "(" + r.dept + ")").join(" "));
const e = Object.keys(people).find((x) => people[x].dept === "ปั๊มโลหะ" && profile[x].k >= 1.3);
console.log("example", e, JSON.stringify(out.filter((r) => r.emp_id === e && r.test_type === "hearing").map((r) => [r.year, KEYS.map((k) => r[k]).join(" ")])));

if (write) {
  const cols = ["record_id", "emp_id", "dept", "year", "test_type", ...KEYS, "fvc_pct", "fev1_pct", "fev1_fvc", "note"];
  fs.writeFileSync(dir + "/data/mock-data.js",
    "// ข้อมูลสมมติ 60 คน ปี 2566–2569 (ไม่ใช่ข้อมูลของคนจริง) การได้ยิน 7 ความถี่ต่อหู แผนกปั๊มโลหะมีรอยบุ๋มที่ 3000–6000 Hz\n" +
    "window.HW_MOCK = " + JSON.stringify(out.map((o) => Object.fromEntries(cols.map((c) => [c, o[c]])))) + ";\n");
  const esc = (v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
  fs.writeFileSync(dir + "/data/mock-data.csv", "﻿" + [cols.join(","), ...out.map((o) => cols.map((c) => esc(o[c] ?? "")).join(","))].join("\n") + "\n");
  console.log("written", out.length, "records");
}
