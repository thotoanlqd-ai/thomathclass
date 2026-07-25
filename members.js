// ==== ThoMathClass — members.js ====
// Helper dùng chung cho mọi trang có đăng nhập (lophoc.html, baigiang/tailieu/khoahoc/azota.html).
// Yêu cầu: firebase-config.js đã chạy trước (khai báo auth, db).

// Ghi nhận 1 lần đăng nhập thành công vào members/{uid}.
// CHỈ gọi hàm này ngay sau khi signInWithEmailAndPassword/createUserWithEmailAndPassword
// thành công — không gọi trong onAuthStateChanged, vì onAuthStateChanged còn chạy lại
// mỗi khi tải lại trang (sẽ làm loginCount tăng sai).
function trackMemberLogin(user, extra) {
  if (!user) return Promise.resolve();
  extra = extra || {};
  const ref = db.collection("members").doc(user.uid);
  return ref
    .get()
    .then((snap) => {
      const data = {
        email: user.email || "",
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
        loginCount: firebase.firestore.FieldValue.increment(1),
      };
      if (extra.accountType) data.accountType = extra.accountType;
      if (extra.classId !== undefined) data.classId = extra.classId;
      if (extra.displayName !== undefined) data.displayName = extra.displayName;
      if (!snap.exists) {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      }
      return ref.set(data, { merge: true });
    })
    .catch((err) => {
      console.error("trackMemberLogin lỗi:", err);
    });
}

// Đọc toàn bộ danh sách sản phẩm mà user hiện tại đã mua/đã dùng miễn phí.
// Trả về object dạng { [productId]: purchaseData }.
function getMyPurchasesMap() {
  const user = auth.currentUser;
  if (!user) return Promise.resolve({});
  return db
    .collection("members")
    .doc(user.uid)
    .collection("purchases")
    .get()
    .then((snap) => {
      const map = {};
      snap.forEach((doc) => {
        map[doc.id] = doc.data();
      });
      return map;
    })
    .catch((err) => {
      console.error("getMyPurchasesMap lỗi:", err);
      return {};
    });
}

// Hiện "Xin chào, {email}" + nút Đăng xuất trên nav khi đã đăng nhập.
// Cần có sẵn <div id="nav-account"></div> trong HTML (xem baigiang.html).
function initAccountNav() {
  const el = document.getElementById("nav-account");
  if (!el) return;
  auth.onAuthStateChanged((user) => {
    if (user) {
      el.innerHTML =
        '<span class="nav-account-email">' +
        escapeHtmlMembers(user.email) +
        '</span><button class="nav-account-logout" id="nav-logout-btn">Đăng xuất</button>';
      document.getElementById("nav-logout-btn").addEventListener("click", () => auth.signOut());
    } else {
      el.innerHTML = "";
    }
  });
}

function escapeHtmlMembers(str) {
  const div = document.createElement("div");
  div.textContent = str === undefined || str === null ? "" : String(str);
  return div.innerHTML;
}

// Tự chạy: trang nào không có #nav-account (vd lophoc.html, admin.html) thì bỏ qua.
initAccountNav();
