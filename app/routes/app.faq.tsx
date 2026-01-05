import { useState } from "react";
import { useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import {
    HelpCircle,
    Tag,
    Trash2,
    Database,
    History,
    ChevronDown,
    FileText,
    CheckCircle2,
    AlertCircle,
} from "lucide-react";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await authenticate.admin(request);
    return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

interface FaqItemProps {
    question: string;
    answer: React.ReactNode;
    icon?: React.ElementType;
    isOpen: boolean;
    onClick: () => void;
}

const FaqItem = ({ question, answer, icon: Icon, isOpen, onClick }: FaqItemProps) => {
    return (
        <div
            className={`bg-white rounded-lg shadow-sm border transition-all duration-200 mb-3 overflow-hidden ${isOpen ? 'border-black ring-1 ring-black/5' : 'border-[#dfe3e8] hover:border-[#babfc3]'
                }`}
        >
            <button
                onClick={onClick}
                className="w-full flex items-center justify-between p-3 sm:p-3.5 text-left bg-white hover:bg-gray-50 transition-colors cursor-pointer group"
            >
                <div className="flex items-center gap-3">
                    {Icon && (
                        <div className={`p-1.5 rounded-md border shrink-0 transition-colors ${isOpen
                            ? 'bg-black text-white border-black'
                            : 'bg-[#fafbfb] border-[#f1f2f3] text-[#5c5f62] group-hover:text-[#202223] group-hover:border-[#dfe3e8]'
                            }`}>
                            <Icon size={14} strokeWidth={2} />
                        </div>
                    )}
                    <span className={`font-semibold text-sm transition-colors ${isOpen ? 'text-black' : 'text-[#202223]'
                        }`}>
                        {question}
                    </span>
                </div>
                <div className={`ml-4 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-black' : ''}`}>
                    <ChevronDown size={16} />
                </div>
            </button>
            <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
                    }`}
            >
                <div className="p-3 sm:p-4 pt-0 text-xs sm:text-sm text-gray-600 leading-relaxed border-t border-transparent">
                    <div className="pt-3 border-t border-[#f1f2f3]">
                        {answer}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function FaqPage() {
    const [openIndex, setOpenIndex] = useState<number | null>(0);
    const navigate = useNavigate();

    const toggleFaq = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    const faqs = [
        {
            question: "What is Tag MetaField Manager?",
            icon: HelpCircle,
            answer: (
                <div className="space-y-3">
                    <p>
                        Tag MetaField Manager is a comprehensive bulk management tool designed to help you efficiently
                        <strong> add, remove, and manage tags and metafields</strong> across your Shopify store.
                    </p>
                    <p>
                        Built for scalability, it simplifies complex updates for large stores using CSV files,
                        ensuring data accuracy and safety.
                    </p>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] sm:text-xs rounded font-medium border border-blue-100">Products</span>
                        <span className="px-2 py-0.5 bg-green-50 text-green-700 text-[10px] sm:text-xs rounded font-medium border border-green-100">Customers</span>
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] sm:text-xs rounded font-medium border border-purple-100">Orders</span>
                        <span className="px-2 py-0.5 bg-orange-50 text-orange-700 text-[10px] sm:text-xs rounded font-medium border border-orange-100">Blog Posts</span>
                    </div>
                </div>
            ),
        },

        {
            question: "How do I add tags in bulk?",
            icon: Tag,
            answer: (
                <div className="space-y-3">
                    <p>
                        The <strong>Add Tags</strong> feature streamlines adding tags to multiple items simultaneously via CSV.
                    </p>
                    <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                        <ol className="list-decimal pl-4 space-y-2 text-xs sm:text-sm">
                            <li className="pl-1">
                                <span className="font-semibold text-gray-900">Enter Tags:</span> Type the tags you wish to apply.
                            </li>
                            <li className="pl-1">
                                <span className="font-semibold text-gray-900">Upload CSV:</span> Upload a CSV containing item identifiers
                                (limit: <strong>5,000 records</strong> per file).
                            </li>
                        </ol>
                    </div>

                    <div className="mt-2">
                        <p className="font-medium text-[10px] sm:text-xs uppercase tracking-wider text-gray-500 mb-1.5">Supported Identifiers</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs sm:text-sm">
                            <div className="flex items-center gap-1.5 p-1.5 rounded bg-white border border-gray-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                <span><strong>Products:</strong> ID or SKU</span>
                            </div>
                            <div className="flex items-center gap-1.5 p-1.5 rounded bg-white border border-gray-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                <span><strong>Customers:</strong> ID or Email</span>
                            </div>
                            <div className="flex items-center gap-1.5 p-1.5 rounded bg-white border border-gray-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                                <span><strong>Orders:</strong> ID or Name (#1001)</span>
                            </div>
                            <div className="flex items-center gap-1.5 p-1.5 rounded bg-white border border-gray-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                                <span><strong>Blog Posts:</strong> ID or Handle</span>
                            </div>
                        </div>
                    </div>
                </div>
            ),
        },

        {
            question: "How do I remove tags?",
            icon: Trash2,
            answer: (
                <div className="space-y-3">
                    <p>
                        The <strong>Remove Tags</strong> feature offers flexible ways to clean up your data.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="border border-[#dfe3e8] p-3 rounded-lg bg-white hover:border-gray-400 transition-colors">
                            <h4 className="font-bold text-[#202223] mb-1.5 flex items-center gap-1.5 text-xs sm:text-sm">
                                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-gray-100 text-[10px]">1</span>
                                Specific Items
                            </h4>
                            <p className="text-xs sm:text-sm text-gray-500">
                                Upload a CSV file to remove tags only from the specific items listed.
                            </p>
                        </div>

                        <div className="border border-[#dfe3e8] p-3 rounded-lg bg-white hover:border-gray-400 transition-colors">
                            <h4 className="font-bold text-[#202223] mb-1.5 flex items-center gap-1.5 text-xs sm:text-sm">
                                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-gray-100 text-[10px]">2</span>
                                All Items
                            </h4>
                            <p className="text-xs sm:text-sm text-gray-500">
                                Use filters (e.g., "starts with") to find and remove tags from <strong>all resources</strong> globally.
                            </p>
                        </div>
                    </div>
                </div>
            ),
        },

        {
            question: "What is the limit for CSV uploads?",
            icon: AlertCircle,
            answer: (
                <div className="space-y-2">
                    <p>
                        To ensure optimal performance, each CSV file is limited to <strong>5,000 records</strong>.
                    </p>
                    <div className="flex items-start gap-2 bg-orange-50 text-orange-800 p-3 rounded-md border border-orange-100 text-xs sm:text-sm">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-orange-600" />
                        <div>
                            <p className="font-semibold mb-0.5 text-orange-900">Why this limit?</p>
                            <p className="opacity-90">
                                This limit helps maintain system speed and ensures the accuracy of your operation history.
                                For larger datasets, please split your data into multiple CSV files.
                            </p>
                        </div>
                    </div>
                </div>
            ),
        },

        {
            question: "What is Metafield Manager?",
            icon: Database,
            answer: (
                <div className="space-y-3">
                    <p>
                        The <strong>Metafield Manager</strong> is a powerful tool for bulk metafield operations.
                    </p>
                    <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                        <ul className="space-y-1.5 text-xs sm:text-sm">
                            <li className="flex items-start gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                                <span><strong>Remove globally:</strong> Delete specific metafields from all items.</span>
                            </li>
                            <li className="flex items-start gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                                <span><strong>Remove via CSV:</strong> targeted removal for specific items.</span>
                            </li>
                            <li className="flex items-start gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                                <span><strong>Add/Update via CSV:</strong> Bulk create or modify metafield values.</span>
                            </li>
                        </ul>
                    </div>
                    <p className="text-xs text-gray-500 italic">
                        * Supports various metafield types (single value, list, reference) with specific CSV formats.
                    </p>
                </div>
            ),
        },

        {
            question: "Where can I see my past operations?",
            icon: History,
            answer: (
                <div className="space-y-2">
                    <p>
                        All bulk actions are logged in the <strong>History</strong> section, stored in a custom metaobject.
                    </p>
                    <div className="flex flex-wrap gap-1.5 text-xs sm:text-sm">
                        <span className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200">Tags Added</span>
                        <span className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200">Tags Removed</span>
                        <span className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200">Metafield Operations</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                        Records are retained for <strong>2 days</strong> before being automatically cleared.
                    </p>
                </div>
            ),
        },

        {
            question: "How does the Undo feature work?",
            icon: History,
            answer: (
                <div className="space-y-2">
                    <p>
                        Mistakes happen! You can revert operations within a limited window.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="bg-blue-50 p-2.5 rounded-md border border-blue-100">
                            <span className="block text-[10px] font-bold text-blue-800 uppercase tracking-wide mb-0.5">Time Limit</span>
                            <span className="text-xs sm:text-sm text-blue-900">Available for <strong>2 days</strong> after the operation.</span>
                        </div>
                        <div className="bg-blue-50 p-2.5 rounded-md border border-blue-100">
                            <span className="block text-[10px] font-bold text-blue-800 uppercase tracking-wide mb-0.5">Usage</span>
                            <span className="text-xs sm:text-sm text-blue-900">Each operation can be undone <strong>only once</strong>.</span>
                        </div>
                    </div>
                </div>
            ),
        },

        {
            question: "Do I need to keep the app open?",
            icon: FileText,
            answer: (
                <div className="flex items-start gap-2 bg-yellow-50 p-3 rounded-md border border-yellow-100">
                    <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-bold text-yellow-900 mb-0.5 text-xs sm:text-sm">Yes, please keep the tab open.</p>
                        <p className="text-xs sm:text-sm text-yellow-800">
                            For large bulk operations, the app must remain open until progress hits <strong>100%</strong>.
                            We process data in batches to respect Shopify's API rate limits.
                        </p>
                    </div>
                </div>
            ),
        },
    ];


    return (
        <div className="min-h-screen bg-[#f6f6f7] pb-24">
            <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 font-sans text-gray-900">

                <div className="text-center mb-8">
                    <div className="text-2xl font-extrabold text-[#202223] mb-5 leading-tight">
                        Frequently Asked Questions
                    </div>


                    <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
                        Everything you need to know about managing your store's data with
                        <span className="font-semibold text-gray-800"> Tag MetaField Manager</span>.
                        Can't find what you're looking for? Reach out to our support team.
                    </p>
                </div>

                <div className="space-y-4">
                    {faqs.map((faq, index) => (
                        <div key={index} className="transition-all duration-200 hover:translate-y-[-1px]">
                            <FaqItem
                                question={faq.question}
                                answer={faq.answer}
                                icon={faq.icon}
                                isOpen={openIndex === index}
                                onClick={() => toggleFaq(index)}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
