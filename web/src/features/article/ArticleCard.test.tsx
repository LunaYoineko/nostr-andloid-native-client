import { screen } from "@testing-library/react";
import { naddrEncode } from "nostr-tools/nip19";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEventByAddress } from "../../nostr/loaders";
import { renderWithRouter } from "../../test/renderWithRouter";
import { ArticleCard, ArticleCardBody, ArticleCards } from "./ArticleCard";

// naddr の解決（addressLoader・実リレー）はしない。ArticleCard の描き分けだけをテストする
vi.mock("../../nostr/loaders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/loaders")>()),
  useEventByAddress: vi.fn(),
}));

const PUBKEY = getPublicKey(generateSecretKey());
const ADDR = { kind: 30023, pubkey: PUBKEY, identifier: "x" };

function article(tags: string[][] = [], content = ""): NostrEvent {
  return finalizeEvent(
    { kind: 30023, created_at: 1_000, tags: [["d", "x"], ...tags], content },
    generateSecretKey(),
  );
}

beforeEach(() => {
  vi.mocked(useEventByAddress).mockReset();
});

describe("ArticleCardBody", () => {
  it("title・image・summary をカードにする。summary が無ければ本文の最初の空でない行", () => {
    const event = article([
      ["title", "テストの記事"],
      ["image", "https://img.test/a.png"],
      ["summary", "概要です"],
    ]);
    renderWithRouter(<ArticleCardBody event={event} />);

    expect(screen.getByText("記事")).toBeInTheDocument();
    expect(screen.getByText("テストの記事")).toBeInTheDocument();
    expect(screen.getByText("概要です")).toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeNull();
  });

  it("title 無しは「無題の記事」、summary 無しは本文の最初の空でない行", () => {
    const event = article([], "\n\n本文の1行目\n2行目");
    renderWithRouter(<ArticleCardBody event={event} />);

    expect(screen.getByText("無題の記事")).toBeInTheDocument();
    expect(screen.getByText("本文の1行目")).toBeInTheDocument();
  });
});

describe("ArticleCard", () => {
  it("解決できたら記事カード、押すと /e/naddr… へ", () => {
    const event = article([["title", "解決済み"]]);
    vi.mocked(useEventByAddress).mockReturnValue({ event, failed: false });
    renderWithRouter(<ArticleCard addr={ADDR} />);

    expect(screen.getByText("解決済み")).toBeInTheDocument();
    expect(screen.getByRole("link").getAttribute("href")).toMatch(/^\/e\/naddr1/);
  });

  it("解決中は「読み込み中…」", () => {
    vi.mocked(useEventByAddress).mockReturnValue({ event: undefined, failed: false });
    renderWithRouter(<ArticleCard addr={ADDR} />);

    expect(screen.getByText("読み込み中…")).toBeInTheDocument();
  });

  it("6 秒（ネイティブの resolveAddress と同じ）届かず諦めたら「記事を取得できませんでした」", () => {
    vi.mocked(useEventByAddress).mockReturnValue({ event: undefined, failed: true });
    renderWithRouter(<ArticleCard addr={ADDR} />);

    expect(screen.getByText("記事を取得できませんでした")).toBeInTheDocument();
  });
});

describe("ArticleCards", () => {
  beforeEach(() => {
    vi.mocked(useEventByAddress).mockReturnValue({ event: undefined, failed: false });
  });

  it("本文の naddr（kind:30023）を出現順に最大 3 件、重複は 1 件にする", () => {
    const addrs = Array.from({ length: 4 }, (_, i) => ({
      kind: 30023,
      pubkey: PUBKEY,
      identifier: `article-${i}`,
    }));
    const [n0, n1, n2, n3] = addrs.map((addr) => naddrEncode(addr));
    const content = `1件目 nostr:${n0}\n重複 nostr:${n0}\n2件目 nostr:${n1}\n3件目 nostr:${n2}\n4件目（出さない） nostr:${n3}`;
    renderWithRouter(<ArticleCards content={content} />);

    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("naddr が無ければ何も描かない", () => {
    const { container } = renderWithRouter(<ArticleCards content="ただの文章です" />);
    expect(container).toBeEmptyDOMElement();
  });
});
