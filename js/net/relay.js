/**
 * Kênh CHUYỂN TIẾP qua máy chủ MQTT công cộng — dự phòng khi WebRTC ngang hàng không nối được
 * (4G/CGNAT nhiều tầng NAT, tường lửa công ty chặn UDP…). Cách làm giống trò chơi toanhoc.
 *
 * Mọi máy chỉ mở kết nối WebSocket bảo mật (wss://) RA NGOÀI tới máy chủ MQTT nên đi qua được hầu
 * hết NAT/tường lửa. Máy chủ MQTT chỉ chuyển tin theo "topic", không lưu gì: vẫn không cần
 * máy chủ riêng hay cơ sở dữ liệu, không cần tài khoản.
 *
 * Topic theo mã phòng:
 *   <tiền tố>/<giao thức>/<MÃ>/h        khách → chủ phòng   { from, data } | { from, bye }
 *   <tiền tố>/<giao thức>/<MÃ>/p/<id>   chủ phòng → 1 khách { data }
 *   <tiền tố>/<giao thức>/<MÃ>/all      chủ phòng → mọi khách { bye } (di chúc khi chủ phòng rớt mạng)
 *
 * Mỗi bên nối SONG SONG tới nhiều máy chủ. Khách gửi lời chào qua mọi máy chủ đã nối; chủ phòng
 * trả lời qua máy chủ mà lời chào tới ĐẦU TIÊN, từ đó hai bên "khóa" vào máy chủ đó.
 *
 * Kết nối trả về có cùng giao diện với DataConnection của PeerJS (on/send/close/open) nên
 * module chủ phòng và khách dùng chung một logic cho cả hai đường truyền.
 *
 * Máy chủ MQTT công cộng không bảo đảm giao tin (QoS 0, có lúc rớt/kết nối lại), nên mỗi
 * kết nối chạy thêm lớp TRUYỀN TIN CẬY (ReliableChannel): đánh số từng tin, bên nhận báo đã nhận,
 * tin chưa được báo nhận tự gửi lại, bên nhận sắp xếp đúng thứ tự và bỏ tin trùng.
 */
import { NET_PROTOCOL, RELAY_BROKERS, RELAY_TOPIC, MQTT_URLS } from '../config.js';

/** Bộ phát sự kiện tối giản */
class Emitter {
  constructor() {
    this.handlers = {};
  }

  on(type, fn) {
    (this.handlers[type] = this.handlers[type] || []).push(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    this.handlers[type] = (this.handlers[type] || []).filter((h) => h !== fn);
  }

  emit(type, ...args) {
    (this.handlers[type] || []).slice().forEach((fn) => fn(...args));
  }
}

/**
 * Lớp truyền tin cậy trên một đường truyền có thể mất tin / đến sai thứ tự.
 * Gói gửi đi: { s: số thứ tự, d: [các tin], a: đã nhận liên tục tới số này } hoặc chỉ { a } (báo nhận).
 * Các tin phát sinh gần như cùng lúc được gom chung một gói để giảm số tin gửi qua máy chủ công cộng
 * (máy chủ công cộng giới hạn số tin mỗi giây).
 */
const BATCH_MS = 30; // gom tin trong khoảng này thành một gói
const BATCH_MAX = 40; // số tin tối đa trong một gói
const RESEND_MS = 900; // tin chưa được báo nhận sau chừng này thì gửi lại
const MAX_UNACKED = 600; // quá nhiều tin không được báo nhận: coi như mất kết nối

class ReliableChannel {
  constructor(rawSend, deliver, onDead) {
    this.rawSend = rawSend;
    this.deliver = deliver;
    this.onDead = onDead;
    this.sent = 0;
    this.unacked = new Map(); // số thứ tự → { d, at }
    this.next = 1; // số thứ tự đang chờ nhận tiếp theo
    this.early = new Map(); // tin đến sớm (sai thứ tự) chờ giao
    this.ackTimer = null;
    this.outbox = [];
    this.flushTimer = null;
    this.timer = setInterval(() => this.resend(), 450);
  }

