import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MEDIA_SERVERS,
  MEDIA_SERVER_KEY,
  parseServerInput,
  setMediaServer,
  uploadServers,
  useMediaServer,
} from "./mediaServer";

afterEach(() => {
  setMediaServer(null);
  localStorage.clear();
});

describe("parseServerInput", () => {
  it("https の URL だけ（前後の空白と末尾の / を除く）", () => {
    expect(parseServerInput("  https://nostr.build/ ")).toBe("https://nostr.build");
    expect(parseServerInput("https://example.com/media//")).toBe("https://example.com/media");
    expect(parseServerInput("http://nostr.build")).toBeNull();
    expect(parseServerInput("nostr.build")).toBeNull();
    expect(parseServerInput("")).toBeNull();
  });
});

describe("アップロード先", () => {
  it("未選択なら既定の一覧（nostrcheck.me → nostr.build）、選べばそれだけ。localStorage に残る", () => {
    expect(useMediaServer.getState().server).toBeNull();
    expect(uploadServers(null)).toEqual(["https://nostrcheck.me", "https://nostr.build"]);
    expect(uploadServers(null)).toEqual([...DEFAULT_MEDIA_SERVERS]);

    setMediaServer("https://nostpic.com");
    expect(useMediaServer.getState().server).toBe("https://nostpic.com");
    expect(localStorage.getItem(MEDIA_SERVER_KEY)).toBe("https://nostpic.com");
    expect(uploadServers("https://nostpic.com")).toEqual(["https://nostpic.com"]);

    setMediaServer(null);
    expect(localStorage.getItem(MEDIA_SERVER_KEY)).toBeNull();
  });
});
