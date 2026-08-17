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

// Thông tin tài khoản học sinh đang đăng nhập (dùng cho khung viết Nhật ký lớp học)
let myClassId = null;
let myClassRole = null;
let myFullName = null;

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
    .then((cred) => {
      loginModal.classList.remove("open");
      trackMemberLogin(cred.user, { accountType: "student", classId: currentClassId, displayName: pendingName });
    })
    .catch((err) => {
      console.error(err);
      loginError.textContent = "Sai mật khẩu, hoặc tài khoản chưa được tạo. Em hỏi lại Thầy nhé.";
    });
}

// ---------- Dashboard cá nhân ----------
function loadDashboard(user) {
  Promise.all([
    db.collection("students").doc(user.uid).get(),
    db.collection("roster").doc(user.uid).get(),
  ])
    .then(([doc, rosterDoc]) => {
      if (!doc.exists) {
        loginError.textContent = "Không tìm thấy dữ liệu học sinh cho tài khoản này.";
        auth.signOut();
        return;
      }
      const d = doc.data();
      const rosterData = rosterDoc.exists ? rosterDoc.data() : {};
      myClassId = d.classId;
      myClassRole = rosterData.classRole || null;
      myFullName = d.fullName;

      const className =
        (CLASS_LIST.find((c) => c.id === d.classId) || {}).name || d.classId;

      document.getElementById("dash-name").textContent = d.fullName || "—";
      document.getElementById("dash-class").textContent = className;
      document.getElementById("dash-avatar").textContent = (d.fullName || "?").charAt(0).toUpperCase();
      document.getElementById("dash-avatar").hidden = false;
      document.getElementById("dash-avatar-img").hidden = true;
      document.getElementById("dash-avatar-status").textContent = "";
      loadDashAvatar(user.uid);

      setupJournalWritePanel();
      loadClassJournal(d.classId);

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

// ---------- Ảnh đại diện cá nhân (học sinh tự đổi sau khi đăng nhập) ----------
function loadDashAvatar(uid) {
  db.collection("studentAvatars")
    .doc(uid)
    .get()
    .then((doc) => {
      if (doc.exists && doc.data().avatarUrl) {
        showDashAvatar(doc.data().avatarUrl);
      }
    })
    .catch((err) => console.error("Không tải được ảnh đại diện:", err));
}

function showDashAvatar(url) {
  const img = document.getElementById("dash-avatar-img");
  const letter = document.getElementById("dash-avatar");
  img.src = url;
  img.hidden = false;
  letter.hidden = true;
}

document.getElementById("dash-avatar-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) uploadDashAvatar(file);
});

async function uploadDashAvatar(file) {
  const statusEl = document.getElementById("dash-avatar-status");
  const user = auth.currentUser;
  if (!user) return;
  statusEl.textContent = "Đang tải lên...";
  try {
    const blob = await compressImageFile(file, 480, 0.8);
    const ref = storage.ref().child("studentAvatars/" + user.uid + "/avatar.jpg");
    await ref.put(blob);
    const url = await ref.getDownloadURL();
    await db.collection("studentAvatars").doc(user.uid).set({
      avatarUrl: url,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showDashAvatar(url);
    statusEl.textContent = "✓ Đã cập nhật.";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Lỗi: " + err.message;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Nhật ký lớp học (xem, và viết/sửa/xoá nếu có chức vụ lớp) ----------
function loadClassJournal(classId) {
  const listEl = document.getElementById("journal-list");
  const emptyEl = document.getElementById("journal-empty");
  listEl.innerHTML = "";
  emptyEl.hidden = true;

  const user = auth.currentUser;

  db.collection("classJournal")
    .where("classId", "==", classId)
    .get()
    .then((snap) => {
      const entries = [];
      snap.forEach((doc) => entries.push(Object.assign({ id: doc.id }, doc.data())));
      entries.sort((a, b) => {
        const ta = a.createdAt ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });

      if (!entries.length) {
        emptyEl.hidden = false;
        return;
      }
      entries.forEach((entry) => {
        const dateStr = entry.createdAt ? new Date(entry.createdAt.toMillis()).toLocaleDateString("vi-VN") : "";
        const imagesHtml = (entry.images || [])
          .map((url) => `<img src="${escapeHtml(url)}" class="journal-thumb" />`)
          .join("");
        const authorLineHtml = entry.authorName
          ? `<p class="date" style="margin-top:6px;">Đăng bởi: ${escapeHtml(entry.authorName)}${
              entry.authorRole ? " - " + escapeHtml(entry.authorRole) : ""
            }</p>`
          : "";
        const card = document.createElement("div");
        card.className = "journal-post";
        card.innerHTML = `
          <span class="date">${escapeHtml(dateStr)}</span>
          <p>${escapeHtml(entry.content || "")}</p>
          <div class="journal-images">${imagesHtml}</div>
          ${authorLineHtml}
        `;
        if (user && entry.authorUid && entry.authorUid === user.uid) {
          const actions = document.createElement("div");
          actions.style.marginTop = "8px";
          actions.style.display = "flex";
          actions.style.gap = "14px";
          actions.innerHTML = `
            <button type="button" class="mini-btn" data-action="edit">Sửa</button>
            <button type="button" class="mini-btn" data-action="delete" style="color:var(--muted);">Xoá</button>
          `;
          actions.querySelector('[data-action="edit"]').addEventListener("click", () => startEditMyJournalEntry(entry));
          actions.querySelector('[data-action="delete"]').addEventListener("click", () => deleteMyJournalEntry(entry));
          card.appendChild(actions);
        }
        listEl.appendChild(card);
      });
    })
    .catch((err) => console.error("loadClassJournal lỗi:", err));
}

// ---------- Khung viết bài Nhật ký lớp học cho học sinh có chức vụ ----------
let journalWriteEditingId = null;
let journalWriteOriginalImages = [];
let journalWriteKeptImages = [];

function setupJournalWritePanel() {
  const panel = document.getElementById("journal-write-panel");
  const canWrite = !!(myClassRole && CLASS_ROLE_LABELS[myClassRole]);
  panel.hidden = !canWrite;
  if (!canWrite) cancelEditJournalWrite();
}

function renderJournalWriteKeptImages() {
  const wrap = document.getElementById("journal-write-kept-images");
  wrap.innerHTML = "";
  journalWriteKeptImages.forEach((url, idx) => {
    const box = document.createElement("div");
    box.className = "journal-thumb-wrap";
    box.innerHTML = `<img src="${escapeHtml(url)}" class="journal-thumb" /><button type="button" class="journal-thumb-remove" title="Bỏ ảnh này">×</button>`;
    box.querySelector("button").addEventListener("click", () => {
      journalWriteKeptImages.splice(idx, 1);
      renderJournalWriteKeptImages();
    });
    wrap.appendChild(box);
  });
}

function startEditMyJournalEntry(entry) {
  journalWriteEditingId = entry.id;
  journalWriteOriginalImages = (entry.images || []).slice();
  journalWriteKeptImages = (entry.images || []).slice();
  document.getElementById("journal-write-content").value = entry.content || "";
  document.getElementById("btn-journal-write-post").textContent = "Lưu chỉnh sửa";
  const bannerEl = document.getElementById("journal-write-edit-banner");
  bannerEl.hidden = false;
  bannerEl.style.display = "flex";
  renderJournalWriteKeptImages();
  document.getElementById("journal-write-panel").scrollIntoView({ behavior: "smooth" });
}

function cancelEditJournalWrite() {
  journalWriteEditingId = null;
  journalWriteOriginalImages = [];
  journalWriteKeptImages = [];
  const contentEl = document.getElementById("journal-write-content");
  const imagesEl = document.getElementById("journal-write-images");
  if (contentEl) contentEl.value = "";
  if (imagesEl) imagesEl.value = "";
  const btn = document.getElementById("btn-journal-write-post");
  if (btn) btn.textContent = "Đăng bài";
  const bannerEl = document.getElementById("journal-write-edit-banner");
  if (bannerEl) {
    bannerEl.hidden = true;
    bannerEl.style.display = "";
  }
  const keptEl = document.getElementById("journal-write-kept-images");
  if (keptEl) keptEl.innerHTML = "";
  const statusEl = document.getElementById("journal-write-status");
  if (statusEl) statusEl.textContent = "";
}

document.getElementById("btn-journal-write-cancel-edit").addEventListener("click", cancelEditJournalWrite);

document.getElementById("btn-journal-write-post").addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user || !myClassId || !myClassRole) return;
  const content = document.getElementById("journal-write-content").value.trim();
  const filesInput = document.getElementById("journal-write-images");
  const files = Array.from(filesInput.files || []);
  const statusEl = document.getElementById("journal-write-status");
  const btn = document.getElementById("btn-journal-write-post");

  if (!content && !files.length && journalWriteKeptImages.length === 0) {
    statusEl.textContent = "Nhập nội dung hoặc chọn ít nhất 1 ảnh.";
    return;
  }

  statusEl.textContent = "Đang đăng...";
  btn.disabled = true;
  try {
    const entryRef = journalWriteEditingId
      ? db.collection("classJournal").doc(journalWriteEditingId)
      : db.collection("classJournal").doc();

    const uploadedUrls = [];
    for (const file of files) {
      const blob = await compressImageFile(file, 1200, 0.75);
      const path =
        "classJournal/" + myClassId + "/" + entryRef.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".jpg";
      const ref = storage.ref().child(path);
      await ref.put(blob);
      const url = await ref.getDownloadURL();
      uploadedUrls.push(url);
    }

    if (journalWriteEditingId) {
      const finalImages = journalWriteKeptImages.concat(uploadedUrls);
      const removed = journalWriteOriginalImages.filter((u) => journalWriteKeptImages.indexOf(u) === -1);
      await Promise.all(
        removed.map((url) =>
          storage
            .refFromURL(url)
            .delete()
            .catch((err) => console.error("Không xoá được ảnh cũ trên Storage:", err))
        )
      );
      await entryRef.update({
        content,
        images: finalImages,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await entryRef.set({
        classId: myClassId,
        content,
        images: uploadedUrls,
        authorUid: user.uid,
        authorName: myFullName,
        authorRole: CLASS_ROLE_LABELS[myClassRole] || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    cancelEditJournalWrite();
    loadClassJournal(myClassId);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Lỗi: " + err.message;
  } finally {
    btn.disabled = false;
  }
});

function deleteMyJournalEntry(entry) {
  if (!confirm("Xoá bài nhật ký này? Không thể hoàn tác.")) return;
  Promise.all(
    (entry.images || []).map((url) =>
      storage
        .refFromURL(url)
        .delete()
        .catch((err) => console.error("Không xoá được ảnh trên Storage:", err))
    )
  )
    .then(() => db.collection("classJournal").doc(entry.id).delete())
    .then(() => {
      if (journalWriteEditingId === entry.id) cancelEditJournalWrite();
      loadClassJournal(entry.classId);
    })
    .catch((err) => alert("Lỗi khi xoá: " + err.message));
}

document.getElementById("btn-logout").addEventListener("click", () => {
  auth.signOut();
});

// ---------- Đổi mật khẩu ----------
const passwordError = document.getElementById("password-error");
const passwordSuccess = document.getElementById("password-success");
const btnChangePassword = document.getElementById("btn-change-password");

btnChangePassword.addEventListener("click", () => {
  const oldPasswordInput = document.getElementById("old-password");
  const newPassword1Input = document.getElementById("new-password-1");
  const newPassword2Input = document.getElementById("new-password-2");

  const oldPassword = oldPasswordInput.value;
  const newPassword1 = newPassword1Input.value;
  const newPassword2 = newPassword2Input.value;

  passwordError.textContent = "";
  passwordSuccess.style.display = "none";

  if (!oldPassword || !newPassword1 || !newPassword2) {
    passwordError.textContent = "Em nhập đủ cả 3 ô nhé.";
    return;
  }
  if (newPassword1.length < 6) {
    passwordError.textContent = "Mật khẩu mới cần ít nhất 6 ký tự.";
    return;
  }
  if (newPassword1 !== newPassword2) {
    passwordError.textContent = "Mật khẩu mới nhập lại chưa khớp.";
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    passwordError.textContent = "Phiên đăng nhập đã hết, em đăng nhập lại rồi thử tiếp nhé.";
    return;
  }

  btnChangePassword.disabled = true;
  btnChangePassword.textContent = "Đang xử lý...";
  passwordError.textContent = "";

  const credential = firebase.auth.EmailAuthProvider.credential(user.email, oldPassword);

  user
    .reauthenticateWithCredential(credential)
    .then(function () {
      return user.updatePassword(newPassword1);
    })
    .then(function () {
      passwordError.textContent = "";
      passwordSuccess.style.display = "block";
      oldPasswordInput.value = "";
      newPassword1Input.value = "";
      newPassword2Input.value = "";
      window.alert("Đổi mật khẩu thành công! Lần sau em nhớ đăng nhập bằng mật khẩu mới nhé.");
    })
    .catch(function (err) {
      console.error("Lỗi đổi mật khẩu:", err.code, err.message);
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential" || err.code === "auth/invalid-login-credentials") {
        passwordError.textContent = "Mật khẩu hiện tại không đúng, em kiểm tra lại.";
      } else if (err.code === "auth/too-many-requests") {
        passwordError.textContent = "Em thử sai nhiều lần quá, chờ một lát rồi thử lại.";
      } else if (err.code === "auth/weak-password") {
        passwordError.textContent = "Mật khẩu mới quá đơn giản, em đặt mật khẩu khác nhé.";
      } else if (err.code === "auth/requires-recent-login") {
        passwordError.textContent = "Em đăng xuất rồi đăng nhập lại, sau đó thử đổi mật khẩu ngay nhé.";
      } else {
        passwordError.textContent = "Có lỗi xảy ra (" + err.code + "). Em chụp màn hình báo Thầy giúp.";
      }
    })
    .finally(function () {
      btnChangePassword.disabled = false;
      btnChangePassword.textContent = "Đổi mật khẩu";
    });
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
