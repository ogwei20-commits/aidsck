#!/usr/bin/env node
/**
 * 打印本机可被局域网访问的地址。
 *
 * 为什么需要它：`npm run dev` 默认只监听 localhost，
 * 手机连同一 Wi-Fi 也打不开；而且大多数人不知道自己机器的局域网 IP。
 * 这个脚本只做一件事——把可以照着敲的地址列出来。
 */
import os from "node:os";

const PORT = process.env.PORT || "3000";
const interfaces = os.networkInterfaces();

const candidates = [];
for (const [name, addrs] of Object.entries(interfaces)) {
  for (const addr of addrs ?? []) {
    // 只取 IPv4 且非回环：::1 / 127.0.0.1 对别的设备没有意义
    if (addr.family !== "IPv4" || addr.internal) continue;
    candidates.push({ name, address: addr.address });
  }
}

console.log("");
console.log("局域网访问地址（手机、另一台电脑连同一个 Wi-Fi 后打开）：");
if (candidates.length === 0) {
  console.log("  没有找到可用的局域网网卡。请确认这台机器已连上网络。");
} else {
  for (const c of candidates) {
    console.log(`  http://${c.address}:${PORT}    (${c.name})`);
  }
}
console.log("");
console.log("本机访问：  http://localhost:" + PORT);
console.log("");
console.log("打不开时按顺序检查：");
console.log("  1. 服务是否用 npm run start:lan 启动（默认的 npm start 只监听本机）");
console.log("  2. 系统防火墙是否放行了 Node 或该端口（Windows 首次运行会弹窗，要允许专用网络）");
console.log("  3. 两台设备是否在同一网段（公司网络或访客 Wi-Fi 常做设备隔离）");
console.log("");
console.log("注意：这是内网地址，只给同一网络里的设备用。不要把它映射到公网——");
console.log("      当前版本没有登录认证，公网暴露等于把数据库操作权交给任何人。");
