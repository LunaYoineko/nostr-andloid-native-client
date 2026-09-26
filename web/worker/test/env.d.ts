// cloudflare:workers の env の型（wrangler.toml のバインディング）
declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher;
  }
}
