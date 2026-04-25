/**
 * Tier 1 Strong paired runtime — establishes a live WebRTC data channel
 * between two paired Stele artifacts.
 *
 * Trust model:
 * - Pair-of-keys (ECDH P-256) is in the artifact manifest; the same shared
 *   AES-GCM key derived in `pair-crypto.ts` encrypts every data-channel
 *   message. The signaling server sees envelopes (SDP / ICE) but never
 *   plaintext data after the channel opens.
 * - Initiator role is decided by lex-compare of the two peers' SPKI public
 *   keys — the larger creates the offer. No coordination round trip needed.
 * - Identity: each peer derives its own SPKI public key from its private
 *   key in the manifest and includes it as `from` on signaling messages.
 *   Receivers ignore messages whose `from` matches their own identity.
 *
 * Limitations of this v1:
 * - Two peers per room. N-peer (poker, etc.) is the next step.
 * - STUN only — no TURN fallback. Most home/mobile networks connect; some
 *   strict corporate / symmetric NATs won't.
 * - HTTP polling, not WebSockets, on the signaling server (1.5 s cadence).
 *   Handshake completes in ~3–5 s; once the data channel is up, messages
 *   are direct peer-to-peer with no signaling involvement.
 * - String payloads only. Binary support is a small follow-up.
 */

import {
  encryptWithSharedKey,
  decryptWithSharedKey,
  deriveSharedKeyFromBase64,
} from './pair-crypto';

export type PairStatus =
  | 'idle'
  | 'connecting'        // signaling handshake in progress
  | 'waiting-for-partner'
  | 'connected'         // data channel open, ready to send
  | 'disconnected'
  | 'error';

export interface PairConnectOptions {
  pairingId: string;
  privateKeyB64: string;        // PKCS8 base64 (matches manifest.private_key)
  partnerPublicKeyB64: string;  // SPKI base64  (matches manifest.partner_pubkey)
  signalingUrl: string;         // root URL of @stele/signaling worker, e.g. https://…/
  /** STUN servers; defaults to a public Google STUN server. Override for self-hosted. */
  iceServers?: RTCIceServer[];
  /** Polling interval for the signaling endpoint in ms. Default 1500. */
  pollIntervalMs?: number;
}

export interface PairConnection {
  send(data: string): Promise<void>;
  close(): void;
  readonly status: PairStatus;
  onMessage(handler: (data: string) => void): () => void;
  onStatusChange(handler: (status: PairStatus) => void): () => void;
}

const SUBTLE: SubtleCrypto = (globalThis.crypto ?? (globalThis as unknown as { msCrypto?: Crypto }).msCrypto)?.subtle as SubtleCrypto;

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes as Uint8Array<ArrayBuffer>;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

/** Derive the SPKI public key (base64) from a PKCS8 ECDH P-256 private key (base64). */
async function derivePublicKeyB64(privateKeyB64: string): Promise<string> {
  const priv = await SUBTLE.importKey(
    'pkcs8',
    base64ToBytes(privateKeyB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey'],
  );
  const jwk = await SUBTLE.exportKey('jwk', priv);
  // Strip the private scalar to get the public-only JWK.
  const pubJwk: JsonWebKey = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true };
  const pub = await SUBTLE.importKey('jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  const spki = await SUBTLE.exportKey('spki', pub);
  return bytesToBase64(spki);
}

interface SignalEnvelope {
  from: string;
  payload: SignalPayload;
  ts: number;
}

type SignalPayload =
  | { kind: 'hello' }
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

interface PollResponse {
  messages: SignalEnvelope[];
  now: number;
}

async function postSignal(signalingUrl: string, pairingId: string, from: string, payload: SignalPayload): Promise<void> {
  const url = signalingUrl.replace(/\/$/, '') + '/messages';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pairingId, from, payload }),
  });
  if (!resp.ok) throw new Error(`Signaling POST failed: ${resp.status} ${resp.statusText}`);
}

/** Serialise this peer's outbound posts so concurrent offer + ICE writes
 *  don't collide on the per-peer KV row at the server. */
function makePostQueue(signalingUrl: string, pairingId: string, from: string) {
  let tail: Promise<void> = Promise.resolve();
  return (payload: SignalPayload) => {
    const next = tail.then(() => postSignal(signalingUrl, pairingId, from, payload));
    // Swallow rejections on the chain so one bad post doesn't break the queue.
    tail = next.catch(() => {});
    return next;
  };
}