  get acked() {
    return this.next - 1;
  }

  send(d) {
    this.outbox.push(d);
    if (this.outbox.length >= BATCH_MAX) this.flush();
    else if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), BATCH_MS);
  }

  /** Đóng gói các tin đang chờ thành một gói đánh số */
  flush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.outbox.length) return;
    const d = this.outbox;
    this.outbox = [];
    const s = ++this.sent;
    this.unacked.set(s, { d, at: Date.now() });
    if (this.unacked.size > MAX_UNACKED) {
      this.onDead();
      return;
    }
    this.rawSend({ s, d, a: this.acked });
  }

  /** Gói nhận được từ đường truyền: xử lý báo nhận, xếp thứ tự, giao dữ liệu, rồi báo nhận lại */
  receive(pkt) {
    if (Number.isInteger(pkt.a)) {
      for (const s of this.unacked.keys()) {
        if (s > pkt.a) break;
        this.unacked.delete(s);
      }
    }
    if (!Number.isInteger(pkt.s)) return;
    if (pkt.s >= this.next && !this.early.has(pkt.s)) this.early.set(pkt.s, pkt.d);
    while (this.early.has(this.next)) {
      const d = this.early.get(this.next);
      this.early.delete(this.next);
      this.next++;
      (Array.isArray(d) ? d : [d]).forEach((m) => this.deliver(m));
    }
    this.scheduleAck();
  }

  scheduleAck() {
    if (this.ackTimer) return;
    this.ackTimer = setTimeout(() => {
      this.ackTimer = null;
      this.rawSend({ a: this.acked });
    }, 60);
  }

  resend(force = false) {
    const now = Date.now();
    let n = 0;
    for (const [s, u] of this.unacked) {
      if (!force && now - u.at < RESEND_MS) continue;
      u.at = now;
      this.rawSend({ s, d: u.d, a: this.acked });
      if (++n >= 60) break;
    }
  }

  stop() {
    clearInterval(this.timer);
    clearTimeout(this.ackTimer);
    clearTimeout(this.flushTimer);
  }
}

const params = () => new URLSearchParams(window.location.search);

/** Danh sách máy chủ MQTT: tham số ?mqtt=url1,url2 (thử nghiệm / tự dựng) ưu tiên hơn cấu hình */
function brokerUrls() {
  const custom = params().get('mqtt');
  return custom ? custom.split(',').map((s) => s.trim()).filter(Boolean) : [...RELAY_BROKERS];
}

/** ?net=relay: bỏ qua kết nối ngang hàng, vào phòng thẳng bằng kênh chuyển tiếp */
export const relayForced = () => params().get('net') === 'relay';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => {
      s.remove();
      reject(new Error(`Không tải được ${src}`));
    };
    document.head.appendChild(s);
  });
}

let mqttLoading = null;

/** Tải thư viện MQTT.js (thử lần lượt các CDN) */
export function loadMqtt() {
  if (window.mqtt && window.mqtt.connect) return Promise.resolve();
  if (!mqttLoading) {
    mqttLoading = (async () => {
      for (const url of MQTT_URLS) {
        if (window.mqtt && window.mqtt.connect) return;
        try {
          await loadScript(url);
        } catch (e) {
          /* thử CDN tiếp theo */
        }
      }
      if (!(window.mqtt && window.mqtt.connect)) {
        mqttLoading = null;
        throw new Error('Không tải được thư viện kết nối chuyển tiếp (MQTT).');
      }
    })();
  }
  return mqttLoading;
}

export const randomId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
};

function topicsFor(code) {
  const base = `${RELAY_TOPIC}/${NET_PROTOCOL}/${code}`;
  return { host: `${base}/h`, all: `${base}/all`, peer: (id) => `${base}/p/${id}` };
}

