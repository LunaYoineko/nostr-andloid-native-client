import { create } from "zustand";

/** 開発者モード（ネイティブ KV の developer_mode）。値は "true" / "false"、無ければオフ */
export const DEVELOPER_MODE_KEY = "nostrism.developerMode";

function readDeveloperMode(): boolean {
  try {
    return localStorage.getItem(DEVELOPER_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

/** 開発者モード（ON で投稿の ⋯ に「イベントJSONを表示」を出す。設定 > データ・キャッシュ） */
export const useDeveloperMode = create<{ enabled: boolean }>()(() => ({ enabled: readDeveloperMode() }));

export function setDeveloperMode(enabled: boolean): void {
  useDeveloperMode.setState({ enabled });
  try {
    localStorage.setItem(DEVELOPER_MODE_KEY, enabled ? "true" : "false");
  } catch {
    // 保存できなくてもこのセッションでは効く
  }
}
