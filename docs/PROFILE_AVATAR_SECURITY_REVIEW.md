# Hồ sơ người dùng, Avatar (Cloudinary) và Duyệt thay đổi bảo mật

## Tổng quan

- **Profile cơ bản** (first name, last name): người dùng tự cập nhật ngay, không cần duyệt.
- **Thông tin bảo mật** (email, mật khẩu): gửi yêu cầu → trạng thái PENDING → Admin/Risk Officer duyệt (approve/reject) → mới áp dụng thay đổi.
- **Avatar**: upload ảnh lên Cloudinary, lưu URL vào DB, hiển thị trên Profile và Drawer.

## Cấu hình Cloudinary (Avatar)

Thêm vào file `.env` (tùy chọn; nếu không cấu hình thì upload avatar sẽ báo lỗi):

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_AVATAR_FOLDER=avatars
```

- Đăng ký tài khoản miễn phí tại [cloudinary.com](https://cloudinary.com).
- Lấy **Cloud name**, **API Key**, **API Secret** từ Dashboard.
- `CLOUDINARY_AVATAR_FOLDER`: thư mục lưu ảnh (mặc định `avatars`).

## Quyền RBAC mới

| Permission               | Mô tả                          | Role có quyền   |
|--------------------------|--------------------------------|-----------------|
| `users:security_review`  | Duyệt yêu cầu đổi email/mật khẩu | ADMIN, RISK_OFFICER |

- Matrix quyền: `src/common/authz/rbac-policy.ts`.
- JWT có thể chứa claim `permissions`; FE dùng để hiển thị mục "Security requests" trong drawer.

## API Endpoints

| Method | Path | Mô tả | Quyền |
|--------|------|--------|--------|
| PATCH | /users/me/profile-basic | Cập nhật first/last name | Đăng nhập |
| POST | /users/me/security-change-requests | Tạo yêu cầu đổi email/password | Đăng nhập |
| POST | /users/me/avatar | Upload avatar (multipart, field: file) | Đăng nhập |
| GET | /users/security-change-requests/pending | Danh sách yêu cầu chờ duyệt | users:security_review |
| POST | /users/security-change-requests/:id/approve | Chấp nhận yêu cầu | users:security_review |
| POST | /users/security-change-requests/:id/reject | Từ chối yêu cầu | users:security_review |

- Avatar: file tối đa 2MB, định dạng JPEG/PNG/WebP.
- Security change: body `{ "changeType": "EMAIL_CHANGE" | "PASSWORD_CHANGE", "payload": { "email": "..." } | { "password": "..." } }`.

## Luồng dữ liệu

1. User sửa tên → PATCH profile-basic → cập nhật ngay.
2. User gửi đổi email/password → POST security-change-requests → tạo bản ghi PENDING.
3. Admin/Risk Officer mở "Security requests" → GET pending → Approve/Reject từng yêu cầu.
4. Khi Approve: backend áp dụng thay đổi (email hoặc password_hash) và đóng yêu cầu.
5. Avatar: chọn ảnh → POST /users/me/avatar (multipart) → Cloudinary upload → lưu URL vào `users.avatar_url`.

## Test gợi ý

- **BE**: profile basic update thành công; security request tạo PENDING và chưa đổi dữ liệu thật; reviewer thiếu permission trả 403; approve áp dụng dữ liệu và đóng request; avatar upload sai type/size trả 400.
- **FE**: đổi tên cập nhật tức thì; đổi email/password hiển thị "Request sent. Pending approval."; avatar hiển thị sau upload (Profile + Drawer); màn Security requests chỉ hiện với role có quyền, approve/reject làm mới danh sách.
