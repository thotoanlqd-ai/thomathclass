// ==== ThoMathClass — auth-modal.js ====
// Modal đăng nhập / đăng ký dùng chung cho 4 trang bán nội dung (baigiang/tailieu/khoahoc/azota.html).
// 2 tab: "Khách hàng / Phụ huynh" (email thật, tự đặt mật khẩu) và
//        "Học sinh trong lớp" (chọn lớp -> chọn tên -> mật khẩu, giống hệt lophoc.js).
// Yêu cầu: firebase-config.js, members.js đã chạy trước. Cần có sẵn trong HTML trang:
//   <div id="auth-modal">...</div> (xem baigiang.html để lấy mẫu đầy đủ)

const authModal = document.getElementById("auth-modal");

let pendingLoginSuccess = null;
let authStudentPendingCode = null;
let authStudentPendingName = null;

function openAuthModal() {
  if (!authModal) return;
  document.getElementById("auth-error").textContent = "";
  document.getElementById("auth-email").value = "";
  document.getElementById("auth-password").value = "";
  switchAuthTab("customer");
  authModal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeAuthModal() {
  if (!authModal) return;
  authModal.classList.remove("open");
  document.body.style.overflow = "";
  pendingLoginSuccess = null;
}

// Gọi hàm này trước mọi thao tác cần đăng nhập.
// Đã đăng nhập -> gọi onSuccess ngay. Chưa đăng nhập -> mở modal, gọi onSuccess sau khi xong.
function requireLogin(onSuccess) {
  if (auth.currentUser) {
    onSuccess();
    return;
  }
  pendingLoginSuccess = onSuccess;
  openAuthModal();
}

function finishAuthSuccess() {
  // Không gọi closeAuthModal() ở đây: nó xoá pendingLoginSuccess (dành cho khi
  // người dùng tự bấm huỷ), mà ta lại đang cần đọc callback đó để tiếp tục thao tác mua.
  const cb = pendingLoginSuccess;
  pendingLoginSuccess = null;
  if (authModal) {
    authModal.classList.remove("open");
    document.body.style.overflow = "";
  }
  if (cb) cb();
}

function switchAuthTab(tab) {
  document.querySelectorAll("#auth-tabs .filter-btn").forEach((b) => b.classList.remove("active"));
  const activeBtn = document.querySelector('#auth-tabs [data-tab="' + tab + '"]');
  if (activeBtn) activeBtn.classList.add("active");
  document.getElementById("auth-tab-customer").hidden = tab !== "customer";
  document.getElementById("auth-tab-student").hidden = tab !== "student";
  if (tab === "student") resetAuthStudentTab();
}

function mapAuthError(err) {
  switch (err.code) {
    case "auth/email-already-in-use":
      return "Email này đã có tài khoản, bấm Đăng nhập thay vì Đăng ký.";
    case "auth/invalid-email":
      return "Email không hợp lệ.";
    case "auth/weak-password":
      return "Mật khẩu quá đơn giản, cần ít nhất 6 ký tự.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Sai email hoặc mật khẩu.";
    case "auth/user-not-found":
      return "Tài khoản chưa tồn tại, bấm Đăng ký để tạo mới.";
    case "auth/too-many-requests":
      return "Thử sai nhiều lần quá, chờ một lát rồi thử lại.";
    default:
      return "Có lỗi xảy ra (" + err.code + ").";
  }
}

// ---------- tab học sinh: chọn lớp -> chọn tên -> mật khẩu ----------
function resetAuthStudentTab() {
  document.getElementById("auth-student-classes").hidden = false;
  document.getElementById("auth-student-roster").hidden = true;
  document.getElementById("auth-student-password").hidden = true;
  renderAuthStudentClassGrid();
}

function renderAuthStudentClassGrid() {
  const grid = document.getElementById("auth-student-class-grid");
  grid.innerHTML = "";
  CLASS_LIST.forEach((cls) => {
    const card = document.createElement("button");
    card.className = "class-card";
    card.style.padding = "16px";
    card.innerHTML = '<h3 style="font-size:0.92rem;margin:0;">' + escapeHtmlAuth(cls.name) + "</h3>";
    card.addEventListener("click", () => openAuthStudentRoster(cls.id));
    grid.appendChild(card);
  });
}

function openAuthStudentRoster(classId) {
  const listEl = document.getElementById("auth-student-roster-list");
  listEl.innerHTML = '<p class="empty-note">Đang tải...</p>';
  document.getElementById("auth-student-classes").hidden = true;
  document.getElementById("auth-student-roster").hidden = false;

  db.collection("roster")
    .where("classId", "==", classId)
    .orderBy("order")
    .get()
    .then((snap) => {
      listEl.innerHTML = "";
      if (snap.empty) {
        listEl.innerHTML = '<p class="empty-note">Lớp này chưa có học sinh nào.</p>';
        return;
      }
      snap.forEach((doc) => {
        const d = doc.data();
        const item = document.createElement("button");
        item.className = "roster-item";
        item.innerHTML = "<span>" + escapeHtmlAuth(d.fullName) + '</span><span class="arrow">→</span>';
        item.addEventListener("click", () => openAuthStudentPassword(d.code, d.fullName));
        listEl.appendChild(item);
      });
    })
    .catch((err) => {
      console.error(err);
      listEl.innerHTML = '<p class="empty-note">Không tải được danh sách lớp.</p>';
    });
}

function openAuthStudentPassword(code, name) {
  authStudentPendingCode = code;
  authStudentPendingName = name;
  document.getElementById("auth-student-name").textContent = name;
  document.getElementById("auth-student-password-input").value = "";
  document.getElementById("auth-student-error").textContent = "";
  document.getElementById("auth-student-roster").hidden = true;
  document.getElementById("auth-student-password").hidden = false;
}

function doAuthStudentLogin() {
  const password = document.getElementById("auth-student-password-input").value;
  const errorEl = document.getElementById("auth-student-error");
  if (!password) {
    errorEl.textContent = "Em nhập mật khẩu nhé.";
    return;
  }
  const email = authStudentPendingCode + "@" + LOGIN_EMAIL_DOMAIN;
  errorEl.textContent = "Đang đăng nhập...";
  auth
    .signInWithEmailAndPassword(email, password)
    .then((cred) => {
      errorEl.textContent = "";
      return trackMemberLogin(cred.user, { accountType: "student", displayName: authStudentPendingName });
    })
    .then(() => finishAuthSuccess())
    .catch((err) => {
      console.error(err);
      errorEl.textContent = "Sai mật khẩu, hoặc tài khoản chưa được tạo. Em hỏi lại Thầy nhé.";
    });
}

function escapeHtmlAuth(str) {
  const div = document.createElement("div");
  div.textContent = str === undefined || str === null ? "" : String(str);
  return div.innerHTML;
}

// ---------- gắn sự kiện (chỉ khi trang có modal này) ----------
if (authModal) {
  document.getElementById("auth-modal-close").addEventListener("click", closeAuthModal);
  authModal.addEventListener("click", (e) => {
    if (e.target === authModal) closeAuthModal();
  });

  document.querySelectorAll("#auth-tabs .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchAuthTab(btn.dataset.tab));
  });

  // tab khách hàng
  document.getElementById("btn-auth-login").addEventListener("click", () => {
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const errorEl = document.getElementById("auth-error");
    errorEl.textContent = "";
    if (!email || !password) {
      errorEl.textContent = "Nhập đủ email và mật khẩu.";
      return;
    }
    errorEl.textContent = "Đang đăng nhập...";
    auth
      .signInWithEmailAndPassword(email, password)
      .then((cred) => {
        errorEl.textContent = "";
        return trackMemberLogin(cred.user, { accountType: "customer" });
      })
      .then(() => finishAuthSuccess())
      .catch((err) => {
        console.error(err);
        errorEl.textContent = mapAuthError(err);
      });
  });

  document.getElementById("btn-auth-register").addEventListener("click", () => {
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const errorEl = document.getElementById("auth-error");
    errorEl.textContent = "";
    if (!email || !password) {
      errorEl.textContent = "Nhập đủ email và mật khẩu để đăng ký.";
      return;
    }
    if (password.length < 6) {
      errorEl.textContent = "Mật khẩu cần ít nhất 6 ký tự.";
      return;
    }
    errorEl.textContent = "Đang tạo tài khoản...";
    auth
      .createUserWithEmailAndPassword(email, password)
      .then((cred) => {
        errorEl.textContent = "";
        return trackMemberLogin(cred.user, { accountType: "customer" });
      })
      .then(() => finishAuthSuccess())
      .catch((err) => {
        console.error(err);
        errorEl.textContent = mapAuthError(err);
      });
  });

  document.getElementById("link-forgot-password").addEventListener("click", (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-email").value.trim();
    const errorEl = document.getElementById("auth-error");
    if (!email) {
      errorEl.textContent = "Nhập email trước, hệ thống sẽ gửi link đặt lại mật khẩu.";
      return;
    }
    errorEl.textContent = "Đang gửi email...";
    auth
      .sendPasswordResetEmail(email)
      .then(() => {
        errorEl.textContent = "Đã gửi email đặt lại mật khẩu, kiểm tra hộp thư nhé.";
      })
      .catch((err) => {
        console.error(err);
        errorEl.textContent = mapAuthError(err);
      });
  });

  // tab học sinh
  document.getElementById("btn-auth-student-back").addEventListener("click", () => {
    document.getElementById("auth-student-classes").hidden = false;
    document.getElementById("auth-student-roster").hidden = true;
  });
  document.getElementById("btn-auth-student-back2").addEventListener("click", () => {
    document.getElementById("auth-student-roster").hidden = false;
    document.getElementById("auth-student-password").hidden = true;
  });
  document.getElementById("btn-auth-student-login").addEventListener("click", doAuthStudentLogin);
  document.getElementById("auth-student-password-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doAuthStudentLogin();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAuthModal();
  });
}
