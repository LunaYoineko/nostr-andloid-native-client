import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { avatarInitial, avatarShade } from "../../lib/avatar";
import { isDataSaver, markProxyBlocked, originOf, proxied } from "../../lib/imageProxy";
import { useSession } from "../../signer/session";
import { EditIcon, Icon } from "../../ui/icons";
import { ChannelEditDialog } from "./ChannelEditDialog";
import styles from "./ChannelList.module.css";
import { ensureMyChannelsSubscribed, useMyChannelIds } from "./channelEdit";
import { type Channel, refreshChannels, useChannels } from "./channels";

/**
 * チャンネル一覧（ネイティブ ChannelListColumn。メッセージ画面のチャット側と CHANNEL_LIST カラムで使う）。
 * 表示したら /api/nchan/channels を取り直す。最終更新の新しい順。行 = 画像・名前・説明 1 行・「ピン留め」。
 * 行を押すと onSelect、ピンを押すと onPin（デッキにピン留め済みのものは色を変える）。
 * [#538] ログイン中は先頭に「新しいスレッドを作成」。自分が作った kind:40 の行には ✏️ で編集。
 * 作成したらローカルの一覧へ即反映してそのまま onSelect（ネイティブと同じく API の一覧を待たない）。
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
  const t = useT();
  const channels = useChannels((s) => s.channels);
  const failed = useChannels((s) => s.failed);
  const me = useSession((s) => s.pubkey);
  const myChannelIds = useMyChannelIds(me);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);

  useEffect(() => {
    void refreshChannels();
  }, []);
  useEffect(() => {
    if (me) ensureMyChannelsSubscribed(me);
  }, [me]);

  return (
    <>
      {me && (
        <button type="button" className={styles.createRow} onClick={() => setShowCreate(true)}>
          <Icon name="add" size="sm" className={styles.createIcon} />
          {t("channel_create_row")}
        </button>
      )}
      {channels === null || channels.length === 0 ? (
        <p className={styles.empty}>
          {channels === null && !failed
            ? t("loading")
            : channels === null
              ? t("web_chat_channels_failed")
              : t("web_chat_channels_empty")}
        </p>
      ) : (
        <ul className={styles.rows}>
          {channels.map((channel) => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              selected={channel.id === selectedId}
              pinned={pinnedIds.has(channel.id)}
              onSelect={onSelect}
              onPin={onPin}
              onEdit={me && myChannelIds.has(channel.id) ? () => setEditing(channel) : undefined}
            />
          ))}
        </ul>
      )}
      {showCreate && me && (
        <ChannelEditDialog
          me={me}
          channel={null}
          onDone={(created) => {
            setShowCreate(false);
            onSelect(created);
          }}
          onDismiss={() => setShowCreate(false)}
        />
      )}
      {editing && me && (
        <ChannelEditDialog
          me={me}
          channel={editing}
          onDone={() => setEditing(null)}
          onDismiss={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ChannelRow({
  channel,
  selected,
  pinned,
  onSelect,
  onPin,
  onEdit,
}: {
  channel: Channel;
  selected: boolean;
  pinned: boolean;
  onSelect(channel: Channel): void;
  onPin(channel: Channel): void;
  /** 自分が作成した kind:40 のときだけ渡る */
  onEdit?: () => void;
}) {
  const t = useT();
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
      {onEdit && (
        <button
          type="button"
          className={styles.edit}
          aria-label={t("channel_edit_title")}
          title={t("channel_edit_title")}
          onClick={onEdit}
        >
          <EditIcon className={styles.editIcon} />
        </button>
      )}
      <button
        type="button"
        className={styles.pin}
        aria-label={t("channel_pin")}
        aria-pressed={pinned}
        title={t("channel_pin")}
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
