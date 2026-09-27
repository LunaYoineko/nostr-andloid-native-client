import { ErrorOutlineIcon, VerifiedIcon } from "../../ui/icons";
import styles from "./Nip05Handle.module.css";
import { useNip05Status } from "./nip05";

/**
 * NIP-05 の文字 + 検証バッジ（ネイティブ Nip05Handle）。OK = 緑の ✓、不一致 = 赤の !、
 * 確認中・取得できなかったときは何も付けない。
 */
export function Nip05Handle({
  pubkey,
  nip05,
  size,
}: {
  pubkey: string;
  nip05: string;
  size: "sub" | "caption";
}) {
  const status = useNip05Status(pubkey, nip05);
  return (
    <span className={styles.handle} data-size={size}>
      <span className={styles.text}>{nip05}</span>
      {status === "verified" && <VerifiedIcon className={styles.ok} title="NIP-05 検証OK" />}
      {status === "invalid" && <ErrorOutlineIcon className={styles.bad} title="NIP-05 検証エラー" />}
    </span>
  );
}
