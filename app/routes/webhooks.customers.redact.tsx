import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { redactCustomer } from "../lib/inbox.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const customer = (payload as { customer?: { email?: string; phone?: string } }).customer;
  await redactCustomer(shop, customer?.email, customer?.phone);
  return new Response();
};
