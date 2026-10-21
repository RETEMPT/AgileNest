import { inflateRawSync } from "node:zlib";
import { AppError } from "@/modules/core";

const MAX_EXPANDED = 40 * 1024 * 1024;
const MAX_PART = 8 * 1024 * 1024;
const fail = () => new AppError("Office 文件结构无效、受加密保护或超出安全读取限制");

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
export function officeCrc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}

export function officePackage(bytes: Uint8Array, signal?: AbortSignal) {
  const data = Buffer.from(bytes);
  if (data.length < 22 || data.length > 10 * 1024 * 1024) throw fail();
  let end = -1;
  for (let offset = data.length - 22; offset >= Math.max(0, data.length - 65557); offset--) {
    if (data.readUInt32LE(offset) === 0x06054b50 && offset + 22 + data.readUInt16LE(offset + 20) === data.length) { end = offset; break; }
  }
  if (end < 0 || data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6)) throw fail();
  const count = data.readUInt16LE(end + 10), size = data.readUInt32LE(end + 12), start = data.readUInt32LE(end + 16);
  if (!count || count > 2048 || count !== data.readUInt16LE(end + 8) || start + size !== end) throw fail();
  const parts = new Map<string, { offset: number; compressed: number; expanded: number; method: number; crc: number }>();
  const ranges: Array<[number, number]> = [];
  let offset = start, total = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let index = 0; index < count; index++) {
    signal?.throwIfAborted();
    if (offset + 46 > end || data.readUInt32LE(offset) !== 0x02014b50) throw fail();
    const flags = data.readUInt16LE(offset + 8), method = data.readUInt16LE(offset + 10);
    const crc = data.readUInt32LE(offset + 16), compressed = data.readUInt32LE(offset + 20), expanded = data.readUInt32LE(offset + 24);
    const nameLength = data.readUInt16LE(offset + 28), extra = data.readUInt16LE(offset + 30), comment = data.readUInt16LE(offset + 32);
    const local = data.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extra + comment;
    if (next > end || !nameLength || nameLength > 512 || flags & ~0x080e || flags & 1 || ![0, 8].includes(method) || data.readUInt16LE(offset + 34) || (data.readUInt32LE(offset + 38) >>> 16 & 0xf000) === 0xa000) throw fail();
    let name: string;
    try { name = decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength)); } catch { throw fail(); }
    if (/[\\\x00-\x1f:%?#]/.test(name) || name.startsWith("/") || name.split("/").some((piece, i, all) => piece === "." || piece === ".." || !piece && i !== all.length - 1) || parts.has(name.toLowerCase())) throw fail();
    total += expanded;
    if (expanded > MAX_PART || total > MAX_EXPANDED || expanded > Math.max(compressed, 1) * 200 || local + 30 > start || data.readUInt32LE(local) !== 0x04034b50) throw fail();
    const localNameLength = data.readUInt16LE(local + 26), localExtra = data.readUInt16LE(local + 28);
    const payload = local + 30 + localNameLength + localExtra;
    if (data.readUInt16LE(local + 6) !== flags || data.readUInt16LE(local + 8) !== method || localNameLength !== nameLength || !data.subarray(local + 30, local + 30 + localNameLength).equals(data.subarray(offset + 46, offset + 46 + nameLength)) || payload + compressed > start) throw fail();
    if (!(flags & 8) && (data.readUInt32LE(local + 14) !== crc || data.readUInt32LE(local + 18) !== compressed || data.readUInt32LE(local + 22) !== expanded)) throw fail();
    ranges.push([local, payload + compressed]);
    parts.set(name.toLowerCase(), { offset: payload, compressed, expanded, method, crc });
    offset = next;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  if (offset !== end || ranges.some((range, index) => index > 0 && range[0] < ranges[index - 1][1])) throw fail();
  const cache = new Map<string, string>();
  function xml(name: string): string {
    signal?.throwIfAborted();
    const key = name.toLowerCase();
    if (cache.has(key)) return cache.get(key)!;
    const part = parts.get(key);
    if (!part) throw new AppError("Office 文件缺少必要的正文内容");
    const packed = data.subarray(part.offset, part.offset + part.compressed);
    let unpacked: Buffer;
    try { unpacked = part.method === 0 ? packed : inflateRawSync(packed, { maxOutputLength: MAX_PART }); } catch { throw fail(); }
    if (unpacked.length !== part.expanded || officeCrc32(unpacked) !== part.crc) throw fail();
    let text: string;
    try { text = decoder.decode(unpacked); } catch { throw fail(); }
    if (/<!(?:DOCTYPE|ENTITY)\b/i.test(text) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw fail();
    cache.set(key, text);
    return text;
  }
  return { xml, names: [...parts.keys()] };
}

export type OfficeXmlEvent = { name: string; namespace: string; attributes: Record<string, string>; closing: boolean; text?: string };
function entities(value: string) {
  return value.replace(/&(amp|lt|gt|quot|apos|#(?:[0-9]{1,8}|x[0-9a-fA-F]{1,6}));|&/g, (whole, entity: string | undefined) => {
    const predefined: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (entity && Object.hasOwn(predefined, entity)) return predefined[entity];
    if (entity && /^#(?:[0-9]+|x[0-9a-f]+)$/i.test(entity)) {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (code === 9 || code === 10 || code === 13 || code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) && code !== 0xfffe && code !== 0xffff) return String.fromCodePoint(code);
    }
    throw fail();
  });
}

// A bounded OOXML event reader: no DTD, entity definitions, external resolution or DOM.
export function officeXml(text: string, visit: (event: OfficeXmlEvent) => void) {
  const stack: Array<{ qualified: string; name: string; namespace: string; namespaces: Record<string, string> }> = [];
  const token = /<!--[\s\S]*?-->|<\?xml\s[^?]*\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z_][\w.:-]*(?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*\/?>|[^<]+/gy;
  let offset = 0, count = 0, roots = 0;
  while (offset < text.length) {
    token.lastIndex = offset;
    const match = token.exec(text);
    if (!match || ++count > 200000) throw fail();
    const raw = match[0]; offset = token.lastIndex;
    if (raw.startsWith("<!--") || raw.startsWith("<?xml")) continue;
    if (!raw.startsWith("<") || raw.startsWith("<![CDATA[")) {
      const value = raw.startsWith("<![CDATA[") ? raw.slice(9, -3) : entities(raw);
      if (!stack.length) { if (value.trim()) throw fail(); continue; }
      const current = stack[stack.length - 1];
      visit({ name: current.name, namespace: current.namespace, attributes: {}, closing: false, text: value });
      continue;
    }
    const qualified = /^<\/?([^\s/>]+)/.exec(raw)![1];
    const closing = raw.startsWith("</"), selfClosing = raw.endsWith("/>");
    if (closing) {
      const current = stack.pop();
      if (!current || current.qualified !== qualified || !/^<\/[^\s/>]+\s*>$/.test(raw)) throw fail();
      visit({ name: current.name, namespace: current.namespace, attributes: {}, closing: true });
      continue;
    }
    if (stack.length > 128 || !stack.length && ++roots > 1) throw fail();
    const namespaces = { ...(stack[stack.length - 1]?.namespaces ?? {}) }, attrs: Record<string, string> = Object.create(null);
    let attributeCount = 0;
    for (const attr of raw.matchAll(/\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/g)) {
      if (++attributeCount > 256) throw fail();
      if (Object.hasOwn(attrs, attr[1])) throw fail();
      attrs[attr[1]] = entities(attr[2] ?? attr[3]);
      if (attr[1] === "xmlns") namespaces[""] = attrs[attr[1]];
      else if (attr[1].startsWith("xmlns:")) namespaces[attr[1].slice(6)] = attrs[attr[1]];
    }
    const pieces = qualified.split(":");
    if (pieces.length > 2 || pieces.length === 2 && !namespaces[pieces[0]]) throw fail();
    const name = pieces[pieces.length - 1], namespace = namespaces[pieces.length === 2 ? pieces[0] : ""] ?? "";
    for (const [key, value] of Object.entries(attrs)) {
      const pair = key.split(":");
      if (pair.length === 2 && pair[0] !== "xmlns") {
        if (!namespaces[pair[0]] && pair[0] !== "xml") throw fail();
        attrs[`{${namespaces[pair[0]] ?? "http://www.w3.org/XML/1998/namespace"}}${pair[1]}`] = value;
      }
    }
    visit({ name, namespace, attributes: attrs, closing: false });
    if (selfClosing) visit({ name, namespace, attributes: {}, closing: true });
    else stack.push({ qualified, name, namespace, namespaces });
  }
  if (stack.length || roots !== 1) throw fail();
}
