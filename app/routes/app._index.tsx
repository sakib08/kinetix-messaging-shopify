import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/inbox.server";
import { applyBoot } from "../inbox/api/client.js";
import OmnichannelApp from "../inbox/App.jsx";
import "../inbox/index.css";
import "@tabler/icons-webfont/dist/tabler-icons.min.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const { timezone, agent } = await ensureShop(session, admin);
  return {
    shop: session.shop,
    appUrl: process.env.SHOPIFY_APP_URL || "",
    timezone,
    user: {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      roles: agent.role === "admin" ? ["administrator"] : ["agent"],
    },
  };
};

export default function Inbox() {
  const data = useLoaderData<typeof loader>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const boot = {
      restUrl: "/api/kmbp/",
      appUrl: data.appUrl,
      shop: data.shop,
      timezone: data.timezone,
      gmtOffset: 0,
      user: data.user,
      caps: {
        isAdmin: true,
        canAccessMessaging: true,
        canManageSettings: true,
        canManageDepts: true,
      },
    };
    window.KinetixMessagingBoot = boot;
    applyBoot(boot);
    setReady(true);
  }, [data]);

  if (!ready) return null;
  return <OmnichannelApp />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
