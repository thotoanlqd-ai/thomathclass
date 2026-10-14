// Thống kê điểm kiểm tra cả lớp (hàm thuần, dễ test). Mỗi "bài kiểm tra" = cùng nội dung (label) + cùng ngày.
// Chỉ công bố khi có ít nhất MIN_N em có điểm, để không lộ điểm riêng của một em.
const MIN_N = 3;

// 5 khoảng điểm: <5, 5–<6.5, 6.5–<8, 8–<9, 9–10
const KHOANG_LABELS = ["Dưới 5", "5 – dưới 6,5", "6,5 – dưới 8", "8 – dưới 9", "9 – 10"];

function parseDiem(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
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
      const label = String(s.label || "").trim();
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

module.exports = { MIN_N, KHOANG_LABELS, parseDiem, tinhThongKeLop };
