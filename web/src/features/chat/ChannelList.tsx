import { useEffect, useState } from "react";
import { avatarInitial, avatarShade } from "../../lib/avatar";
import { isDataSaver, markProxyBlocked, originOf, proxied } from "../../lib/imageProxy";
import { Icon } from "../../ui/icons";
import styles from "./ChannelList.module.css";
import { type Channel, refreshChannels, useChannels } from "./channels";

/**
 * チャンネル一覧（ネイティブ ChannelListColumn。メッセージ画面のチャット側と CHANNEL_LIST カラムで使う）。
 * 表示したら /api/nchan/channels を取り直す。最終更新の新しい順。行 = 画像・名前・説明 1 行・「ピン留め」。
 * 行を押すと onSelect、ピンを押すと onPin（デッキにピン留め済みのものは色を変える）。
 */
export function ChannelList({
  selectedId,
  pinnedIds,
  onSelect,
  onPin,
}: {
  selectedId: string | null;
  pinnedIds: ReadonlySet<string>;
  onSelect(channel: Channel): void;
  onPin(channel: Channel): void;
}) {
  const channels = useChannels((s) => s.channels);
  const failed = useChannels((s) => s.failed);
  useEffect(() => {
    void refreshChannels();
  }, []);

  if (channels === null || channels.length === 0) {
    return (
      <p className={styles.empty}>
        {channels === null && !failed
          ? "読み込み中…"
          : channels === null
            ? "チャンネルの一覧を取得できませんでした"
            : "チャンネルがありません"}
      </p>
    );
  }
  return (
    <ul className={styles.rows}>
      {channels.map((channel) => (
        <ChannelRow
          key={channel.id}
          channel={channel}
          selected={channel.id === selectedId}
          pinned={pinnedIds.has(channel.id)}
          onSelect={onSelect}
          onPin={onPin}
        />
      ))}
    </ul>
  );
}

function ChannelRow({
  channel,
  selected,
  pinned,
  onSelect,
  onPin,
}: {
  channel: Channel;
  selected: boolean;
  pinned: boolean;
  onSelect(channel: Channel): void;
  onPin(channel: Channel): void;
}) {
  return (
    <li className={styles.item}>
      <button
        type="button"
        className={styles.row}
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(channel)}
      >
        <ChannelIcon key={channel.picture} name={channel.name} url={channel.picture} />
        <span className={styles.texts}>
          <span className={styles.name}>{channel.name}</span>
          {channel.about.trim() !== "" && <span className={styles.about}>{channel.about}</span>}
        </span>
      </button>
      <button
        type="button"
        className={styles.pin}
        aria-label="ピン留め"
        aria-pressed={pinned}
        title="ピン留め"
        onClick={() => onPin(channel)}
      >
        <Icon name="pushPin" size="sm" />
      </button>
    </li>
  );
}

/**
 * チャンネルの画像（角丸の四角。ネイティブ AvatarSquare）。無い・読めなければ名前の頭文字
 * [#540] w=128・q=80・アニメ保持（データセーバー中は先頭フレームだけ）
 */
export function ChannelIcon({ name, url }: { name: string; url: string | null }) {
  const [src, setSrc] = useState(() =>
    url && /^https?:\/\//i.test(url.trim()) ? proxied(url, 128, 80, !isDataSaver()) : null,
  );
  if (!src) {
    return (
      <span
        className={`${styles.icon} ${styles.initial}`}
        style={{ background: avatarShade(name) }}
        aria-hidden="true"
      >
        {avatarInitial(name)}
      </span>
    );
  }

  function onError() {
    const origin = originOf(src);
    if (origin) {
      markProxyBlocked(origin);
      setSrc(/^https:\/\//i.test(origin) ? origin : null);
    } else {
      setSrc(null);
    }
  }

  return (
    <img
      className={styles.icon}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}
