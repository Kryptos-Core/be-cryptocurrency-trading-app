/**
 * Name Helper
 * Các function tiện ích để xử lý tên người dùng
 * Pattern: Helper/Utility Pattern
 * 
 * Áp dụng SOLID principles:
 * - Single Responsibility: Chỉ xử lý các thao tác liên quan đến tên
 * - Open/Closed: Có thể mở rộng thêm các tiện ích xử lý tên mới
 */

/**
 * Viết hoa chữ cái đầu của mỗi từ trong tên
 * Example: "john doe" -> "John Doe"
 */
export function capitalizeWords(name: string): string {
  if (!name) return '';
  
  return name
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Sanitize tên bằng cách loại bỏ khoảng trắng thừa và ký tự đặc biệt
 * Chỉ cho phép chữ cái và khoảng trắng
 */
export function sanitizeName(name: string): string {
  if (!name) return '';
  
  return name
    .trim()
    .replace(/\s+/g, ' ') // Thay thế nhiều khoảng trắng bằng một khoảng trắng
    .replace(/[^a-zA-ZÀ-ỹ\s]/g, ''); // Xóa ký tự đặc biệt, giữ lại tiếng Việt
}

/**
 * Format tên với việc viết hoa và sanitization hợp lệ
 * Kết hợp sanitization và capitalization
 */
export function formatName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  
  const sanitized = sanitizeName(name);
  return sanitized ? capitalizeWords(sanitized) : undefined;
}

/**
 * Lấy tên đầy đủ từ first name và last name
 * Return tên đầy đủ đã format hoặc undefined nếu cả hai đều rỗng
 */
export function getFullName(firstName?: string, lastName?: string): string | undefined {
  const formattedFirst = formatName(firstName);
  const formattedLast = formatName(lastName);
  
  if (!formattedFirst && !formattedLast) {
    return undefined;
  }
  
  return [formattedFirst, formattedLast].filter(Boolean).join(' ');
}

/**
 * Validate xem tên có chỉ chứa các ký tự hợp lệ hay không
 * Hợp lệ: chữ cái (bao gồm tiếng Việt) và khoảng trắng
 */
export function isValidName(name: string): boolean {
  if (!name) return false;
  
  const nameRegex = /^[a-zA-ZÀ-ỹ\s]+$/;
  return nameRegex.test(name.trim());
}
