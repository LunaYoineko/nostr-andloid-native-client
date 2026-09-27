import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type SyntheticEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { MediaItem } from "../../lib/media";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ContentCopyIcon, OpenInNewIcon } from "../../ui/icons";
import styles from "./Lightbox.module.css";

/** シングルクリックで閉じるまで待つ時間（この間に 2 回目のクリックが来ればズーム） */
const SINGLE_CLICK_DELAY = 250;
/** 前後の画像へ送る横スワイプの移動量（px） */
const SWIPE_THRESHOLD = 50;
/** 「コピーしました」を出しておく時間 */
const COPIED_DURATION = 1500;

type Props = { items: MediaItem[]; index: number; onClose: () => void };

/**
 * 画像の全画面表示（ネイティブの NoteImages.kt Lightbox）。原 URL（プロキシ非経由）を画面に収めて出す。
 * モーダルの <dialog> で開き、閉じるのは「閉じる」・Esc（cancel）・背景・画像のシングルクリック（拡大中を除く）。
 * 履歴は積まない（Android の戻るは開いているモーダル dialog の cancel として届く）。
 * 前後は ← → / Home / End・横スワイプ・左右のボタン（端で止まる）。
 * ダブルクリック / ダブルタップで 2.5 倍（CSS の .zoomed）、拡大中はスクロールでパン。
 */
export function Lightbox({ items, index: initialIndex, onClose }: Props) {
  const last = items.length - 1;
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), last));
  const [zoomed, setZoomed] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  // 直前のポインタ操作がスワイプ（ドラッグ）だった。続く click を閉じる / ズームに使わない
  const swiped = useRef(false);
  // 2 回目の click（detail === 2）で拡大を切り替えた。続く dblclick で二重に切り替えない
  const toggledByClick = useRef(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const copiedTimer = useRef<number | undefined>(undefined);

  // モーダルで開き、「閉じる」にフォーカスする（showModal が無い環境では open 属性だけ付ける）
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.open = true;
    }
    closeRef.current?.focus();
    return () => {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.open = false;
    };
  }, []);

  // 開いている間は後ろの文書をスクロールさせない
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(closeTimer.current);
      window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  // 拡大したら中央を見せる（ネイティブは中心を基準に拡大する）
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!zoomed || !stage) return;
    stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2;
    stage.scrollTop = (stage.scrollHeight - stage.clientHeight) / 2;
  }, [zoomed]);

  const item = items[index];
  if (!item) return null;
  const url = item.url;
  const failed = failedUrl === url;

  function go(next: number) {
    const target = Math.min(Math.max(next, 0), last);
    if (target === index) return;
    window.clearTimeout(closeTimer.current);
    setIndex(target);
    setZoomed(false);
  }

  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    // 閉じるのは呼び出し側（アンマウント）に任せる
    event.preventDefault();
    onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    const target = keyTarget(event.key, index, last);
    if (target === null) return;
    event.preventDefault();
    go(target);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    pointerStart.current = { x: event.clientX, y: event.clientY };
    swiped.current = false;
    toggledByClick.current = false;
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
    swiped.current = true;
    // 拡大中の移動はパン（スクロール）に任せる
    if (!zoomed && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1));
  }

  function onPointerCancel() {
    pointerStart.current = null;
  }

  function toggleZoom() {
    window.clearTimeout(closeTimer.current);
    setZoomed((value) => !value);
  }

  // 画像: 1 回目は閉じるのを待ち、2 回目（detail === 2）が来たら拡大を切り替える。背景: すぐ閉じる
  function onClick(event: MouseEvent<HTMLDialogElement>) {
    if (swiped.current) return;
    if (event.target === imageRef.current) {
      if (event.detail === 2) {
        toggledByClick.current = true;
        toggleZoom();
        return;
      }
      if (event.detail > 2) return;
      window.clearTimeout(closeTimer.current);
      if (!zoomed) closeTimer.current = window.setTimeout(onClose, SINGLE_CLICK_DELAY);
      return;
    }
    if (event.target === event.currentTarget || event.target === stageRef.current) onClose();
  }

  // タッチのダブルタップで click の detail が数えられない環境向け
  function onDoubleClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== imageRef.current) return;
    if (toggledByClick.current) {
      toggledByClick.current = false;
      return;
    }
    toggleZoom();
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return;
    }
    setCopied(true);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_DURATION);
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.lightbox}
      aria-label="画像"
      onCancel={onCancel}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    >
      <div
        ref={stageRef}
        className={zoomed ? `${styles.stage} ${styles.stageZoomed}` : styles.stage}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {failed ? (
          <p className={styles.error}>画像を読み込めませんでした</p>
        ) : (
          <img
            // 画像を切り替えたら前の画像を残さず作り直す
            key={url}
            ref={imageRef}
            className={zoomed ? `${styles.image} ${styles.zoomed}` : styles.image}
            src={url}
            alt={item.alt ?? ""}
            referrerPolicy="no-referrer"
            decoding="async"
            draggable={false}
            onError={() => setFailedUrl(url)}
          />
        )}
      </div>
      {items.length > 1 && (
        <>
          <p className={styles.counter}>{`${index + 1} / ${items.length}`}</p>
          {/* 端では押しても何も起きない。disabled にするとフォーカスが外れて ← → が効かなくなるので aria-disabled */}
          <button
            type="button"
            className={`${styles.control} ${styles.nav} ${styles.prev}`}
            aria-label="前の画像"
            aria-disabled={index === 0 || undefined}
            onClick={() => go(index - 1)}
          >
            <ChevronLeftIcon className={styles.icon} />
          </button>
          <button
            type="button"
            className={`${styles.control} ${styles.nav} ${styles.next}`}
            aria-label="次の画像"
            aria-disabled={index === last || undefined}
            onClick={() => go(index + 1)}
          >
            <ChevronRightIcon className={styles.icon} />
          </button>
        </>
      )}
      <div className={styles.actions}>
        {/* コピーできたら 1.5 秒だけアイコンを「コピーしました」の文字に替える */}
        <button
          type="button"
          className={copied ? `${styles.control} ${styles.labeled}` : styles.control}
          aria-label={copied ? "コピーしました" : "URL をコピー"}
          onClick={copyUrl}
        >
          {copied ? "コピーしました" : <ContentCopyIcon className={styles.icon} />}
        </button>
        {/* ネイティブの「保存」の代わり */}
        <a
          className={styles.control}
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          aria-label="新しいタブで開く"
        >
          <OpenInNewIcon className={styles.icon} />
        </a>
        <button ref={closeRef} type="button" className={styles.control} aria-label="閉じる" onClick={onClose}>
          <CloseIcon className={styles.icon} />
        </button>
      </div>
    </dialog>
  );
}

/** キーに対応する移動先の番号。対応しないキーは null */
function keyTarget(key: string, index: number, last: number): number | null {
  switch (key) {
    case "ArrowLeft":
      return index - 1;
    case "ArrowRight":
      return index + 1;
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}
