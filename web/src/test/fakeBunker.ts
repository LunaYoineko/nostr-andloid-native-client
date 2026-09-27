import type { Filter } from "applesauce-core/helpers/filter";
import { normalizeURL } from "applesauce-core/helpers/url";
import type { PrivateKeySigner } from "applesauce-signers/signers/private-key-signer";
import { makeAuthEvent } from "nostr-tools/nip42";
import { decrypt, encrypt, getConversationKey } from "nostr-tools/nip44";
import {
  type EventTemplate,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  type NostrEvent,
} from "nostr-tools/pure";
import { BehaviorSubject, Observable, type Subscriber } from "rxjs";
import { vi } from "vitest";
import type { Nip46Pool, Nip46Relay } from "../signer/nip46";

/** 署名側が受けた要求（復号済み） */
export type BunkerRequest = { id: string; method: string; params: string[]; client: string };

/**
 * 署名側の応答。result = 成功、error = エラー応答、silent = 応答しない、
 * authUrl = auth_url を返す（after があれば続けて返す）
 */
export type BunkerReply =
  | { result: string }
  | { error: string }
  | { authUrl: string; after?: BunkerReply }
  | "silent";

/** AUTH のチャレンジを流せる偽のリレー */
export class FakeBunkerRelay implements Nip46Relay {
  readonly challenge$ = new BehaviorSubject<string | null>(null);
  readonly authenticate = vi.fn(async (signer: PrivateKeySigner) => {
    const challenge = this.challenge$.value;
    if (!challenge) throw new Error("no challenge");
    await signer.signEvent(makeAuthEvent(this.url, challenge));
    return { ok: true, from: this.url };
  });

  constructor(readonly url: string) {}
}

/**
 * 署名側（bunker）の偽物。NIP-46 のプール（subscription / publish / relay）として差し替える。
 * publish された kind:24133 を署名側の鍵で復号し、設定した応答を購読へ流す。実リレーには繋がない
 */
export class FakeBunker implements Nip46Pool {
  readonly secretKey = generateSecretKey();
  readonly remote = getPublicKey(this.secretKey);
  /** ユーザーの鍵（get_public_key / sign_event に使う） */
  readonly userKey = generateSecretKey();
  readonly user = getPublicKey(this.userKey);
  readonly requests: BunkerRequest[] = [];
  /** method ごとの応答。無ければ既定（connect / logout = ack、get_public_key = ユーザー、sign_event = ユーザーの鍵で署名） */
  readonly replies = new Map<string, BunkerReply | ((req: BunkerRequest) => BunkerReply)>();
  private readonly subs = new Set<{ filters: Filter[]; subscriber: Subscriber<NostrEvent> }>();
  private readonly relayMap = new Map<string, FakeBunkerRelay>();

  /** 開いている購読の数 */
  get openSubscriptions(): number {
    return this.subs.size;
  }

  /** bunker:// の URI（relay は既定で wss://relay.example） */
  uri(opts: { secret?: string; relays?: string[] } = {}): string {
    const params = new URLSearchParams();
    for (const relay of opts.relays ?? ["wss://relay.example"]) params.append("relay", relay);
    if (opts.secret) params.set("secret", opts.secret);
    return `bunker://${this.remote}?${params.toString()}`;
  }

  /** 受けた要求の method の並び */
  methods(): string[] {
    return this.requests.map((r) => r.method);
  }

  subscription = (_relays: string[], filters: Filter[]) =>
    new Observable<NostrEvent>((subscriber) => {
      const entry = { filters, subscriber };
      this.subs.add(entry);
      return () => {
        this.subs.delete(entry);
      };
    });

  publish = async (_relays: string[], event: NostrEvent) => {
    if (event.kind !== 24133 || !event.tags.some((t) => t[0] === "p" && t[1] === this.remote)) return [];
    const ck = getConversationKey(this.secretKey, event.pubkey);
    const { id, method, params } = JSON.parse(decrypt(event.content, ck)) as Omit<BunkerRequest, "client">;
    const req: BunkerRequest = { id, method, params, client: event.pubkey };
    this.requests.push(req);
    const configured = this.replies.get(method);
    const reply = typeof configured === "function" ? configured(req) : (configured ?? this.defaultReply(req));
    // 実際のリレーと同じく、publish が返った後に応答が届く
    queueMicrotask(() => this.respond(req, reply));
    return [{ ok: true, from: "wss://relay.example/" }];
  };

  relay(url: string): FakeBunkerRelay {
    const key = normalizeURL(url);
    let relay = this.relayMap.get(key);
    if (!relay) {
      relay = new FakeBunkerRelay(key);
      this.relayMap.set(key, relay);
    }
    return relay;
  }

  /** ユーザーの鍵で署名したイベントの JSON（sign_event の応答） */
  signAs(secretKey: Uint8Array, templateJson: string): string {
    const { kind, content, tags, created_at } = JSON.parse(templateJson) as EventTemplate;
    return JSON.stringify(finalizeEvent({ kind, content, tags, created_at }, secretKey));
  }

  private defaultReply(req: BunkerRequest): BunkerReply {
    switch (req.method) {
      case "connect":
      case "logout":
        return { result: "ack" };
      case "get_public_key":
        return { result: this.user };
      case "sign_event":
        return { result: this.signAs(this.userKey, req.params[0] ?? "{}") };
      default:
        return { error: "unsupported" };
    }
  }

  private respond(req: BunkerRequest, reply: BunkerReply) {
    if (reply === "silent") return;
    if ("authUrl" in reply) {
      this.send(req.client, { id: req.id, result: "auth_url", error: reply.authUrl });
      if (reply.after) this.respond(req, reply.after);
      return;
    }
    if ("error" in reply) this.send(req.client, { id: req.id, result: "", error: reply.error });
    else this.send(req.client, { id: req.id, result: reply.result });
  }

  private send(client: string, response: { id: string; result: string; error?: string }) {
    const ck = getConversationKey(this.secretKey, client);
    const event = finalizeEvent(
      {
        kind: 24133,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", client]],
        content: encrypt(JSON.stringify(response), ck),
      },
      this.secretKey,
    );
    for (const { filters, subscriber } of this.subs) {
      if (filters.some((f) => f.kinds?.includes(24133) && f["#p"]?.includes(client))) subscriber.next(event);
    }
  }
}
