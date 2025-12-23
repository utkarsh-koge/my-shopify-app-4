import { useEffect } from "react";
import { AlertCircle, X } from "lucide-react";

export default function AlertModal({
    modalState = {},       // { isOpen, title, message }
    setModalState,         // function to close modal
    onClose,               // optional callback
    confirmText = "OK",
}) {
    const { isOpen = false, title = "", message = "" } = modalState;

    // Prevent background scrolling when modal is active
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "auto";
        }
        return () => { document.body.style.overflow = "auto"; };
    }, [isOpen]);

    const handleClose = () => {
        setModalState({ ...modalState, isOpen: false });
        if (onClose) onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-[#202223]/60 backdrop-blur-[2px] cursor-pointer transition-opacity"
                onClick={handleClose}
            />

            {/* Modal Container */}
            <div className="relative bg-white w-full max-w-[400px] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="px-6 py-4 border-b border-[#f1f2f3] flex items-center justify-between bg-[#fafbfb]">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={18} className="text-blue-600" />
                        <h3 className="text-sm font-bold text-[#202223] uppercase tracking-wider">
                            {title || "Notice"}
                        </h3>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-gray-400 cursor-pointer hover:text-black transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">
                    <p className="text-[#202223] text-sm leading-relaxed">
                        {message}
                    </p>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-[#fafbfb] border-t border-[#f1f2f3] flex justify-end">
                    <button
                        onClick={handleClose}
                        className="min-w-[80px] px-4 py-2 text-sm font-bold text-white bg-black rounded-md hover:bg-gray-800 shadow-sm transition-all"
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
