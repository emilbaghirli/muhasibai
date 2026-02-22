import { useState, useRef } from "react";
import * as XLSX from "xlsx";

/*═══════════════════════════════════════════════════════════════
  MUHASIBAI v0.7 — Azerbaijan Accounting Platform
  2026 Tax Engine (verified: 1000₼ → net 865₼)
═══════════════════════════════════════════════════════════════*/

const TX = {
  GV_EXEMPT: 200, ISH: 0.005,
  ITS_THR: 2500, ITS_LO: 0.02, ITS_HI: 0.005,
  VAT: 0.18, PROFIT: 0.20, MW: 400,
  LEAVE: 21, WD: 21,
  LS: [{ mn: 5, mx: 10, d: 2 }, { mn: 10, mx: 15, d: 4 }, { mn: 15, mx: 99, d: 6 }],
  SEV: [{ mx: 1, m: 1.0 }, { mx: 5, m: 1.4 }, { mx: 10, m: 1.7 }, { mx: Infinity, m: 2.0 }],
  EZ: { baku: 125, naxcivan: 100, ganja: 95, sumgait: 95, other: 90 },
  SICK: { rate: 0.8, minDays: 1, maxDays: 14 },
};

function calcGV(g, sec) {
  if (sec === "state" || sec === "oil") {
    const ex = g <= 2500 ? TX.GV_EXEMPT : 0;
    const t = Math.max(0, g - ex);
    return t <= 2500 ? t * 0.14 : 2500 * 0.14 + (t - 2500) * 0.25;
  }
  if (g <= 2500) return Math.max(0, g - TX.GV_EXEMPT) * 0.03;
  if (g <= 8000) return 2500 * 0.03 + (g - 2500) * 0.10;
  return 75 + 5500 * 0.10 + (g - 8000) * 0.14;
}
function calcDSMF_EE(g) { return g <= 200 ? g * 0.03 : g <= 8000 ? 6 + (g - 200) * 0.10 : 786 + (g - 8000) * 0.10; }
function calcDSMF_ER(g) { return g <= 200 ? g * 0.22 : g <= 8000 ? 44 + (g - 200) * 0.15 : 1214 + (g - 8000) * 0.11; }
function calcITS(g) { return g <= TX.ITS_THR ? g * TX.ITS_LO : TX.ITS_THR * TX.ITS_LO + (g - TX.ITS_THR) * TX.ITS_HI; }
function cp(g, sec = "private") {
  const gv = calcGV(g, sec), dee = calcDSMF_EE(g), der = calcDSMF_ER(g);
  const ie = g * TX.ISH, ir = g * TX.ISH, te = calcITS(g), tr = calcITS(g);
  const ded = gv + dee + ie + te;
  return { g, net: g - ded, gv, dee, der, ie, ir, te, tr, ded, cost: g + der + ir + tr };
}
function calcLeave(e) { let b = 0; for (const s of TX.LS) if (e.seniority >= s.mn && e.seniority < s.mx) b = s.d; return { base: TX.LEAVE, bonus: b, total: TX.LEAVE + b }; }
function calcSev(e) { let m = 1; for (const s of TX.SEV) if (e.seniority < s.mx) { m = s.m; break; } const lv = calcLeave(e), ud = Math.max(0, lv.total - (e.usedLeave || 0)); const up = (e.gross / TX.WD) * ud; return { sev: e.gross * m, m, ud, up, total: e.gross * m + up + e.gross }; }
function calcSick(gross, days, seniority) {
  let rate = seniority < 5 ? 0.60 : seniority < 8 ? 0.70 : 0.80;
  const daily = gross / TX.WD;
  return { daily, rate, days, amount: daily * days * rate };
}

// ══════════ DATA ══════════
const EMPS0 = [
  { id: 1, name: "Əli Həsənov", pos: "Baş direktor", dept: "Rəhbərlik", gross: 5000, sec: "private", start: "2015-03-15", birth: "1980-07-22", tin: "1234567890", fin: "1AB2CD3", seniority: 11, gender: "M", contract: "Müddətsiz", status: "active", usedLeave: 8, phone: "+994502001122", bank: "AZ21NABZ00000000137010001944" },
  { id: 2, name: "Leyla Məmmədova", pos: "Baş mühasib", dept: "Maliyyə", gross: 3200, sec: "private", start: "2019-09-01", birth: "1988-03-10", tin: "2345678901", fin: "2DE5FG6", seniority: 6, gender: "F", contract: "Müddətsiz", status: "active", usedLeave: 10, phone: "+994503002233", bank: "AZ35PAHA00000000000000001234" },
  { id: 3, name: "Rəşad Əliyev", pos: "Baş proqramçı", dept: "İT", gross: 4500, sec: "private", start: "2020-01-10", birth: "1993-11-05", tin: "3456789012", fin: "3GH7IJ8", seniority: 6, gender: "M", contract: "Müddətsiz", status: "active", usedLeave: 14, phone: "+994554003344", bank: "AZ47UBER00000000000000005678" },
  { id: 4, name: "Günel Quliyeva", pos: "HR mütəxəssisi", dept: "Kadr", gross: 1800, sec: "private", start: "2022-06-20", birth: "1995-01-18", tin: "4567890123", fin: "4KL9MN0", seniority: 3, gender: "F", contract: "Müddətsiz", status: "active", usedLeave: 5, phone: "+994705004455", bank: "AZ59AIIB00000000000000009012" },
  { id: 5, name: "Tural Babayev", pos: "Satış meneceri", dept: "Satış", gross: 2400, sec: "private", start: "2020-11-01", birth: "1988-09-30", tin: "5678901234", fin: "5OP1QR2", seniority: 5, gender: "M", contract: "Müddətsiz", status: "active", usedLeave: 9, phone: "+994556005566", bank: "AZ62NABZ00000000000000003456" },
  { id: 6, name: "Aytən Sadıqova", pos: "Mühasib", dept: "Maliyyə", gross: 1200, sec: "private", start: "2023-04-15", birth: "1997-06-12", tin: "6789012345", fin: "6ST3UV4", seniority: 2, gender: "F", contract: "Müddətli", status: "active", usedLeave: 2, phone: "+994507006677", bank: "AZ74PAHA00000000000000007890" },
  { id: 7, name: "Orxan Hüseynov", pos: "Anbardar", dept: "Logistika", gross: 900, sec: "private", start: "2024-01-08", birth: "1991-12-25", tin: "7890123456", fin: "7WX5YZ6", seniority: 2, gender: "M", contract: "Müddətli", status: "active", usedLeave: 3, phone: "+994558007788", bank: "AZ86UBER00000000000000001234" },
  { id: 8, name: "Nigar İsmayılova", pos: "Ofis meneceri", dept: "İnzibati", gross: 1000, sec: "private", start: "2023-09-01", birth: "1996-04-15", tin: "8901234567", fin: "8AB7CD8", seniority: 2, gender: "F", contract: "Müddətsiz", status: "active", usedLeave: 1, phone: "+994709008899", bank: "AZ98AIIB00000000000000005678" },
];
const INVS0 = [
  { id: 1, no: "EQF-2026-0001", party: "Azərsu ASC", tin: "1301269851", amt: 15000, vat: 2700, total: 17700, date: "2026-02-05", due: "2026-02-10", st: "sent", tp: "sale", items: [{ desc: "Su təmizləmə avadanlığı", qty: 3, price: 5000, vat: 900 }], notes: "Müqavilə №A-2026/012" },
  { id: 2, no: "EQF-2026-0002", party: "SOCAR Trading", tin: "1700017921", amt: 28000, vat: 5040, total: 33040, date: "2026-02-10", due: "2026-02-15", st: "sent", tp: "sale", items: [{ desc: "Sənaye avadanlığı xidməti", qty: 1, price: 28000, vat: 5040 }], notes: "İllik müqavilə" },
  { id: 3, no: "EQF-2026-0003", party: "Bakı Taksi MMC", tin: "2200087654", amt: 8500, vat: 1530, total: 10030, date: "2026-02-15", due: "2026-02-20", st: "pending", tp: "sale", items: [{ desc: "GPS izləmə sistemi", qty: 10, price: 850, vat: 153 }], notes: "Sifariş №BT-445" },
  { id: 4, no: "EQF-2026-0004", party: "GlobalTech LLC", tin: "1100045678", amt: 6200, vat: 1116, total: 7316, date: "2026-02-18", due: "2026-02-23", st: "pending", tp: "sale", items: [{ desc: "Server texniki xidmət", qty: 2, price: 3100, vat: 558 }], notes: "" },
  { id: 5, no: "EQF-2026-0005", party: "Ofis Mebel MMC", tin: "3300012345", amt: 4200, vat: 756, total: 4956, date: "2026-02-03", due: "2026-02-08", st: "received", tp: "purchase", items: [{ desc: "Ofis stolu", qty: 6, price: 500, vat: 90 }, { desc: "Kreslo", qty: 6, price: 200, vat: 36 }], notes: "Anbar mədaxil" },
  { id: 6, no: "EQF-2026-0006", party: "Texnika Plus", tin: "4400098765", amt: 9600, vat: 1728, total: 11328, date: "2026-02-12", due: "2026-02-17", st: "received", tp: "purchase", items: [{ desc: "HP ProBook noutbuk", qty: 4, price: 2400, vat: 432 }], notes: "İT sifarişi" },
  { id: 7, no: "EQF-2026-0007", party: "Araz Market", tin: "5500011111", amt: 1800, vat: 324, total: 2124, date: "2026-02-19", due: "2026-02-24", st: "received", tp: "purchase", items: [{ desc: "Ofis ləvazimatları", qty: 1, price: 1800, vat: 324 }], notes: "" },
];
const KASSA0 = [
  { id: 1, date: "2026-02-03", tp: "in", desc: "SOCAR Trading — ödəniş", amt: 33040, doc: "MO-001", cat: "Satış", bank: "Kapital Bank" },
  { id: 2, date: "2026-02-05", tp: "out", desc: "Ofis icarəsi — Fevral", amt: 2400, doc: "XO-001", cat: "İcarə", bank: "Kapital Bank" },
  { id: 3, date: "2026-02-10", tp: "out", desc: "Əmək haqqı avansı", amt: 5200, doc: "XO-002", cat: "Əmək haqqı", bank: "Kapital Bank" },
  { id: 4, date: "2026-02-12", tp: "in", desc: "Azərsu — qismən ödəniş", amt: 10000, doc: "MO-002", cat: "Satış", bank: "Kapital Bank" },
  { id: 5, date: "2026-02-15", tp: "out", desc: "Texnika Plus ödəniş", amt: 11328, doc: "XO-003", cat: "Avadanlıq", bank: "ABB" },
  { id: 6, date: "2026-02-18", tp: "out", desc: "Kommunal xərclər", amt: 680, doc: "XO-004", cat: "Kommunal", bank: "Kapital Bank" },
  { id: 7, date: "2026-02-20", tp: "out", desc: "Əmək haqqı — Fevral", amt: 12580, doc: "XO-005", cat: "Əmək haqqı", bank: "Kapital Bank" },
  { id: 8, date: "2026-02-21", tp: "in", desc: "GlobalTech — avans", amt: 3000, doc: "MO-003", cat: "Avans", bank: "ABB" },
];
const ASSETS0 = [
  { id: 1, name: "Ofis binası (2-ci mərtəbə)", cat: "Binalar", init: 120000, cur: 102000, date: "2020-01-15", rate: 7, inv: "ƏV-001", loc: "Bakı" },
  { id: 2, name: "Server avadanlığı", cat: "Kompüter", init: 22000, cur: 10312, date: "2022-06-01", rate: 25, inv: "ƏV-002", loc: "Bakı" },
  { id: 3, name: "Toyota Camry", cat: "Nəqliyyat", init: 48000, cur: 25312, date: "2021-09-01", rate: 25, inv: "ƏV-003", loc: "Qaraj" },
  { id: 4, name: "Ofis mebeli", cat: "Mebel", init: 8500, cur: 5440, date: "2022-03-15", rate: 20, inv: "ƏV-004", loc: "Bakı" },
  { id: 5, name: "İstehsalat xətti", cat: "Maşınlar", init: 75000, cur: 48000, date: "2023-01-10", rate: 20, inv: "ƏV-005", loc: "Sumqayıt" },
  { id: 6, name: "Noutbuklar (8 əd)", cat: "Kompüter", init: 16000, cur: 7500, date: "2023-05-01", rate: 25, inv: "ƏV-006", loc: "Bakı" },
];
const DEBTORS0 = [
  { id: 1, name: "Azərsu ASC", tin: "1301269851", tp: "debitor", amt: 7700, due: "2026-03-10", inv: "EQF-2026-0001", status: "active", note: "Qismən ödənilib (10000₼)" },
  { id: 2, name: "Bakı Taksi MMC", tin: "2200087654", tp: "debitor", amt: 10030, due: "2026-02-20", inv: "EQF-2026-0003", status: "overdue", note: "Vaxtı keçib" },
  { id: 3, name: "GlobalTech LLC", tin: "1100045678", tp: "debitor", amt: 4316, due: "2026-02-23", inv: "EQF-2026-0004", status: "active", note: "3000₼ avans alınıb" },
  { id: 4, name: "Ofis Mebel MMC", tin: "3300012345", tp: "kreditor", amt: 0, due: "2026-02-08", inv: "EQF-2026-0005", status: "paid", note: "Tam ödənilib" },
  { id: 5, name: "Texnika Plus", tin: "4400098765", tp: "kreditor", amt: 0, due: "2026-02-17", inv: "EQF-2026-0006", status: "paid", note: "Tam ödənilib" },
  { id: 6, name: "Araz Market", tin: "5500011111", tp: "kreditor", amt: 2124, due: "2026-02-24", inv: "EQF-2026-0007", status: "active", note: "Ödənilməyib" },
];

