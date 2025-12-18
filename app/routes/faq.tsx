import { useState } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import Navbar from "app/componant/app-nav";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import {
    HelpCircle,
    Tag,
    Trash2,
    Database,
    History,
    ChevronDown,
    ChevronUp,
    FileText,
    CheckCircle2,
    AlertCircle
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
        <div className="border border-gray-200 rounded-lg bg-white overflow-hidden transition-all duration-300 hover:shadow-sm mb-2">
            <button
                onClick={onClick}
                className="w-full flex items-center justify-between p-3 text-left bg-white hover:bg-gray-50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    {Icon && (
                        <div className={`p-1.5 rounded-md ${isOpen ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'} transition-colors`}>
                            <Icon size={16} />
                        </div>
                    )}
                    <span className="font-semibold text-sm text-gray-800">{question}</span>
                </div>
                {isOpen ? (
                    <ChevronUp className="text-gray-400" size={16} />
                ) : (
                    <ChevronDown className="text-gray-400" size={16} />
                )}
            </button>
            <div
                className={`transition-all duration-300 ease-in-out ${isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                    }`}
            >
                <div className="p-3 pt-0 text-xs text-gray-600 leading-relaxed border-t border-gray-100 mt-1">
                    {answer}
                </div>
            </div>
        </div>
    );
};

