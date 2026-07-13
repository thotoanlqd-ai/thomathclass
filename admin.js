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

// ---------- Tiện ích xử lý tên tiếng Việt ----------
function removeDiacritics(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function slugifyName(name) {
  return removeDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .join("");
}

const HEADER_WORDS = [
  "stt", "tt", "hoten", "hovaten", "ten", "hocsinh", "danhsach",
  "lop", "sbd", "ngaysinh", "gioitinh", "ghichu", "email", "sdt",
  "dienthoai", "sonienlac", "makhoahoc", "masinhvien", "mahocsinh",
];

function looksLikeName(cell) {
  if (!cell) return false;
  const trimmed = String(cell).trim();
  if (!trimmed) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (trimmed.length < 3) return false;
  if (!/^[\p{L}\s]+$/u.test(trimmed)) return false;
  const noAccent = removeDiacritics(trimmed).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (HEADER_WORDS.includes(noAccent)) return false;
  return true;
}

function extractNamesFromRows(rows) {
  const names = [];
  rows.forEach((row) => {
    if (!row) return;
    for (const cellRaw of row) {
      const cell = cellRaw === undefined || cellRaw === null ? "" : String(cellRaw).trim();
      if (looksLikeName(cell)) {
        names.push(cell);
        break;
      }
    }
  });
  return names;
}

function extractNamesFromText(text) {
  const names = [];
  text.split(/\r?\n/).forEach((lineRaw) => {
    let line = lineRaw.trim().replace(/^\d+[\.\)]\s*/, "").replace(/\t/g, " ").trim();
    if (looksLikeName(line)) names.push(line);
  });
  return names;
}

// ---------- Khởi tạo bảng điều khiển ----------
function initAdminPanel() {
  populateClassSelects();
}

function populateClassSelects() {
  const selects = [
    document.getElementById("new-class"),
    document.getElementById("pick-class"),
    document.getElementById("export-class"),
  ];
  selects.forEach((sel) => {
    sel.innerHTML = "";
    CLASS_LIST.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
  });
  loadStudentPicker(document.getElementById("pick-class").value);
  renderBulkClassGrid();
}

// ---------- Lưới chọn lớp cho khu vực "Thêm học sinh hàng loạt" ----------
let bulkSelectedClassId = null;

