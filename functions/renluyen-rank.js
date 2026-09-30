// Logic thuần (không phụ thuộc Firebase) để tính & xếp hạng điểm rèn luyện lớp 10C5.
// Tách riêng khỏi index.js để test được bằng `node renluyen-rank.test.js`.

const TOP_N = 10;

// Tổng điểm của 1 học sinh trong 1 học kỳ: cộng mọi lượt chấm CHƯA huỷ (huy !== true) đúng học kỳ đó.
function tongDiem(entries, hocKy) {
  return entries.reduce((sum, e) => {
    if (!e || e.huy === true || e.hocKy !== hocKy) return sum;
    return sum + (typeof e.diem === "number" ? e.diem : 0);
  }, 0);
}

// students: [{uid, ten, tong}] -> mảng đã sắp xếp điểm cao -> thấp (đồng điểm xếp theo tên),
// mỗi phần tử thêm `hang` kiểu 1,2,2,4 (đồng điểm cùng hạng, hạng kế tiếp nhảy cóc).
function xepHang(students) {
  const sorted = students
    .slice()
    .sort((a, b) => b.tong - a.tong || String(a.ten).localeCompare(String(b.ten), "vi"));
  let hang = 0;
  return sorted.map((s, i) => {
    if (i === 0 || s.tong !== sorted[i - 1].tong) hang = i + 1;
    return { uid: s.uid, ten: s.ten, tong: s.tong, hang };
  });
}

// Top 10 công khai: mọi em có hạng <= 10 (nên đồng điểm ở hạng 10 vẫn hiện đủ).
function layTop(ranked) {
  return ranked.filter((r) => r.hang <= TOP_N).map((r) => ({ hang: r.hang, ten: r.ten, diem: r.tong }));
}

module.exports = { TOP_N, tongDiem, xepHang, layTop };
