import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/inbox.server";
import { handleKmbpRequest } from "../lib/api.server";

async function handle({ request, params }: LoaderFunctionArgs | ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const { agent } = await ensureShop(session, admin);
  return handleKmbpRequest(request, params["*"] || "", {
    shop: session.shop,
    agent: {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      role: agent.role,
    },
    admin,
  });
}

export const loader = (args: LoaderFunctionArgs) => handle(args);
export const action = (args: ActionFunctionArgs) => handle(args);