function parse(payload) {
  try {
    const msg = JSON.parse(typeof payload === 'string' ? payload : new TextDecoder().decode(payload));
    return msg && typeof msg === 'object' ? msg : null;
  } catch (e) {
    return null;
  }
}

/** Một kết nối tới một máy chủ MQTT */
class Broker {
  constructor(url, { will, subscribe, onMessage, onConnect }) {
    this.url = url;
    this.everConnected = false;
    this.failures = 0;
    this.client = window.mqtt.connect(url, {
      clientId: `ctp_${randomId()}`,
      clean: true,
      keepalive: 20,
      connectTimeout: 8000,
      reconnectPeriod: 3000,
      will,
    });
    this.client.on('connect', () => {
      this.everConnected = true;
      subscribe.forEach((topic) => this.client.subscribe(topic, { qos: 0 }));
      if (onConnect) onConnect(this);
    });
    this.client.on('message', (topic, payload) => onMessage(this, topic, payload));
    // Lỗi của từng máy chủ không làm hỏng cả kênh
    this.client.on('error', () => {});
    // Máy chủ bị chặn / không tồn tại: thử 3 lần rồi thôi
    this.client.on('close', () => {
      if (!this.everConnected && ++this.failures >= 3) this.client.end(true);
    });
  }

  get connected() {
    return this.client.connected;
  }

  publish(topic, msg) {
    if (this.client.connected) this.client.publish(topic, JSON.stringify(msg), { qos: 0 });
  }

  /** Ngắt có chào (gói DISCONNECT) nên máy chủ KHÔNG phát di chúc */
  end() {
    try {
      this.client.end(false);
    } catch (e) {
      /* đã đóng */
    }
  }
}

/** Kết nối ảo phía chủ phòng tới một khách — cùng giao diện DataConnection của PeerJS */
class RelayConnection extends Emitter {
  constructor(peer, rawSend, onClose) {
    super();
    this.peer = peer;
    this.open = true;
    this.relay = true;
    this.onClose = onClose;
    this.channel = new ReliableChannel(rawSend, (d) => this.emit('data', d), () => this.close());
  }

  send(data) {
    if (this.open) this.channel.send(data);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.channel.stop();
    if (this.onClose) this.onClose();
    this.emit('close');
  }
}

// ===================================================================
// Phía CHỦ PHÒNG
// ===================================================================
/** Lắng nghe khách vào phòng qua kênh chuyển tiếp; phát sự kiện 'connection' (RelayConnection) */
export class RelayHub extends Emitter {
  constructor(code) {
    super();
    this.topics = topicsFor(code);
    this.brokers = [];
    this.links = new Map(); // id khách → { conn, broker }
    this.stopped = false;
    this.failed = false;
  }

  get readyCount() {
    return this.brokers.filter((b) => b.connected).length;
  }

  /** Chờ tới khi có ít nhất 1 máy chủ nối được (true) hoặc hết giờ / không dùng được (false) */
  whenReady(timeoutMs) {
    return new Promise((resolve) => {
      if (this.readyCount > 0) {
        resolve(true);
        return;
      }
      if (this.failed) {
        resolve(false);
        return;
      }
      let off = () => {};
      const done = (ok) => {
        clearTimeout(timer);
        off();
        resolve(ok);
      };
      off = this.on('status', (count) => {
        if (count > 0) done(true);
        else if (this.failed) done(false);
      });
      const timer = setTimeout(() => done(this.readyCount > 0), timeoutMs);
    });
  }

  async start() {
    try {
      await loadMqtt();
    } catch (e) {
      this.failed = true;
      this.emit('status', 0);
      return;
    }
    if (this.stopped) return;
    const will = { topic: this.topics.all, payload: JSON.stringify({ bye: true }), qos: 0, retain: false };
    brokerUrls().forEach((url) => {
      this.brokers.push(
        new Broker(url, {
          will,
          subscribe: [this.topics.host],
          onMessage: (broker, topic, payload) => this.onMessage(broker, topic, payload),
          onConnect: () => this.emit('status', this.readyCount),
        })
      );
    });
  }