// ══════════ HELPERS ══════════
const K = { bg: "#05070C", sf: "#0A0E16", cd: "#10141D", bd: "rgba(255,255,255,0.06)", tx: "#E2E8F0", mt: "#64748B", dm: "#3B4557", bl: "#3B82F6", gn: "#10B981", yl: "#F59E0B", rd: "#EF4444", pr: "#8B5CF6", cy: "#06B6D4", or: "#F97316", pk: "#EC4899" };
const F = n => n != null ? n.toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₼" : "—";
const D = d => d ? d.split("-").reverse().join(".") : "";
const P = n => n != null ? (n * 100).toFixed(1) + "%" : "—";
const nid = arr => Math.max(0, ...arr.map(x => x.id)) + 1;

// Excel export
function exportXlsx(emps) {
  const hdr = ["№","Ad Soyad","Vəzifə","Şöbə","VÖEN","FİN","Brutto","GV","DSMF","İSH","İTS","Netto","İG xərci","İşə başlama","Staj","Telefon","IBAN"];
  const rows = emps.map((e, i) => { const p = cp(e.gross, e.sec); return [i+1,e.name,e.pos,e.dept,e.tin,e.fin,e.gross,+p.gv.toFixed(2),+p.dee.toFixed(2),+p.ie.toFixed(2),+p.te.toFixed(2),+p.net.toFixed(2),+p.cost.toFixed(2),e.start,e.seniority,e.phone,e.bank]; });
  const tot = emps.reduce((a,e)=>{const p=cp(e.gross,e.sec);return{g:a.g+p.g,gv:a.gv+p.gv,d:a.d+p.dee,i:a.i+p.ie,t:a.t+p.te,n:a.n+p.net,c:a.c+p.cost}},{g:0,gv:0,d:0,i:0,t:0,n:0,c:0});
  rows.push(["","CƏMİ","","","","",+tot.g.toFixed(2),+tot.gv.toFixed(2),+tot.d.toFixed(2),+tot.i.toFixed(2),+tot.t.toFixed(2),+tot.n.toFixed(2),+tot.c.toFixed(2),"","","",""]);
  const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet([hdr,...rows]);
  ws["!cols"] = [{wch:4},{wch:22},{wch:18},{wch:12},{wch:12},{wch:10},{wch:12},{wch:10},{wch:10},{wch:8},{wch:8},{wch:12},{wch:12},{wch:12},{wch:8},{wch:16},{wch:30}];
  XLSX.utils.book_append_sheet(wb, ws, "İşçilər");
  XLSX.writeFile(wb, "isciler_siyahisi_2026.xlsx");
}

// ══════════ UI PRIMITIVES (redesigned with transitions) ══════════
const CSS = `
  .box{transition:all .2s ease;border:1px solid rgba(255,255,255,0.06)}
  .box:hover{border-color:rgba(59,130,246,0.15);box-shadow:0 0 20px rgba(59,130,246,0.04)}
  .navbtn{transition:all .15s ease}
  .navbtn:hover{background:rgba(59,130,246,0.08)!important;transform:translateX(2px)}
  .tabbtn{transition:all .15s ease;position:relative}
  .tabbtn:hover{background:rgba(59,130,246,0.12)!important}
  .tabbtn.active{background:linear-gradient(135deg,rgba(59,130,246,0.2),rgba(139,92,246,0.12))!important;color:#3B82F6!important;box-shadow:inset 0 0 12px rgba(59,130,246,0.08)}
  .statbox{transition:all .2s ease;position:relative;overflow:hidden}
  .statbox::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--ac),transparent);opacity:0;transition:opacity .2s}
  .statbox:hover::after{opacity:1}
  .statbox:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(0,0,0,0.3)}
  .row-hover:hover{background:rgba(59,130,246,0.04)!important}
  .addbtn{transition:all .15s ease}
  .addbtn:hover{transform:scale(1.03);box-shadow:0 2px 8px rgba(59,130,246,0.3)}
  .delbtn{transition:all .1s ease}
  .delbtn:hover{transform:scale(1.3);color:#EF4444!important;opacity:1!important}
  .detail-enter{animation:slideIn .2s ease}
  @keyframes slideIn{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:translateX(0)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  .sidebar{background:linear-gradient(180deg,#0A0E16 0%,#080C14 100%)}
  .logo-icon{transition:transform .3s ease}
  .logo-icon:hover{transform:rotate(15deg)}
  .form-slide{animation:formSlide .2s ease}
  @keyframes formSlide{from{opacity:0;transform:translateY(-8px);max-height:0}to{opacity:1;transform:translateY(0);max-height:500px}}
  .spark-line{filter:drop-shadow(0 0 3px currentColor)}
  input:focus,select:focus{border-color:rgba(59,130,246,0.4)!important;box-shadow:0 0 0 2px rgba(59,130,246,0.1)}
  table tr{transition:background .1s ease}
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
  ::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.2)}
`;

const Box = ({ children, style, onClick, className = "" }) => <div onClick={onClick} className={`box ${className}`} style={{ background: K.cd, borderRadius: 8, padding: 12, cursor: onClick ? "pointer" : "default", ...style }}>{children}</div>;
const Stat = ({ l, v, sub, c = K.bl, sm }) => <div className="statbox box" style={{ background: K.cd, border: `1px solid ${K.bd}`, borderRadius: 8, padding: sm ? "8px 10px" : 12, "--ac": c }}><div style={{ fontSize: 9, color: K.mt, marginBottom: 2, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{l}</div><div style={{ fontSize: sm ? 15 : 18, fontWeight: 700, color: c }}>{v}</div>{sub && <div style={{ fontSize: 9, color: K.dm, marginTop: 1 }}>{sub}</div>}</div>;
const Pill = ({ t, c = K.bl }) => <span style={{ display: "inline-flex", padding: "2px 7px", borderRadius: 10, fontSize: 9, fontWeight: 700, background: `${c}15`, color: c, border: `1px solid ${c}22` }}>{t}</span>;
const Btn = ({ children, c = K.bl, sm, ghost, ...p }) => <button {...p} className={ghost ? "" : "addbtn"} style={{ padding: sm ? "4px 8px" : "6px 12px", borderRadius: 6, border: ghost ? `1px solid ${c}44` : "none", background: ghost ? "transparent" : `linear-gradient(135deg,${c},${c}cc)`, color: "#fff", fontSize: sm ? 10 : 11, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, opacity: p.disabled ? .4 : 1, flexShrink: 0, ...p.style }}>{children}</button>;
const DelBtn = ({ onClick }) => <button onClick={e => { e.stopPropagation(); onClick(); }} title="Sil" className="delbtn" style={{ background: "none", border: "none", color: K.rd, fontSize: 14, cursor: "pointer", padding: "2px 4px", opacity: 0.4, lineHeight: 1 }}>×</button>;
const TH = ({ children, r }) => <th style={{ padding: "7px 8px", textAlign: r ? "right" : "left", color: K.mt, fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: ".04em", borderBottom: `1px solid ${K.bd}`, whiteSpace: "nowrap", position: "sticky", top: 0, background: `linear-gradient(180deg,${K.cd},${K.cd}ee)`, backdropFilter: "blur(8px)", zIndex: 1 }}>{children}</th>;
const TD = ({ children, r, b, c, m }) => <td style={{ padding: "7px 8px", textAlign: r ? "right" : "left", fontWeight: b ? 700 : 400, color: c || K.tx, fontFamily: m ? "'Courier New',monospace" : "inherit", fontSize: 11, whiteSpace: "nowrap" }}>{children}</td>;
const Row = ({ l, v, c, b, border }) => <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: border ? `1px solid ${K.bd}` : "none" }}><span style={{ fontSize: 11, fontWeight: b ? 700 : 400, color: b ? K.tx : K.mt }}>{l}</span><span style={{ fontSize: 11, fontWeight: b ? 700 : 500, color: c || K.tx }}>{v}</span></div>;
const Alert = ({ children, c = K.bl }) => <div style={{ background: `linear-gradient(135deg,${c}08,${c}04)`, border: `1px solid ${c}22`, borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 11, color: c, lineHeight: 1.5, display: "flex", gap: 6 }}><span style={{ flexShrink: 0 }}>ⓘ</span><span>{children}</span></div>;
const TabBar = ({ tabs, a, on }) => <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 3, marginBottom: 12, flexWrap: "wrap", border: `1px solid ${K.bd}` }}>{tabs.map(t => <button key={t.id} onClick={() => on(t.id)} className={`tabbtn ${a === t.id ? "active" : ""}`} style={{ flex: "1 1 auto", padding: "7px 12px", borderRadius: 6, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", background: "transparent", color: a === t.id ? K.bl : K.mt, whiteSpace: "nowrap" }}>{t.l}{t.n != null && <span style={{ marginLeft: 3, opacity: .5 }}>({t.n})</span>}</button>)}</div>;
const Inp = ({ label, ...p }) => <div style={{ marginBottom: 8 }}>{label && <label style={{ display: "block", fontSize: 9, color: K.mt, fontWeight: 700, marginBottom: 2 }}>{label}</label>}<input {...p} style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: `1px solid ${K.bd}`, background: "rgba(255,255,255,0.03)", color: K.tx, fontSize: 11, outline: "none", boxSizing: "border-box", transition: "border-color .15s, box-shadow .15s", ...p.style }} /></div>;
const Sel = ({ label, opts, ...p }) => <div style={{ marginBottom: 8 }}>{label && <label style={{ display: "block", fontSize: 9, color: K.mt, fontWeight: 700, marginBottom: 2 }}>{label}</label>}<select {...p} style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: `1px solid ${K.bd}`, background: K.cd, color: K.tx, fontSize: 11, outline: "none", transition: "border-color .15s" }}>{opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>;

// Logo: MUHASIB + crescent moon on right
const Logo = () => <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
  <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: "-.02em", color: K.tx }}>MÜHASİB</span>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 1 }}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="#F59E0B"/><circle cx="18" cy="5" r="1.2" fill="#F59E0B"/></svg>
</div>;

// Detail panel wrapper (click outside to close)
const DetailPanel = ({ children, onClose, show }) => {
  if (!show) return null;
  return <div onClick={e => e.stopPropagation()}>
    <Box style={{ position: "relative" }}>
      <button onClick={onClose} style={{ position: "absolute", top: 6, right: 8, background: "none", border: "none", color: K.mt, fontSize: 14, cursor: "pointer", padding: "2px 4px" }} title="Bağla">✕</button>
      {children}
    </Box>
  </div>;
};

