/**
 * /api/* のうちファイルに対応しないパスは JSON の 404 を返す（静的アセットの 404.html へ落とさない）。
 * より具体的なルート（functions/api/nchan/channels.ts 等）が優先される。
 */
import { errorResponse } from "../../server/http";

export const onRequest: PagesFunction = () => errorResponse(404, "not_found");
