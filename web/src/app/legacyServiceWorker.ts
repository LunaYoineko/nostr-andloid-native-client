/**
 * 旧 scope（/app/）の Service Worker が残っていれば解除する（#647。/app を廃止して / に統合したため）。
 * 新しい SW は scope "/" で登録される（vite-plugin-pwa。登録は UpdateToast の useRegisterSW）。
 * 取得・解除に失敗しても無視する（対応していないブラウザや権限の制約があり得るため）。
 */
export async function unregisterLegacyServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.filter((r) => new URL(r.scope).pathname === "/app/").map((r) => r.unregister()),
    );
  } catch {
    // 取得・解除に失敗しても無視する
  }
}
