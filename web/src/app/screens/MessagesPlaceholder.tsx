import { ScreenHeader } from "../../ui/ScreenHeader";
import { SingleColumnPane } from "../../ui/SingleColumnPane";
import { ComingSoon } from "./ComingSoon";

/** メッセージ（DM + パブリックチャット。M2） */
export function MessagesPlaceholder() {
  return (
    <SingleColumnPane>
      <ScreenHeader title="メッセージ" />
      <ComingSoon>DM とパブリックチャットは今後のバージョンで対応します</ComingSoon>
    </SingleColumnPane>
  );
}
