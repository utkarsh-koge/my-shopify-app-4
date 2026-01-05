import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";



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
    <div className="min-h-screen flex items-center justify-center bg-white text-black font-sans p-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-5xl font-black tracking-tighter uppercase">
            Tag Field Manager
          </h1>
          <p className="text-xl font-medium text-gray-600 max-w-lg mx-auto">
            The ultimate tool for bulk managing tags and metafields across your Shopify store.
          </p>
        </div>

        {showForm && (
          <Form className="max-w-md mx-auto space-y-4" method="post" action="/auth/login">
            <label className="block text-left">
              <span className="block text-sm font-bold uppercase tracking-wide mb-1">Shop Domain</span>
              <input
                className="w-full px-4 py-3 border-2 border-black rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                type="text"
                name="shop"
                placeholder="e.g. my-shop.myshopify.com"
              />
            </label>
            <button
              className="w-full px-6 py-3 bg-black text-white font-bold rounded-lg hover:bg-gray-800 transition-colors uppercase tracking-wide"
              type="submit"
            >
              Log in
            </button>
          </Form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left pt-8 border-t border-gray-200">
          <div className="p-4 border border-gray-100 rounded-xl hover:border-black transition-colors">
            <strong className="block text-lg font-bold mb-2">Bulk Tagging</strong>
            <p className="text-sm text-gray-600">
              Add or remove tags from thousands of products, customers, and orders in seconds using CSVs.
            </p>
          </div>
          <div className="p-4 border border-gray-100 rounded-xl hover:border-black transition-colors">
            <strong className="block text-lg font-bold mb-2">Metafield Control</strong>
            <p className="text-sm text-gray-600">
              Clean up unused metafields or bulk update values with precision and ease.
            </p>
          </div>
          <div className="p-4 border border-gray-100 rounded-xl hover:border-black transition-colors">
            <strong className="block text-lg font-bold mb-2">Safe & Secure</strong>
            <p className="text-sm text-gray-600">
              Every operation is logged. Undo mistakes within 24 hours with our built-in history and restore feature.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
