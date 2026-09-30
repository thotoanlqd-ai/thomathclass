const assert = require("assert");
const { tongDiem, xepHang, layTop } = require("./renluyen-rank");

// tongDiem: bỏ lượt đã huỷ và lượt học kỳ khác
assert.strictEqual(
  tongDiem(
    [
      { diem: 3, hocKy: "HK1", huy: false },
      { diem: -1, hocKy: "HK1", huy: false },
      { diem: 5, hocKy: "HK1", huy: true },
      { diem: 9, hocKy: "HK2", huy: false },
    ],
    "HK1"
  ),
  2
);
assert.strictEqual(tongDiem([], "HK1"), 0);

// xepHang: 1,2,2,4 và cho phép âm
const r = xepHang([
  { uid: "a", ten: "An", tong: 5 },
  { uid: "b", ten: "Bình", tong: 3 },
  { uid: "c", ten: "Chi", tong: 3 },
  { uid: "d", ten: "Dũng", tong: -2 },
  { uid: "e", ten: "Em", tong: 0 },
]);
assert.deepStrictEqual(r.map((x) => x.hang), [1, 2, 2, 4, 5]);
assert.deepStrictEqual(r.map((x) => x.uid), ["a", "b", "c", "e", "d"]);

// layTop: đồng điểm ở hạng 10 hiện đủ, ngoài hạng 10 không hiện
const many = [];
for (let i = 0; i < 9; i++) many.push({ uid: "u" + i, ten: "HS" + i, tong: 100 - i });
many.push({ uid: "x1", ten: "X1", tong: 50 }, { uid: "x2", ten: "X2", tong: 50 }, { uid: "x3", ten: "X3", tong: 50 });
many.push({ uid: "y", ten: "Y", tong: 49 });
const top = layTop(xepHang(many));
assert.strictEqual(top.length, 12); // 9 + 3 em đồng hạng 10
assert.ok(top.every((t) => t.hang <= 10));
assert.ok(!top.some((t) => t.ten === "Y"));
assert.deepStrictEqual(Object.keys(top[0]).sort(), ["diem", "hang", "ten"]); // không lộ uid/lý do

console.log("renluyen-rank: OK");
