import { ScreenHeader } from "../../ui/ScreenHeader";
import { SingleColumnPane } from "../../ui/SingleColumnPane";
import { ComingSoon } from "./ComingSoon";

/** 検索（#461 が置き換える） */
export function SearchPlaceholder() {
  return (
    <SingleColumnPane>
      <ScreenHeader title="検索" />
      <ComingSoon>検索は準備中です</ComingSoon>
    </SingleColumnPane>
  );
}
