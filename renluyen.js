// ==== ThoMathClass — renluyen.js ====
// Hàm dùng chung cho tính năng "Điểm rèn luyện" (chỉ áp dụng lớp 10C5).
// Dùng ở cả admin.html (giáo viên chấm) và lophoc.html (học sinh xem / người được
// giao quyền chấm nhanh). Yêu cầu: firebase-config.js đã chạy trước (khai báo auth, db).

// PHẢI khớp is10C5() trong firestore.rules và "id" của lớp 10C5 trong CLASS_LIST.
const RENLUYEN_CLASS_ID = "10c-lqd";

function renLuyenConfigRef() {
  return db.collection("config").doc("renluyen");
}

// Đọc config/renluyen. Luôn trả về đủ 3 field kể cả khi tài liệu chưa tồn tại.
function getRenLuyenConfig() {
  return renLuyenConfigRef()
    .get()
    .then((doc) => (doc.exists ? doc.data() : {}))
    .then((data) => ({
      hocKyHienTai: data.hocKyHienTai || "",
      nguoiDuocCham: Array.isArray(data.nguoiDuocCham) ? data.nguoiDuocCham : [],
      nutNhanh: Array.isArray(data.nutNhanh) ? data.nutNhanh : [],
    }));
}

function formatDiemRenLuyen(diem) {
  const n = Number(diem) || 0;
  return (n > 0 ? "+" : "") + n;
}

// Từ 1 mã học kỳ "HK{n}-{nămBắtĐầu}-{nămKếtThúc}" (vd "HK2-2026-2027"), suy ra cặp mã
// HK1/HK2 CÙNG năm học đó — dùng khi xuất Excel cần cả điểm HK1 lẫn HK2 của 1 năm học.
// Nếu không đúng định dạng, trả nguyên chuỗi vào hk1 và để hk2 rỗng (không suy đoán được).
function capHocKyTrongNam(hocKy) {
  const m = /^HK\d+-(\d{4})-(\d{4})$/.exec(hocKy || "");
  if (!m) return { hk1: hocKy || "", hk2: "" };
  return { hk1: "HK1-" + m[1] + "-" + m[2], hk2: "HK2-" + m[1] + "-" + m[2] };
}

// Sắp xếp danh sách mã học kỳ theo thứ tự MỚI NHẤT TRƯỚC, dựa vào định dạng
// "HK{số học kỳ}-{năm bắt đầu}-{năm kết thúc}" (vd "HK1-2026-2027", "HK2-2026-2027").
// Mã không đúng định dạng bị xếp xuống cuối (không làm hỏng danh sách).
function sapXepHocKyGanNhat(list) {
  function key(hk) {
    const m = /^HK(\d+)-(\d{4})-\d{4}$/.exec(hk || "");
    return m ? [Number(m[2]), Number(m[1])] : [0, 0];
  }
  return list.slice().sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka[0] !== kb[0] ? kb[0] - ka[0] : kb[1] - ka[1];
  });
}

// Thêm 1 lượt chấm điểm rèn luyện cho học sinh `uid`, đồng thời cộng/trừ vào tổng
// đúng học kỳ đó bằng transaction (không để lệch giữa lượt chấm và tổng).
// diem: số khác 0 (âm = trừ). lyDo: bắt buộc, không rỗng. hocKy: vd "HK1-2026-2027".
function themLuotChamRenLuyen(uid, diem, lyDo, hocKy, nguoiChamUid, nguoiChamTen) {
  const entryRef = db.collection("students").doc(uid).collection("renluyen").doc();
  const tongRef = db.collection("renluyenTong").doc(uid);
  return db.runTransaction((tx) =>
    tx.get(tongRef).then((tongSnap) => {
      const tong = tongSnap.exists ? tongSnap.data() || {} : {};
      const hienTai = typeof tong[hocKy] === "number" ? tong[hocKy] : 0;
      tx.set(entryRef, {
        diem,
        lyDo,
        hocKy,
        thoiGian: firebase.firestore.FieldValue.serverTimestamp(),
        nguoiChamUid,
        nguoiChamTen: nguoiChamTen || "",
        huy: false,
        huyBoi: null,
        huyLyDo: null,
        huyLuc: null,
      });
      tx.set(tongRef, { [hocKy]: hienTai + diem }, { merge: true });
    })
  );
}

// Huỷ 1 lượt chấm điểm rèn luyện (chỉ admin được phép — do firestore.rules chặn).
// Đánh dấu huy=true (KHÔNG xoá hẳn) và trừ lại đúng số điểm đã cộng khỏi tổng học kỳ đó.
function huyLuotChamRenLuyen(uid, entryId, huyBoi, huyLyDo) {
  const entryRef = db.collection("students").doc(uid).collection("renluyen").doc(entryId);
  const tongRef = db.collection("renluyenTong").doc(uid);
  return db.runTransaction((tx) =>
    Promise.all([tx.get(entryRef), tx.get(tongRef)]).then(([entrySnap, tongSnap]) => {
      if (!entrySnap.exists) throw new Error("Không tìm thấy lượt chấm này.");
      const entry = entrySnap.data();
      if (entry.huy) throw new Error("Lượt chấm này đã được huỷ trước đó.");
      const tong = tongSnap.exists ? tongSnap.data() || {} : {};
      const hienTai = typeof tong[entry.hocKy] === "number" ? tong[entry.hocKy] : 0;
      tx.update(entryRef, {
        huy: true,
        huyBoi,
        huyLyDo: huyLyDo || "",
        huyLuc: firebase.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(tongRef, { [entry.hocKy]: hienTai - entry.diem }, { merge: true });
    })
  );
}