  onMessage(broker, topic, payload) {
    if (topic !== this.topics.host) return;
    const msg = parse(payload);
    if (!msg || typeof msg.from !== 'string' || !msg.from) return;
    const id = msg.from.slice(0, 40);
    let link = this.links.get(id);
    if (msg.bye) {
      // Khách rớt mạng (di chúc MQTT)
      if (link && link.broker === broker) link.conn.close();
      return;
    }
    if (!link) {
      // Chỉ lời chào (tin số 1) mới mở kết nối mới
      const first = Array.isArray(msg.d) ? msg.d[0] : msg.d;
      if (msg.s !== 1 || !first || first.t !== 'hello') return;
      const conn = new RelayConnection(
        id,
        (pkt) => broker.publish(this.topics.peer(id), pkt),
        () => this.links.delete(id)
      );
      link = { conn, broker };
      this.links.set(id, link);
      this.emit('connection', conn);
    } else if (link.broker !== broker) {
      // Bản trùng của cùng tin nhắn đi qua máy chủ khác
      return;
    }
    if (link.conn.open) link.conn.channel.receive(msg);
  }

  stop() {
    this.stopped = true;
    [...this.links.values()].forEach(({ conn }) => conn.close());
    this.brokers.forEach((b) => b.end());
    this.brokers = [];
  }
}

// ===================================================================
// Phía KHÁCH
// ===================================================================
/** Kết nối tới chủ phòng qua kênh chuyển tiếp — cùng giao diện DataConnection của PeerJS */
export class RelayLink extends Emitter {
  constructor(code) {
    super();
    this.id = randomId();
    this.peer = `relay:${code}`;
    this.open = true;
    this.relay = true;
    this.topics = topicsFor(code);
    this.brokers = [];
    this.locked = null; // máy chủ đã chọn (nơi chủ phòng trả lời đầu tiên)
    this.channel = new ReliableChannel((pkt) => this.publish(pkt), (d) => this.emit('data', d), () => this.close());
  }

  /** Gửi một gói: đã chọn máy chủ thì gửi qua đó, chưa thì gửi qua mọi máy chủ đang nối */
  publish(pkt) {
    const msg = { from: this.id, ...pkt };
    if (this.locked) this.locked.publish(this.topics.host, msg);
    else this.brokers.forEach((b) => b.publish(this.topics.host, msg));
  }

  async start() {
    await loadMqtt();
    if (!this.open) return;
    const will = { topic: this.topics.host, payload: JSON.stringify({ from: this.id, bye: true }), qos: 0, retain: false };
    brokerUrls().forEach((url) => {
      this.brokers.push(
        new Broker(url, {
          will,
          subscribe: [this.topics.peer(this.id), this.topics.all],
          onMessage: (broker, topic, payload) => this.onMessage(broker, topic, payload),
          // Máy chủ nối muộn: gửi ngay các tin chưa được báo nhận (ví dụ lời chào)
          onConnect: () => {
            if (!this.locked) this.channel.resend(true);
          },
        })
      );
    });
  }

  send(data) {
    if (this.open) this.channel.send(data);
  }

  onMessage(broker, topic, payload) {
    const msg = parse(payload);
    if (!msg) return;
    if (topic === this.topics.all) {
      // Chủ phòng rớt mạng
      if (msg.bye && (!this.locked || this.locked === broker)) this.close();
      return;
    }
    if (topic !== this.topics.peer(this.id)) return;
    if (!this.locked) {
      this.locked = broker;
      this.brokers.forEach((b) => {
        if (b !== broker) b.end();
      });
      this.brokers = [broker];
    } else if (broker !== this.locked) {
      return;
    }
    this.channel.receive(msg);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.channel.stop();
    this.brokers.forEach((b) => b.end());
    this.brokers = [];
    this.emit('close');
  }
}
