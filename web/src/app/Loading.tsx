import styles from "./Loading.module.css";

export function Loading() {
  return (
    <main className={styles.loading} aria-busy="true">
      読み込み中…
    </main>
  );
}
