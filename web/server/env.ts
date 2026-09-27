/**
 * Pages が Functions に渡す env。ASSETS（静的アセットの配信）は Pages が付ける（wrangler.toml には書かない）。
 * cloudflare:test（createPagesEventContext 等）が Cloudflare.Env を参照するため、グローバルの宣言に足す。
 */
declare global {
  namespace Cloudflare {
    interface Env {
      ASSETS: Fetcher;
    }
  }
}

export type Env = Cloudflare.Env;
