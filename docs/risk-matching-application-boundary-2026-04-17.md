# Risk Assessment - matching application boundary - 2026-04-17

## Mô tả thay đổi

- Hoàn tất thêm application boundary cho `src/modules/matching/` để external modules không phụ thuộc trực tiếp vào `MatchingService` hoặc `MatchingQueueService`
- Thêm use-case để enqueue matching job từ `orders`
- Giảm export `MatchingService` và queue service khỏi `MatchingModule`, giữ public API ở `application/use-cases/`
- Bổ sung test cho các flow nhạy cảm quanh `orders -> matching queue` và matching processor/use-cases

## Edge cases có thể gây lỗi

- Order tạo thành công nhưng enqueue matching thất bại, dẫn tới lệnh nằm OPEN mà chưa được match ngay
- Sai mapping từ `Order` sang `OrderBookOrder` làm sai `remaining`, `slippage_tolerance`, hoặc fee context
- Reconcile/cancel dùng sai use-case wrapper có thể không cập nhật order book in-memory
- Export provider không đủ từ `MatchingModule` làm `OrdersModule` resolve dependency lỗi khi boot
- Refactor boundary nhưng vô tình đổi retry policy hoặc payload của Bull job

## Ảnh hưởng đến tính toàn vẹn dữ liệu

- Không đổi business logic lõi của `MatchingService.runMatch()` hay stored procedure tạo/hủy order
- Có rủi ro operational nếu queue enqueue không còn được gọi đúng lúc sau create order
- Có rủi ro audit trail gián tiếp nếu match job không được enqueue, vì trade sẽ không được execute đúng thời điểm

## Kế hoạch rollback

- Revert các thay đổi trong `src/modules/matching/application/use-cases/`, `src/modules/matching/matching.module.ts`, `src/modules/orders/application/use-cases/`
- Restore `MatchingService` và `MatchingQueueService` exports như trước
- Re-run targeted Jest + `npm run build`
- Nếu phát hiện issue sau deploy, tạm quay lại wiring cũ để đảm bảo orders vẫn enqueue/match bình thường
