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
  initContentManager();
  loadMembersList();
}

function populateClassSelects() {
  const selects = [
    document.getElementById("new-class"),
    document.getElementById("pick-class"),
    document.getElementById("export-class"),
    document.getElementById("delete-class"),
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
  loadDeleteList();
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

// ==========================================================
// XOÁ HỌC SINH: xoá lẻ / nhiều / cả lớp
// ==========================================================
let deleteRosterCache = []; // [{uid, fullName, code}]

document.getElementById("delete-class").addEventListener("change", loadDeleteList);

function loadDeleteList() {
  const classId = document.getElementById("delete-class").value;
  const body = document.getElementById("delete-list-body");
  const emptyNote = document.getElementById("delete-list-empty");
  const selectAll = document.getElementById("delete-select-all");
  selectAll.checked = false;
  body.innerHTML = "";
  emptyNote.hidden = true;
  deleteRosterCache = [];

  db.collection("roster")
    .where("classId", "==", classId)
    .orderBy("order")
    .get()
    .then((snap) => {
      if (snap.empty) {
        emptyNote.hidden = false;
        return;
      }
      snap.forEach((doc) => {
        const d = doc.data();
        deleteRosterCache.push({ uid: doc.id, fullName: d.fullName, code: d.code });
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><input type="checkbox" class="delete-row-check" data-uid="${doc.id}" /></td>
          <td>${escapeHtml(d.fullName || "")}</td>
          <td class="mono">${escapeHtml(d.code || "")}</td>
          <td style="white-space:nowrap;">
            <button class="mini-btn" data-action="reset" data-uid="${doc.id}">Reset mật khẩu</button>
            &nbsp;
            <button class="mini-btn" data-action="delete-one" data-uid="${doc.id}" style="color:var(--muted);">Xoá</button>
          </td>
        `;
        tr.querySelector('[data-action="reset"]').addEventListener("click", () => resetStudentPassword(doc.id));
        tr.querySelector('[data-action="delete-one"]').addEventListener("click", () => {
          const s = deleteRosterCache.find((x) => x.uid === doc.id);
          if (!confirm(`Xoá học sinh "${s.fullName}"?\n\nKhông thể hoàn tác.`)) return;
          const statusEl = document.getElementById("delete-status");
          statusEl.textContent = "Đang xoá...";
          deleteStudentsByUids([doc.id])
            .then(() => {
              statusEl.textContent = `Đã xoá ${s.fullName}.`;
              loadDeleteList();
              loadStudentPicker(document.getElementById("pick-class").value);
            })
            .catch((err) => (statusEl.textContent = "Lỗi khi xoá: " + err.message));
        });
        body.appendChild(tr);
      });
    })
    .catch((err) => {
      console.error(err);
      emptyNote.hidden = false;
      emptyNote.textContent = "Không tải được danh sách: " + err.message;
    });
}

document.getElementById("delete-select-all").addEventListener("change", (e) => {
  document.querySelectorAll(".delete-row-check").forEach((cb) => (cb.checked = e.target.checked));
});

// Xoá roster + students cho 1 danh sách uid, trả về Promise
function deleteStudentsByUids(uids) {
  const batchPromises = uids.map((uid) =>
    Promise.all([
      db.collection("roster").doc(uid).delete(),
      db.collection("students").doc(uid).delete(),
    ])
  );
  return Promise.all(batchPromises);
}

document.getElementById("btn-delete-selected").addEventListener("click", () => {
  const statusEl = document.getElementById("delete-status");
  const checked = Array.from(document.querySelectorAll(".delete-row-check:checked"));
  if (!checked.length) {
    statusEl.textContent = "Thầy chưa tick chọn học sinh nào.";
    return;
  }
  const uids = checked.map((cb) => cb.dataset.uid);
  const names = uids
    .map((uid) => (deleteRosterCache.find((s) => s.uid === uid) || {}).fullName)
    .filter(Boolean);

  if (!confirm(`Xoá ${uids.length} học sinh sau đây?\n\n${names.join("\n")}\n\nKhông thể hoàn tác.`)) {
    return;
  }

  statusEl.textContent = "Đang xoá...";
  deleteStudentsByUids(uids)
    .then(() => {
      statusEl.textContent = `Đã xoá ${uids.length} học sinh.`;
      loadDeleteList();
      loadStudentPicker(document.getElementById("pick-class").value);
    })
    .catch((err) => {
      statusEl.textContent = "Lỗi khi xoá: " + err.message;
    });
});

document.getElementById("btn-delete-whole-class").addEventListener("click", () => {
  const classId = document.getElementById("delete-class").value;
  const className = (CLASS_LIST.find((c) => c.id === classId) || {}).name || classId;
  const statusEl = document.getElementById("delete-status");

  if (!deleteRosterCache.length) {
    statusEl.textContent = "Lớp này đang không có học sinh nào.";
    return;
  }

  const typed = prompt(
    `Thao tác này sẽ xoá TOÀN BỘ ${deleteRosterCache.length} học sinh trong lớp "${className}".\n` +
      `Không thể hoàn tác.\n\nĐể xác nhận, gõ chính xác tên lớp vào ô bên dưới:`
  );
  if (typed === null) return;
  if (typed.trim().toLowerCase() !== className.trim().toLowerCase()) {
    statusEl.textContent = "Tên lớp gõ không khớp, đã huỷ thao tác xoá.";
    return;
  }

  const uids = deleteRosterCache.map((s) => s.uid);
  statusEl.textContent = "Đang xoá cả lớp...";
  deleteStudentsByUids(uids)
    .then(() => {
      statusEl.textContent = `Đã xoá toàn bộ ${uids.length} học sinh trong lớp ${className}.`;
      loadDeleteList();
      loadStudentPicker(document.getElementById("pick-class").value);
    })
    .catch((err) => {
      statusEl.textContent = "Lỗi khi xoá: " + err.message;
    });
});

// ==========================================================
// RESET MẬT KHẨU: tạo lại tài khoản với mật khẩu mặc định,
// giữ nguyên điểm số + nhận xét cũ (mã đăng nhập có thể đổi nhẹ)
// ==========================================================
function resetStudentPassword(oldUid) {
  const statusEl = document.getElementById("delete-status");
  const student = deleteRosterCache.find((s) => s.uid === oldUid);
  if (!student) return;

  if (
    !confirm(
      `Reset mật khẩu cho "${student.fullName}" về mặc định (123abc)?\n\n` +
        `Mã đăng nhập có thể đổi nhẹ (thêm số ở cuối), hệ thống sẽ báo mã mới sau khi xong.\n` +
        `Điểm số và nhận xét cũ sẽ được giữ nguyên.`
    )
  ) {
    return;
  }

  statusEl.textContent = `Đang reset mật khẩu cho ${student.fullName}...`;

  Promise.all([
    db.collection("roster").doc(oldUid).get(),
    db.collection("students").doc(oldUid).get(),
  ])
    .then(([rosterDoc, studentDoc]) => {
      if (!rosterDoc.exists || !studentDoc.exists) {
        throw new Error("Không tìm thấy dữ liệu học sinh này.");
      }
      const rosterData = rosterDoc.data();
      const studentData = studentDoc.data();
      const baseCode = rosterData.code || student.fullName.toLowerCase();
      const classId = rosterData.classId;
      const fullName = rosterData.fullName;

      return tryCreateWithFreeCode(baseCode, classId, fullName, studentData);
    })
    .then((newCode) => {
      // Xoá bản ghi cũ (tài khoản đăng nhập cũ trong Firebase Auth sẽ mồ côi, không dùng được nữa nhưng không xoá hết được từ trình duyệt)
      return deleteStudentsByUids([oldUid]).then(() => newCode);
    })
    .then((newCode) => {
      statusEl.textContent = "";
      alert(
        `Đã reset xong cho ${student.fullName}!\n\n` +
          `Mã đăng nhập mới: ${newCode}\n` +
          `Mật khẩu: 123abc\n\n` +
          `Thầy báo lại mã đăng nhập mới này cho học sinh nhé.`
      );
      loadDeleteList();
      loadStudentPicker(document.getElementById("pick-class").value);
    })
    .catch((err) => {
      console.error(err);
      statusEl.textContent = "Lỗi khi reset: " + err.message;
    });
}

// Thử tạo tài khoản mới với mã dựa trên baseCode, tự thêm số nếu bị trùng (email đã tồn tại)
function tryCreateWithFreeCode(baseCode, classId, fullName, oldStudentData, attempt) {
  attempt = attempt || 1;
  const candidateCode = attempt === 1 ? baseCode : baseCode + "-" + attempt;
  const email = candidateCode + "@" + LOGIN_EMAIL_DOMAIN;

  return secondaryAuth
    .createUserWithEmailAndPassword(email, "123abc")
    .then((cred) => {
      const uid = cred.user.uid;
      const order = Date.now();
      return Promise.all([
        db.collection("roster").doc(uid).set({ fullName, classId, code: candidateCode, order }),
        db
          .collection("students")
          .doc(uid)
          .set({
            fullName,
            classId,
            scores: oldStudentData.scores || [],
            comments: oldStudentData.comments || [],
          }),
      ])
        .then(() => secondaryAuth.signOut())
        .then(() => candidateCode);
    })
    .catch((err) => {
      try {
        secondaryAuth.signOut();
      } catch (e) {}
      if (err.code === "auth/email-already-in-use" && attempt < 20) {
        return tryCreateWithFreeCode(baseCode, classId, fullName, oldStudentData, attempt + 1);
      }
      throw err;
    });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ==========================================================
// QUẢN LÝ NỘI DUNG: Bài giảng / Tài liệu / Khóa học / Azota
// ==========================================================
const CONTENT_CATEGORY_LABELS = {
  baigiang: "Bài giảng",
  tailieu: "Tài liệu",
  khoahoc: "Khóa học online",
  azota: "Bài tập Azota",
};

let currentContentCategory = "baigiang";
let currentEditingContentId = null;

function initContentManager() {
  document.querySelectorAll("#content-tabs .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#content-tabs .filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentContentCategory = btn.dataset.cat;
      resetContentForm();
      loadContentList();
    });
  });
  resetContentForm();
  loadContentList();
}

function resetContentForm() {
  currentEditingContentId = null;
  document.getElementById("content-form-title").textContent = "Thêm mới — " + CONTENT_CATEGORY_LABELS[currentContentCategory];
  document.getElementById("content-title").value = "";
  document.getElementById("content-desc").value = "";
  document.getElementById("content-price").value = "";
  document.getElementById("content-amount").value = "";
  document.getElementById("content-tag").value = "";
  document.getElementById("content-link-url").value = "";
  document.getElementById("content-link-label").value = "";
  document.getElementById("content-error").textContent = "";
  document.getElementById("btn-content-save").textContent = "Thêm mới";
  document.getElementById("btn-content-cancel-edit").hidden = true;
}

document.getElementById("btn-content-cancel-edit").addEventListener("click", resetContentForm);

function loadContentList() {
  const body = document.getElementById("content-list-body");
  const emptyNote = document.getElementById("content-list-empty");
  body.innerHTML = "";
  emptyNote.hidden = true;

  db.collection("products")
    .where("category", "==", currentContentCategory)
    .orderBy("order")
    .get()
    .then((snap) => {
      if (snap.empty) {
        emptyNote.hidden = false;
        return;
      }
      snap.forEach((doc) => {
        const d = doc.data();
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(d.title || "")}</td>
          <td>${escapeHtml(d.price || "")}</td>
          <td>${escapeHtml(d.tag || "")}</td>
          <td style="white-space:nowrap;">
            <button class="mini-btn" data-action="edit">Sửa</button>
            &nbsp;
            <button class="mini-btn" data-action="delete" style="color:var(--muted);">Xoá</button>
          </td>
        `;
        tr.querySelector('[data-action="edit"]').addEventListener("click", () => editContentItem(doc.id, d));
        tr.querySelector('[data-action="delete"]').addEventListener("click", () => deleteContentItem(doc.id, d.title));
        body.appendChild(tr);
      });
    })
    .catch((err) => {
      console.error(err);
      emptyNote.hidden = false;
      emptyNote.textContent = "Không tải được danh sách: " + err.message;
    });
}

function editContentItem(id, data) {
  currentEditingContentId = id;
  document.getElementById("content-form-title").textContent = "Đang sửa: " + data.title;
  document.getElementById("content-title").value = data.title || "";
  document.getElementById("content-desc").value = data.description || "";
  document.getElementById("content-price").value = data.price || "";
  document.getElementById("content-amount").value =
    data.amountVnd === undefined || data.amountVnd === null ? "" : data.amountVnd;
  document.getElementById("content-tag").value = data.tag || "";
  document.getElementById("content-link-url").value = "";
  document.getElementById("content-link-label").value = "";
  document.getElementById("content-error").textContent = "";
  document.getElementById("btn-content-save").textContent = "Cập nhật";
  document.getElementById("btn-content-cancel-edit").hidden = false;
  window.scrollTo({ top: document.getElementById("content-title").getBoundingClientRect().top + window.scrollY - 100, behavior: "smooth" });

  // Link nội dung nằm ở subcollection riêng (products/{id}/private/content) — tải thêm để hiện lên form sửa
  db.collection("products")
    .doc(id)
    .collection("private")
    .doc("content")
    .get()
    .then((snap) => {
      if (snap.exists && currentEditingContentId === id) {
        document.getElementById("content-link-url").value = snap.data().linkUrl || "";
        document.getElementById("content-link-label").value = snap.data().linkLabel || "";
      }
    })
    .catch((err) => console.error(err));
}

function deleteContentItem(id, title) {
  if (!confirm(`Xoá "${title}"? Không thể hoàn tác.`)) return;
  db.collection("products")
    .doc(id)
    .collection("private")
    .doc("content")
    .delete()
    .catch(() => {})
    .then(() => db.collection("products").doc(id).delete())
    .then(() => loadContentList())
    .catch((err) => alert("Lỗi khi xoá: " + err.message));
}

document.getElementById("btn-content-save").addEventListener("click", () => {
  const title = document.getElementById("content-title").value.trim();
  const description = document.getElementById("content-desc").value.trim();
  const price = document.getElementById("content-price").value.trim();
  const amountRaw = document.getElementById("content-amount").value.trim();
  const tag = document.getElementById("content-tag").value.trim();
  const linkUrl = document.getElementById("content-link-url").value.trim();
  const linkLabel = document.getElementById("content-link-label").value.trim();
  const errorEl = document.getElementById("content-error");
  errorEl.textContent = "";

  if (!title) {
    errorEl.textContent = "Thầy nhập tiêu đề đã nhé.";
    return;
  }
  if (amountRaw !== "" && (isNaN(Number(amountRaw)) || Number(amountRaw) < 0)) {
    errorEl.textContent = "Số tiền phải là số không âm, hoặc để trống nếu giá Liên hệ.";
    return;
  }

  const data = {
    category: currentContentCategory,
    title,
    description,
    price,
    tag,
    amountVnd: amountRaw === "" ? null : Number(amountRaw),
  };

  // Link nội dung thật lưu riêng ở subcollection private — chỉ ai đã mua mới đọc được (xem firestore-rules.txt)
  function savePrivateContent(productId) {
    return db
      .collection("products")
      .doc(productId)
      .collection("private")
      .doc("content")
      .set({ linkUrl, linkLabel });
  }

  errorEl.textContent = "Đang lưu...";

  if (currentEditingContentId) {
    const productId = currentEditingContentId;
    db.collection("products")
      .doc(productId)
      .update(data)
      .then(() => savePrivateContent(productId))
      .then(() => {
        errorEl.textContent = "";
        resetContentForm();
        loadContentList();
      })
      .catch((err) => (errorEl.textContent = "Lỗi: " + err.message));
  } else {
    data.order = Date.now();
    db.collection("products")
      .add(data)
      .then((docRef) => savePrivateContent(docRef.id))
      .then(() => {
        errorEl.textContent = "";
        resetContentForm();
        loadContentList();
      })
      .catch((err) => (errorEl.textContent = "Lỗi: " + err.message));
  }
});

// ==========================================================
// QUẢN LÝ THÀNH VIÊN
// ==========================================================
function loadMembersList() {
  const body = document.getElementById("members-list-body");
  const emptyNote = document.getElementById("members-list-empty");
  body.innerHTML = "";
  emptyNote.hidden = true;
  document.getElementById("member-detail-panel").hidden = true;

  db.collection("members")
    .orderBy("lastLoginAt", "desc")
    .get()
    .then((snap) => {
      const rows = snap.docs.filter((doc) => doc.id !== ADMIN_UID);
      if (!rows.length) {
        emptyNote.hidden = false;
        return;
      }
      rows.forEach((doc) => {
        const d = doc.data();
        const typeLabel = d.accountType === "student" ? "Học sinh" : "Khách hàng";
        const lastLogin = d.lastLoginAt && d.lastLoginAt.toDate ? formatDateTimeVN(d.lastLoginAt.toDate()) : "—";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(d.email || "")}</td>
          <td>${escapeHtml(typeLabel)}</td>
          <td>${escapeHtml(String(d.loginCount || 0))}</td>
          <td>${escapeHtml(lastLogin)}</td>
          <td><button class="mini-btn" data-action="detail">Xem đã mua</button></td>
        `;
        tr.querySelector('[data-action="detail"]').addEventListener("click", () => showMemberDetail(doc.id, d));
        body.appendChild(tr);
      });
    })
    .catch((err) => {
      console.error(err);
      emptyNote.hidden = false;
      emptyNote.textContent = "Không tải được danh sách: " + err.message;
    });
}

function formatDateTimeVN(date) {
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function showMemberDetail(uid, memberData) {
  const panel = document.getElementById("member-detail-panel");
  const body = document.getElementById("member-purchases-body");
  const emptyNote = document.getElementById("member-purchases-empty");
  document.getElementById("member-detail-title").textContent = "Đã mua/dùng — " + (memberData.email || uid);
  body.innerHTML = "";
  emptyNote.hidden = true;
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

  db.collection("members")
    .doc(uid)
    .collection("purchases")
    .get()
    .then((snap) => {
      if (snap.empty) {
        emptyNote.hidden = false;
        return;
      }
      snap.forEach((doc) => {
        const d = doc.data();
        const when = d.purchasedAt && d.purchasedAt.toDate ? formatDateTimeVN(d.purchasedAt.toDate()) : "—";
        const amountLabel =
          d.method === "free" || d.method === "admin" ? "Miễn phí" : Number(d.amountVnd || 0).toLocaleString("vi-VN") + "đ";
        const methodLabel =
          d.method === "free" ? "Dùng miễn phí" : d.method === "admin" ? "Giáo viên (miễn phí)" : "Chuyển khoản (payOS)";
        const categoryLabel = CONTENT_CATEGORY_LABELS[d.category] || d.category || "";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(d.title || doc.id)}</td>
          <td>${escapeHtml(categoryLabel)}</td>
          <td>${escapeHtml(amountLabel)}</td>
          <td>${escapeHtml(methodLabel)}</td>
          <td>${escapeHtml(when)}</td>
        `;
        body.appendChild(tr);
      });
    })
    .catch((err) => {
      console.error(err);
      emptyNote.hidden = false;
      emptyNote.textContent = "Không tải được: " + err.message;
    });
}

document.getElementById("btn-member-detail-close").addEventListener("click", () => {
  document.getElementById("member-detail-panel").hidden = true;
});