async function pollSignals(signalingUrl: string, pairingId: string, peer: string, since: number): Promise<PollResponse> {
  const url = `${signalingUrl.replace(/\/$/, '')}/messages?pairingId=${encodeURIComponent(pairingId)}&peer=${encodeURIComponent(peer)}&since=${since}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Signaling GET failed: ${resp.status} ${resp.statusText}`);
  return await resp.json() as PollResponse;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Last-resort fallback ICE config. The signaling Worker normally serves
 * short-lived TURN credentials via /turn-credentials (Cloudflare Calls).
 * If that endpoint is unreachable or unconfigured we fall back to STUN —
 * connections only succeed for same-network pairs where mDNS / direct
 * UDP works.
 */
const FALLBACK_ICE: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

async function fetchIceServers(signalingUrl: string): Promise<RTCIceServer[]> {
  try {
    const resp = await fetch(`${signalingUrl.replace(/\/$/, '')}/turn-credentials`);
    if (!resp.ok) return FALLBACK_ICE;
    const data = await resp.json() as { iceServers?: RTCIceServer[] | RTCIceServer };
    if (!data.iceServers) return FALLBACK_ICE;
    return Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
  } catch (err) {
    console.warn('[pair-rtc] turn-credentials fetch failed, falling back to STUN:', err);
    return FALLBACK_ICE;
  }
}

