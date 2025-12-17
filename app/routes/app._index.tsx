import { useNavigate } from "react-router";
import { HelpCircle, History } from "lucide-react";

export default function HomePage() {
  const navigate = useNavigate();

  const modules = [
    {
      title: "Remove Tags",
      desc: "Fetch tags by condition, select tags, and remove globally or via CSV.",
      route: "/remove-tags",
    },
    {
      title: "Bulk Add Tags",
      desc: "Add multiple tags to selected object types using CSV data.",
      route: "/add-tags",
    },
    {
      title: "Metafield Manager",
      desc: "Fetch & select metafields to clear globally, clear via CSV, or update/add via CSV.",
      route: "/metafield-manage",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-10 flex flex-col items-center relative"> {/* Added relative for button positioning */}

      {/* FAQ and HISTORY Buttons in Top Right Corner */}
      <div className="absolute top-10 right-10 flex space-x-4">
        <button
          className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors shadow-sm flex items-center gap-2"
          onClick={() => navigate("/faq")} // Assuming an /faq route
        >
          <HelpCircle size={18} />
          FAQ
        </button>
        <button
          className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors shadow-sm flex items-center gap-2"
          onClick={() => navigate("/history")} // Assuming a /history route
        >
          <History size={18} />
          History
        </button>
      </div>

      <h1 className="text-4xl font-bold text-black mb-3 mt-10">Tag-Field Manager 🏷️</h1> {/* Adjusted margin-top for better spacing below buttons */}
      <p className="text-gray-700 max-w-xl text-center mb-10">
        Manage your Shopify store tags and metafields easily. Upload CSV to add/remove tags,
        and clear or update metafield values in bulk from different resources.
      </p>

      {/* Modules Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl mb-10">
        {modules.map((module) => (
          <div
            key={module.title}
            className="bg-white rounded-2xl shadow-md border hover:shadow-xl transition-all p-6 flex flex-col justify-between items-center text-center"
          >
            <h2 className="text-xl font-semibold text-gray-800 mb-2">{module.title}</h2>
            <p className="text-gray-600 text-sm mb-4">{module.desc}</p>
            <button
              className="px-4 py-2 bg-gray-200 text-black border rounded-lg hover:bg-gray-700 hover:text-white cursor-pointer transition-all"
              onClick={() => navigate(module.route)}
            >
              Go ➜
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}