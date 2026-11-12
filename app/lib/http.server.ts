import { ApiError } from "./errors.server";

export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return readProviderResponse(response);
}

export async function getJson(
  url: string,
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers });
  return readProviderResponse(response);
}

export async function postForm(
  url: string,
  body: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(body),
  });
  return readProviderResponse(response);
}

async function readProviderResponse(response: Response) {
  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      const parsed = JSON.parse(text) as unknown;
      data =
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : { raw: text };
    } catch {
      data = { raw: text };
    }
  }
  if (!response.ok) {
    throw new ApiError(providerMessage(data, text, response.status), 502);
  }
  if (data.ok === false) {
    throw new ApiError(providerMessage(data, text, response.status), 502);
  }
  const errcode = data.errcode;
  if (typeof errcode === "number" && errcode !== 0) {
    throw new ApiError(providerMessage(data, text, response.status), 502);
  }
  return data;
}

function providerMessage(
  data: Record<string, unknown>,
  text: string,
  status: number,
) {
  const error = data.error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  if (typeof data.description === "string") return data.description;
  if (typeof data.message === "string") return data.message;
  if (typeof data.errmsg === "string") return data.errmsg;
  const raw = text || `Provider request failed (${status})`;
  return raw.slice(0, 500);
}
