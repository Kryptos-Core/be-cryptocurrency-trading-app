# Cách sử dụng Redis - Dự án hiện tại

Redis được sử dụng để làm bộ nhớ đệm (cache) và hỗ trợ vận hành trong các module backend.

## Các biến môi trường cần thiết

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

## Khởi động Redis tại địa phương

```bash
docker compose -f docker-compose.infrastructure.yml up -d redis
```

## Các cách sử dụng phổ biến

- Lưu bộ nhớ đệm cho các dữ liệu truy vấn thường xuyên (hot data)
- Áp dụng mẫu "get-or-set" cho các tác vụ đọc dữ liệu tốn kém
- Cơ chế publish/subscribe cho các sự kiện nội bộ khi cần thiết

## Lưu ý

- Luôn đặt thời gian tồn tại (TTL) cho các khóa bộ nhớ đệm tạm thời.
- Xóa bỏ bộ nhớ đệm (invalidate cache) trên các luồng ghi dữ liệu có ảnh hưởng đến các mô hình đọc đã được lưu đệm.
