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
  apiKey: "AIzaSyDTfelodEAPn-nfCrl-QhyZCWDMrHL9zAs",
  authDomain: "thomathclass.firebaseapp.com",
  projectId: "thomathclass",
  storageBucket: "thomathclass.firebasestorage.app",
  messagingSenderId: "1076472930743",
  appId: "1:1076472930743:web:e71646a2c10b3031e30832",
  measurementId: "G-4MCM5W0S0D"
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
  { id: "10c-lqd", name: "10C LQĐ" },
  { id: "tho-2k9", name: "Thầy Thọ vs 2k9" },
  { id: "tho-2k10", name: "Thầy Thọ vs 2k10" },
  { id: "tho-2k11", name: "Thầy Thọ vs 2k11" }
];

// --- Khởi tạo Firebase (dùng SDK compat, tải qua thẻ <script> ở mỗi trang) ---
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
