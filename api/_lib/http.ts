import type { VercelRequest, VercelResponse } from "@vercel/node";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

export function handle(fn: Handler) {
  return async (req: VercelRequest, res: VercelResponse) => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST." });
    }
    try {
      const body = await fn(req, res);
      if (!res.writableEnded) res.status(200).json(body ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message });
      }
      // Never leak an internal stack to the browser.
      console.error("Unhandled API error", err);
      return res.status(500).json({ error: "Something went wrong. Try again." });
    }
  };
}

export function requireString(body: unknown, field: string, max = 200): string {
  const value = (body as Record<string, unknown>)?.[field];
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new HttpError(400, `"${field}" is required.`);
  }
  return value.trim();
}
