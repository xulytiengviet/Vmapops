# Vmapops WebGIS 2.0

Giao diện tiếng Việt do Long Ngo thiết kế, MIT 2026. Trang chính chạy tĩnh,
không yêu cầu Node, backend hoặc khóa API để xem OpenStreetMap.

## Chạy

Tại thư mục gốc: `python3 -m http.server 8000`, mở http://localhost:8000.
Không cần chạy build TypeScript cho giao diện này. Mã Google Maps cũ vẫn ở
`src/`, `nextjs-frontend/` và `legacy.html` (cần build và khóa Google riêng).

## Chức năng

- Bản đồ OSM hoặc XYZ tùy chỉnh; phóng to, định vị, toàn màn hình.
- Tìm địa điểm bằng Nominatim khi nhấn Enter (không autocomplete); nhập trực tiếp `10.253, 105.972`.
- Nhập GeoJSON WGS84 tối đa 20 MB, bật/tắt lớp, chỉnh độ đậm, xem thuộc tính, xóa lớp.
- Đo khoảng cách đường chim bay; xuất những lớp đang bật thành GeoJSON.
- Sáu điểm đô thị là dữ liệu minh họa, không phải ranh giới hành chính.
- Lớp nhập và phép đo giữ trong bộ nhớ; xuất GeoJSON trước khi tải lại trang.

## API riêng

Mở **Kết nối API**:
1. URL XYZ tùy chọn, chứa `{z}/{x}/{y}`. Điền nguồn/bản quyền nhà cung cấp.
2. Endpoint HTTPS trả về GeoJSON chuẩn, ví dụ FeatureCollection.
3. Token Bearer tùy chọn, chỉ gửi đến endpoint GeoJSON đã nhập.
4. **Kiểm tra API** kiểm tra phản hồi nhưng không thêm lớp.
5. **Lưu & áp dụng** tải và thêm/thay thế lớp API; áp dụng XYZ nếu có.

Endpoint được lưu trên thiết bị. Token mặc định ở sessionStorage, tùy chọn
lưu lâu dài trong localStorage. Trang tĩnh không thể bảo mật khóa server:
dùng token được phép lộ cho client, hạn chế quyền và thời hạn; khóa bí mật
phải ở proxy backend của bạn. Không có khóa API nào được ghi vào repository.
Sau khi mở lại trang, vào cài đặt và áp dụng để tải API; không tự gửi token.
Không theo chuyển hướng khi gọi API có token. `Xóa cấu hình` xóa token và lớp API.

Ví dụ phản hồi API:
```json
{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Vĩnh Long"},"geometry":{"type":"Point","coordinates":[105.972,10.253]}}]}
```

Server API phải hỗ trợ CORS và OPTIONS nếu dùng Authorization:
```
Access-Control-Allow-Origin: https://xulytiengviet.github.io
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Authorization, Accept
```
Khi phát triển, cho phép origin http://localhost:8000 thay vì domain production.
Đây là client WebGIS, không tạo sẵn dịch vụ API backend. URL XYZ có khóa truy vấn
sẽ hiển thị trong trình duyệt; chỉ dùng khóa công khai được nhà cung cấp cho phép.

## GitHub Pages

Workflow `.github/workflows/pages.yml` chỉ xuất index.html và webgis/.
Trong repository Settings → Pages → Source chọn **GitHub Actions**.
URL dự kiến: https://xulytiengviet.github.io/Vmapops/.

Leaflet 1.9.4 được lưu tại vendor/; giữ ghi công Leaflet và OpenStreetMap.
Nền bản đồ và tìm kiếm cần Internet; tuân thủ hạn mức của nhà cung cấp.
