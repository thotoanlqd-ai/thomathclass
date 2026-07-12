// ==== ThoMathClass — admin.js ====
// Yêu cầu: firebase-config.js đã chạy trước (auth, db, CLASS_LIST, LOGIN_EMAIL_DOMAIN, ADMIN_UID)

const viewLogin = document.getElementById("view-login");
const viewAdmin = document.getElementById("view-admin");
const viewForbidden = document.getElementById("view-forbidden");

// App phụ dùng riêng để tạo tài khoản học sinh mà KHÔNG làm đăng xuất admin
// (createUserWithEmailAndPassword trên app chính sẽ tự động đổi phiên đăng nhập)
const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = secondaryApp.auth();

let currentStudentUid = null;
let currentStudentData = null;

// ---------- Đăng nhập Giáo viên ----------
document.getElementById("btn-admin-login").addEventListener("click", () => {
  const email = document.getElementById("admin-email").value.trim();
  const password = document.getElementById("admin-password").value;
  const errorEl = document.getElementById("admin-login-error");
  errorEl.textContent = "";
  if (!email || !password) {
    errorEl.textContent = "Nhập đủ email và mật khẩu.";
    return;
  }
  auth.signInWithEmailAndPassword(email, password).catch((err) => {
    console.error(err);
    errorEl.textContent = "Sai email hoặc mật khẩu.";
  });
});

document.getElementById("btn-admin-logout").addEventListener("click", () => auth.signOut());
document.getElementById("btn-forbidden-logout").addEventListener("click", () => auth.signOut());

auth.onAuthStateChanged((user) => {
  if (!user) {
    viewLogin.hidden = false;
    viewAdmin.hidden = true;
    viewForbidden.hidden = true;
    return;
  }
  if (user.uid === ADMIN_UID) {
    viewLogin.hidden = true;
    viewAdmin.hidden = false;
    viewForbidden.hidden = true;
    initAdminPanel();
  } else {
    viewLogin.hidden = true;
    viewAdmin.hidden = true;
    viewForbidden.hidden = false;
  }
});

// ---------- Khởi tạo bảng điều khiển ----------
function initAdminPanel() {
  populateClassSelects();
}

function populateClassSelects() {
  const newClassSelect = document.getElementById("new-class");
  const pickClassSelect = document.getElementById("pick-class");
  [newClassSelect, pickClassSelect].forEach((sel) => {
    sel.innerHTML = "";
    CLASS_LIST.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
  });
  loadStudentPicker(pickClassSelect.value);
}

document.getElementById("pick-class").addEventListener("change", (e) => {
  loadStudentPicker(e.target.value);
});

function loadStudentPicker(classId) {
  const pickStudent = document.getElementById("pick-student");
  pickStudent.innerHTML = '<option value="">— Đang tải... —</option>';
  document.getElementById("student-editor").hidden = true;

  db.collection("roster")
    .where("classId", "==", classId)
    .orderBy("order")
    .get()
    .then((snap) => {
      pickStudent.innerHTML = '<option value="">— Chọn học sinh —</option>';
      snap.forEach((doc) => {
        const d = doc.data();
        const opt = document.createElement("option");
        opt.value = doc.id;
        opt.textContent = d.fullName;
        pickStudent.appendChild(opt);
      });
    });
}

document.getElementById("pick-student").addEventListener("change", (e) => {
  const uid = e.target.value;
  if (!uid) {
    document.getElementById("student-editor").hidden = true;
    return;
  }
  currentStudentUid = uid;
  loadStudentEditor(uid);
});

function loadStudentEditor(uid) {
  db.collection("students")
    .doc(uid)
    .get()
    .then((doc) => {
      currentStudentData = doc.exists ? doc.data() : { scores: [], comments: [] };
      renderScoreTable();
      renderCommentTable();
      document.getElementById("student-editor").hidden = false;
    });
}