export async function connectPair(opts: PairConnectOptions): Promise<PairConnection> {
  const pollIntervalMs = opts.pollIntervalMs ?? 1500;
  const iceServers = opts.iceServers ?? await fetchIceServers(opts.signalingUrl);

  const [sharedKey, myPubkeyB64] = await Promise.all([
    deriveSharedKeyFromBase64(opts.privateKeyB64, opts.partnerPublicKeyB64),
    derivePublicKeyB64(opts.privateKeyB64),
  ]);

  const isInitiator = myPubkeyB64 > opts.partnerPublicKeyB64;

  const pc = new RTCPeerConnection({ iceServers });
  let dataChannel: RTCDataChannel | null = null;
  let status: PairStatus = 'connecting';
  let cancelled = false;

  // Serialise this peer's outbound signals so the offer and trickled ICE
  // candidates don't race against each other in the worker's read-modify-write.
  const post = makePostQueue(opts.signalingUrl, opts.pairingId, myPubkeyB64);

  const messageHandlers = new Set<(data: string) => void>();
  const statusHandlers = new Set<(status: PairStatus) => void>();

  const setStatus = (s: PairStatus) => {
    if (s === status) return;
    status = s;
    for (const h of statusHandlers) try { h(s); } catch { /* swallow */ }
  };

  const setupChannel = (ch: RTCDataChannel) => {
    dataChannel = ch;
    ch.onopen = () => setStatus('connected');
    ch.onclose = () => setStatus('disconnected');
    ch.onerror = () => setStatus('error');
    ch.onmessage = async (ev) => {
      try {
        const { ciphertext, iv } = JSON.parse(ev.data as string);
        const plain = await decryptWithSharedKey(sharedKey, ciphertext, iv);
        for (const h of messageHandlers) try { h(plain); } catch { /* swallow */ }
      } catch (err) {
        console.error('[pair-rtc] decrypt failed:', err);
      }
    };
  };

  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return; // end-of-candidates sentinel — nothing to forward
    post({
      kind: 'ice',
      candidate: ev.candidate.toJSON(),
    }).catch((err) => console.warn('[pair-rtc] ICE post failed:', err));
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      setStatus('disconnected');
    }
  };

  // Symmetric "hello" handshake: both peers post hello immediately. The
  // initiator delays creating its offer until it has SEEN the responder's
  // hello in the room. This is what makes pairing order-insensitive — if
  // the initiator opens first and creates the offer immediately, Chrome's
  // RTCPeerConnection sits in have-local-offer for a long time, and when
  // the eventual answer arrives the ICE state has gone stale and the
  // checks never complete. By gating offer creation on partner presence,
  // pc + offer are always fresh when ICE checking begins.
  if (!isInitiator) {
    pc.ondatachannel = (ev) => setupChannel(ev.channel);
    setStatus('waiting-for-partner');
  }
  await post({ kind: 'hello' });

  // Poll the signaling server for partner messages.
  //
  // Among offers/answers we receive, only apply the LATEST one — earlier
  // ones from prior sessions never become the active SDP. ICE candidates
  // are applied additively; extras from stale sessions are harmless (the
  // new pc just ignores candidates it can't pair with).
  let since = 0;
  let appliedOfferTs = 0;
  let appliedAnswerTs = 0;
  let offerCreated = false; // initiator-side: have we created our offer yet?

  (async function pollLoop() {
    while (!cancelled) {
      try {
        const { messages, now } = await pollSignals(opts.signalingUrl, opts.pairingId, opts.partnerPublicKeyB64, since);
        since = now;

        // Look for partner presence (any message at all from them).
        const partnerPresent = messages.length > 0;

        // Initiator: create + post the offer once we've confirmed the
        // partner is online. Doing this BEFORE seeing them lets Chrome's
        // ICE state go stale before the answer arrives.
        if (isInitiator && !offerCreated && partnerPresent) {
          offerCreated = true;
          setupChannel(pc.createDataChannel('stele-pair'));
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await post({ kind: 'offer', sdp: offer.sdp ?? '' });
        }

        // Pick the latest offer / answer (ignore stale).
        let latestOffer: SignalEnvelope | null = null;
        let latestAnswer: SignalEnvelope | null = null;
        const iceMsgs: SignalEnvelope[] = [];

        for (const env of messages) {
          if (env.from === myPubkeyB64) continue;
          const p = env.payload;
          if (p.kind === 'offer') {
            if (!latestOffer || env.ts > latestOffer.ts) latestOffer = env;
          } else if (p.kind === 'answer') {
            if (!latestAnswer || env.ts > latestAnswer.ts) latestAnswer = env;
          } else if (p.kind === 'ice') {
            iceMsgs.push(env);
          }
          // 'hello' messages are presence-only; nothing else to do here.
        }

        try {
          if (latestOffer && !isInitiator && latestOffer.ts > appliedOfferTs) {
            appliedOfferTs = latestOffer.ts;
            const p = latestOffer.payload as { kind: 'offer'; sdp: string };
            await pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await post({ kind: 'answer', sdp: answer.sdp ?? '' });
          }
          if (latestAnswer && isInitiator && latestAnswer.ts > appliedAnswerTs) {
            appliedAnswerTs = latestAnswer.ts;
            const p = latestAnswer.payload as { kind: 'answer'; sdp: string };
            await pc.setRemoteDescription({ type: 'answer', sdp: p.sdp });
          }
          // Only add ICE candidates from the CURRENT session — anything older
          // than the latest offer/answer we applied is from a prior pairing
          // attempt with different ufrags. addIceCandidate would fail silently
          // for those, but the failed attempts can pollute Chrome's ICE state
          // and prevent the live candidates from establishing a connection.
          const currentSessionTs = Math.max(appliedOfferTs, appliedAnswerTs);
          for (const env of iceMsgs) {
            if (env.ts < currentSessionTs) continue;
            const p = env.payload as { kind: 'ice'; candidate: RTCIceCandidateInit };
            if (!p.candidate) continue;
            try { await pc.addIceCandidate(p.candidate); }
            catch { /* candidate from a partner pc that's no longer relevant */ }
          }
        } catch (err) {
          console.error('[pair-rtc] applying signal failed:', err);
        }
      } catch (err) {
        console.warn('[pair-rtc] poll failed (will retry):', err);
      }
      await sleep(pollIntervalMs);
    }
  })();

  return {
    async send(data: string) {
      if (!dataChannel || dataChannel.readyState !== 'open') {
        throw new Error(`pair.send: data channel is ${dataChannel?.readyState ?? 'not yet created'}`);
      }
      const enc = await encryptWithSharedKey(sharedKey, data);
      dataChannel.send(JSON.stringify(enc));
    },
    close() {
      cancelled = true;
      try { dataChannel?.close(); } catch { /* swallow */ }
      try { pc.close(); } catch { /* swallow */ }
      setStatus('disconnected');
    },
    get status() { return status; },
    onMessage(handler) {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },
    onStatusChange(handler) {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    },
  };
}
