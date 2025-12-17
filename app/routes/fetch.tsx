import { useLoaderData } from "react-router";
import * as XLSX from "xlsx";
import { authenticate } from "../shopify.server";

// ---------------- Loader ----------------
export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  // Helper function to fetch all items with pagination
  async function fetchAll(queryName, queryNode) {
    let items = [];
    let hasNextPage = true;
    let after = null;

    while (hasNextPage) {
      const query = `
        query {
          ${queryName}(first: 250${after ? `, after: "${after}"` : ""}) {
            edges { node { ${queryNode} } }
            pageInfo { hasNextPage endCursor }
          }
        }
      `;
      const res = await admin.graphql(query);
      const json = await res.json();
      const edges = json?.data?.[queryName]?.edges || [];
      items.push(...edges.map((e) => ({ id: e.node.id })));
      hasNextPage = json?.data?.[queryName]?.pageInfo?.hasNextPage;
      after = json?.data?.[queryName]?.pageInfo?.endCursor;
    }

    return items;
  }

  const products = await fetchAll("products", "id");
  const customers = await fetchAll("customers", "id");

  return { products, customers };
}

// ---------------- Component ----------------
export default function ExportTest() {
  const { products, customers } = useLoaderData();

  // Download products only
  function downloadProducts() {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(products);
    XLSX.utils.book_append_sheet(wb, sheet, "Products");
    XLSX.writeFile(wb, "products.xlsx");
  }

  // Download customers only
  function downloadCustomers() {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(customers);
    XLSX.utils.book_append_sheet(wb, sheet, "Customers");
    XLSX.writeFile(wb, "customers.xlsx");
  }

  // Download both in one file
  function downloadAll() {
    const wb = XLSX.utils.book_new();

    const productSheet = XLSX.utils.json_to_sheet(products);
    const customerSheet = XLSX.utils.json_to_sheet(customers);

    XLSX.utils.book_append_sheet(wb, productSheet, "Products");
    XLSX.utils.book_append_sheet(wb, customerSheet, "Customers");

    XLSX.writeFile(wb, "shopify-test-ids.xlsx");
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h2 className="text-2xl font-bold mb-4">Export Product & Customer IDs</h2>

      {/* Summary cards */}
      <div className="flex gap-6 mb-6">
        <div className="p-4 bg-white shadow rounded w-40 text-center">
          <p className="text-3xl font-semibold">{products.length}</p>
          <p className="text-sm text-gray-500">Products</p>
        </div>

        <div className="p-4 bg-white shadow rounded w-40 text-center">
          <p className="text-3xl font-semibold">{customers.length}</p>
          <p className="text-sm text-gray-500">Customers</p>
        </div>
      </div>

      {/* Download Buttons */}
      <div className="flex gap-4 mb-8">
        <button
          onClick={downloadProducts}
          className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Download Products
        </button>

        <button
          onClick={downloadCustomers}
          className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Download Customers
        </button>

        <button
          onClick={downloadAll}
          className="px-6 py-3 bg-purple-600 text-white rounded hover:bg-purple-700"
        >
          Download All (2 sheets)
        </button>
      </div>

      {/* Preview Section */}
      <h3 className="font-semibold mb-2">Preview (first 10)</h3>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium mb-1">Products</h4>
          <pre className="text-xs bg-gray-100 p-3 rounded h-48 overflow-auto">
            {JSON.stringify(products.slice(0, 10), null, 2)}
          </pre>
        </div>

        <div>
          <h4 className="font-medium mb-1">Customers</h4>
          <pre className="text-xs bg-gray-100 p-3 rounded h-48 overflow-auto">
            {JSON.stringify(customers.slice(0, 10), null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
