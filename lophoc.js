// ==== ThoMathClass — lophoc.js ====
// Yêu cầu: firebase-config.js đã chạy trước (khai báo auth, db, CLASS_LIST, LOGIN_EMAIL_DOMAIN)

const viewClasses = document.getElementById("view-classes");
const viewRoster = document.getElementById("view-roster");
const viewDashboard = document.getElementById("view-dashboard");

const classGrid = document.getElementById("class-grid");
const rosterList = document.getElementById("roster-list");
const rosterEmpty = document.getElementById("roster-empty");
const rosterClassName = document.getElementById("roster-class-name");

const loginModal = document.getElementById("login-modal");
const loginStudentName = document.getElementById("login-student-name");
const loginPasswordInput = document.getElementById("login-password");
const loginError = document.getElementById("login-error");

let pendingCode = null;
let pendingName = null;
let currentClassId = null;

// ---------- Render 6 lớp học ----------
function renderClassGrid() {
  classGrid.innerHTML = "";
  CLASS_LIST.forEach((cls) => {
    const card = document.createElement("button");
    card.className = "class-card";
    card.innerHTML = `
      <div class="icon-wrap">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M4 19V6a2 2 0 0 1 2-2h9l5 5v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>
          <path d="M9 22v-6h6v6"/>
        </svg>
      </div>
      <h3>${cls.name}</h3>
      <p>Bấm để xem danh sách học sinh</p>
    `;
    card.addEventListener("click", () => openRoster(cls.id, cls.name));
    classGrid.appendChild(card);
  });
}

function openRoster(classId, className) {
  currentClassId = classId;
  rosterClassName.textContent = className;
  rosterList.innerHTML = "";
  rosterEmpty.hidden = true;

  viewClasses.hidden = true;
  viewRoster.hidden = false;
  viewDashboard.hidden = true;

  db.collection("roster")
    .where("classId", "==", classId)
    .orderBy("order")
    .get()
    .then((snap) => {
      if (snap.empty) {
        rosterEmpty.hidden = false;
        return;
      }
      snap.forEach((doc) => {
        const d = doc.data();
        const item = document.createElement("button");
        item.className = "roster-item";
        item.innerHTML = `<span>${d.fullName}</span><span class="arrow">→</span>`;
        item.addEventListener("click", () => openLogin(d.code, d.fullName));
        rosterList.appendChild(item);
      });
    })
    .catch((err) => {
      rosterEmpty.hidden = false;
      rosterEmpty.textContent = "Không tải được danh sách lớp. Vui lòng thử lại sau.";
      console.error(err);
    });
}

document.getElementById("btn-back-to-classes").addEventListener("click", () => {
  viewRoster.hidden = true;
  viewClasses.hidden = false;
});

// ---------- Đăng nhập học sinh ----------
function openLogin(code, name) {
  pendingCode = code;
  pendingName = name;
  loginStudentName.textContent = name;
  loginPasswordInput.value = "";
  loginError.textContent = "";
  loginModal.classList.add("open");
  loginPasswordInput.focus();
}

document.getElementById("login-modal-close").addEventListener("click", () => {
  loginModal.classList.remove("open");
});

document.getElementById("btn-do-login").addEventListener("click", doLogin);
loginPasswordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doLogin();
});

function doLogin() {
  const password = loginPasswordInput.value;
  if (!password) {
    loginError.textContent = "Em nhập mật khẩu nhé.";
    return;
  }
  const email = pendingCode + "@" + LOGIN_EMAIL_DOMAIN;
  loginError.textContent = "Đang đăng nhập...";
  auth
    .signInWithEmailAndPassword(email, password)
    .then(() => {
      loginModal.classList.remove("open");
    })
    .catch((err) => {
      console.error(err);
      loginError.textContent = "Sai mật khẩu, hoặc tài khoản chưa được tạo. Em hỏi lại Thầy nhé.";
    });
}

// ---------- Dashboard cá nhân ----------
function loadDashboard(user) {
  db.collection("students")
    .doc(user.uid)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        loginError.textContent = "Không tìm thấy dữ liệu học sinh cho tài khoản này.";
        auth.signOut();
        return;
      }
      const d = doc.data();
      const className =
        (CLASS_LIST.find((c) => c.id === d.classId) || {}).name || d.classId;

      document.getElementById("dash-name").textContent = d.fullName || "—";
      document.getElementById("dash-class").textContent = className;
      document.getElementById("dash-avatar").textContent = (d.fullName || "?").charAt(0).toUpperCase();

      // điểm số
      const scoreBody = document.getElementById("score-body");
      const scoreEmpty = document.getElementById("score-empty");
      scoreBody.innerHTML = "";
      const scores = (d.scores || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      if (scores.length === 0) {
        scoreEmpty.hidden = false;
      } else {
        scoreEmpty.hidden = true;
        scores.forEach((s) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td>${escapeHtml(s.label)}</td><td>${escapeHtml(s.date || "")}</td><td class="val">${escapeHtml(String(s.value))}</td>`;
          scoreBody.appendChild(tr);
        });
      }

      // nhận xét
      const commentList = document.getElementById("comment-list");
      const commentEmpty = document.getElementById("comment-empty");
      commentList.innerHTML = "";
      const comments = (d.comments || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      if (comments.length === 0) {
        commentEmpty.hidden = false;
      } else {
        commentEmpty.hidden = true;
        comments.forEach((c) => {
          const card = document.createElement("div");
          card.className = "comment-card";
          card.innerHTML = `<span class="date">${escapeHtml(c.date || "")}</span><p>${escapeHtml(c.text)}</p>`;
          commentList.appendChild(card);
        });
      }

      viewClasses.hidden = true;
      viewRoster.hidden = true;
      viewDashboard.hidden = false;
    });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById("btn-logout").addEventListener("click", () => {
  auth.signOut();
});

// ---------- Theo dõi trạng thái đăng nhập ----------
auth.onAuthStateChanged((user) => {
  if (user) {
    loadDashboard(user);
  } else {
    viewDashboard.hidden = true;
    if (viewRoster.hidden) {
      viewClasses.hidden = false;
    }
  }
});

renderClassGrid();
