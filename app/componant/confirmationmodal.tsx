import { useEffect } from "react";

export default function ConfirmationModal({
    modalState = {},       // { isOpen, title, message }
    setModalState,         // function to close modal
    onConfirm,             // function to run on confirm
    isRemoving = false,    // loading state
    confirmText = "Confirm", // button text
    cancelText = "Cancel",   // cancel button text
}) {
    const { isOpen = false, title = "", message = "" } = modalState;

    useEffect(() => {
        document.body.style.overflow = isOpen ? "hidden" : "auto";
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-2xl">
                <h3 className="text-xl font-bold mb-3 text-gray-900">{title}</h3>

                <p className="text-gray-700 mb-6">{message}</p>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={() => setModalState({ isOpen: false })}
                        disabled={isRemoving}
                        className="px-4 py-2 border border-gray-300 rounded-md  hover:bg-gray-50 transition disabled:opacity-50"
                    >
                        {cancelText}
                    </button>

                    <button
                        onClick={onConfirm}
                        disabled={isRemoving}
                        className={`px-4 py-2 rounded-md font-semibold bg-red-800 text-white transition disabled:opacity-50`}
                    >
                        {isRemoving ? (
                            <div className="flex items-center justify-center gap-2">
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Removing...
                            </div>
                        ) : (
                            confirmText
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}


