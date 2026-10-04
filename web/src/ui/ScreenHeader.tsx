import type { ReactNode } from "react";
import { useT } from "../i18n";
import { ArrowBackIcon } from "./icons";
import styles from "./ScreenHeader.module.css";

/**
 * 画面・詳細のヘッダ（ネイティブ ColumnHeader）。先頭 40px のスロットは onBack があれば「←」
 * （HeaderBackButton）、無ければ icon。その後にタイトル + 説明。
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  icon,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  icon?: ReactNode;
}) {
  const t = useT();
  return (
    <header className={styles.header}>
      {onBack ? (
        <button type="button" className={styles.lead} aria-label={t("common_back")} onClick={onBack}>
          <ArrowBackIcon className={styles.leadIcon} />
        </button>
      ) : (
        icon && <span className={styles.icon}>{icon}</span>
      )}
      <div className={styles.texts}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
    </header>
  );
}
