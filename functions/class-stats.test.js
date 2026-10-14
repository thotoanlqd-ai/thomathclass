const assert = require("assert");
const { tinhThongKeLop, parseDiem } = require("./class-stats");

assert.strictEqual(parseDiem("7,5"), 7.5);
assert.strictEqual(parseDiem("abc"), null);

const sc = (v, label = "KT 15p", date = "2026-10-01") => [{ label, date, value: v }];
const t = tinhThongKeLop([sc("4"), sc("5"), sc("6,5"), sc("8"), sc("10"), sc("x"), []]);
assert.strictEqual(t.length, 1);
assert.deepStrictEqual(
  { n: t[0].n, tb: t[0].tb, max: t[0].max, min: t[0].min, khoang: t[0].khoang },
  { n: 5, tb: 6.7, max: 10, min: 4, khoang: [1, 1, 1, 1, 1] }
);

// dưới 3 em -> không công bố; khác ngày/nhãn -> bài khác; mới nhất lên đầu
assert.deepStrictEqual(tinhThongKeLop([sc("5"), sc("6")]), []);
const t2 = tinhThongKeLop([sc("5"), sc("6", "kt 15p"), sc("7"), sc("1", "KT 15p", "2026-10-09"), sc("2", "KT 15p", "2026-10-09"), sc("3", "KT 15p", "2026-10-09")]);
assert.deepStrictEqual(t2.map((x) => x.date), ["2026-10-09", "2026-10-01"]);
console.log("class-stats OK");
