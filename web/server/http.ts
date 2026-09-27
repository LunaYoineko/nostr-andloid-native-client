/**
 * /api/* の Pages Functions で共有する JSON 応答。
 * static/_headers は Functions の応答に効かないため、応答ヘッダはここで付ける。
 */

export const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

export function jsonResponse(
  body: BodyInit,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": JSON_CONTENT_TYPE,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export function errorResponse(
  status: number,
  code: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse(JSON.stringify({ error: code }), status, extraHeaders);
}
