import { useEffect, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ModalState {
    isOpen?: boolean;
    title?: string;
    message?: ReactNode;
    [key: string]: any;
}

interface ConfirmationModalProps {
    modalState: ModalState;
    setModalState: Dispatch<SetStateAction<ModalState>>;
    onConfirm: () => void;
    isRemoving?: boolean;
    confirmText?: string;
    cancelText?: string;
}

export default function ConfirmationModal({
    modalState = {},
    setModalState,
    onConfirm,
    isRemoving = false,
    confirmText = "Confirm",
    cancelText = "Cancel",
}: ConfirmationModalProps) {
    const { isOpen = false, title = "", message = "" } = modalState;

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "auto";
        }
        return () => { document.body.style.overflow = "auto"; };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-[#202223]/60 backdrop-blur-[2px] transition-opacity "
                onClick={() => !isRemoving && setModalState({ isOpen: false })}
            />

            {/* Modal Container */}
            <div className="relative bg-white w-full max-w-[450px] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="px-6 py-4 border-b border-[#f1f2f3] flex items-center justify-between bg-[#fafbfb]">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={18} className="text-red-600" />
                        <h3 className="text-sm font-bold text-[#202223] uppercase tracking-wider ">
                            {title || "Confirm Action"}
                        </h3>
                    </div>
                    {!isRemoving && (
                        <button
                            onClick={() => setModalState({ isOpen: false })}
                            className="text-gray-400 hover:text-black transition-colors cursor-pointer"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Body */}
                <div className="p-6">
                    <p className="text-[#202223] text-sm leading-relaxed">
                        {message || "Are you sure you want to proceed with this operation? This action may be permanent."}
                    </p>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-[#fafbfb] border-t border-[#f1f2f3] flex justify-end gap-3">
                    <button
                        onClick={() => setModalState({ isOpen: false })}
                        disabled={isRemoving}
                        className="px-4 py-2 text-sm font-semibold cursor-pointer text-[#202223] bg-white border border-[#dfe3e8] rounded-md hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {cancelText}
                    </button>

                    <button
                        onClick={onConfirm}
                        disabled={isRemoving}
                        className="min-w-[120px] px-4 py-2 text-sm cursor-pointer font-bold text-white bg-red-600 rounded-md hover:bg-red-700 shadow-sm transition-all flex items-center justify-center gap-2 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed"
                    >
                        {isRemoving ? (
                            <>
                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Processing
                            </>
                        ) : (
                            confirmText
                        )}
                    </button>
                </div>

            </div>
        </div>
    );
}