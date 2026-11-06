/**
 * Quản lý "phiên" chơi: mỗi lần bắt đầu/tiếp tục ván là một phiên mới.
 * Đổi phiên sẽ hủy mọi tiến trình đang chờ (hoạt ảnh, hộp thoại) của phiên cũ.
 */

export class Cancelled extends Error {}
export class GameOver extends Error {}
export class TurnAbort extends Error {}

export const Session = { id: 0, pending: new Set() };

export function resetSession() {
  Session.id++;
  const list = [...Session.pending];
  Session.pending.clear();
  list.forEach((cancel) => cancel());
}

export function sleep(ms) {
  const sid = Session.id;
  return new Promise((res) => setTimeout(res, Math.max(0, ms || 0))).then(() => {
    if (sid !== Session.id) throw new Cancelled();
  });
}

/** Chờ thao tác của người chơi; tự hủy khi bắt đầu phiên mới */
export function humanWait(setup) {
  const sid = Session.id;
  return new Promise((resolve, reject) => {
    let settled = false;
    const cancel = () => {
      if (settled) return;
      settled = true;
      reject(new Cancelled());
    };
    Session.pending.add(cancel);
    setup((value) => {
      if (settled) return;
      settled = true;
      Session.pending.delete(cancel);
      if (sid !== Session.id) reject(new Cancelled());
      else resolve(value);
    });
  });
}

export const isControlFlow = (e) => e instanceof Cancelled || e instanceof GameOver || e instanceof TurnAbort;