function renderBulkClassGrid() {
  const grid = document.getElementById("bulk-class-grid");
  grid.innerHTML = "";
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
      <p>Bấm để tải file danh sách cho lớp này</p>
    `;
    card.addEventListener("click", () => openBulkImportFor(cls.id, cls.name));
    grid.appendChild(card);
  });
}

function openBulkImportFor(classId, className) {
  bulkSelectedClassId = classId;
  document.getElementById("bulk-import-class-name").textContent = "Lớp: " + className;
  document.getElementById("bulk-class-grid").hidden = true;
  document.getElementById("bulk-import-panel").hidden = false;
  document.getElementById("import-file").value = "";
  document.getElementById("import-error").textContent = "";
  document.getElementById("import-preview").hidden = true;
  importPreviewNames = [];
}

document.getElementById("btn-bulk-back").addEventListener("click", () => {
  document.getElementById("bulk-class-grid").hidden = false;
  document.getElementById("bulk-import-panel").hidden = true;
  bulkSelectedClassId = null;
});

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

// ---------- Hàm dùng chung: tạo 1 tài khoản học sinh ----------
// Trả về Promise resolve({ok:true}) hoặc resolve({ok:false, error}) — không reject,
// để vòng lặp nhập hàng loạt không bị dừng giữa chừng khi 1 học sinh lỗi.
function createStudentAccount(fullName, classId, code, password) {
  const email = code + "@" + LOGIN_EMAIL_DOMAIN;
  return secondaryAuth
    .createUserWithEmailAndPassword(email, password)
    .then((cred) => {
      const uid = cred.user.uid;
      const order = Date.now();
      return Promise.all([
        db.collection("roster").doc(uid).set({ fullName, classId, code, order }),
        db.collection("students").doc(uid).set({ fullName, classId, scores: [], comments: [] }),
      ]).then(() => secondaryAuth.signOut());
    })
    .then(() => ({ ok: true }))
    .catch((err) => {
      try { secondaryAuth.signOut(); } catch (e) {}
      return { ok: false, error: err };
    });
}

// ---------- Thêm 1 học sinh (form đơn lẻ) ----------
document.getElementById("btn-add-student").addEventListener("click", () => {
  const classId = document.getElementById("new-class").value;
  const fullName = document.getElementById("new-fullname").value.trim();
  const code = document.getElementById("new-code").value.trim().toLowerCase();
  const password = document.getElementById("new-password").value || "123abc";
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

  errorEl.textContent = "Đang tạo tài khoản...";

  createStudentAccount(fullName, classId, code, password).then((result) => {
    if (result.ok) {
      errorEl.textContent = "";
      alert("Đã thêm học sinh: " + fullName + "\nMã đăng nhập: " + code + "\nMật khẩu: " + password);
      document.getElementById("new-fullname").value = "";
      document.getElementById("new-code").value = "";
      document.getElementById("new-password").value = "123abc";
      loadStudentPicker(document.getElementById("pick-class").value);
    } else {
      const err = result.error;
      if (err && err.code === "auth/email-already-in-use") {
        errorEl.textContent = "Mã học sinh này đã được dùng, thầy chọn mã khác.";
      } else {
        errorEl.textContent = "Lỗi: " + (err ? err.message : "không xác định");
      }
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

// ==========================================================
// NHẬP DANH SÁCH HÀNG LOẠT TỪ FILE WORD/EXCEL
// ==========================================================
let importPreviewNames = []; // danh sách tên đang chờ xem trước

document.getElementById("btn-read-file").addEventListener("click", () => {
  const fileInput = document.getElementById("import-file");
  const errorEl = document.getElementById("import-error");
  errorEl.textContent = "";

  const file = fileInput.files[0];
  if (!file) {
    errorEl.textContent = "Thầy chọn file trước đã nhé.";
    return;
  }

  const ext = file.name.split(".").pop().toLowerCase();
  const reader = new FileReader();

  reader.onerror = () => {
    errorEl.textContent = "Không đọc được file, thầy thử lại nhé.";
  };

  if (ext === "docx") {
    reader.onload = (e) => {
      mammoth
        .extractRawText({ arrayBuffer: e.target.result })
        .then((result) => {
          const names = extractNamesFromText(result.value);
          showImportPreview(names, errorEl);
        })
        .catch((err) => {
          console.error(err);
          errorEl.textContent = "Không đọc được file Word: " + err.message;
        });
    };
    reader.readAsArrayBuffer(file);
  } else if (ext === "xlsx" || ext === "xls" || ext === "csv") {
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const names = extractNamesFromRows(rows);
        showImportPreview(names, errorEl);
      } catch (err) {
        console.error(err);
        errorEl.textContent = "Không đọc được file Excel: " + err.message;
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    errorEl.textContent = "Chỉ hỗ trợ file .xlsx, .csv hoặc .docx.";
  }
});

function showImportPreview(names, errorEl) {
  if (!names.length) {
    errorEl.textContent = "Không tìm thấy tên học sinh nào trong file. Thầy có thể thêm dòng trống bên dưới để tự nhập.";
  }
  importPreviewNames = names.map((n) => ({ name: n }));
  renderImportPreview();
  document.getElementById("import-preview").hidden = false;
}

function renderImportPreview() {
  const body = document.getElementById("import-preview-body");
  const countEl = document.getElementById("import-count");
  body.innerHTML = "";
  countEl.textContent = importPreviewNames.length;

  importPreviewNames.forEach((item, idx) => {
    const tr = document.createElement("tr");

    const nameTd = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = item.name;
    nameInput.style.cssText = "width:100%;border:1px solid var(--card-border);border-radius:6px;padding:6px 8px;font-family:inherit;";
    nameInput.addEventListener("input", () => {
      importPreviewNames[idx].name = nameInput.value;
      codeSpan.textContent = buildImportCode(idx);
    });
    nameTd.appendChild(nameInput);

    const codeTd = document.createElement("td");
    const codeSpan = document.createElement("span");
    codeSpan.className = "mono";
    codeSpan.textContent = buildImportCode(idx);
    codeTd.appendChild(codeSpan);

    const actionTd = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.className = "mini-btn";
    delBtn.textContent = "Xoá";
    delBtn.addEventListener("click", () => {
      importPreviewNames.splice(idx, 1);
      renderImportPreview();
    });
    actionTd.appendChild(delBtn);

    tr.appendChild(nameTd);
    tr.appendChild(codeTd);
    tr.appendChild(actionTd);
    body.appendChild(tr);
  });
}

function buildImportCode(idx) {
  const classId = bulkSelectedClassId;
  const usedCodes = new Set();
  let targetCode = "";
  for (let i = 0; i <= idx; i++) {
    const base = classId + "-" + (slugifyName(importPreviewNames[i].name) || "hocsinh");
    let candidate = base;
    let n = 2;
    while (usedCodes.has(candidate)) {
      candidate = base + n;
      n++;
    }
    usedCodes.add(candidate);
    if (i === idx) targetCode = candidate;
  }
  return targetCode;
}

document.getElementById("btn-add-blank-row").addEventListener("click", () => {
  importPreviewNames.push({ name: "" });
  renderImportPreview();
});

document.getElementById("btn-import-confirm").addEventListener("click", async () => {
  const classId = bulkSelectedClassId;
  const className = (CLASS_LIST.find((c) => c.id === classId) || {}).name || classId;
  const progressEl = document.getElementById("import-progress");
  const confirmBtn = document.getElementById("btn-import-confirm");

  const validNames = importPreviewNames.map((n) => n.name.trim()).filter((n) => n.length >= 2);
  if (!validNames.length) {
    progressEl.textContent = "Danh sách đang trống, chưa có tên nào để tạo.";
    return;
  }

  confirmBtn.disabled = true;
  const usedCodes = new Set();
  let successCount = 0;
  const failed = [];
  const createdAccounts = []; // để xuất ra Excel: Họ tên, Mã học sinh, Mật khẩu

  for (let i = 0; i < validNames.length; i++) {
    const fullName = validNames[i];
    const base = classId + "-" + (slugifyName(fullName) || "hocsinh");
    let code = base;
    let n = 2;
    while (usedCodes.has(code)) {
      code = base + n;
      n++;
    }
    usedCodes.add(code);

    progressEl.textContent = `Đang tạo tài khoản ${i + 1}/${validNames.length}: ${fullName}...`;

    const result = await createStudentAccount(fullName, classId, code, "123abc");
    if (result.ok) {
      successCount++;
      createdAccounts.push({ "Họ tên học sinh": fullName, "Mã học sinh": code, "Mật khẩu ban đầu": "123abc" });
    } else {
      failed.push(fullName + " (" + (result.error ? result.error.code : "lỗi") + ")");
    }
  }

  confirmBtn.disabled = false;
  progressEl.textContent = `Hoàn tất: đã tạo ${successCount}/${validNames.length} tài khoản.` +
    (failed.length ? " Lỗi: " + failed.join(", ") : "");

  // Xuất file Excel danh sách tài khoản vừa tạo
  if (createdAccounts.length) {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(createdAccounts);
    XLSX.utils.book_append_sheet(wb, sheet, "Tai khoan");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `TaiKhoan_${className.replace(/\s+/g, "")}_${today}.xlsx`);
  }

  alert(
    `Đã tạo ${successCount}/${validNames.length} tài khoản học sinh cho lớp ${className}.\n` +
      `Mật khẩu mặc định cho tất cả: 123abc\n` +
      `File Excel danh sách tài khoản đã được tải về máy.` +
      (failed.length ? "\n\nKhông tạo được: " + failed.join(", ") : "")
  );

  importPreviewNames = [];
  renderImportPreview();
  document.getElementById("import-file").value = "";
  loadStudentPicker(document.getElementById("pick-class").value);
});

// ==========================================================
// XUẤT ĐIỂM & NHẬN XÉT RA EXCEL
// ==========================================================
document.getElementById("btn-export-excel").addEventListener("click", () => {
  const classId = document.getElementById("export-class").value;
  const className = (CLASS_LIST.find((c) => c.id === classId) || {}).name || classId;
  const statusEl = document.getElementById("export-status");
  statusEl.textContent = "Đang tổng hợp dữ liệu...";

  db.collection("roster")
    .where("classId", "==", classId)
    .orderBy("order")
    .get()
    .then((rosterSnap) => {
      const studentUids = [];
      rosterSnap.forEach((doc) => studentUids.push(doc.id));

      if (!studentUids.length) {
        statusEl.textContent = "Lớp này chưa có học sinh nào.";
        return null;
      }

      return Promise.all(studentUids.map((uid) => db.collection("students").doc(uid).get())).then(
        (studentDocs) => {
          const scoreRows = [];
          const commentRows = [];

          studentDocs.forEach((doc) => {
            if (!doc.exists) return;
            const d = doc.data();
            const scores = d.scores || [];
            const comments = d.comments || [];

            if (scores.length === 0) {
              scoreRows.push({ "Họ tên": d.fullName, "Nội dung": "", "Ngày": "", "Điểm": "" });
            } else {
              scores.forEach((s) => {
                scoreRows.push({ "Họ tên": d.fullName, "Nội dung": s.label, "Ngày": s.date || "", "Điểm": s.value });
              });
            }

            comments.forEach((c) => {
              commentRows.push({ "Họ tên": d.fullName, "Ngày": c.date || "", "Nhận xét": c.text });
            });
          });

          const wb = XLSX.utils.book_new();
          const scoreSheet = XLSX.utils.json_to_sheet(scoreRows);
          const commentSheet = XLSX.utils.json_to_sheet(commentRows.length ? commentRows : [{ "Họ tên": "", "Ngày": "", "Nhận xét": "" }]);
          XLSX.utils.book_append_sheet(wb, scoreSheet, "Điểm số");
          XLSX.utils.book_append_sheet(wb, commentSheet, "Nhận xét");

          const today = new Date().toISOString().slice(0, 10);
          XLSX.writeFile(wb, `Diem_${className.replace(/\s+/g, "")}_${today}.xlsx`);
          statusEl.textContent = "Đã xuất file Excel thành công.";
        }
      );
    })
    .catch((err) => {
      console.error(err);
      statusEl.textContent = "Có lỗi khi xuất file: " + err.message;
    });
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