export default function FaqPage() {
    const { apiKey } = useLoaderData<typeof loader>();
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    const toggleFaq = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    const faqs = [
        {
            question: "What is Tag Field Manager?",
            icon: HelpCircle,
            answer: (
                <div className="space-y-3">
                    <p>
                        Tag Field Manager is a powerful bulk editing tool designed to help you manage tags and metafields across your Shopify store efficiently.
                    </p>
                    <p>
                        Whether you need to add tags to thousands of products, clean up old tags, or manage metafields, this app provides a simple, reliable interface to get the job done.
                    </p>
                    <div className="flex gap-2 mt-2">
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md font-medium">Products</span>
                        <span className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded-md font-medium">Customers</span>
                        <span className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded-md font-medium">Orders</span>
                        <span className="px-2 py-1 bg-orange-50 text-orange-700 text-xs rounded-md font-medium">Blog Posts</span>
                    </div>
                </div>
            ),
        },
        {
            question: "How do I add tags in bulk?",
            icon: Tag,
            answer: (
                <div className="space-y-4">
                    <p>
                        The <strong>Add Tags</strong> feature allows you to apply tags to resources using a two-step process:
                    </p>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>
                            <strong>Enter Tags:</strong> Manually type the tags you want to add in the input field.
                        </li>
                        <li>
                            <strong>Upload CSV:</strong> Upload a CSV file containing the identifiers of the items you want to tag (Max 5,000 records).
                        </li>
                    </ol>
                    <div className="bg-gray-50 p-3 rounded-md border border-gray-200 text-sm">
                        <p className="font-medium mb-1">Supported CSV Columns:</p>
                        <ul className="list-disc pl-5 space-y-1 text-gray-600">
                            <li><strong>ID:</strong> Shopify GID (e.g., <code>gid://shopify/Product/123...</code>)</li>
                            <li><strong>SKU:</strong> For Products</li>
                            <li><strong>Email:</strong> For Customers</li>
                            <li><strong>Name:</strong> For Orders (e.g., <code>#1001</code>)</li>
                            <li><strong>Handle:</strong> For Blog Posts</li>
                        </ul>
                    </div>
                </div>
            ),
        },
        {
            question: "How do I remove tags?",
            icon: Trash2,
            answer: (
                <div className="space-y-4">
                    <p>
                        The <strong>Remove Tags</strong> feature helps you clean up your store's tags. It works in two modes:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border p-3 rounded-lg">
                            <h4 className="font-semibold text-gray-800 mb-2">1. Global Removal</h4>
                            <p className="text-sm">
                                Search for tags using filters (Contains, Starts With, etc.) and remove selected tags from <strong>ALL</strong> items in your store that have them.
                            </p>
                        </div>
                        <div className="border p-3 rounded-lg">
                            <h4 className="font-semibold text-gray-800 mb-2">2. Specific Removal</h4>
                            <p className="text-sm">
                                Upload a CSV file to remove selected tags <strong>ONLY</strong> from the specific items listed in your file.
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
                        To ensure reliability and maintain accurate history logs, we limit CSV uploads to <strong>5,000 records</strong> per file.
                    </p>
                    <div className="bg-orange-50 text-orange-800 p-3 rounded-md border border-orange-100 text-xs">
                        <p className="font-semibold mb-1">Why this limit?</p>
                        <p>Processing large files while tracking every change in the History can impact performance. Please split larger datasets into multiple files of 5,000 records or less.</p>
                    </div>
                </div>
            ),
        },
        {
            question: "What is Metafield Clear?",
            icon: Database,
            answer: (
                <div>
                    <p className="mb-3">
                        <strong>Metafield Clear</strong> is a versatile tool for managing your metafields. It allows you to:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-gray-600 mb-3">
                        <li><strong>Bulk Delete:</strong> Remove metafield definitions and their values to clean up unused data.</li>
                        <li><strong>Bulk Update:</strong> Update existing metafield values or add new ones using a CSV file.</li>
                    </ul>
                    <div className="flex items-start gap-2 text-sm bg-blue-50 text-blue-800 p-3 rounded-md border border-blue-100">
                        <CheckCircle2 size={16} className="mt-0.5" />
                        <p>
                            Don't worry if you make a mistake! You can <strong>restore</strong> cleared or updated metafields within <strong>24 hours</strong> using the History page.
                        </p>
                    </div>
                </div>
            ),
        },
        {
            question: "Where can I see my past operations?",
            icon: History,
            answer: (
                <div className="space-y-3">
                    <p>
                        The <strong>History</strong> page serves as a comprehensive audit log for your store's bulk operations. It tracks:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-gray-600">
                        <li><strong>Tags Added:</strong> See exactly which tags were applied to which items.</li>
                        <li><strong>Tags Removed:</strong> Track tags that were deleted globally or specifically.</li>
                        <li><strong>Metafield Changes:</strong> Monitor bulk updates or deletions of metafields.</li>
                    </ul>
                    <p>
                        You can click the <strong>View</strong> button on any row to see the exact values (IDs, specific tags, or metafield keys) that were affected by that operation.
                    </p>
                </div>
            ),
        },
        {
            question: "How does the Undo feature work?",
            icon: History,
            answer: (
                <div className="space-y-3">
                    <p>
                        We understand that mistakes happen. Our <strong>Undo</strong> feature allows you to revert changes, but there are important rules to remember:
                    </p>
                    <div className="bg-blue-50 px-3 py-2 rounded border border-blue-100 text-xs space-y-1">
                        <div className="flex gap-1">
                            <span className="font-semibold text-blue-800">Time Limit:</span>
                            <span className="text-blue-900">
                                History logs expire after <strong>24 hours</strong>.
                            </span>
                        </div>
                        <div className="flex gap-1">
                            <span className="font-semibold text-blue-800">One-Time Use:</span>
                            <span className="text-blue-900">
                                Each operation can be restored <strong>only once</strong>.
                            </span>
                        </div>
                    </div>

                </div>
            ),
        },
        {
            question: "Do I need to keep the app open?",
            icon: FileText,
            answer: (
                <p>
                    For large bulk operations, it is recommended to keep the app tab open until the progress bar reaches 100%. The app processes items in batches to ensure reliability and stay within Shopify's API limits.
                </p>
            ),
        },
    ];

    return (
        <AppProvider embedded apiKey={apiKey}>
            <div className="min-h-screen bg-gray-50 pb-10">
                <div className="max-w-3xl mx-auto p-4 font-sans text-gray-900">
                    <Navbar />

                    <div className="text-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">
                            Frequently Asked Questions
                        </h1>
                        <p className="text-sm text-gray-600 max-w-xl mx-auto">
                            Learn how to get the most out of Tag Field Manager. Manage your store's data with confidence and ease.
                        </p>
                    </div>

                    <div className="space-y-2">
                        {faqs.map((faq, index) => (
                            <FaqItem
                                key={index}
                                question={faq.question}
                                answer={faq.answer}
                                icon={faq.icon}
                                isOpen={openIndex === index}
                                onClick={() => toggleFaq(index)}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </AppProvider>
    );
}
