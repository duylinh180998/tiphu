/**
 * Theo dõi lời nhắc (prompt) đang chờ người chơi trên máy này để có thể đóng
 * từ bên ngoài, ví dụ khi hết thời gian suy nghĩ lúc chơi trực tuyến.
 */
let active = null;

/** Đăng ký một giao diện đang chờ trả lời. Trả về hàm hủy đăng ký. */
export function beginPrompt(close) {
  const entry = { close };
  active = entry;
  return () => {
    if (active === entry) active = null;
  };
}

/** Đóng lời nhắc đang mở (nếu có), trả về undefined cho bên đang chờ */
export function cancelPrompt() {
  if (!active) return;
  const a = active;
  active = null;
  a.close(undefined);
}

export const hasPrompt = () => !!active;
