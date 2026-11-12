import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Kinetix Messaging</h1>
        <p className={styles.text}>
          One inbox for live chat, email, WhatsApp, Messenger, Telegram, Instagram, SMS, LINE, Viber, and WeChat.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Shared inbox</strong>. Reply to every channel from Shopify admin, with departments, assignment, and agent presence.
          </li>
          <li>
            <strong>Storefront chat</strong>. A theme app embed puts the live chat bubble on the online store.
          </li>
          <li>
            <strong>AI assistant</strong>. Answer from a knowledge base, then hand the thread to a person.
          </li>
        </ul>
      </div>
    </div>
  );
}
