/// <reference types="vite/client" />
/// <reference types="@react-router/node" />

declare module "*.jsx";

declare module "*client.js" {
  export function applyBoot(boot: Record<string, unknown>): void;
}

interface Window {
  KinetixMessagingBoot?: Record<string, unknown>;
  shopify?: { idToken?: () => Promise<string> };
}

declare namespace JSX {
  interface IntrinsicElements {
    "s-app-nav": import("react").DetailedHTMLProps<
      import("react").HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
  }
}
