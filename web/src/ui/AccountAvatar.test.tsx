import { render } from "@testing-library/react";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { afterEach, expect, it } from "vitest";
import { avatarShade } from "../lib/avatar";
import { unixNow } from "../lib/time";
import { eventStore } from "../nostr/store";
import { useSession } from "../signer/session";
import { AccountAvatar } from "./AccountAvatar";
import styles from "./AccountAvatar.module.css";

afterEach(() => {
  useSession.setState({ status: "loading", method: null, pubkey: null });
});

it("画像の無い自分のアバターは名前の頭文字を、名前から決めたグレーの丸に出す", () => {
  const key = generateSecretKey();
  eventStore.add(
    finalizeEvent(
      { kind: 0, created_at: unixNow(), tags: [], content: JSON.stringify({ name: "carol" }) },
      key,
    ),
  );
  useSession.setState({ status: "in", method: "nip07", pubkey: getPublicKey(key) });

  const { container } = render(<AccountAvatar size={24} />);

  const avatar = container.getElementsByClassName(styles.initial)[0] as HTMLElement;
  expect(avatar).toHaveTextContent(/^C$/);
  expect(avatar.style.background).toBe(avatarShade("carol"));
});

it("プロフィールが無ければ pubkey の頭文字（ネイティブと同じ）", () => {
  const pubkey = getPublicKey(generateSecretKey());
  useSession.setState({ status: "in", method: "nip07", pubkey });

  const { container } = render(<AccountAvatar size={40} />);

  expect(container.getElementsByClassName(styles.initial)[0]).toHaveTextContent(
    new RegExp(`^${pubkey[0].toUpperCase()}$`),
  );
});