// ---------- Thêm học sinh mới ----------
document.getElementById("btn-add-student").addEventListener("click", () => {
  const classId = document.getElementById("new-class").value;
  const fullName = document.getElementById("new-fullname").value.trim();
  const code = document.getElementById("new-code").value.trim().toLowerCase();
  const password = document.getElementById("new-password").value;
  const errorEl = document.getElementById("new-student-error");
  errorEl.textContent = "";

  if (!fullName || !code || !password) {
    errorEl.textContent = "Điền đủ họ tên, mã học sinh và mật khẩu.";
    return;
  }
  if (password.length < 6) {
    errorEl.textContent = "Mật khẩu cần ít nhất 6 ký tự.";
    return;
  }

  const email = code + "@" + LOGIN_EMAIL_DOMAIN;
  errorEl.textContent = "Đang tạo tài khoản...";

  secondaryAuth
    .createUserWithEmailAndPassword(email, password)
    .then((cred) => {
      const uid = cred.user.uid;
      const order = Date.now();
      return Promise.all([
        db.collection("roster").doc(uid).set({ fullName, classId, code, order }),
        db.collection("students").doc(uid).set({ fullName, classId, scores: [], comments: [] }),
      ]).then(() => secondaryAuth.signOut());
    })
    .then(() => {
      errorEl.textContent = "";
      alert("Đã thêm học sinh: " + fullName + "\nMã đăng nhập: " + code + "\nMật khẩu: " + password);
      document.getElementById("new-fullname").value = "";
      document.getElementById("new-code").value = "";
      document.getElementById("new-password").value = "";
      loadStudentPicker(document.getElementById("pick-class").value);
    })
    .catch((err) => {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        errorEl.textContent = "Mã học sinh này đã được dùng, thầy chọn mã khác.";
      } else {
        errorEl.textContent = "Lỗi: " + err.message;
      }
    });
});

// ---------- Điểm số ----------
function renderScoreTable() {
  const body = document.getElementById("score-data-body");
  body.innerHTML = "";
  const scores = currentStudentData.scores || [];
  scores.forEach((s, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(s.label)}</td><td>${escapeHtml(s.date || "")}</td><td>${escapeHtml(String(s.value))}</td>
      <td><button class="mini-btn" data-idx="${idx}">Xoá</button></td>`;
    tr.querySelector(".mini-btn").addEventListener("click", () => deleteScore(idx));
    body.appendChild(tr);
  });
}

document.getElementById("btn-add-score").addEventListener("click", () => {
  const label = document.getElementById("score-label").value.trim();
  const value = document.getElementById("score-value").value.trim();
  const date = document.getElementById("score-date").value || new Date().toISOString().slice(0, 10);
  if (!label || !value) {
    alert("Nhập đủ nội dung và điểm.");
    return;
  }
  const newScore = { label, value, date };
  const scores = (currentStudentData.scores || []).concat([newScore]);
  db.collection("students")
    .doc(currentStudentUid)
    .update({ scores })
    .then(() => {
      currentStudentData.scores = scores;
      renderScoreTable();
      document.getElementById("score-label").value = "";
      document.getElementById("score-value").value = "";
    })
    .catch((err) => alert("Lỗi: " + err.message));
});

function deleteScore(idx) {
  const scores = (currentStudentData.scores || []).slice();
  scores.splice(idx, 1);
  db.collection("students")
    .doc(currentStudentUid)
    .update({ scores })
    .then(() => {
      currentStudentData.scores = scores;
      renderScoreTable();
    });
}

// ---------- Nhận xét ----------
function renderCommentTable() {
  const body = document.getElementById("comment-data-body");
  body.innerHTML = "";
  const comments = currentStudentData.comments || [];
  comments.forEach((c, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(c.date || "")}</td><td>${escapeHtml(c.text)}</td>
      <td><button class="mini-btn" data-idx="${idx}">Xoá</button></td>`;
    tr.querySelector(".mini-btn").addEventListener("click", () => deleteComment(idx));
    body.appendChild(tr);
  });
}

document.getElementById("btn-add-comment").addEventListener("click", () => {
  const text = document.getElementById("comment-text").value.trim();
  const date = document.getElementById("comment-date").value || new Date().toISOString().slice(0, 10);
  if (!text) {
    alert("Nhập nội dung nhận xét.");
    return;
  }
  const newComment = { text, date };
  const comments = (currentStudentData.comments || []).concat([newComment]);
  db.collection("students")
    .doc(currentStudentUid)
    .update({ comments })
    .then(() => {
      currentStudentData.comments = comments;
      renderCommentTable();
      document.getElementById("comment-text").value = "";
    })
    .catch((err) => alert("Lỗi: " + err.message));
});

function deleteComment(idx) {
  const comments = (currentStudentData.comments || []).slice();
  comments.splice(idx, 1);
  db.collection("students")
    .doc(currentStudentUid)
    .update({ comments })
    .then(() => {
      currentStudentData.comments = comments;
      renderCommentTable();
    });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
