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
  constructor(peer, sendFn, onClose) {
    super();
    this.peer = peer;
    this.open = true;
    this.relay = true;
    this.sendFn = sendFn;
    this.onClose = onClose;
  }

  send(data) {
    if (this.open) this.sendFn(data);
  }

  close() {
    if (!this.open) return;
    this.open = false;
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
      // Chỉ lời chào mới mở kết nối mới
      if (!msg.data || msg.data.t !== 'hello') return;
      const conn = new RelayConnection(
        id,
        (data) => broker.publish(this.topics.peer(id), { data }),
        () => this.links.delete(id)
      );
      link = { conn, broker };
      this.links.set(id, link);
      this.emit('connection', conn);
    } else if (link.broker !== broker) {
      // Bản trùng của cùng tin nhắn đi qua máy chủ khác
      return;
    }
    link.conn.emit('data', msg.data);
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
    this.pending = null; // lời chào chờ gửi tới các máy chủ nối muộn
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
          onConnect: (broker) => {
            if (!this.locked && this.pending) broker.publish(this.topics.host, { from: this.id, data: this.pending });
          },
        })
      );
    });
  }

  send(data) {
    if (!this.open) return;
    const msg = { from: this.id, data };
    if (this.locked) {
      this.locked.publish(this.topics.host, msg);
      return;
    }
    // Chưa chọn máy chủ: gửi qua mọi máy chủ đã nối (và cả máy chủ nối muộn)
    this.pending = data;
    this.brokers.forEach((b) => b.publish(this.topics.host, msg));
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
      this.pending = null;
      this.brokers.forEach((b) => {
        if (b !== broker) b.end();
      });
      this.brokers = [broker];
    } else if (broker !== this.locked) {
      return;
    }
    this.emit('data', msg.data);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.brokers.forEach((b) => b.end());
    this.brokers = [];
    this.emit('close');
  }
}
