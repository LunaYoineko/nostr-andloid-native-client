import { type ReactNode, useId } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { hrefForProfile } from "../../lib/content/labels";
import { useSession } from "../../signer/session";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { useLayoutMode } from "../../ui/useLayoutMode";
import { AccountSection, AccountSummary } from "./AccountSection";
import { BookmarksSection } from "./BookmarksSection";
import { DataSection } from "./DataSection";
import { DisplaySection } from "./DisplaySection";
import { DmRelaySection } from "./DmRelaySection";
import { FavsSection } from "./FavsSection";
import { MediaSection } from "./MediaSection";
import { MuteSection } from "./MuteSection";
import { ProfileEditSection } from "./ProfileEditSection";
import { RelaySection } from "./RelaySection";
import styles from "./SettingsScreen.module.css";
import {
  DEFAULT_SECTION_ID,
  findSection,
  renamedSectionId,
  SETTINGS_GROUPS,
  type SettingsSection,
} from "./sections";

/** 一覧から開いた詳細の履歴エントリの印（Compact の「←」で戻れるか） */
const FROM_LIST = "settingsFromList";

function openedFromList(state: unknown): boolean {
  return (
    typeof state === "object" && state !== null && (state as Record<string, unknown>)[FROM_LIST] === true
  );
}

/**
 * 設定（ネイティブ SettingsScreen + TwoPane）。URL は /settings/:section?。
 * Expanded = 左に項目の一覧・右に内容（未選択ならアカウント）、Compact = 一覧 → 内容（「←」で一覧へ）。
 */
export function SettingsScreen() {
  const mode = useLayoutMode();
  const { section: param } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useSession((s) => s.pubkey);
  const opened = findSection(param) ?? null;
  const selected = opened ?? (mode === "expanded" ? (findSection(DEFAULT_SECTION_ID) ?? null) : null);

  // Compact は戻る対象にする（一覧 → 内容）、Expanded は項目の切り替えなので置き換える。
  // 「プロフィール」は自分のプロフィールを重ね、「DM」はメッセージ画面へ切り替える（設定の中では描かない）
  function select(id: string) {
    if (id === "profile") {
      if (me) void navigate(hrefForProfile(me));
      return;
    }
    if (id === "dm") {
      void navigate("/messages", { replace: true });
      return;
    }
    if (id === selected?.id) return;
    if (mode === "compact") void navigate(`/settings/${id}`, { state: { [FROM_LIST]: true } });
    else void navigate(`/settings/${id}`, { replace: true });
  }

  function back() {
    if (openedFromList(location.state)) void navigate(-1);
    else void navigate("/settings", { replace: true });
  }

  const renamed = renamedSectionId(param);
  if (renamed) return <Navigate to={`/settings/${renamed}`} replace state={location.state} />;

  if (mode === "compact") {
    return (
      <div className={styles.single}>
        {selected ? (
          <SectionPane section={selected} onBack={back} />
        ) : (
          <SectionList selectedId={null} onSelect={select} />
        )}
      </div>
    );
  }
  return (
    <div className={styles.twoPane}>
      <div className={styles.listPane}>
        <SectionList selectedId={selected?.id ?? null} onSelect={select} />
      </div>
      <div className={styles.detailPane}>{selected && <SectionPane section={selected} />}</div>
    </div>
  );
}

/** 項目の一覧（ネイティブ SettingsMenu。グループ見出し + 行） */
function SectionList({ selectedId, onSelect }: { selectedId: string | null; onSelect(id: string): void }) {
  return (
    <div className={styles.list}>
      <ScreenHeader title="設定" />
      <AccountSummary onOpen={() => onSelect("account")} />
      <nav className={styles.groups} aria-label="設定の項目">
        {SETTINGS_GROUPS.map((group) => (
          <SectionGroup key={group.title} title={group.title}>
            {group.sections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  className={styles.row}
                  aria-current={section.id === selectedId ? "page" : undefined}
                  onClick={() => onSelect(section.id)}
                >
                  <span className={styles.rowLabel}>{section.label}</span>
                  {!section.ready && <span className={styles.badge}>準備中</span>}
                </button>
              </li>
            ))}
          </SectionGroup>
        ))}
      </nav>
    </div>
  );
}

function SectionGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={styles.groupTitle}>
        {title}
      </h2>
      <ul className={styles.rows}>{children}</ul>
    </section>
  );
}

/** 項目の内容。Compact は「←」つきのヘッダ、Expanded は見出しだけ */
function SectionPane({ section, onBack }: { section: SettingsSection; onBack?: () => void }) {
  return (
    <section className={styles.pane} aria-label={section.label}>
      {onBack ? (
        <ScreenHeader title={section.label} onBack={onBack} />
      ) : (
        <h2 className={styles.paneTitle}>{section.label}</h2>
      )}
      <div className={styles.body}>
        <SectionBody id={section.id} />
      </div>
    </section>
  );
}

function SectionBody({ id }: { id: string }) {
  switch (id) {
    case "favs":
      return <FavsSection />;
    case "bookmarks":
      return <BookmarksSection />;
    case "mute":
      return <MuteSection />;
    case "profile-edit":
      return <ProfileEditSection />;
    case "account":
      return <AccountSection />;
    case "relays":
      return <RelaySection />;
    case "dm-relays":
      return <DmRelaySection />;
    case "media":
      return <MediaSection />;
    case "display":
      return <DisplaySection />;
    case "data":
      return <DataSection />;
    default:
      return <p className={styles.comingSoon}>この項目は準備中です</p>;
  }
}
