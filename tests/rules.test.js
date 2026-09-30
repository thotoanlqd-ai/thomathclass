// Test firestore.rules cho tính năng Điểm rèn luyện lớp 10C5, dùng DỮ LIỆU THỬ (không phải học sinh thật).
// Chạy bằng Firebase Emulator: cd tests && npm install && npm test   (cần Java)
const { test, before, after } = require("node:test");
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");

const ADMIN_UID = "cbWUWVPZ8Fgni1gQjbz7ycJvfL72";
const HK = "HK1-2026-2027";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-thomathclass",
    firestore: { rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8") },
  });
  // Dữ liệu thử: 3 học sinh 10C5 (dương, âm, đồng điểm) + 1 học sinh lớp khác
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("config/renluyen").set({ hocKyHienTai: HK, nguoiDuocCham: [], nutNhanh: [] });
    const hs = [
      ["hsA", "Thử An", "10c-lqd"],
      ["hsB", "Thử Bình", "10c-lqd"],
      ["hsC", "Thử Chi", "10c-lqd"],
      ["hsOther", "Thử Khác", "tho-2k9"],
    ];
    for (const [uid, fullName, classId] of hs) {
      await db.doc(`roster/${uid}`).set({ fullName, classId, order: 1 });
      await db.doc(`students/${uid}`).set({ fullName, classId, scores: [], comments: [] });
    }
    await db.doc("students/hsA/renluyen/e1").set({ diem: 5, lyDo: "Bí mật của A", hocKy: HK, nguoiChamTen: "Giáo viên", huy: false });
    await db.doc("students/hsB/renluyen/e1").set({ diem: -2, lyDo: "Bí mật của B", hocKy: HK, nguoiChamTen: "Giáo viên", huy: false });
    await db.doc("renluyenTong/hsA").set({ [HK]: 5 });
    await db.doc("renluyenTong/hsB").set({ [HK]: -2 });
    // Hai tài liệu do Cloud Function ghi
    await db.doc(`leaderboard/10C5_${HK}`).set({ hocKy: HK, siSo: 3, top: [{ hang: 1, ten: "Thử An", diem: 5 }] });
    await db.doc("renluyenHang/hsA").set({ hocKy: HK, hang: 1, diem: 5, siSo: 3 });
    await db.doc("renluyenHang/hsB").set({ hocKy: HK, hang: 3, diem: -2, siSo: 3 });
  });
});

after(async () => env && env.cleanup());

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

test("học sinh đọc được điểm + lịch sử + lý do của CHÍNH MÌNH", async () => {
  await assertSucceeds(as("hsA").doc("students/hsA/renluyen/e1").get());
  await assertSucceeds(as("hsA").collection("students/hsA/renluyen").where("hocKy", "==", HK).get());
  await assertSucceeds(as("hsA").doc("renluyenTong/hsA").get());
  await assertSucceeds(as("hsA").doc("renluyenHang/hsA").get());
});

test("học sinh KHÔNG đọc được điểm/lý do/tổng/hạng của học sinh khác", async () => {
  await assertFails(as("hsA").doc("students/hsB/renluyen/e1").get());
  await assertFails(as("hsA").collection("students/hsB/renluyen").where("hocKy", "==", HK).get());
  await assertFails(as("hsA").doc("renluyenTong/hsB").get());
  await assertFails(as("hsA").doc("renluyenHang/hsB").get());
  await assertFails(as("hsA").doc("students/hsB").get());
  // không quét được cả collection
  await assertFails(as("hsA").collection("renluyenTong").get());
  await assertFails(as("hsA").collectionGroup("renluyen").get());
});

test("học sinh 10C5 đọc được bảng xếp hạng; người ngoài lớp / chưa đăng nhập thì không", async () => {
  await assertSucceeds(as("hsC").doc(`leaderboard/10C5_${HK}`).get());
  await assertFails(as("hsOther").doc(`leaderboard/10C5_${HK}`).get());
  await assertFails(anon().doc(`leaderboard/10C5_${HK}`).get());
});

test("học sinh không tự ghi được điểm / bảng xếp hạng / hạng", async () => {
  const entry = { diem: 100, lyDo: "tự cộng", hocKy: HK, nguoiChamUid: "hsA", huy: false };
  await assertFails(as("hsA").doc("students/hsA/renluyen/hack").set(entry));
  await assertFails(as("hsA").doc("renluyenTong/hsA").set({ [HK]: 999 }));
  await assertFails(as("hsA").doc(`leaderboard/10C5_${HK}`).set({ hocKy: HK, siSo: 3, top: [] }));
  await assertFails(as("hsA").doc("renluyenHang/hsA").set({ hocKy: HK, hang: 1, diem: 999, siSo: 3 }));
});

test("admin đọc được tất cả, chấm điểm được; vẫn không ghi tay được leaderboard/renluyenHang", async () => {
  const admin = as(ADMIN_UID);
  await assertSucceeds(admin.doc("students/hsB/renluyen/e1").get());
  await assertSucceeds(admin.doc(`leaderboard/10C5_${HK}`).get());
  await assertSucceeds(admin.doc("renluyenHang/hsB").get());
  await assertSucceeds(
    admin.doc("students/hsC/renluyen/e9").set({ diem: 1, lyDo: "Phát biểu", hocKy: HK, nguoiChamUid: ADMIN_UID, huy: false })
  );
  await assertFails(admin.doc("renluyenHang/hsC").set({ hocKy: HK, hang: 1, diem: 0, siSo: 3 }));
});
