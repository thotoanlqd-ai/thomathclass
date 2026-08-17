// =========================================================
// ThoMathClass — firebase-config.js
// File cấu hình dùng chung cho lophoc.html và admin.html
// =========================================================
//
// BƯỚC 1: Thầy lấy đoạn config bên dưới từ Firebase Console:
// Project settings (biểu tượng bánh răng) > tab General >
// mục "Your apps" > chọn app web > copy object firebaseConfig
//
// TODO: thay toàn bộ giá trị "TODO_..." bên dưới bằng giá trị thật
const firebaseConfig = {
  apiKey: "AIzaSyCiLVgORcb1NBuLGI0UrThbcLNP47Ub3Ss",
  authDomain: "thomathclass.firebaseapp.com",
  projectId: "thomathclass",
  storageBucket: "thomathclass.firebasestorage.app",
  messagingSenderId: "1076472930743",
  appId: "1:1076472930743:web:e71646a2c10b3031e30832"
};

// BƯỚC 2: Thầy vào Authentication > tab Users > tạo tài khoản
// Giáo viên (email + mật khẩu của thầy) > bấm vào dòng vừa tạo
// để xem "User UID" > dán UID đó vào đây.
// TODO: thay bằng UID thật của tài khoản Giáo viên
const ADMIN_UID = "cbWUWVPZ8Fgni1gQjbz7ycJvfL72";

// Domain nội bộ dùng để tạo email đăng nhập cho học sinh.
// Không cần là domain có thật, chỉ dùng để Firebase Auth chấp nhận định dạng email.
const LOGIN_EMAIL_DOMAIN = "hocsinh.thomathclass.app";

// Danh sách 6 lớp học — thầy có thể sửa tên hiển thị, KHÔNG nên đổi "id"
// sau khi đã có học sinh trong lớp (id dùng để liên kết dữ liệu).
const CLASS_LIST = [
  { id: "12a6-lqd", name: "12A6 LQĐ" },
  { id: "12a7-lqd", name: "12A7 LQĐ" },
  { id: "10c-lqd", name: "10C5 LQĐ" },
  { id: "tho-2k9", name: "Thầy Thọ vs 2k9" },
  { id: "tho-2k10", name: "Thầy Thọ vs 2k10" },
  { id: "tho-2k11", name: "Thầy Thọ vs 2k11" }
];

// Chức vụ lớp cho phép học sinh viết bài "Nhật ký lớp học" (ngoài admin).
// Áp dụng chung cho mọi lớp trong CLASS_LIST — lớp nào có gán chức vụ (roster.classRole)
// thì học sinh đó viết được, lớp không gán ai thì chỉ admin viết như trước.
// Key phải khớp CHÍNH XÁC với các giá trị cho phép trong firestore.rules/storage.rules.
const CLASS_ROLE_LABELS = {
  "lop-truong": "Lớp trưởng",
  "lop-pho-hoc-tap": "Lớp phó học tập",
  "lop-pho-ne-nep": "Lớp phó nề nếp",
  "bi-thu": "Bí thư",
  "thu-quy": "Thủ quỹ",
};

// --- Khởi tạo Firebase (dùng SDK compat, tải qua thẻ <script> ở mỗi trang) ---
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Cloud Functions (thanh toán payOS) — chỉ dùng ở các trang có nạp thêm
// thẻ <script> firebase-functions-compat.js (baigiang/tailieu/khoahoc/azota.html).
// Region phải khớp với region khai báo trong functions/index.js.
const fns = typeof firebase.functions === "function" ? firebase.app().functions("asia-southeast1") : null;

// Cloud Storage (ảnh Nhật ký lớp học / ảnh đại diện học sinh) — chỉ dùng ở trang có nạp thêm
// thẻ <script> firebase-storage-compat.js (admin.html).
const storage = typeof firebase.storage === "function" ? firebase.storage() : null;
