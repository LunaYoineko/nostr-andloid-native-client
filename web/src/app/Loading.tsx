import { useT } from "../i18n";
import styles from "./Loading.module.css";

export function Loading() {
  const t = useT();
  return (
    <main className={styles.loading} aria-busy="true">
      {t("loading")}
    </main>
  );
}
