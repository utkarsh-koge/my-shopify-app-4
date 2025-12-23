import { useNavigate } from "react-router";
import {
  Tags,
  Trash2,
  Database,
  HelpCircle,
  History,
  ArrowRight,
  LayoutGrid,
  Loader2 // Added for the spinner
} from "lucide-react";
import { CheckCircle2 } from "lucide-react";
import React, { useState } from "react"; // Added useState

export default function HomePage() {
  const navigate = useNavigate();
  const [isNavigating, setIsNavigating] = useState(false);

  // Helper to handle navigation with a brief loading state
  const handleNavigation = (path) => {
    setIsNavigating(true);
    // The timeout ensures the user sees the transition if the next page loads instantly
    setTimeout(() => {
      navigate(path);
    }, 200);
  };

  const modules = [
    {
      title: "Remove Tags",
      desc: "Search for tags by condition and remove them from your entire store or specific items via CSV upload.",
      route: "/remove-tags",
      icon: <Trash2 className="w-5 h-5 text-black" />,
      action: "Remove Tags",
    },
    {
      title: "Bulk Add Tags",
      desc: "Quickly append multiple tags to products, customers, or orders using a simple CSV identifier list.",
      route: "/add-tags",
      icon: <Tags className="w-5 h-5 text-black" />,
      action: "Add Tags",
    },
    {
      title: "Metafield Manager",
      desc: "Manage metafield definitions and values. Clear data globally or perform bulk updates using CSV files.",
      route: "/metafield-manage",
      icon: <Database className="w-5 h-5 text-black" />,
      action: "Manage Metafields",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f6f6f7] p-8 font-sans relative">
      {/* Loading Overlay */}
      {isNavigating && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-[2px] z-50 flex items-center justify-center transition-opacity">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-black" />
            <span className="text-xs font-bold uppercase tracking-tighter text-black">Loading...</span>
          </div>
        </div>
      )}

      <div className={`max-w-5xl mx-auto transition-opacity duration-300 ${isNavigating ? 'opacity-50' : 'opacity-100'}`}>

        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>

            <h1 className="text-2xl font-bold text-[#202223] tracking-tight">Tag-Field Manager</h1>
            <p className="text-sm text-gray-500 mt-1">
              Select a module to begin managing your store data.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleNavigation("/faq")}
              className="flex cursor-pointer items-center gap-2 px-4 py-2 bg-white border border-[#dfe3e8] rounded-md shadow-sm text-xs font-bold text-[#202223] hover:bg-gray-50 transition-all"
            >
              <HelpCircle size={14} />
              FAQ
            </button>
            <button
              onClick={() => handleNavigation("/history")}
              className="flex cursor-pointer items-center gap-2 px-4 py-2 bg-white border border-[#dfe3e8] rounded-md shadow-sm text-xs font-bold text-[#202223] hover:bg-gray-50 transition-all"
            >
              <History size={14} />
              History
            </button>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {modules.map((module) => (
            <div
              key={module.title}
              className="bg-white rounded-xl shadow-sm border border-[#dfe3e8] p-6 flex flex-col h-full hover:border-black transition-all duration-200 group"
            >
              <div className="flex flex-col items-start mb-6">
                <div className="p-3 bg-[#fafbfb] rounded-lg border border-[#f1f2f3] group-hover:bg-black group-hover:text-white transition-colors duration-200 mb-4">
                  {React.cloneElement(module.icon, {
                    className: "w-6 h-6 group-hover:text-white transition-colors"
                  })}
                </div>
                <h2 className="text-base font-bold text-[#202223]">
                  {module.title}
                </h2>
              </div>

              <p className="text-sm text-gray-500 mb-8 flex-grow leading-relaxed">
                {module.desc}
              </p>

              <button
                onClick={() => handleNavigation(module.route)}
                disabled={isNavigating}
                className="w-full cursor-pointer flex items-center justify-between px-4 py-2.5 bg-white border border-black text-black rounded-md text-xs font-bold hover:bg-black hover:text-white transition-all shadow-sm disabled:opacity-50"
              >
                {module.action}
                <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Quick Tips Footer */}
        <div className="mt-12 p-6 bg-white border border-[#dfe3e8] rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-blue-50 p-2 rounded-full">
              <CheckCircle2 size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#202223]">Safe Operations Guaranteed</p>
              <p className="text-xs text-gray-500">Every bulk action is recorded and can be reverted within 24 hours.</p>
            </div>
          </div>
          <button
            onClick={() => handleNavigation("/history")}
            className="text-xs cursor-pointer font-bold text-gray-500 hover:text-black underline underline-offset-4"
          >
            View Recent Activity
          </button>
        </div>
      </div>
    </div>
  );
}