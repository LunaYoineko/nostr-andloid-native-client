import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { addVerified } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { openHashtagManager } from "../hashtags/hashtagManagerStore";
import { HashtagSection } from "./HashtagSection";

vi.mock("../hashtags/hashtagManagerStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hashtags/hashtagManagerStore")>()),
  openHashtagManager: vi.fn(),
}));

let meKey: Uint8Array;
let me: string;

beforeEach(() => {
  meKey = generateSecretKey();
  me = getPublicKey(meKey);
  useSession.setState({ status: "in", method: "local", pubkey: me });
  vi.mocked(openHashtagManager).mockClear();
});

afterEach(() => {
  useSession.setState({ status: "loading", method: null, pubkey: null });
});

it("ピン留めの件数を出し、押すと整理画面を開く", async () => {
  addVerified(
    finalizeEvent(
      {
        kind: 30015,
        created_at: 1,
        tags: [
          ["d", "pinned"],
          ["t", "nostr"],
          ["t", "zap"],
        ],
        content: "",
      },
      meKey,
    ),
  );
  render(<HashtagSection />);

  expect(screen.getByText("ピン留め 2 / 15 件")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "ハッシュタグの整理画面を開く" }));
  expect(vi.mocked(openHashtagManager)).toHaveBeenCalledTimes(1);
});
