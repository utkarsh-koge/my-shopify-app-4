import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import "./styles/tailwind.css";
export function ErrorBoundary() {
  return (
    <html lang="en">
      <head>
        <title>System Error</title>
        <Meta />
        <Links />
      </head>
      <body className="bg-white text-black antialiased">
        <div className="flex flex-col items-center justify-center h-screen p-6">
          {/* Main Error Container */}
          <div className="max-w-md w-full border-t-4 border-black pt-8">
            <h1 className="text-6xl font-black uppercase tracking-tighter mb-6">
              Error 404.
            </h1>

            <p className="text-xl font-bold leading-none mb-4">
              Page Not Found.
            </p>

            <p className="text-sm font-medium leading-relaxed text-gray-900 mb-10">
              The page you are looking for does not exist or has been moved.
            </p>

            {/* Simple Text Instruction */}
            <div className="pt-6 border-t border-gray-200">
              <p className="text-sm font-black uppercase tracking-[0.2em]">
                Please return to the{" "}
                <span className="text-red-600">home page</span>.
              </p>

            </div>
          </div>

          {/* Status Code */}
          <p className="absolute bottom-10 text-[10px] font-mono uppercase tracking-widest opacity-40">
            404 Not Found
          </p>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />

        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <link rel="preconnect" href="https://cdn.shopify.com/" />

        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
