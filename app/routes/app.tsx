import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import translations from "@shopify/polaris/locales/en.json";
import prisma from "../db.server";


export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const url = new URL(request.url);
  const hostFromUrl = url.searchParams.get("host");
  console.log(hostFromUrl, ".......host");

  let active = await prisma.activeSubscription.findUnique({
    where: { shopDomain },
    select: { plan: true },
  });

  if (!active) {
    active = await prisma.activeSubscription.create({
      data: {
        shopDomain,
        plan: "FREE",
        subscriptionId: "free",
        popupShown: false,
        host: hostFromUrl || "",
      },
      select: { plan: true },
    });
  }

  // ✅ SIMPLE HOST SAVE (ONLY IF PRESENT)
  if (hostFromUrl) {
    await prisma.activeSubscription.update({
      where: { shopDomain },
      data: { host: hostFromUrl },
    });
  }

  const plan = active.plan ?? "FREE";
  let limits;

  if (plan === "FREE") {
    limits =
      (await prisma.freePlanLimits.findUnique({ where: { shopDomain } })) ??
      (await prisma.freePlanLimits.create({ data: { shopDomain } }));
  }

  if (plan === "BASIC") {
    limits =
      (await prisma.basicPlanLimits.findUnique({ where: { shopDomain } })) ??
      (await prisma.basicPlanLimits.create({ data: { shopDomain } }));
  }

  if (plan === "ADVANCED") {
    limits = Infinity;
  }

  return {
    apiKey: process.env.SHOPIFY_API_KEY!,
    planData: {
      plan,
      limits,
    },
  };
};


export default function App() {
  const { apiKey, planData } = useLoaderData<typeof loader>();
  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={translations}>
        <s-app-nav>
          {/* <s-link href="/app/add-tags">Add Tags</s-link>
          <s-link href="/app/remove-tags">Remove Tags</s-link>
          <s-link href="/app/metafield-manage">Metafield Manager</s-link> */}
          <s-link href="/app/export-data">Export Data</s-link>
          <s-link href="/app/history">History</s-link>
          <s-link href="/app/billing/subscribe">Subscription Plans</s-link>
          <s-link href="/app/faq">FAQ</s-link>
        </s-app-nav>
        {/* 👇 provide plan globally */}
        <Outlet context={{ planData }} />
      </PolarisAppProvider>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
