import { useRef, useState } from "react";
import { HistoryIcon, Icon, SearchIcon } from "../../ui/icons";
import { useLayoutMode } from "../../ui/useLayoutMode";
import { ResultsPane } from "./ResultsPane";
import styles from "./SearchScreen.module.css";
import { useSearchHistory } from "./searchHistory";
import { addTokens } from "./searchTokens";

/**
 * 検索画面（/search。ネイティブ SearchScreen）。単語と #タグを積んで OR で 1 つのフィードとして検索する。
 * 全幅（SingleColumnPane に入れない）。上から 検索バー → 条件チップ → 区切り線 →
 * Compact: 実行前は履歴、実行後は結果 / Expanded: 左に履歴 | 右に結果。
 * 入力・条件・結果は画面を離れると消える（ネイティブも宛先を切り替えると消える）。
 */
export function SearchScreen() {
  const mode = useLayoutMode();
  const history = useSearchHistory((s) => s.history);
  const [query, setQuery] = useState("");
  const [tokens, setTokens] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  // 実行のたびに進める。結果の key にして REQ を張り直し、「投稿」タブへ戻す
  const [searchSeq, setSearchSeq] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  /** 積むだけで実行しない */
  function add() {
    setTokens(addTokens(tokens, query));
    setQuery("");
  }

  function run() {
    const next = query.trim() ? addTokens(tokens, query) : tokens;
    setTokens(next);
    setQuery("");
    if (next.length === 0) return;
    setRunning(true);
    setSearchSeq((n) => n + 1);
    useSearchHistory.getState().add(next.join(" "));
    inputRef.current?.blur();
  }

  /** 履歴から選ぶ: 条件をその語で置き換えて実行する（履歴には足さない） */
  function pick(term: string) {
    const next = addTokens([], term);
    if (next.length === 0) return;
    setTokens(next);
    setRunning(true);
    setSearchSeq((n) => n + 1);
  }

  function removeToken(token: string) {
    const next = tokens.filter((t) => t !== token);
    setTokens(next);
    if (next.length === 0) setRunning(false);
  }

  const active = running && tokens.length > 0;

  return (
    <div className={styles.screen} data-layout={mode}>
      <h1 className="srOnly">検索</h1>
      <search>
        <form
          className={styles.bar}
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <div className={styles.barRow}>
            <div className={styles.field}>
              <input
                ref={inputRef}
                type="search"
                enterKeyHint="search"
                aria-label="検索語"
                placeholder="単語 / #タグ"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className={styles.submit} aria-label="検索">
                <SearchIcon className={styles.submitIcon} />
              </button>
            </div>
            <button type="button" className={styles.ghost} onClick={add}>
              ＋追加
            </button>
          </div>
          <p className={styles.hint}>スペース区切りで複数・OR で並ぶ</p>
        </form>
      </search>
      {tokens.length > 0 && (
        <ul className={styles.tokens} aria-label="検索条件">
          {tokens.map((t) => (
            <li key={t} className={styles.chip}>
              {t.startsWith("#") ? <Icon name="tag" size="sm" /> : <SearchIcon className={styles.chipIcon} />}
              <span className={styles.chipText}>{t}</span>
              <button
                type="button"
                className={styles.chipRemove}
                aria-label="条件を削除"
                onClick={() => removeToken(t)}
              >
                <Icon name="close" size="sm" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <hr className={styles.divider} />
      <div className={styles.panes}>
        {mode === "compact" ? (
          active ? (
            <ResultsPane key={searchSeq} tokens={tokens} onBack={() => setRunning(false)} />
          ) : (
            <HistoryPane history={history} onPick={pick} />
          )
        ) : (
          <>
            <HistoryPane history={history} onPick={pick} />
            <div className={styles.vline} aria-hidden="true" />
            {active ? (
              <ResultsPane key={searchSeq} tokens={tokens} />
            ) : (
              <p className={styles.idle}>単語・#タグを追加して検索してください（複数は OR で並びます）</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 検索履歴（ネイティブ HistoryPane）。押すと再検索、✕ で 1 件、「クリア」で全部（確認なし）消す */
function HistoryPane({ history, onPick }: { history: readonly string[]; onPick(term: string): void }) {
  return (
    <section className={styles.history} aria-label="検索履歴">
      <div className={styles.historyHead}>
        <p className={styles.caption}>検索履歴</p>
        {history.length > 0 && (
          <button
            type="button"
            className={styles.textButton}
            onClick={() => useSearchHistory.getState().clear()}
          >
            クリア
          </button>
        )}
      </div>
      {history.length === 0 ? (
        <p className={styles.historyEmpty}>検索履歴はありません</p>
      ) : (
        <ul className={styles.historyList}>
          {history.map((term) => (
            <li key={term} className={styles.historyItem}>
              <button type="button" className={styles.historyTerm} onClick={() => onPick(term)}>
                <HistoryIcon className={styles.historyIcon} />
                <span className={styles.historyText}>{term}</span>
              </button>
              <button
                type="button"
                className={styles.historyRemove}
                aria-label="削除"
                onClick={() => useSearchHistory.getState().remove(term)}
              >
                <Icon name="close" size="md" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
