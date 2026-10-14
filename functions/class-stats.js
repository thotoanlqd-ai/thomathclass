// Thống kê điểm kiểm tra cả lớp (hàm thuần, dễ test). Mỗi "bài kiểm tra" = cùng nội dung (label) + cùng ngày.
// Chỉ công bố khi có ít nhất MIN_N em có điểm, để không lộ điểm riêng của một em.
const MIN_N = 3;

// 5 khoảng điểm: <5, 5–<6.5, 6.5–<8, 8–<9, 9–10
const KHOANG_LABELS = ["Dưới 5", "5 – dưới 6,5", "6,5 – dưới 8", "8 – dưới 9", "9 – 10"];

function parseDiem(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Bỏ phần "mã đề ..." khỏi tên bài để mọi mã đề của cùng một bài kiểm tra được tính chung.
// Ví dụ: "KT 15p - Mã đề 101", "KT 15p (mã 102)", "KT 15p đề A" -> "KT 15p".
// "đề" đứng một mình chỉ bị bỏ khi theo sau là số ngắn/một chữ cái, để không cắt nhầm "Đề kiểm tra".
const MA_DE_RE = /(?<![\p{L}\d])(?:(?:mã\s*đề|mã|mđ|md)\s*[:.]?\s*[\p{L}\d]{1,5}|đề\s*[:.]?\s*(?:\d{1,4}|\p{L})(?![\p{L}\d]))/giu;

function tenBaiKiemTra(label) {
  const s = String(label || "")
    .replace(MA_DE_RE, " ")
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—,;:]+|[\s\-–—,;:]+$/g, "");
  return s || String(label || "").trim();
}

function khoangIndex(d) {
  if (d < 5) return 0;
  if (d < 6.5) return 1;
  if (d < 8) return 2;
  if (d < 9) return 3;
  return 4;
}

// studentsScores: mảng các mảng scores ({label, date, value}) của từng học sinh trong lớp.
function tinhThongKeLop(studentsScores) {
  const groups = new Map();
  studentsScores.forEach((scores) => {
    (scores || []).forEach((s) => {
      const d = parseDiem(s.value);
      const label = tenBaiKiemTra(s.label);
      if (d === null || !label) return;
      const date = s.date || "";
      const key = label.toLowerCase() + "|" + date;
      if (!groups.has(key)) groups.set(key, { label, date, values: [] });
      groups.get(key).values.push(d);
    });
  });

  const tests = [];
  groups.forEach((g) => {
    const v = g.values;
    if (v.length < MIN_N) return;
    const khoang = [0, 0, 0, 0, 0];
    v.forEach((d) => khoang[khoangIndex(d)]++);
    tests.push({
      label: g.label,
      date: g.date,
      n: v.length,
      tb: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100,
      max: Math.max.apply(null, v),
      min: Math.min.apply(null, v),
      khoang,
    });
  });
  tests.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.label.localeCompare(b.label, "vi")));
  return tests;
}

module.exports = { MIN_N, KHOANG_LABELS, parseDiem, tenBaiKiemTra, tinhThongKeLop };
