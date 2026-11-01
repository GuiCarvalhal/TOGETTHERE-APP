// Minimal IMAP client over a real TLS socket (node:tls).
//
// The runtime's Deno.connectTls is a shim with a non-standard read() signature,
// so the transport uses node:tls — the runtime implements it natively. This
// client speaks just enough IMAP4rev1 to read an INBOX read-only: LOGIN,
// SELECT and UID FETCH. It buffers bytes as latin1 (one char per byte) so
// literals survive intact, and it never logs credentials.

import tls from 'node:tls';
import { Buffer } from 'node:buffer';

const decoder = new TextDecoder('utf-8');

function latin1ToBytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

// Exported so the SASL exchange can be exercised without a live mail server.
export class ImapSession {
  socket: any;
  timeoutMs: number;
  buffer: string;
  tagSeq: number;
  pending: any;
  failed: Error | null;
  closed: boolean;

  constructor(socket: any, timeoutMs: number) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.buffer = '';
    this.tagSeq = 0;
    this.pending = null;
    this.failed = null;
    this.closed = false;

    // latin1 decoding keeps every byte as one char, so literals stay binary-safe.
    socket.on('data', (chunk: any) => {
      this.buffer += Buffer.isBuffer(chunk) ? chunk.toString('latin1') : String(chunk);
      this.wake();
    });
    socket.on('error', (error: any) => {
      this.failed = error instanceof Error ? error : new Error(String(error));
      this.wake();
    });
    socket.on('close', () => {
      this.closed = true;
      this.wake();
    });
  }

  wake() {
    if (!this.pending) return;
    const waiter = this.pending;
    this.pending = null;
    waiter.resolve();
  }

  waitForData() {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error('timeout'));
      }, this.timeoutMs);
      this.pending = {
        resolve: () => { clearTimeout(timer); resolve(); },
        reject: (error: any) => { clearTimeout(timer); reject(error); },
      };
    });
  }

  assertAlive() {
    if (this.failed) throw new Error(this.failed.message || 'socket_error');
    if (this.closed) throw new Error('imap_closed');
  }

  async readLine() {
    for (;;) {
      const index = this.buffer.indexOf('\r\n');
      if (index >= 0) {
        const line = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 2);
        return line;
      }
      this.assertAlive();
      await this.waitForData();
    }
  }

  async readBytes(size: number) {
    while (this.buffer.length < size) {
      this.assertAlive();
      await this.waitForData();
    }
    const chunk = this.buffer.slice(0, size);
    this.buffer = this.buffer.slice(size);
    return latin1ToBytes(chunk);
  }

  write(line: string) {
    this.socket.write(Buffer.from(`${line}\r\n`, 'latin1'));
  }

  // Runs one tagged command. Returns the response in wire order as text lines
  // and literal byte blocks, plus the final OK / NO / BAD status.
  async run(command: string) {
    this.tagSeq += 1;
    const tag = `a${this.tagSeq}`;
    this.write(`${tag} ${command}`);

    const parts: any[] = [];
    for (;;) {
      let current = await this.readLine();
      for (;;) {
        const marker = current.match(/\{(\d+)\}$/);
        if (!marker) break;
        parts.push({ line: current.slice(0, current.length - marker[0].length) });
        parts.push({ literal: await this.readBytes(Number(marker[1])) });
        current = await this.readLine();
      }
      parts.push({ line: current });

      const trimmed = current.trim();
      if (trimmed.startsWith(`${tag} `)) {
        const status = (trimmed.split(' ')[1] || '').toUpperCase();
        return { status, parts };
      }
    }
  }

  // Runs one SASL authentication exchange (AUTHENTICATE <mechanism>). The server
  // opens with a `+` continuation, we answer with the payload; on failure some
  // servers (Yahoo) send a second `+` challenge carrying a base64 error, which
  // must be acknowledged with an empty line before they report the final NO.
  async authenticateSasl(mechanism: string, payload: string) {
    this.tagSeq += 1;
    const tag = `a${this.tagSeq}`;
    this.write(`${tag} AUTHENTICATE ${mechanism}`);

    const parts: any[] = [];
    let answered = false;
    for (;;) {
      const current = await this.readLine();
      const trimmed = current.trim();
      if (trimmed.startsWith('+')) {
        parts.push({ line: current });
        this.write(answered ? '' : payload);
        answered = true;
        continue;
      }
      parts.push({ line: current });
      if (trimmed.startsWith(`${tag} `)) {
        const status = (trimmed.split(' ')[1] || '').toUpperCase();
        return { status, parts };
      }
    }
  }

  async close() {
    try {
      this.write('LOGOUT');
    } catch {
      // Socket already gone — nothing to shut down.
    }
    try {
      this.socket.end();
    } catch {
      // ignore
    }
  }
}

export async function openImap(endpoint: { host: string; port: number }, { timeoutMs = 15000 } = {}) {
  const socket = await new Promise<any>((resolve, reject) => {
    let settled = false;
    const connection = tls.connect({
      host: endpoint.host,
      port: endpoint.port,
      servername: endpoint.host,
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        connection.destroy();
      } catch {
        // ignore
      }
      reject(new Error('timeout'));
    }, timeoutMs);
    const ready = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(connection);
    };
    connection.once('secureConnect', ready);
    connection.once('connect', ready);
    connection.once('error', (error: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });

  const session = new ImapSession(socket, timeoutMs);
  const greeting = await session.readLine();
  if (!/^\*\s+(OK|PREAUTH)/i.test(greeting.trim())) {
    await session.close();
    throw new Error('imap_greeting_failed');
  }
  return session;
}

export function quoteImap(value: unknown) {
  return `"${String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function decodeImapBytes(bytes: Uint8Array) {
  return decoder.decode(bytes);
}

// Walks a FETCH response and pairs each literal block with the UID announced on
// the line that introduced it.
export function literalsByUid(result: any) {
  const map = new Map<number, { bytes: Uint8Array; internalDate: string }>();
  let currentUid = 0;
  let currentInternalDate = '';
  for (const part of result?.parts || []) {
    if (typeof part.line === 'string') {
      const uid = part.line.match(/UID\s+(\d+)/i);
      if (uid) currentUid = Number(uid[1]);
      const internal = part.line.match(/INTERNALDATE\s+"([^"]*)"/i);
      if (internal) currentInternalDate = internal[1];
    } else if (part.literal && currentUid) {
      map.set(currentUid, { bytes: part.literal, internalDate: currentInternalDate });
    }
  }
  return map;
}

export function searchUids(result: any) {
  const uids: number[] = [];
  for (const part of result?.parts || []) {
    if (typeof part.line !== 'string') continue;
    if (!/^\*\s+SEARCH/i.test(part.line.trim())) continue;
    const matches = part.line.replace(/^\*\s+SEARCH\s*/i, '').match(/\d+/g) || [];
    for (const value of matches) uids.push(Number(value));
  }
  return uids.filter((value) => Number.isFinite(value) && value > 0);
}