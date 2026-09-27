import { ScreenHeader } from "../../ui/ScreenHeader";
import { SingleColumnPane } from "../../ui/SingleColumnPane";
import { ComingSoon } from "./ComingSoon";

/** 通知画面（通知カラムが無いときの宛先。#460 が置き換える） */
export function NotificationsPlaceholder() {
  return (
    <SingleColumnPane>
      <ScreenHeader title="通知" />
      <ComingSoon>通知画面は準備中です。通知カラムはデッキに追加できます</ComingSoon>
    </SingleColumnPane>
  );
}
