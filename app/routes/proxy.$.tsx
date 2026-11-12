import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { jsonError, ApiError } from "../lib/errors.server";
import {
  livechatConfig,
  livechatInbound,
  livechatMessages,
  saveUpload,
} from "../lib/channels.server";

async function handle({ request, params }: LoaderFunctionArgs | ActionFunctionArgs) {
  try {
    const { session } = await authenticate.public.appProxy(request);
    const shop = session?.shop || new URL(request.url).searchParams.get("shop") || "";
    if (!shop) throw new ApiError("Shop not found.", 404);
    const path = params["*"] || "";
    const url = new URL(request.url);

    if (path === "livechat/config") return Response.json(await livechatConfig(shop));
    if (path === "livechat/messages") {
      return Response.json(
        await livechatMessages(
          shop,
          url.searchParams.get("roomId") || "",
          Number(url.searchParams.get("after") || 0),
        ),
      );
    }
    if (path === "livechat/inbound" && request.method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      const token = request.headers.get("x-kmbp-widget-token") || String(body.widgetToken || "");
      return Response.json(await livechatInbound(shop, body, token));
    }
    if (path === "livechat/upload" && request.method === "POST") {
      const form = await request.formData();
      const token = request.headers.get("x-kmbp-widget-token") || String(form.get("widgetToken") || "");
      const file = form.get("file");
      if (!(file instanceof File)) throw new ApiError("Choose a file to upload.");
      const cfg = await livechatConfig(shop);
      if (!cfg.enabled || token !== cfg.widgetToken) throw new ApiError("Invalid widget token.", 403);
      return Response.json(await saveUpload(shop, file));
    }
    throw new ApiError("Not found.", 404);
  } catch (error) {
    return jsonError(error);
  }
}

export const loader = (args: LoaderFunctionArgs) => handle(args);
export const action = (args: ActionFunctionArgs) => handle(args);
