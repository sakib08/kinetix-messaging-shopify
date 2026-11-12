# Kinetix Messaging for Shopify

Shopify app that matches the Kinetix Messaging WordPress plugin: one inbox for live chat, email, WhatsApp, Messenger, Instagram, Telegram, SMS, LINE, Viber, and WeChat, plus departments, agent presence, and an AI knowledge base.

The Hydrogen storefront in `/home/sakib/web/shopify` is separate. This app is what a merchant installs in Shopify admin.

## Run it locally

```bash
npm install
npm run dev
```

`npm run dev` starts the Shopify CLI, which creates the app in your Partner account, a tunnel, and the database. Open the app on a development store.

Then:

1. In the app, open **Settings** (gear in the inbox sidebar) and connect a channel.
2. Copy the webhook URL shown on that channel into the provider (Meta, Telegram, Twilio, and the rest). Each URL includes `?shop=your-store.myshopify.com`.
3. In the theme editor, enable the **Kinetix live chat** app embed. Turn Live Chat on in the app first.

## What is included

- Embedded inbox with the same conversation list, reply box, assignment, status, and channel filters as the WordPress admin.
- Channel settings, team departments, business hours, browser notifications, and AI settings.
- Provider webhooks and outbound send for each channel. Email uses the SMTP and IMAP settings you save.
- Storefront chat bubble (theme app extension) that talks to the app through the `apps/kinetix` app proxy.
- AI replies from manual articles and, when enabled, indexed Shopify products and pages. OpenAI, Grok, Claude, Gemini, and OpenAI-compatible endpoints use the same provider switch as the plugin.
- App uninstall and the privacy webhooks delete that shop’s messages.

SQLite is the local database (`prisma/dev.sqlite`). Use Postgres when you deploy more than one app server.
