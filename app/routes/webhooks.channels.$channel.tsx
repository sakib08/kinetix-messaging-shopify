import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { jsonError } from "../lib/errors.server";
import { handleProviderWebhook } from "../lib/channels.server";

async function handle({ request, params }: LoaderFunctionArgs | ActionFunctionArgs) {
  try {
    return await handleProviderWebhook(request, params.channel || "");
  } catch (error) {
    return jsonError(error);
  }
}

export const loader = (args: LoaderFunctionArgs) => handle(args);
export const action = (args: ActionFunctionArgs) => handle(args);