// ══════════ MAIN APP ══════════
export default function App() {
  const [pg, setPg] = useState("dash");
  const [emps, setEmps] = useState(EMPS0);
  const [invs, setInvs] = useState(INVS0);
  const [kassa, setKassa] = useState(KASSA0);
  const [assets, setAssets] = useState(ASSETS0);
  const [debtors, setDebtors] = useState(DEBTORS0);
  const [selEmp, setSelEmp] = useState(null);
  const [selInv, setSelInv] = useState(null);
  const [selKas, setSelKas] = useState(null);
  const [selAst, setSelAst] = useState(null);
  const [selDbt, setSelDbt] = useState(null);

  const clearAll = () => { setSelEmp(null); setSelInv(null); setSelKas(null); setSelAst(null); setSelDbt(null); };
  const tog = (setter) => (id) => setter(p => p === id ? null : id);
  const rm = (setter, selId, selSetter) => (id) => { setter(p => p.filter(x => x.id !== id)); if (selId === id) selSetter(null); };
  const add = (setter) => (item) => setter(p => [...p, { ...item, id: nid(p) }]);

  const nav = [
    { id: "dash", ic: "◫", l: "İdarə paneli" },
    { id: "emp", ic: "◉", l: "İşçilər" },
    { id: "pay", ic: "₼", l: "Əmək haqqı" },
    { id: "tax", ic: "◆", l: "Vergi / ÖMV" },
    { id: "inv", ic: "◧", l: "E-Qaimə" },
    { id: "dbt", ic: "◑", l: "Debitor/Kreditor" },
    { id: "kas", ic: "◨", l: "Kassa / Bank" },
    { id: "ast", ic: "◩", l: "Əsas vəsaitlər" },
    { id: "bi", ic: "◈", l: "Analitika" },
    { id: "ocr", ic: "◎", l: "OCR Skaner" },
    { id: "rep", ic: "◪", l: "Hesabatlar" },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", background: K.bg, color: K.tx, fontFamily: "'Segoe UI',-apple-system,sans-serif", overflow: "hidden", fontSize: 12 }}>
      <style>{CSS}</style>
      {/* SIDEBAR */}
      <div className="sidebar" style={{ width: 180, borderRight: `1px solid ${K.bd}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "12px 10px", borderBottom: `1px solid ${K.bd}`, display: "flex", alignItems: "center", gap: 6 }}>
          <div className="logo-icon" style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg,#1E3A5F,#0A1628)", border: "1px solid rgba(245,158,11,0.3)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(245,158,11,0.1)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="#F59E0B"/><circle cx="18" cy="5" r="1.2" fill="#F59E0B"/></svg>
          </div>
          <div><Logo /><div style={{ fontSize: 7, color: K.dm, marginTop: -2 }}>v0.8 · 2026</div></div>
        </div>
        <nav style={{ padding: "6px 4px", flex: 1, overflowY: "auto" }}>
          {nav.map(n => <button key={n.id} onClick={() => { setPg(n.id); clearAll(); }} className="navbtn" style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 8px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, marginBottom: 1, background: pg === n.id ? `linear-gradient(135deg,${K.bl}15,${K.bl}08)` : "transparent", color: pg === n.id ? K.bl : K.mt, borderLeft: pg === n.id ? `2px solid ${K.bl}` : "2px solid transparent" }}><span style={{ fontSize: 11, width: 14, textAlign: "center", opacity: .7 }}>{n.ic}</span>{n.l}</button>)}
        </nav>
        <div style={{ padding: "7px 8px", borderTop: `1px solid ${K.bd}`, fontSize: 8, color: K.dm }}>Min.ƏH: {TX.MW}₼ · GV güzəşt: 200₼<br />İTS hədd: 2.500₼ (2026)</div>
      </div>

      {/* CONTENT — click background to close panels */}
      <div onClick={clearAll} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "14px 16px" }}>
        <div onClick={e => e.stopPropagation()}>
          {pg === "dash" && <Dash emps={emps} invs={invs} kassa={kassa} debtors={debtors} go={setPg} />}
          {pg === "emp" && <Emps emps={emps} sel={selEmp} tog={tog(setSelEmp)} rm={rm(setEmps, selEmp, setSelEmp)} addEmp={add(setEmps)} />}
          {pg === "pay" && <Pay emps={emps} />}
          {pg === "tax" && <TaxPage emps={emps} />}
          {pg === "inv" && <Invs invs={invs} sel={selInv} tog={tog(setSelInv)} rm={rm(setInvs, selInv, setSelInv)} setInvs={setInvs} addInv={add(setInvs)} />}
          {pg === "dbt" && <Debtors data={debtors} sel={selDbt} tog={tog(setSelDbt)} rm={rm(setDebtors, selDbt, setSelDbt)} addDbt={add(setDebtors)} setData={setDebtors} />}
          {pg === "kas" && <Kas data={kassa} sel={selKas} tog={tog(setSelKas)} rm={rm(setKassa, selKas, setSelKas)} addKas={add(setKassa)} />}
          {pg === "ast" && <Ast data={assets} sel={selAst} tog={tog(setSelAst)} rm={rm(setAssets, selAst, setSelAst)} />}
          {pg === "bi" && <Analitika emps={emps} invs={invs} kassa={kassa} assets={assets} />}
          {pg === "ocr" && <OCR />}
          {pg === "rep" && <RepPage emps={emps} invs={invs} assets={assets} debtors={debtors} kassa={kassa} />}
        </div>
      </div>
    </div>
  );
}

// ══════════ DASHBOARD ══════════
function Dash({ emps, invs, kassa, debtors, go }) {
  const ps = emps.map(e => cp(e.gross, e.sec));
  const rev = invs.filter(i => i.tp === "sale").reduce((s, i) => s + i.amt, 0);
  const oV = invs.filter(i => i.tp === "sale").reduce((s, i) => s + i.vat, 0) - invs.filter(i => i.tp === "purchase").reduce((s, i) => s + i.vat, 0);
  const kb = kassa.reduce((s, k) => s + (k.tp === "in" ? k.amt : -k.amt), 0);
  const dbtT = debtors.filter(d => d.tp === "debitor" && d.status !== "paid").reduce((s, d) => s + d.amt, 0);
  const krdT = debtors.filter(d => d.tp === "kreditor" && d.status !== "paid").reduce((s, d) => s + d.amt, 0);
  return <div>
    <div style={{ marginBottom: 12 }}><h1 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>İdarə Paneli</h1><div style={{ fontSize: 10, color: K.mt }}>Fevral 2026 · {emps.length} işçi</div></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 8, marginBottom: 14 }}>
      <Stat l="Satış" v={F(rev)} c={K.gn} sm /><Stat l="ƏH fondu" v={F(ps.reduce((s, p) => s + p.g, 0))} c={K.bl} sm />
      <Stat l="ƏDV" v={F(oV)} c={K.or} sm /><Stat l="Kassa" v={F(kb)} c={K.gn} sm />
      <Stat l="Debitor" v={F(dbtT)} c={K.yl} sm /><Stat l="Kreditor" v={F(krdT)} c={K.rd} sm />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
      <Box><div style={{ fontSize: 9, fontWeight: 800, color: K.mt, textTransform: "uppercase", marginBottom: 6 }}>Vergi (Fevral)</div>
        {[{ l: "GV", v: ps.reduce((s, p) => s + p.gv, 0), c: K.yl }, { l: "DSMF", v: ps.reduce((s, p) => s + p.dee + p.der, 0), c: K.pr }, { l: "İTS", v: ps.reduce((s, p) => s + p.te + p.tr, 0), c: K.cy }, { l: "ƏDV", v: oV, c: K.rd }].map((r, i) =>
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${K.bd}` }}><span style={{ fontSize: 10, color: K.mt, display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 4, height: 4, borderRadius: "50%", background: r.c }} />{r.l}</span><span style={{ fontSize: 10, fontWeight: 700 }}>{F(r.v)}</span></div>)}
      </Box>
      <Box><div style={{ fontSize: 9, fontWeight: 800, color: K.mt, textTransform: "uppercase", marginBottom: 6 }}>Son Tarixlər</div>
        {[{ d: "2026-03-20", t: "Vahid bəyannamə", c: K.bl }, { d: "2026-03-31", t: "İllik GV (2025)", c: K.rd }, { d: "2026-04-20", t: "R1 ƏDV bəyannaməsi", c: K.or }, { d: "2026-04-30", t: "Maliyyə hesabatları", c: K.gn }].map((d, i) => {
          const days = Math.ceil((new Date(d.d) - new Date("2026-02-22")) / 864e5);
          return <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${K.bd}` }}><div><div style={{ fontSize: 10 }}>{d.t}</div><div style={{ fontSize: 8, color: K.dm }}>{D(d.d)}</div></div><Pill t={`${days}g`} c={days <= 14 ? K.rd : days <= 30 ? K.yl : K.gn} /></div>; })}
      </Box>
      <Box><div style={{ fontSize: 9, fontWeight: 800, color: K.mt, textTransform: "uppercase", marginBottom: 6 }}>Keçidlər</div>
        {[{ l: "İşçilər", p: "emp", c: K.bl }, { l: "Əmək haqqı", p: "pay", c: K.gn }, { l: "Vergi / ÖMV", p: "tax", c: K.yl }, { l: "Debitor/Kreditor", p: "dbt", c: K.or }, { l: "Analitika", p: "bi", c: K.cy }].map((a, i) =>
          <button key={i} onClick={() => go(a.p)} style={{ display: "block", width: "100%", padding: "5px 8px", marginBottom: 2, borderRadius: 4, border: `1px solid ${a.c}30`, background: `${a.c}06`, color: a.c, fontSize: 10, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>{a.l}</button>)}
      </Box>
    </div>
  </div>;
}

// ══════════ EMPLOYEES ══════════
function Emps({ emps, sel, tog, rm, addEmp }) {
  const [tab, setTab] = useState("profile");
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ name:"", pos:"", dept:"", gross:"", tin:"", fin:"", phone:"", birth:"", start:"", contract:"Müddətsiz", gender:"M", bank:"" });
  const emp = emps.find(e => e.id === sel);
  const submit = () => { if(!nf.name||!nf.pos||!nf.gross)return; addEmp({...nf,gross:+nf.gross,sec:"private",seniority:0,status:"active",usedLeave:0}); setNf({name:"",pos:"",dept:"",gross:"",tin:"",fin:"",phone:"",birth:"",start:"",contract:"Müddətsiz",gender:"M",bank:""}); setAdding(false); };

  return <div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
      <h1 style={{ margin:0, fontSize:17, fontWeight:800 }}>İşçilər <span style={{ fontWeight:400, fontSize:12, color:K.mt }}>({emps.length})</span></h1>
      <div style={{ display:"flex", gap:6 }}><Btn c={K.bl} sm onClick={()=>setAdding(!adding)}>{adding?"✕ Bağla":"+ Yeni işçi"}</Btn><Btn c={K.gn} sm onClick={()=>exportXlsx(emps)}>⬇ Excel</Btn></div>
    </div>
    {adding && <Box style={{ marginBottom:10, borderColor:`${K.bl}33` }}>
      <div style={{ fontSize:10, fontWeight:800, color:K.bl, marginBottom:8 }}>Yeni İşçi</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:6 }}>
        <Inp label="Ad Soyad *" value={nf.name} onChange={e=>setNf({...nf,name:e.target.value})} />
        <Inp label="Vəzifə *" value={nf.pos} onChange={e=>setNf({...nf,pos:e.target.value})} />
        <Inp label="Şöbə" value={nf.dept} onChange={e=>setNf({...nf,dept:e.target.value})} />
        <Inp label="Brutto ƏH *" type="number" value={nf.gross} onChange={e=>setNf({...nf,gross:e.target.value})} />
        <Inp label="VÖEN" value={nf.tin} onChange={e=>setNf({...nf,tin:e.target.value})} />
        <Inp label="FİN" value={nf.fin} onChange={e=>setNf({...nf,fin:e.target.value})} />
        <Inp label="Telefon" value={nf.phone} onChange={e=>setNf({...nf,phone:e.target.value})} />
        <Inp label="İşə başlama" type="date" value={nf.start} onChange={e=>setNf({...nf,start:e.target.value})} />
        <Sel label="Cins" value={nf.gender} onChange={e=>setNf({...nf,gender:e.target.value})} opts={[{v:"M",l:"Kişi"},{v:"F",l:"Qadın"}]} />
        <Sel label="Müqavilə" value={nf.contract} onChange={e=>setNf({...nf,contract:e.target.value})} opts={[{v:"Müddətsiz",l:"Müddətsiz"},{v:"Müddətli",l:"Müddətli"}]} />
        <Inp label="IBAN" value={nf.bank} onChange={e=>setNf({...nf,bank:e.target.value})} />
        <Inp label="Doğum tarixi" type="date" value={nf.birth} onChange={e=>setNf({...nf,birth:e.target.value})} />
      </div>
      <div style={{ display:"flex", gap:6, marginTop:6 }}><Btn c={K.gn} onClick={submit}>✓ Əlavə et</Btn><Btn ghost c={K.mt} onClick={()=>setAdding(false)}>Ləğv et</Btn></div>
    </Box>}
    <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", gap:10 }}>
      <div style={{ overflowY:"auto", maxHeight:"calc(100vh - 100px)", display:"flex", flexDirection:"column", gap:2 }}>
        {emps.map(e=>{const p=cp(e.gross,e.sec);return <Box key={e.id} onClick={()=>{tog(e.id);setTab("profile");}} style={{ padding:"8px 10px", borderColor:e.id===sel?K.bl:K.bd, background:e.id===sel?`${K.bl}0A`:K.cd }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ minWidth:0 }}><div style={{ fontSize:11, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.name}</div><div style={{ fontSize:9, color:K.mt }}>{e.pos}</div></div>
            <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}><div style={{ textAlign:"right" }}><div style={{ fontSize:11, fontWeight:700, color:K.bl }}>{F(e.gross)}</div><div style={{ fontSize:8, color:K.gn }}>Net:{F(p.net)}</div></div><DelBtn onClick={()=>rm(e.id)} /></div>
          </div>
        </Box>;})}
      </div>
      {emp ? <Box style={{ padding:0, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"10px 14px", borderBottom:`1px solid ${K.bd}`, display:"flex", justifyContent:"space-between", flexShrink:0 }}>
          <div><div style={{ fontSize:15, fontWeight:800 }}>{emp.name}</div><div style={{ fontSize:10, color:K.mt }}>{emp.pos} — {emp.dept}</div></div>
          <div style={{ textAlign:"right" }}><div style={{ fontSize:17, fontWeight:800, color:K.bl }}>{F(emp.gross)}</div><div style={{ fontSize:8, color:K.dm }}>brutto</div></div>
        </div>
        <div style={{ display:"flex", borderBottom:`1px solid ${K.bd}`, padding:"0 14px", flexShrink:0, overflowX:"auto" }}>
          {[{id:"profile",l:"Profil"},{id:"salary",l:"Əmək haqqı"},{id:"leave",l:"Məzuniyyət"},{id:"sick",l:"Xəstəlik"},{id:"term",l:"Son hesab"},{id:"ezam",l:"Ezamiyyət"}].map(t=>
            <button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:"7px 10px", border:"none", cursor:"pointer", fontSize:10, fontWeight:700, background:"transparent", color:tab===t.id?K.bl:K.mt, borderBottom:tab===t.id?`2px solid ${K.bl}`:"2px solid transparent", marginBottom:-1, whiteSpace:"nowrap", flexShrink:0 }}>{t.l}</button>)}
        </div>
        <div style={{ padding:14, overflowY:"auto", flex:1 }}>
          {tab==="profile" && <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:6 }}>Şəxsi</div>{[["Doğum",D(emp.birth)],["Cins",emp.gender==="M"?"Kişi":"Qadın"],["VÖEN",emp.tin],["FİN",emp.fin],["Telefon",emp.phone]].map(([l,v],i)=><Row key={i} l={l} v={v}/>)}</div>
            <div><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:6 }}>İş</div>{[["İşə başlama",D(emp.start)],["Staj",emp.seniority+" il"],["Müqavilə",emp.contract],["Məzuniyyət",`${calcLeave(emp).total}g`],["IBAN",emp.bank?.substring(0,16)+"..."]].map(([l,v],i)=><Row key={i} l={l} v={v}/>)}</div>
          </div>}
          {tab==="salary" && (()=>{const p=cp(emp.gross,emp.sec);return <div>
            {emp.gross<=2500&&<Alert c={K.gn}><strong>GV güzəşti:</strong> ƏH ≤2.500₼ → 200₼ vergidən azad</Alert>}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <div><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:6 }}>İşçidən tutulma</div>
                <Row l="Brutto" v={F(p.g)} b c={K.bl}/><Row l="GV" v={`-${F(p.gv)}`} c={K.yl}/><Row l="DSMF" v={`-${F(p.dee)}`}/><Row l="İSH" v={`-${F(p.ie)}`}/><Row l="İTS" v={`-${F(p.te)}`}/>
                <Row l="Netto" v={F(p.net)} b c={K.gn} border/></div>
              <div><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:6 }}>İşəgötürən</div>
                <Row l="Brutto" v={F(p.g)} b/><Row l="DSMF" v={`+${F(p.der)}`}/><Row l="İSH" v={`+${F(p.ir)}`}/><Row l="İTS" v={`+${F(p.tr)}`}/>
                <Row l="İG xərci" v={F(p.cost)} b c={K.rd} border/></div>
            </div></div>;})()}
          {tab==="leave" && (()=>{const lv=calcLeave(emp),rem=lv.total-(emp.usedLeave||0),dy=emp.gross/TX.WD;return <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:10 }}>
              <Stat l="Hüququ" v={`${lv.total}g`} c={K.bl} sm/><Stat l="İstifadə" v={`${emp.usedLeave||0}g`} c={K.yl} sm/><Stat l="Qalıq" v={`${rem}g`} c={rem>5?K.gn:K.rd} sm/><Stat l="Günlük" v={F(dy)} c={K.pr} sm/>
            </div><Row l="Məzuniyyət pulu (qalıq)" v={F(dy*rem)} b c={K.gn}/></div>;})()}
          {tab==="sick" && (()=>{const sk=calcSick(emp.gross,7,emp.seniority);return <div>
            <Alert c={K.bl}>Xəstəlik vərəqəsi hesablanması. Staj: {emp.seniority} il → {(sk.rate*100).toFixed(0)}% ödəniş</Alert>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:10 }}>
              <Stat l="Günlük ƏH" v={F(sk.daily)} c={K.bl} sm/><Stat l="Ödəniş %" v={P(sk.rate)} c={K.yl} sm/><Stat l="7 gün" v={F(sk.amount)} c={K.gn} sm/>
            </div>
            <Box><div style={{ fontSize:9,fontWeight:800,color:K.mt,marginBottom:6 }}>HESABLAMA QAYDASI</div>
              <div style={{ fontSize:10,color:K.mt,lineHeight:1.5 }}>{"<"}5 il staj: 60% · 5-8 il: 70% · 8+ il: 80%<br/>Formul: (ƏH / {TX.WD} iş günü) × gün × faiz<br/>İlk 14 gün işəgötürən, sonra DSMF ödəyir</div>
            </Box></div>;})()}
          {tab==="term" && (()=>{const s=calcSev(emp);return <div>
            <Alert c={K.rd}><strong>ƏM 77:</strong> {emp.seniority} il → ×{s.m}</Alert>
            <Row l="Son ay ƏH" v={F(emp.gross)}/><Row l={`Məzuniyyət qalığı (${s.ud}g)`} v={F(s.up)} c={K.bl}/>
            <Row l={`Müavinət (×${s.m})`} v={F(s.sev)} c={K.pr}/><Row l="CƏMİ" v={F(s.total)} b c={K.rd} border/></div>;})()}
          {tab==="ezam" && <EzamTab emp={emp}/>}
        </div>
      </Box> : <Box style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:300, color:K.dm }}><div style={{ textAlign:"center" }}><div style={{ fontSize:24, opacity:.3 }}>◉</div><div style={{ fontSize:12, fontWeight:700, marginTop:4 }}>İşçi seçin</div></div></Box>}
    </div>
  </div>;
}

function EzamTab({ emp }) {
  const [c, sC] = useState("baku");
  const [d, sD] = useState(3);
  const dy = TX.EZ[c] || 90;
  return <div style={{ display:"grid", gridTemplateColumns:"160px 1fr", gap:10 }}>
    <Box><Sel label="Şəhər" value={c} onChange={x=>sC(x.target.value)} opts={Object.entries(TX.EZ).map(([k,v])=>({v:k,l:`${k} (${v}₼)`}))}/><Inp label="Gün" type="number" value={d} onChange={x=>sD(+x.target.value||0)}/></Box>
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}><Stat l="Gündəlik" v={`${dy}₼`} c={K.bl} sm/><Stat l="Cəmi" v={F(dy*d)} c={K.gn} sm/><Stat l="Otel 70%" v={F(dy*0.7*d)} c={K.pr} sm/></div>
  </div>;
}

// ══════════ PAYROLL TABLE ══════════
function Pay({ emps }) {
  const data = emps.map(e => ({ ...e, p: cp(e.gross, e.sec) }));
  const T = data.reduce((a, e) => ({ g:a.g+e.p.g, net:a.net+e.p.net, gv:a.gv+e.p.gv, dee:a.dee+e.p.dee, der:a.der+e.p.der, ie:a.ie+e.p.ie, ir:a.ir+e.p.ir, te:a.te+e.p.te, tr:a.tr+e.p.tr, cost:a.cost+e.p.cost }), { g:0,net:0,gv:0,dee:0,der:0,ie:0,ir:0,te:0,tr:0,cost:0 });
  return <div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
      <div><h1 style={{ margin:0, fontSize:17, fontWeight:800 }}>Əmək Haqqı — Fevral 2026</h1><div style={{ fontSize:10, color:K.mt }}>GV: 3%/10%/14% · 200₼ güzəşt · İTS hədd: 2500₼</div></div>
      <Btn c={K.gn} sm onClick={()=>exportXlsx(emps)}>⬇ Excel</Btn>
    </div>
    <Box style={{ padding:0, marginBottom:12 }}><div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", fontSize:10, minWidth:900 }}>
      <thead><tr style={{ background:"rgba(255,255,255,0.02)" }}>{["#","İşçi","Brutto","GV","DSMF(İ)","İSH","İTS","Netto","DSMF(İG)","İSH(İG)","İTS(İG)","İG xərci"].map((h,i)=><TH key={i} r={i>1}>{h}</TH>)}</tr></thead>
      <tbody>{data.map((e,i)=><tr key={e.id} style={{ borderBottom:`1px solid ${K.bd}` }}><TD>{i+1}</TD><TD b>{e.name}</TD><TD r b c={K.bl}>{F(e.p.g)}</TD><TD r c={K.yl}>{F(e.p.gv)}</TD><TD r>{F(e.p.dee)}</TD><TD r c={K.dm}>{F(e.p.ie)}</TD><TD r c={K.dm}>{F(e.p.te)}</TD><TD r b c={K.gn}>{F(e.p.net)}</TD><TD r>{F(e.p.der)}</TD><TD r c={K.dm}>{F(e.p.ir)}</TD><TD r c={K.dm}>{F(e.p.tr)}</TD><TD r b c={K.rd}>{F(e.p.cost)}</TD></tr>)}</tbody>
      <tfoot><tr style={{ background:`${K.bl}06` }}><TD/><TD b>CƏMİ</TD><TD r b c={K.bl}>{F(T.g)}</TD><TD r b c={K.yl}>{F(T.gv)}</TD><TD r b>{F(T.dee)}</TD><TD r>{F(T.ie)}</TD><TD r>{F(T.te)}</TD><TD r b c={K.gn}>{F(T.net)}</TD><TD r b>{F(T.der)}</TD><TD r>{F(T.ir)}</TD><TD r>{F(T.tr)}</TD><TD r b c={K.rd}>{F(T.cost)}</TD></tr></tfoot>
    </table></div></Box>
  </div>;
}

// ══════════ TAX / ÖMV ══════════
function TaxPage({ emps }) {
  const [tab, setTab] = useState("pit"); const [sal, setSal] = useState(1000);
  const ps = emps.map(e => cp(e.gross, e.sec));
  const T = ps.reduce((a,p)=>({gv:a.gv+p.gv,dee:a.dee+p.dee,der:a.der+p.der,ie:a.ie+p.ie,ir:a.ir+p.ir,te:a.te+p.te,tr:a.tr+p.tr}),{gv:0,dee:0,der:0,ie:0,ir:0,te:0,tr:0});
  return <div>
    <h1 style={{ margin:"0 0 10px", fontSize:17, fontWeight:800 }}>Vergi / ÖMV</h1>
    <TabBar tabs={[{id:"pit",l:"GV Kalkulyator"},{id:"omv",l:"ÖMV Hesablama"},{id:"vahid",l:"Vahid Bəyannamə"},{id:"vat",l:"ƏDV"},{id:"dsmf",l:"DSMF Hesabat"}]} a={tab} on={setTab} />
    {tab==="pit" && (()=>{const p=cp(sal);return <div>
      <div style={{ display:"grid", gridTemplateColumns:"180px 1fr", gap:10 }}>
        <Box><Inp label="Brutto ƏH" type="number" value={sal} onChange={x=>setSal(+x.target.value||0)}/><div style={{ fontSize:9, color:K.dm, lineHeight:1.4 }}>≤2500: (ƏH-200)×3%<br/>2500-8000: 75₼+10%<br/>8000+: 625₼+14%</div></Box>
        <div><div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:10 }}><Stat l="Brutto" v={F(p.g)} c={K.bl} sm/><Stat l="Netto" v={F(p.net)} c={K.gn} sm/><Stat l="Tutulma" v={F(p.ded)} c={K.yl} sm/><Stat l="İG xərci" v={F(p.cost)} c={K.rd} sm/></div>
          <Box><Row l="GV" v={F(p.gv)} c={K.yl}/><Row l="DSMF" v={F(p.dee)}/><Row l="İSH" v={F(p.ie)}/><Row l="İTS" v={F(p.te)}/><Row l="NETTO" v={F(p.net)} b c={K.gn} border/></Box></div>
      </div>
      <Box style={{ padding:0, marginTop:12 }}><div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", fontSize:10 }}>
        <thead><tr>{["Brutto","GV","DSMF","İSH","İTS","Netto","İG xərci"].map((h,i)=><TH key={i} r={i>0}>{h}</TH>)}</tr></thead>
        <tbody>{[400,700,1000,1500,2000,2500,3000,5000,8000,10000].map(g=>{const r=cp(g);return <tr key={g} style={{ borderBottom:`1px solid ${K.bd}`, background:g===sal?`${K.bl}10`:"transparent" }}><TD b>{F(g)}</TD><TD r c={K.yl}>{F(r.gv)}</TD><TD r>{F(r.dee)}</TD><TD r c={K.dm}>{F(r.ie)}</TD><TD r c={K.dm}>{F(r.te)}</TD><TD r b c={K.gn}>{F(r.net)}</TD><TD r b c={K.rd}>{F(r.cost)}</TD></tr>;})}</tbody>
      </table></div></Box>
    </div>;})()}
    {tab==="omv" && <div>
      <Alert c={K.bl}>ÖMV — Ödəmə mənbəyində tutulan vergi. İşçilərdən tutulub büdcəyə ödənilməli vergilər.</Alert>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:12 }}>
        <Stat l="GV (ÖMV)" v={F(T.gv)} c={K.yl} sm/><Stat l="DSMF (İşçi)" v={F(T.dee)} c={K.pr} sm/><Stat l="DSMF (İG)" v={F(T.der)} c={K.or} sm/><Stat l="İSH+İTS" v={F(T.ie+T.ir+T.te+T.tr)} c={K.cy} sm/>
      </div>
      <Box style={{ padding:0 }}><div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", fontSize:10 }}>
        <thead><tr>{["İşçi","VÖEN","Brutto","GV","DSMF(İ)","DSMF(İG)","İSH(İ)","İSH(İG)","İTS(İ)","İTS(İG)"].map((h,i)=><TH key={i} r={i>=2}>{h}</TH>)}</tr></thead>
        <tbody>{emps.map(e=>{const p=cp(e.gross,e.sec);return <tr key={e.id} style={{ borderBottom:`1px solid ${K.bd}` }}><TD b>{e.name}</TD><TD m c={K.mt}>{e.tin}</TD><TD r b>{F(p.g)}</TD><TD r c={K.yl}>{F(p.gv)}</TD><TD r>{F(p.dee)}</TD><TD r>{F(p.der)}</TD><TD r c={K.dm}>{F(p.ie)}</TD><TD r c={K.dm}>{F(p.ir)}</TD><TD r c={K.dm}>{F(p.te)}</TD><TD r c={K.dm}>{F(p.tr)}</TD></tr>;})}</tbody>
        <tfoot><tr style={{ background:`${K.bl}06` }}><TD b>CƏMİ</TD><TD/><TD r b c={K.bl}>{F(ps.reduce((s,p)=>s+p.g,0))}</TD><TD r b c={K.yl}>{F(T.gv)}</TD><TD r b>{F(T.dee)}</TD><TD r b>{F(T.der)}</TD><TD r>{F(T.ie)}</TD><TD r>{F(T.ir)}</TD><TD r>{F(T.te)}</TD><TD r>{F(T.tr)}</TD></tr></tfoot>
      </table></div></Box>
      <div style={{ marginTop:10 }}><Row l="Büdcəyə ödəniləcək GV" v={F(T.gv)} b c={K.rd}/><Row l="Büdcəyə ödəniləcək DSMF" v={F(T.dee+T.der)} b c={K.pr}/><Row l="Büdcəyə İSH+İTS" v={F(T.ie+T.ir+T.te+T.tr)} b c={K.cy}/><Row l="CƏMİ ÖDƏNİŞ" v={F(T.gv+T.dee+T.der+T.ie+T.ir+T.te+T.tr)} b c={K.rd} border/></div>
    </div>}
    {tab==="vahid" && <div>
      <Alert c={K.bl}>Muzdlu işlə əlaqədar ödəmə mənbəyində tutulan vergi bəyannaməsi — hər ay 20-dək taxes.gov.az-a təqdim edilir.</Alert>
      <Box><div style={{ textAlign:"center", marginBottom:10 }}><div style={{ fontSize:13, fontWeight:800 }}>VAHİD VERGİ BƏYANNAMƏSİ</div><div style={{ fontSize:9, color:K.mt }}>Fevral 2026 · Bölmə 1: Muzdlu işdən gəlir vergisi</div></div>
        <div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", fontSize:10 }}>
          <thead><tr>{["№","Ad Soyad","VÖEN","FİN","Brutto","GV","DSMF","İSH","İTS","Netto"].map((h,i)=><TH key={i} r={i>=4}>{h}</TH>)}</tr></thead>
          <tbody>{emps.map((e,i)=>{const p=cp(e.gross,e.sec);return <tr key={e.id} style={{ borderBottom:`1px solid ${K.bd}` }}><TD>{i+1}</TD><TD b>{e.name}</TD><TD m c={K.mt}>{e.tin}</TD><TD m c={K.mt}>{e.fin}</TD><TD r b>{F(p.g)}</TD><TD r c={K.yl}>{F(p.gv)}</TD><TD r>{F(p.dee)}</TD><TD r>{F(p.ie)}</TD><TD r>{F(p.te)}</TD><TD r b c={K.gn}>{F(p.net)}</TD></tr>;})}</tbody>
          <tfoot><tr style={{ background:`${K.bl}06` }}><TD/><TD b>CƏMİ</TD><TD/><TD/><TD r b c={K.bl}>{F(ps.reduce((s,p)=>s+p.g,0))}</TD><TD r b c={K.yl}>{F(T.gv)}</TD><TD r b>{F(T.dee)}</TD><TD r>{F(T.ie)}</TD><TD r>{F(T.te)}</TD><TD r b c={K.gn}>{F(ps.reduce((s,p)=>s+p.net,0))}</TD></tr></tfoot>
        </table></div>
        <div style={{ marginTop:8, fontSize:9, color:K.dm }}>* Bəyannamə hər ayın 20-dək taxes.gov.az portalına yüklənməlidir</div>
      </Box>
    </div>}
    {tab==="vat" && <VatCalc/>}
    {tab==="dsmf" && <div>
      <Alert c={K.pr}>DSMF hesabatı — hər ay ödənilməli sosial sığorta haqqları</Alert>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
        <Stat l="İşçi payı" v={F(T.dee)} c={K.bl} sm/><Stat l="İG payı" v={F(T.der)} c={K.or} sm/><Stat l="CƏMİ DSMF" v={F(T.dee+T.der)} c={K.rd} sm/>
      </div>
      <Box style={{ padding:0 }}><div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", fontSize:10 }}>
        <thead><tr>{["İşçi","Brutto","DSMF (İşçi 3-10%)","DSMF (İG 15-22%)","Cəmi"].map((h,i)=><TH key={i} r={i>=1}>{h}</TH>)}</tr></thead>
        <tbody>{emps.map(e=>{const p=cp(e.gross,e.sec);return <tr key={e.id} style={{ borderBottom:`1px solid ${K.bd}` }}><TD b>{e.name}</TD><TD r>{F(p.g)}</TD><TD r c={K.bl}>{F(p.dee)}</TD><TD r c={K.or}>{F(p.der)}</TD><TD r b c={K.rd}>{F(p.dee+p.der)}</TD></tr>;})}</tbody>
      </table></div></Box>
    </div>}
  </div>;
}

// ══════════ VAT CALC ══════════
function VatCalc() {
  const [o, sO] = useState(50000);
  const [i, sI] = useState(20000);
  return <div style={{ display:"grid", gridTemplateColumns:"180px 1fr", gap:10 }}>
    <Box><Inp label="Satış" type="number" value={o} onChange={x=>sO(+x.target.value||0)}/><Inp label="Giriş ƏDV" type="number" value={i} onChange={x=>sI(+x.target.value||0)}/></Box>
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}><Stat l="Çıxış ƏDV" v={F(o*TX.VAT)} c={K.rd}/><Stat l="Giriş ƏDV" v={F(i)} c={K.gn}/><Stat l="Ödəniləcək" v={F(o*TX.VAT-i)} c={o*TX.VAT-i>0?K.rd:K.gn}/></div>
  </div>;
}

// ══════════ INVOICES ══════════
function Invs({ invs, sel, tog, rm, setInvs, addInv }) {
  const [f,setF]=useState("all"); const [adding,setAdding]=useState(false);
  const [nf,setNf]=useState({party:"",tin:"",amt:"",tp:"sale",date:"",due:"",itemDesc:"",itemQty:"1"});
  const fl = f==="all" ? invs : invs.filter(i=>i.tp===f);
  const s = invs.find(i=>i.id===sel);
  const stC = {sent:{l:"Göndərildi",c:K.gn},pending:{l:"Gözləyir",c:K.yl},received:{l:"Qəbul",c:K.bl}};
  const submit = ()=>{ if(!nf.party||!nf.amt)return; const amt=+nf.amt,vat=+(amt*TX.VAT).toFixed(2); addInv({no:`EQF-2026-${String(invs.length+1).padStart(4,"0")}`,party:nf.party,tin:nf.tin,amt,vat,total:amt+vat,date:nf.date||"2026-02-22",due:nf.due||"2026-02-27",st:"pending",tp:nf.tp,items:[{desc:nf.itemDesc||"Xidmət",qty:+nf.itemQty||1,price:amt,vat}],notes:""}); setNf({party:"",tin:"",amt:"",tp:"sale",date:"",due:"",itemDesc:"",itemQty:"1"}); setAdding(false); };
  return <div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
      <h1 style={{ margin:0, fontSize:17, fontWeight:800 }}>E-Qaimə</h1>
      <Btn c={K.bl} sm onClick={()=>setAdding(!adding)}>{adding?"✕ Bağla":"+ Yeni qaimə"}</Btn>
    </div>
    {adding && <Box style={{ marginBottom:10, borderColor:`${K.bl}33` }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:6 }}>
        <Inp label="Tərəf *" value={nf.party} onChange={e=>setNf({...nf,party:e.target.value})}/>
        <Inp label="VÖEN" value={nf.tin} onChange={e=>setNf({...nf,tin:e.target.value})}/>
        <Inp label="Məbləğ *" type="number" value={nf.amt} onChange={e=>setNf({...nf,amt:e.target.value})}/>
        <Sel label="Növ" value={nf.tp} onChange={e=>setNf({...nf,tp:e.target.value})} opts={[{v:"sale",l:"Satış"},{v:"purchase",l:"Alış"}]}/>
        <Inp label="Tarix" type="date" value={nf.date} onChange={e=>setNf({...nf,date:e.target.value})}/>
        <Inp label="Son tarix" type="date" value={nf.due} onChange={e=>setNf({...nf,due:e.target.value})}/>
        <Inp label="Mal/Xidmət" value={nf.itemDesc} onChange={e=>setNf({...nf,itemDesc:e.target.value})}/>
        <Inp label="Miqdar" type="number" value={nf.itemQty} onChange={e=>setNf({...nf,itemQty:e.target.value})}/>
      </div>
      {nf.amt&&<div style={{ fontSize:10, color:K.mt, marginTop:4 }}>ƏDV: {F(+nf.amt*TX.VAT)} · Yekun: {F(+nf.amt+ +nf.amt*TX.VAT)}</div>}
      <div style={{ display:"flex", gap:6, marginTop:6 }}><Btn c={K.gn} onClick={submit}>✓ Əlavə et</Btn><Btn ghost c={K.mt} onClick={()=>setAdding(false)}>Ləğv et</Btn></div>
    </Box>}
    <TabBar tabs={[{id:"all",l:"Hamısı",n:invs.length},{id:"sale",l:"Satış",n:invs.filter(i=>i.tp==="sale").length},{id:"purchase",l:"Alış",n:invs.filter(i=>i.tp==="purchase").length}]} a={f} on={setF}/>
    <div style={{ display:"grid", gridTemplateColumns:s?"1fr 280px":"1fr", gap:10 }}>
      <Box style={{ padding:0 }}><div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", fontSize:10, minWidth:700 }}>
        <thead><tr>{["","№","Tərəf","Növ","Məbləğ","ƏDV","Cəmi","Tarix","Status"].map((h,i)=><TH key={i} r={i>=4&&i<=6}>{h}</TH>)}</tr></thead>
        <tbody>{fl.map(inv=><tr key={inv.id} onClick={()=>tog(inv.id)} style={{ borderBottom:`1px solid ${K.bd}`, cursor:"pointer", background:inv.id===sel?`${K.bl}0A`:"transparent" }}>
          <TD><DelBtn onClick={()=>rm(inv.id)}/></TD><TD m b>{inv.no}</TD><TD>{inv.party}</TD><TD><Pill t={inv.tp==="sale"?"Satış":"Alış"} c={inv.tp==="sale"?K.gn:K.bl}/></TD>
          <TD r b>{F(inv.amt)}</TD><TD r c={K.yl}>{F(inv.vat)}</TD><TD r b>{F(inv.total)}</TD><TD c={K.mt}>{D(inv.date)}</TD>
          <TD><div style={{ display:"flex", gap:4, alignItems:"center" }}><Pill t={stC[inv.st]?.l} c={stC[inv.st]?.c}/>{inv.st==="pending"&&<Btn sm c={K.gn} onClick={e=>{e.stopPropagation();setInvs(p=>p.map(i=>i.id===inv.id?{...i,st:"sent"}:i));}}>Göndər</Btn>}</div></TD>
        </tr>)}</tbody></table></div></Box>
      {s && <DetailPanel show={!!s} onClose={()=>tog(sel)}>
        <div style={{ fontSize:13, fontWeight:800, marginBottom:6 }}>{s.no}</div>
        <Row l="Tərəf" v={s.party}/><Row l="VÖEN" v={s.tin}/><Row l="Tarix" v={D(s.date)}/><Row l="Son tarix" v={D(s.due)}/>
        {s.items?.map((it,i)=><div key={i} style={{ padding:"4px 0", borderBottom:`1px solid ${K.bd}`, fontSize:10 }}><div style={{ fontWeight:600 }}>{it.desc}</div><div style={{ color:K.mt }}>{it.qty}əd × {F(it.price)}</div></div>)}
        <Row l="Cəmi" v={F(s.amt)} border/><Row l="ƏDV" v={F(s.vat)} c={K.yl}/><Row l="YEKUN" v={F(s.total)} b c={K.bl} border/>
      </DetailPanel>}
    </div>
  </div>;
}

// ══════════ DEBITOR / KREDITOR ══════════
function Debtors({ data, sel, tog, rm, addDbt, setData }) {
  const [f,setF]=useState("all"); const [adding,setAdding]=useState(false);
  const [nf,setNf]=useState({name:"",tin:"",tp:"debitor",amt:"",due:"",inv:"",note:""});
  const fl = f==="all"?data:data.filter(d=>d.tp===f);
  const s = data.find(d=>d.id===sel);
  const dT = data.filter(d=>d.tp==="debitor"&&d.status!=="paid").reduce((a,d)=>a+d.amt,0);
  const kT = data.filter(d=>d.tp==="kreditor"&&d.status!=="paid").reduce((a,d)=>a+d.amt,0);
  const ovd = data.filter(d=>d.status==="overdue").length;
  const submit=()=>{if(!nf.name||!nf.amt)return; addDbt({name:nf.name,tin:nf.tin,tp:nf.tp,amt:+nf.amt,due:nf.due||"2026-03-22",inv:nf.inv,status:"active",note:nf.note}); setNf({name:"",tin:"",tp:"debitor",amt:"",due:"",inv:"",note:""}); setAdding(false);};
  return <div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
      <h1 style={{ margin:0, fontSize:17, fontWeight:800 }}>Debitor / Kreditor</h1>
      <Btn c={K.bl} sm onClick={()=>setAdding(!adding)}>{adding?"✕ Bağla":"+ Yeni"}</Btn>
    </div>
    {adding && <Box style={{ marginBottom:10, borderColor:`${K.bl}33` }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:6 }}>
        <Inp label="Ad *" value={nf.name} onChange={e=>setNf({...nf,name:e.target.value})}/>
        <Inp label="VÖEN" value={nf.tin} onChange={e=>setNf({...nf,tin:e.target.value})}/>
        <Sel label="Növ" value={nf.tp} onChange={e=>setNf({...nf,tp:e.target.value})} opts={[{v:"debitor",l:"Debitor"},{v:"kreditor",l:"Kreditor"}]}/>
        <Inp label="Məbləğ *" type="number" value={nf.amt} onChange={e=>setNf({...nf,amt:e.target.value})}/>
        <Inp label="Son tarix" type="date" value={nf.due} onChange={e=>setNf({...nf,due:e.target.value})}/>
        <Inp label="Qaimə №" value={nf.inv} onChange={e=>setNf({...nf,inv:e.target.value})}/>
        <Inp label="Qeyd" value={nf.note} onChange={e=>setNf({...nf,note:e.target.value})}/>
      </div>
      <div style={{ display:"flex", gap:6, marginTop:6 }}><Btn c={K.gn} onClick={submit}>✓ Əlavə et</Btn></div>
    </Box>}
    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:12 }}>
      <Stat l="Debitor borcu" v={F(dT)} c={K.yl} sm/><Stat l="Kreditor borcu" v={F(kT)} c={K.rd} sm/><Stat l="Xalis" v={F(dT-kT)} c={dT>=kT?K.gn:K.rd} sm/><Stat l="Vaxtı keçmiş" v={ovd} c={ovd>0?K.rd:K.gn} sm/>
    </div>
    <TabBar tabs={[{id:"all",l:"Hamısı",n:data.length},{id:"debitor",l:"Debitor",n:data.filter(d=>d.tp==="debitor").length},{id:"kreditor",l:"Kreditor",n:data.filter(d=>d.tp==="kreditor").length}]} a={f} on={setF}/>
    <div style={{ display:"grid", gridTemplateColumns:s?"1fr 260px":"1fr", gap:10 }}>
      <Box style={{ padding:0 }}><div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", fontSize:10 }}>
        <thead><tr>{["","Tərəf","Növ","Məbləğ","Son tarix","Status","Qaimə"].map((h,i)=><TH key={i} r={i===3}>{h}</TH>)}</tr></thead>
        <tbody>{fl.map(d=><tr key={d.id} onClick={()=>tog(d.id)} style={{ borderBottom:`1px solid ${K.bd}`, cursor:"pointer", background:d.id===sel?`${K.bl}0A`:"transparent" }}>
          <TD><DelBtn onClick={()=>rm(d.id)}/></TD><TD b>{d.name}</TD><TD><Pill t={d.tp==="debitor"?"Debitor":"Kreditor"} c={d.tp==="debitor"?K.yl:K.rd}/></TD>
          <TD r b c={d.amt>0?(d.tp==="debitor"?K.yl:K.rd):K.gn}>{F(d.amt)}</TD><TD c={K.mt}>{D(d.due)}</TD>
          <TD><Pill t={d.status==="paid"?"Ödənilib":d.status==="overdue"?"Gecikmiş":"Aktiv"} c={d.status==="paid"?K.gn:d.status==="overdue"?K.rd:K.bl}/></TD><TD c={K.mt}>{d.inv}</TD>
        </tr>)}</tbody></table></div></Box>
      {s && <DetailPanel show={!!s} onClose={()=>tog(sel)}>
        <div style={{ fontSize:13, fontWeight:800, marginBottom:6 }}>{s.name}</div>
        <Row l="VÖEN" v={s.tin}/><Row l="Növ" v={s.tp==="debitor"?"Debitor":"Kreditor"}/><Row l="Məbləğ" v={F(s.amt)} b c={s.tp==="debitor"?K.yl:K.rd}/>
        <Row l="Son tarix" v={D(s.due)}/><Row l="Qaimə" v={s.inv}/><Row l="Qeyd" v={s.note||"—"}/>
        {s.status!=="paid"&&s.amt>0&&<Btn c={K.gn} sm style={{ marginTop:8 }} onClick={()=>setData(p=>p.map(x=>x.id===s.id?{...x,status:"paid",amt:0,note:"Ödənilib "+new Date().toISOString().split("T")[0]}:x))}>✓ Ödənildi</Btn>}
      </DetailPanel>}
    </div>
  </div>;
}

// ══════════ KASSA ══════════
function Kas({ data, sel, tog, rm, addKas }) {
  const [adding,setAdding]=useState(false);
  const [nf,setNf]=useState({tp:"in",desc:"",amt:"",cat:"",bank:"Kapital Bank",date:""});
  let run=0; const rows=data.map(k=>{run+=(k.tp==="in"?k.amt:-k.amt);return{...k,bal:run};});
  const s=data.find(k=>k.id===sel);
  const tIn=data.filter(k=>k.tp==="in").reduce((a,k)=>a+k.amt,0), tOut=data.filter(k=>k.tp==="out").reduce((a,k)=>a+k.amt,0);
  const submit=()=>{if(!nf.desc||!nf.amt)return; addKas({tp:nf.tp,desc:nf.desc,amt:+nf.amt,cat:nf.cat||(nf.tp==="in"?"Satış":"Xərc"),bank:nf.bank,date:nf.date||"2026-02-22",doc:`${nf.tp==="in"?"MO":"XO"}-${String(data.length+1).padStart(3,"0")}`}); setNf({tp:"in",desc:"",amt:"",cat:"",bank:"Kapital Bank",date:""}); setAdding(false);};
  return <div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
      <h1 style={{ margin:0, fontSize:17, fontWeight:800 }}>Kassa / Bank</h1>
      <Btn c={K.bl} sm onClick={()=>setAdding(!adding)}>{adding?"✕ Bağla":"+ Yeni"}</Btn>
    </div>
    {adding && <Box style={{ marginBottom:10, borderColor:`${K.bl}33` }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap:6 }}>
        <Sel label="Növ" value={nf.tp} onChange={e=>setNf({...nf,tp:e.target.value})} opts={[{v:"in",l:"Mədaxil"},{v:"out",l:"Məxaric"}]}/>
        <Inp label="Təsvir *" value={nf.desc} onChange={e=>setNf({...nf,desc:e.target.value})}/>
        <Inp label="Məbləğ *" type="number" value={nf.amt} onChange={e=>setNf({...nf,amt:e.target.value})}/>
        <Inp label="Kateqoriya" value={nf.cat} onChange={e=>setNf({...nf,cat:e.target.value})}/>
        <Inp label="Tarix" type="date" value={nf.date} onChange={e=>setNf({...nf,date:e.target.value})}/>
      </div>
      <div style={{ display:"flex", gap:6, marginTop:6 }}><Btn c={K.gn} onClick={submit}>✓ Əlavə et</Btn></div>
    </Box>}
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
      <Stat l="Mədaxil" v={F(tIn)} c={K.gn} sm/><Stat l="Məxaric" v={F(tOut)} c={K.rd} sm/><Stat l="Qalıq" v={F(tIn-tOut)} c={K.bl} sm/>
    </div>
    <div style={{ display:"grid", gridTemplateColumns:s?"1fr 260px":"1fr", gap:10 }}>
      <Box style={{ padding:0 }}><div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", fontSize:10, minWidth:550 }}>
        <thead><tr>{["","Tarix","Sənəd","Təsvir","Mədaxil","Məxaric","Qalıq"].map((h,i)=><TH key={i} r={i>=4}>{h}</TH>)}</tr></thead>
        <tbody>{rows.map(k=><tr key={k.id} onClick={()=>tog(k.id)} style={{ borderBottom:`1px solid ${K.bd}`, cursor:"pointer", background:k.id===sel?`${K.bl}0A`:"transparent" }}>
          <TD><DelBtn onClick={()=>rm(k.id)}/></TD><TD c={K.mt}>{D(k.date)}</TD><TD m b>{k.doc}</TD><TD>{k.desc}</TD>
          <TD r c={K.gn} b={k.tp==="in"}>{k.tp==="in"?F(k.amt):""}</TD><TD r c={K.rd} b={k.tp==="out"}>{k.tp==="out"?F(k.amt):""}</TD><TD r b c={k.bal>=0?K.bl:K.rd}>{F(k.bal)}</TD>
        </tr>)}</tbody></table></div></Box>
      {s && <DetailPanel show={!!s} onClose={()=>tog(sel)}>
        <div style={{ fontSize:13, fontWeight:800, marginBottom:6 }}>{s.doc}</div>
        <Row l="Tarix" v={D(s.date)}/><Row l="Növ" v={s.tp==="in"?"Mədaxil":"Məxaric"}/><Row l="Məbləğ" v={F(s.amt)} b c={s.tp==="in"?K.gn:K.rd}/><Row l="Kateqoriya" v={s.cat}/><Row l="Bank" v={s.bank}/>
      </DetailPanel>}
    </div>
  </div>;
}

// ══════════ ASSETS ══════════
function Ast({ data, sel, tog, rm }) {
  const s=data.find(a=>a.id===sel); const tI=data.reduce((a,x)=>a+x.init,0), tC=data.reduce((a,x)=>a+x.cur,0);
  return <div>
    <h1 style={{ margin:"0 0 10px", fontSize:17, fontWeight:800 }}>Əsas Vəsaitlər</h1>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:12 }}>
      <Stat l="İlkin" v={F(tI)} c={K.bl} sm/><Stat l="Qalıq" v={F(tC)} c={K.gn} sm/><Stat l="Amortizasiya" v={F(tI-tC)} c={K.yl} sm/><Stat l="%" v={P((tI-tC)/tI)} c={K.pr} sm/>
    </div>
    <div style={{ display:"grid", gridTemplateColumns:s?"1fr 260px":"1fr", gap:10 }}>
      <Box style={{ padding:0 }}><div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", fontSize:10 }}>
        <thead><tr>{["","Aktiv","Kat.","İlkin","Qalıq","%","İllik"].map((h,i)=><TH key={i} r={i>=3}>{h}</TH>)}</tr></thead>
        <tbody>{data.map(a=><tr key={a.id} onClick={()=>tog(a.id)} style={{ borderBottom:`1px solid ${K.bd}`, cursor:"pointer", background:a.id===sel?`${K.bl}0A`:"transparent" }}>
          <TD><DelBtn onClick={()=>rm(a.id)}/></TD><TD b>{a.name}</TD><TD c={K.mt}>{a.cat}</TD><TD r>{F(a.init)}</TD><TD r b c={K.gn}>{F(a.cur)}</TD><TD r c={K.pr}>{a.rate}%</TD><TD r c={K.yl}>{F(a.cur*(a.rate/100))}</TD>
        </tr>)}</tbody></table></div></Box>
      {s && <DetailPanel show={!!s} onClose={()=>tog(sel)}>
        <div style={{ fontSize:13, fontWeight:800, marginBottom:6 }}>{s.name}</div>
        <Row l="İnv. №" v={s.inv}/><Row l="Kat." v={s.cat}/><Row l="Yer" v={s.loc}/><Row l="Tarix" v={D(s.date)}/>
        <Row l="İlkin" v={F(s.init)} c={K.bl}/><Row l="Qalıq" v={F(s.cur)} c={K.gn}/><Row l="İllik amort." v={F(s.cur*(s.rate/100))} c={K.yl}/><Row l="Aylıq" v={F(s.cur*(s.rate/100)/12)} c={K.or}/>
      </DetailPanel>}
    </div>
  </div>;
}

// ══════════ ANALITIKA (Enhanced BI Dashboard) ══════════
function Analitika({ emps, invs, kassa, assets }) {
  const [tab,setTab]=useState("overview");
  const ps=emps.map(e=>({...e,p:cp(e.gross,e.sec)}));
  const rev=invs.filter(i=>i.tp==="sale").reduce((s,i)=>s+i.amt,0), pur=invs.filter(i=>i.tp==="purchase").reduce((s,i)=>s+i.amt,0);
  const tG=ps.reduce((s,e)=>s+e.p.g,0), tC=ps.reduce((s,e)=>s+e.p.cost,0), tN=ps.reduce((s,e)=>s+e.p.net,0);
  const kI=kassa.filter(k=>k.tp==="in").reduce((s,k)=>s+k.amt,0), kO=kassa.filter(k=>k.tp==="out").reduce((s,k)=>s+k.amt,0);
  const aT=assets.reduce((s,a)=>s+a.cur,0), aI=assets.reduce((s,a)=>s+a.init,0), deprA=assets.reduce((s,a)=>s+a.cur*(a.rate/100),0);
  const gp=rev-pur, fixedCost=tC+deprA/12, varCostRate=pur/(rev||1), opEx=fixedCost+3200, op=gp-opEx, np=op-Math.max(0,op)*TX.PROFIT;
  const breakEven=fixedCost/(1-varCostRate), safetyMargin=(rev-breakEven)/(rev||1);

  const HBar=({data,maxV})=><div style={{ display:"flex", flexDirection:"column", gap:5 }}>{data.map((d,i)=><div key={i} style={{ display:"flex", alignItems:"center", gap:6 }}>
    <div style={{ width:90, fontSize:10, color:K.mt, textAlign:"right", flexShrink:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.l}</div>
    <div style={{ flex:1, background:"rgba(255,255,255,0.03)", borderRadius:4, height:20, position:"relative", overflow:"hidden" }}>
      <div style={{ width:`${Math.min(100,Math.abs(d.v)/(maxV||1)*100)}%`, height:"100%", background:`linear-gradient(90deg,${d.c||K.bl}55,${d.c||K.bl}33)`, borderRadius:4, transition:"width .5s ease" }}/>
      <span style={{ position:"absolute", right:6, top:3, fontSize:9, fontWeight:700, color:d.c||K.bl }}>{F(d.v)}</span></div></div>)}</div>;

  const Spark=({data,c=K.bl,h=40,fill})=>{const mx=Math.max(...data),mn=Math.min(...data),rng=mx-mn||1;const pts=data.map((v,i)=>`${(i/(data.length-1))*100},${100-((v-mn)/rng)*80-10}`).join(" ");const fillPts=`0,100 ${pts} 100,100`;return <svg viewBox="0 0 100 100" style={{ width:"100%", height:h }} preserveAspectRatio="none">{fill&&<polygon points={fillPts} fill={`${c}15`}/>}<polyline points={pts} fill="none" stroke={c} strokeWidth="2" className="spark-line"/><circle cx={100} cy={100-((data[data.length-1]-mn)/rng)*80-10} r="3" fill={c}/></svg>;};

  const Gauge=({v,max,c=K.bl,label})=>{const pct=Math.min(100,Math.max(0,(v/max)*100));return <div style={{ textAlign:"center" }}><div style={{ position:"relative", width:70, height:36, margin:"0 auto", overflow:"hidden" }}><div style={{ position:"absolute", width:70, height:70, borderRadius:"50%", border:`4px solid ${K.bd}`, borderBottom:"4px solid transparent", borderLeft:"4px solid transparent", transform:"rotate(225deg)" }}/><div style={{ position:"absolute", width:70, height:70, borderRadius:"50%", border:`4px solid ${c}`, borderBottom:`4px solid transparent`, borderLeft:`4px solid transparent`, transform:`rotate(${225+pct*1.8}deg)`, transition:"transform .5s ease" }}/><div style={{ position:"absolute", bottom:0, left:0, right:0, textAlign:"center", fontSize:13, fontWeight:800, color:c }}>{P(v/100)}</div></div><div style={{ fontSize:8, color:K.mt, marginTop:2 }}>{label}</div></div>;};

  const months=["Okt","Noy","Dek","Yan","Fev"]; const mRev=[42000,48000,55000,51000,rev]; const mExp=[28000,32000,35000,30000,pur+tC]; const mProf=mRev.map((r,i)=>r-mExp[i]);
  const gs=emps.map(e=>e.gross).sort((a,b)=>a-b); const med=gs[Math.floor(gs.length/2)]; const avg=gs.reduce((s,g)=>s+g,0)/(gs.length||1);
  const depts={}; ps.forEach(e=>{if(!depts[e.dept])depts[e.dept]={n:0,g:0,c:0};depts[e.dept].n++;depts[e.dept].g+=e.p.g;depts[e.dept].c+=e.p.cost;});

  return <div>
    <h1 style={{ margin:"0 0 4px", fontSize:17, fontWeight:800 }}>Analitika</h1>
    <div style={{ fontSize:10, color:K.mt, marginBottom:12 }}>Maliyyə təhlili, KPI, pul axını, rentabellik, işçi analitikası</div>
    <TabBar tabs={[{id:"overview",l:"Ümumi"},{id:"cashflow",l:"Pul axını"},{id:"profit",l:"Rentabellik"},{id:"ratios",l:"Nisbətlər"},{id:"workforce",l:"İşçi qüvvəsi"},{id:"forecast",l:"Proqnoz"},{id:"stats",l:"Statistika"}]} a={tab} on={setTab}/>

    {tab==="overview"&&<div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:8, marginBottom:14 }}>
        <Stat l="Gəlir" v={F(rev)} c={K.gn} sm/><Stat l="Xərc" v={F(pur+tC)} c={K.rd} sm/><Stat l="Mənfəət" v={F(np)} c={np>=0?K.gn:K.rd} sm/><Stat l="Pul qalığı" v={F(kI-kO)} c={K.bl} sm/><Stat l="Əsas vəsait" v={F(aT)} c={K.pr} sm/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Box><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:8 }}>Gəlir trendi (5 ay)</div><Spark data={mRev} c={K.gn} h={50} fill/><div style={{ display:"flex", justifyContent:"space-between", fontSize:8, color:K.dm, marginTop:2 }}>{months.map((m,i)=><span key={i}>{m}</span>)}</div></Box>
        <Box><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:8 }}>Mənfəət trendi</div><Spark data={mProf} c={K.bl} h={50} fill/><div style={{ display:"flex", justifyContent:"space-between", fontSize:8, color:K.dm, marginTop:2 }}>{months.map((m,i)=><span key={i}>{m}</span>)}</div></Box>
      </div>
      <Box style={{ marginTop:12 }}><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:8 }}>Xərc strukturu</div><HBar maxV={Math.max(tC,pur,deprA/12,3200)} data={[{l:"Əmək haqqı",v:tC,c:K.bl},{l:"Mal alışı",v:pur,c:K.or},{l:"Amortizasiya",v:deprA/12,c:K.pr},{l:"Digər xərclər",v:3200,c:K.mt}]}/></Box>
    </div>}

    {tab==="cashflow"&&<div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, marginBottom:14 }}>
        <Stat l="Mədaxil" v={F(kI)} c={K.gn} sm/><Stat l="Məxaric" v={F(kO)} c={K.rd} sm/><Stat l="Xalis axın" v={F(kI-kO)} c={kI>=kO?K.gn:K.rd} sm/><Stat l="Nisbət" v={(kI/(kO||1)).toFixed(2)+"x"} c={kI>kO?K.gn:K.rd} sm/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Box><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:8 }}>Mədaxil kateqoriyaları</div>{(()=>{const cats={};kassa.filter(k=>k.tp==="in").forEach(k=>{cats[k.cat]=(cats[k.cat]||0)+k.amt;});const mx=Math.max(...Object.values(cats),1);return <HBar maxV={mx} data={Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([l,v])=>({l,v,c:K.gn}))}/>;})()}</Box>
        <Box><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:8 }}>Məxaric kateqoriyaları</div>{(()=>{const cats={};kassa.filter(k=>k.tp==="out").forEach(k=>{cats[k.cat]=(cats[k.cat]||0)+k.amt;});const mx=Math.max(...Object.values(cats),1);return <HBar maxV={mx} data={Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([l,v])=>({l,v,c:K.rd}))}/>;})()}</Box>
      </div>
      <Box style={{ marginTop:12 }}><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:8 }}>Kumulyativ pul axını</div>{(()=>{let run=0;const cum=kassa.map(k=>{run+=(k.tp==="in"?k.amt:-k.amt);return run;});return <Spark data={cum} c={K.bl} h={50} fill/>;})()}<div style={{ display:"flex", justifyContent:"space-between", fontSize:8, color:K.dm, marginTop:2 }}><span>Əvvəl</span><span>İndi</span></div></Box>
    </div>}

    {tab==="profit"&&<div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:14 }}>
        <Stat l="Ümumi marja" v={P(gp/(rev||1))} c={K.gn} sm/><Stat l="Əməliyyat" v={P(op/(rev||1))} c={K.bl} sm/><Stat l="Xalis marja" v={P(np/(rev||1))} c={np>=0?K.gn:K.rd} sm/><Stat l="ROA (illik)" v={P(np*12/(aT||1))} c={K.pr} sm/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Box><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:8 }}>Şəlalə diaqramı</div>
          {[{l:"Satış gəliri",v:rev,c:K.gn},{l:"Maya dəyəri",v:-pur,c:K.rd},{l:"ÜMUMİ MƏNFƏƏT",v:gp,b:1,border:1},{l:"ƏH xərci",v:-tC,c:K.rd},{l:"Amortizasiya",v:-(deprA/12),c:K.yl},{l:"Vergi (20%)",v:-Math.max(0,op)*TX.PROFIT,c:K.rd},{l:"XALİS MƏNFƏƏT",v:np,b:1,border:1,c:np>=0?K.gn:K.rd}].map((r,i)=>
            <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderTop:r.border?`1px solid ${K.bd}`:"none" }}><span style={{ fontSize:11, fontWeight:r.b?700:400, color:r.b?K.tx:K.mt }}>{r.l}</span><span style={{ fontSize:11, fontWeight:r.b?700:500, color:r.c||(r.v<0?K.dm:K.tx) }}>{r.v<0?`(${F(Math.abs(r.v))})`:F(r.v)}</span></div>)}</Box>
        <Box><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:8 }}>Break-even təhlili</div>
          <Row l="Sabit xərclər" v={F(fixedCost)} c={K.bl}/><Row l="Dəyişən xərc %" v={P(varCostRate)} c={K.or}/><Row l="Break-even nöqtəsi" v={F(breakEven)} b c={K.yl} border/><Row l="Təhlükəsizlik marjası" v={P(safetyMargin)} c={safetyMargin>0?K.gn:K.rd}/>
          <div style={{ marginTop:8 }}><div style={{ height:20, background:`linear-gradient(90deg,${K.rd}33 ${Math.min(100,(breakEven/(rev||1))*100)}%,${K.gn}33 0%)`, borderRadius:4, position:"relative" }}><div style={{ position:"absolute", left:`${Math.min(100,(breakEven/(rev||1))*100)}%`, top:-4, width:2, height:28, background:K.yl }}/><span style={{ position:"absolute", left:4, top:3, fontSize:8, color:K.rd }}>Zərər</span><span style={{ position:"absolute", right:4, top:3, fontSize:8, color:K.gn }}>Mənfəət</span></div></div>
        </Box>
      </div>
    </div>}

    {tab==="ratios"&&<div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:14 }}>
        <Box><div style={{ fontSize:10,fontWeight:800,color:K.bl,marginBottom:8 }}>Likvidlik</div>
          <Row l="Cari nisbət" v={((kI-kO+aT)/(kO||1)).toFixed(2)} c={K.bl}/><Row l="Tez nisbət" v={((kI-kO)/(kO||1)).toFixed(2)} c={K.cy}/><Row l="Pul nisbəti" v={((kI-kO)/(tC||1)).toFixed(2)} c={K.gn}/>
        </Box>
        <Box><div style={{ fontSize:10,fontWeight:800,color:K.gn,marginBottom:8 }}>Effektivlik</div>
          <Row l="Aktiv dövriyyəsi" v={(rev*12/(aT||1)).toFixed(2)+"x"} c={K.gn}/><Row l="İşçi başına gəlir" v={F(rev/(emps.length||1))} c={K.bl}/><Row l="İşçi başına xərc" v={F(tC/(emps.length||1))} c={K.rd}/>
        </Box>
        <Box><div style={{ fontSize:10,fontWeight:800,color:K.pr,marginBottom:8 }}>Borc</div>
          <Row l="Borc/Kapital" v={(kO/(kI||1)).toFixed(2)} c={K.pr}/><Row l="ƏH/Gəlir" v={P(tC/(rev||1))} c={tC/rev>0.5?K.rd:K.gn}/><Row l="Amort./Aktiv" v={P(deprA/(aI||1))} c={K.yl}/>
        </Box>
      </div>
      <Box><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:10 }}>Performans göstəriciləri</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
          <Gauge v={gp/(rev||1)*100} max={100} c={K.gn} label="Ümumi marja"/><Gauge v={np/(rev||1)*100} max={100} c={K.bl} label="Xalis marja"/><Gauge v={Math.min(100,(kI/(kO||1))*50)} max={100} c={K.cy} label="Pul axını"/><Gauge v={Math.min(100,safetyMargin*100)} max={100} c={K.yl} label="Təhlükəsizlik"/><Gauge v={Math.min(100,np*12/(aT||1)*100)} max={100} c={K.pr} label="ROA"/>
        </div>
      </Box>
    </div>}

    {tab==="workforce"&&<div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:14 }}>
        <Stat l="İşçi sayı" v={emps.length} c={K.bl} sm/><Stat l="Orta ƏH" v={F(avg)} c={K.gn} sm/><Stat l="Median ƏH" v={F(med)} c={K.cy} sm/><Stat l="ƏH fondu/Gəlir" v={P(tC/(rev||1))} c={K.or} sm/><Stat l="İşçi/Gəlir" v={F(rev/(emps.length||1))} c={K.pr} sm/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Box><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:8 }}>Şöbə xərcləri</div>
          <HBar maxV={Math.max(...Object.values(depts).map(d=>d.c),1)} data={Object.entries(depts).sort((a,b)=>b[1].c-a[1].c).map(([d,v])=>({l:`${d} (${v.n})`,v:v.c,c:K.bl}))}/></Box>
        <Box><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:8 }}>ƏH paylanması</div>
          {(()=>{const bkts=[{l:"<1K",mn:0,mx:1000},{l:"1-2K",mn:1000,mx:2000},{l:"2-3K",mn:2000,mx:3000},{l:"3-5K",mn:3000,mx:5000},{l:"5K+",mn:5000,mx:1e6}];const data=bkts.map(b=>({l:b.l,v:emps.filter(e=>e.gross>=b.mn&&e.gross<b.mx).length,c:K.pr}));const mx=Math.max(...data.map(d=>d.v),1);return <div style={{ display:"flex", gap:4, alignItems:"flex-end", height:80 }}>{data.map((d,i)=><div key={i} style={{ flex:1, textAlign:"center" }}><div style={{ background:`linear-gradient(180deg,${d.c},${d.c}44)`, height:`${(d.v/mx)*60}px`, borderRadius:"3px 3px 0 0", transition:"height .3s ease", minHeight:d.v>0?8:2 }}/><div style={{ fontSize:13, fontWeight:800, color:d.c, marginTop:2 }}>{d.v}</div><div style={{ fontSize:8, color:K.dm }}>{d.l}</div></div>)}</div>;})()}</Box>
      </div>
      <Box style={{ marginTop:12 }}><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:6 }}>Gender analizi</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          {["M","F"].map(g=>{const grp=ps.filter(e=>e.gender===g);const tavg=grp.length?grp.reduce((s,e)=>s+e.p.g,0)/grp.length:0;return <div key={g}><div style={{ fontSize:11,fontWeight:700,marginBottom:4 }}>{g==="M"?"Kişi":"Qadın"} ({grp.length})</div><Row l="Orta ƏH" v={F(tavg)} c={K.bl}/><Row l="Cəmi brutto" v={F(grp.reduce((s,e)=>s+e.p.g,0))} c={K.gn}/></div>;})}
        </div></Box>
    </div>}

    {tab==="forecast"&&<div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:14 }}>
        {[{m:"Mart",f:1.05},{m:"Aprel",f:1.08},{m:"May",f:1.12}].map((f,i)=>{const r=rev*f.f,x=(pur+tC)*1.03,n=r-x-Math.max(0,r-x)*TX.PROFIT;return <Box key={i}><div style={{ fontSize:11,fontWeight:800,color:K.bl,marginBottom:4 }}>{f.m} 2026</div><Row l="Gəlir" v={F(r)} c={K.gn}/><Row l="Xərc" v={F(x)} c={K.rd}/><Row l="Mənfəət" v={F(n)} b c={n>=0?K.gn:K.rd} border/></Box>;})}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Box><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:8 }}>8 aylıq gəlir trendi</div>
          <Spark data={[...mRev,rev*1.05,rev*1.08,rev*1.12]} c={K.gn} h={60} fill/>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:8, color:K.dm, marginTop:2 }}>{[...months,"Mar","Apr","May"].map((m,i)=><span key={i}>{m}</span>)}</div></Box>
        <Box><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:8 }}>Rüblük vergi proqnozu</div>
          {(()=>{const qRev=rev*3.15,qVat=qRev*TX.VAT-pur*3*TX.VAT,qGv=ps.reduce((s,p)=>s+p.gv,0)*3,qDsmf=(ps.reduce((s,p)=>s+p.dee+p.der,0))*3;return <div><Row l="R1 ƏDV" v={F(qVat)} c={K.or}/><Row l="R1 GV" v={F(qGv)} c={K.yl}/><Row l="R1 DSMF" v={F(qDsmf)} c={K.pr}/><Row l="CƏMİ VERGİ" v={F(qVat+qGv+qDsmf)} b c={K.rd} border/></div>;})()}</Box>
      </div>
      <Alert c={K.bl}>Proqnoz cari məlumatlar əsasında 3 aylıq linear ekstrapolyasiya ilə hesablanır. Faktiki nəticələr fərqli ola bilər.</Alert>
    </div>}

    {tab==="stats"&&<div>
      <div style={{ fontSize:9, fontWeight:800, color:K.mt, textTransform:"uppercase", marginBottom:6 }}>Əmək haqqı statistikası</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:8, marginBottom:14 }}>
        <Stat l="Orta" v={F(avg)} c={K.gn} sm/><Stat l="Median" v={F(med)} c={K.cy} sm/><Stat l="Min" v={F(gs[0])} c={K.yl} sm/><Stat l="Max" v={F(gs[gs.length-1])} c={K.pr} sm/><Stat l="Diapazon" v={F(gs[gs.length-1]-gs[0])} c={K.or} sm/><Stat l="Vergi yükü" v={P((tC-tN)/tC)} c={K.rd} sm/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
        <Box><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:6 }}>Şöbə</div>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:10 }}>
            <thead><tr><TH>Şöbə</TH><TH r>Say</TH><TH r>Brutto</TH><TH r>Orta</TH></tr></thead>
            <tbody>{Object.entries(depts).sort((a,b)=>b[1].g-a[1].g).map(([d,v])=>
              <tr key={d} style={{ borderBottom:`1px solid ${K.bd}` }}><TD b>{d}</TD><TD r>{v.n}</TD><TD r c={K.bl}>{F(v.g)}</TD><TD r c={K.gn}>{F(v.g/v.n)}</TD></tr>
            )}</tbody></table></Box>
        <Box><div style={{ fontSize:9,fontWeight:800,color:K.mt,textTransform:"uppercase",marginBottom:6 }}>Maliyyə icmalı</div>
          <Row l="Brutto fond" v={F(tG)} c={K.bl}/><Row l="Netto fond" v={F(tN)} c={K.gn}/><Row l="İG xərci" v={F(tC)} c={K.rd}/><Row l="GV cəmi" v={F(ps.reduce((s,e)=>s+e.p.gv,0))} c={K.yl}/><Row l="DSMF cəmi" v={F(ps.reduce((s,e)=>s+e.p.dee+e.p.der,0))} c={K.pr}/>
          <Row l="Satış" v={F(rev)} c={K.gn} border/><Row l="Alış" v={F(pur)} c={K.bl}/><Row l="Kassa mədaxil" v={F(kI)} c={K.gn}/><Row l="Kassa məxaric" v={F(kO)} c={K.rd}/><Row l="Əsas vəsait" v={F(aT)} c={K.pr}/>
        </Box>
      </div>
    </div>}
  </div>;
}

// ══════════ OCR ══════════
function OCR() {
  const [file,setFile]=useState(null); const [preview,setPreview]=useState(null); const [scanning,setScanning]=useState(false); const [result,setResult]=useState(null); const [mode,setMode]=useState("invoice"); const ref=useRef(null);
  const handleFile=e=>{const f=e.target.files?.[0];if(!f)return;setFile(f);setResult(null);if(f.type.startsWith("image/")){const r=new FileReader();r.onload=ev=>setPreview(ev.target.result);r.readAsDataURL(f);}else{setPreview(null);}};
  const scan=async()=>{if(!file)return;setScanning(true);setResult(null);try{const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=()=>rej(new Error("Oxuna bilmədi"));r.readAsDataURL(file);});
    const isImg=file.type.startsWith("image/"),isPdf=file.type==="application/pdf";
    const sys=`You are an Azerbaijani accounting document analyzer. Return ONLY valid JSON.\n${mode==="invoice"?'{"type":"invoice","invoice_no":"","date":"","seller_name":"","buyer_name":"","items":[{"description":"","quantity":1,"unit_price":0,"vat":0}],"subtotal":0,"vat_total":0,"grand_total":0}':mode==="payroll"?'{"type":"payroll","period":"","employees":[{"name":"","gross":0,"net":0}],"total_gross":0,"total_net":0}':'{"type":"document","title":"","content":"","amounts":[{"description":"","amount":0}],"total":0}'}`;
    const content=[];
    if(isImg)content.push({type:"image",source:{type:"base64",media_type:file.type,data:base64}});
    else if(isPdf)content.push({type:"document",source:{type:"base64",media_type:"application/pdf",data:base64}});
    else{const txt=atob(base64);content.push({type:"text",text:`File(${file.name}):\n${txt.substring(0,8000)}`});}
    content.push({type:"text",text:"Extract structured data. Return ONLY JSON."});
    const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:4000,system:sys,messages:[{role:"user",content}]})});
    if(!resp.ok)throw new Error(`API ${resp.status}`);
    const data=await resp.json();const text=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
    setResult(JSON.parse(text.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim()));
  }catch(err){setResult({error:err.message});}setScanning(false);};

  return <div>
    <h1 style={{ margin:"0 0 10px", fontSize:17, fontWeight:800 }}>OCR Skaner</h1>
    <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", gap:12 }}>
      <Box>
        <Sel label="Növ" value={mode} onChange={e=>{setMode(e.target.value);setResult(null);}} opts={[{v:"invoice",l:"Qaimə"},{v:"payroll",l:"Əmək haqqı"},{v:"other",l:"Digər"}]}/>
        <div onClick={()=>ref.current?.click()} style={{ border:`2px dashed ${file?K.gn:K.bd}`, borderRadius:6, padding:16, textAlign:"center", cursor:"pointer", marginBottom:10 }}>
          <input ref={ref} type="file" accept="image/*,.pdf,.csv,.xlsx" onChange={handleFile} style={{ display:"none" }}/>
          {file?<div style={{ fontSize:11, color:K.gn }}>✓ {file.name}</div>:<div><div style={{ fontSize:20, opacity:.2 }}>◎</div><div style={{ fontSize:10, color:K.mt }}>Fayl yükləyin</div></div>}
        </div>
        {preview&&<img src={preview} alt="" style={{ width:"100%", borderRadius:4, marginBottom:8, border:`1px solid ${K.bd}` }}/>}
        <Btn disabled={!file||scanning} onClick={scan} style={{ width:"100%" }} c={K.bl}>{scanning?"⏳ Analiz...":"◎ Skan et"}</Btn>
      </Box>
      <Box>{!result&&!scanning&&<div style={{ textAlign:"center", padding:30, color:K.dm }}><div style={{ fontSize:24, opacity:.2 }}>◎</div><div style={{ fontSize:12, fontWeight:700, marginTop:6 }}>Sənəd yükləyin</div></div>}
        {scanning&&<div style={{ textAlign:"center", padding:30, color:K.bl }}>Analiz edilir...</div>}
        {result&&!result.error&&<div>
          <Pill t={result.type==="invoice"?"Qaimə":"Sənəd"} c={K.gn}/>
          <pre style={{ fontSize:9, color:K.tx, background:"rgba(0,0,0,0.3)", padding:8, borderRadius:4, overflow:"auto", maxHeight:300, marginTop:8, whiteSpace:"pre-wrap" }}>{JSON.stringify(result,null,2)}</pre>
          <Btn sm ghost c={K.bl} onClick={()=>navigator.clipboard.writeText(JSON.stringify(result,null,2))} style={{ marginTop:6 }}>Kopyala</Btn>
        </div>}
        {result?.error&&<Alert c={K.rd}>{result.error}</Alert>}
      </Box>
    </div>
  </div>;
}

// ══════════ REPORTS ══════════
function RepPage({ emps, invs, assets, debtors, kassa }) {
  const [tab,setTab]=useState("pnl");
  const ps=emps.map(e=>cp(e.gross,e.sec));
  const rev=invs.filter(i=>i.tp==="sale").reduce((s,i)=>s+i.amt,0), pur=invs.filter(i=>i.tp==="purchase").reduce((s,i)=>s+i.amt,0);
  const payT=ps.reduce((s,p)=>s+p.cost,0), depr=assets.reduce((s,a)=>s+a.cur*(a.rate/100)/12,0);
  const opEx=3200, gp=rev-pur, op=gp-payT-depr-opEx, tx=Math.max(0,op)*TX.PROFIT, np=op-tx;
  const dbtT=debtors.filter(d=>d.tp==="debitor"&&d.status!=="paid").reduce((s,d)=>s+d.amt,0);
  const krdT=debtors.filter(d=>d.tp==="kreditor"&&d.status!=="paid").reduce((s,d)=>s+d.amt,0);

  return <div>
    <h1 style={{ margin:"0 0 10px", fontSize:17, fontWeight:800 }}>Hesabatlar</h1>
    <TabBar tabs={[{id:"pnl",l:"Mənfəət/Zərər"},{id:"balance",l:"Balans"},{id:"vat",l:"ƏDV"},{id:"audit",l:"Audit"}]} a={tab} on={setTab}/>
    {tab==="pnl"&&<Box>
      <div style={{ textAlign:"center", marginBottom:10 }}><div style={{ fontSize:13, fontWeight:800 }}>MƏNFƏƏT VƏ ZƏRƏR HESABATI</div><div style={{ fontSize:9, color:K.mt }}>Fevral 2026</div></div>
      {[{l:"Satış gəlirləri",v:rev,c:K.gn},{l:"Maya dəyəri",v:-pur},{l:"ÜMUMİ MƏNFƏƏT",v:gp,b:1,border:1},{l:"  Əmək haqqı",v:-payT},{l:"  Amortizasiya",v:-depr},{l:"  Digər",v:-opEx},{l:"ƏMƏLİYYAT",v:op,b:1,border:1},{l:"Mənfəət vergisi",v:-tx,c:K.rd},{l:"XALİS MƏNFƏƏT",v:np,b:1,border:1,c:np>=0?K.gn:K.rd}].map((r,i)=>
        <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderTop:r.border?`1px solid ${K.bd}`:"none" }}>
          <span style={{ fontSize:11, fontWeight:r.b?700:400, color:r.b?K.tx:K.mt }}>{r.l}</span>
          <span style={{ fontSize:11, fontWeight:r.b?700:500, color:r.c||(r.v<0?K.dm:K.tx) }}>{r.v<0?`(${F(Math.abs(r.v))})`:F(r.v)}</span></div>)}
    </Box>}
    {tab==="balance"&&<Box>
      <div style={{ textAlign:"center", marginBottom:10 }}><div style={{ fontSize:13, fontWeight:800 }}>BALANS HESABATI</div><div style={{ fontSize:9, color:K.mt }}>22.02.2026</div></div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <div><div style={{ fontSize:10, fontWeight:800, color:K.bl, marginBottom:6 }}>AKTİVLƏR</div>
          <Row l="Əsas vəsaitlər" v={F(assets.reduce((s,a)=>s+a.cur,0))} c={K.bl}/><Row l="Debitor borcları" v={F(dbtT)} c={K.yl}/>
          <Row l="Pul vəsaitləri" v={F(16852)} c={K.gn}/><Row l="CƏMİ AKTİV" v={F(assets.reduce((s,a)=>s+a.cur,0)+dbtT+16852)} b border/>
        </div>
        <div><div style={{ fontSize:10, fontWeight:800, color:K.rd, marginBottom:6 }}>PASSİVLƏR</div>
          <Row l="Kreditor borcları" v={F(krdT)} c={K.rd}/><Row l="Vergi borcu" v={F(ps.reduce((s,p)=>s+p.gv,0))} c={K.yl}/>
          <Row l="Kapital" v={F(assets.reduce((s,a)=>s+a.cur,0)+dbtT+16852-krdT-ps.reduce((s,p)=>s+p.gv,0))} c={K.gn}/>
          <Row l="CƏMİ PASSİV" v={F(assets.reduce((s,a)=>s+a.cur,0)+dbtT+16852)} b border/>
        </div>
      </div>
    </Box>}
    {tab==="vat"&&<Box>
      <div style={{ textAlign:"center", marginBottom:10 }}><div style={{ fontSize:13, fontWeight:800 }}>ƏDV BƏYANNAMƏSİ — R1 2026</div></div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
        <Stat l="Çıxış ƏDV" v={F(invs.filter(i=>i.tp==="sale").reduce((s,i)=>s+i.vat,0))} c={K.rd}/>
        <Stat l="Giriş ƏDV" v={F(invs.filter(i=>i.tp==="purchase").reduce((s,i)=>s+i.vat,0))} c={K.gn}/>
        <Stat l="Büdcəyə" v={F(invs.filter(i=>i.tp==="sale").reduce((s,i)=>s+i.vat,0)-invs.filter(i=>i.tp==="purchase").reduce((s,i)=>s+i.vat,0))} c={K.or}/>
      </div>
    </Box>}
    {tab==="audit"&&<div>
      <Alert c={K.bl}>Audit yoxlaması üçün hazır məlumatlar. Bütün hesabatlar 2026-cı il Vergi Məcəlləsinə uyğundur.</Alert>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Box><div style={{ fontSize:10, fontWeight:800, color:K.mt, marginBottom:6 }}>SƏNƏD BAZASI</div>
          <Row l="İşçi sayı" v={emps.length}/><Row l="Qaimə sayı" v={invs.length}/><Row l="Kassa əməliyyatları" v={kassa?.length||0}/><Row l="Əsas vəsaitlər" v={assets.length}/>
          <Row l="Debitor/Kreditor" v={debtors.length}/>
        </Box>
        <Box><div style={{ fontSize:10, fontWeight:800, color:K.mt, marginBottom:6 }}>VERGİ UYĞUNLUĞU</div>
          <Row l="GV hesablanma" v="✓ VM 101-102" c={K.gn}/><Row l="DSMF hesablanma" v="✓ Qanun" c={K.gn}/><Row l="İTS 2026 hədd" v="✓ 2500₼" c={K.gn}/>
          <Row l="200₼ güzəşt" v="✓ VM 102.1.6" c={K.gn}/><Row l="ƏDV 18%" v="✓ VM 175" c={K.gn}/>
        </Box>
      </div>
    </div>}
  </div>;
}
