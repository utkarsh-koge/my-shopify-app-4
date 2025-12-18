import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import Navbar from "app/componant/app-nav";
import ConfirmationModal from "../componant/confirmationmodal";
import { LogsTable } from "app/componant/history-form";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function LogsPage() {
  const fetcher = useFetcher();
  const { apiKey } = useLoaderData<typeof loader>();

  const [openRow, setOpenRow] = useState<number | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreTotal, setRestoreTotal] = useState(0);
  const [restoreCompleted, setRestoreCompleted] = useState(0);
  const [globalId, setGlobalId] = useState(null);
  const [restore, setRestore] = useState(true);
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: "",
    message: "",
    logToRestore: null,
  });

  //  Run fetch only when restore is triggered manually
  useEffect(() => {
    if (!restore) return;

    const timeout = setTimeout(() => {
      fetcher.load("/api/check/db");
    }, 50);

    return () => clearTimeout(timeout);
  }, [restore]);

  // Prevent reload/close while running
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRestoring) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isRestoring]);

  useEffect(() => {
    const runRestore = async () => {
      const shouldRunRestore =
        restoreCompleted >= restoreTotal &&
        isRestoring
      if (!shouldRunRestore) return;

      const formData = new FormData();
      formData.append("rowId", JSON.stringify(globalId));

      const response = await fetch("/api/remove/db", {
        method: "POST",
        body: formData,
      });

      const res = await response.json();

      if (res.success) {
        setRestore(true);        // triggers fetcher.load
      } else {
        console.error("Restore failed:", res.errors);
      }
    };

    runRestore();
  }, [restoreCompleted, restoreTotal]);

  useEffect(() => {
    if (modalState?.isOpen) {
      setGlobalId(modalState?.logToRestore?.id);
    }
  }, [modalState])

  // Handle fetch results safely
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    setRestore(false);
    setLogs(fetcher?.data?.logs);
    setIsLoading(false);
  }, [fetcher.state, fetcher.data]);

  //  User clicks restore
  const handleRestoreClick = (log) => {
    console.log(log, '...........this is the row')

    let message = "Are you sure you want to restore the removed data?";
    if (log.operation === "Tags-removed") {
      message = "Are you sure you want to restore the removed tags?";
    } else if (log.operation === "Tags-Added") {
      message = "Are you sure you want to remove the added tags?";
    } else if (log.operation === "Metafield-removed") {
      message = "Are you sure you want to restore the removed metafields?";
    } else if (log.operation === "Metafield-updated") {
      message = "Are you sure you want to revert the metafield updates?";
    }

    setModalState({
      isOpen: true,
      title: "Confirm Restore",
      message: message,
      logToRestore: log,
    });
  };

  //  Confirm restore
  const handleConfirmRestore = async () => {
    const log = modalState.logToRestore;

    // Close modal first
    setModalState({
      isOpen: false,
      title: "",
      message: "",
      logToRestore: null,
    });

    if (!log) return;

    const operation = log.operation;
    const objectType = log.objectType;

    const rows =
      operation === "Tags-removed"
        ? log.value.filter((v) => v.removedTags?.length > 0)
        : log.value || [];

    if (!rows.length) return;

    // Start restoring popup
    setRestoreCompleted(0);
    setRestoreTotal(rows.length);
    setIsRestoring(true);
    // Perform restore sequentially
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i];

      let payload: any = { id: v.id, objectType, operation };

      if (operation === "Tags-removed") {
        payload.tags = v.removedTags;
      } else if (operation === "Tags-Added") {
        payload.tags = v.tagList ? v.tagList.split(",").map((t) => t.trim()) : [];
      } else if (operation === "Metafield-removed") {
        payload.namespace = v.data?.namespace;
        payload.key = v.data?.key;
        payload.type = v.data?.type;
        payload.value = v.data?.value;
      } else if (operation === "Metafield-updated") {
        payload.namespace = v.namespace || v.data?.namespace;
        payload.key = v.key || v.data?.key;
      }

      const formData = new FormData();
      formData.append("rows", JSON.stringify([payload]));

      const res = await fetch("/api/restore/db", {
        method: "POST",
        body: formData,
      }).then((r) => r.json());

      if (res.success) {
        setRestoreCompleted((prev) => prev + 1);
      }
    }
  };
  console.log(logs, '..........logssssssss')
  return (
    <AppProvider embedded apiKey={apiKey}>
      <Navbar />

      <ConfirmationModal
        modalState={modalState}
        setModalState={setModalState}
        onConfirm={handleConfirmRestore}
        confirmText="Restore"
        cancelText="Cancel"
        isRemoving={false}
      />

      {isRestoring && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-white p-6 rounded-xl shadow-lg w-96 text-center border border-black">
            <h2 className="text-xl font-semibold mb-3 text-black">
              {restoreCompleted < restoreTotal
                ? "Restoring..."
                : "Restore Completed"}
            </h2>

            {restoreCompleted < restoreTotal ? (
              <>
                <div className="w-full bg-gray-200 h-4 rounded-full overflow-hidden border border-black">
                  <div
                    className="bg-green-600 h-full transition-all duration-300"
                    style={{
                      width: `${(restoreCompleted / restoreTotal) * 100}%`,
                    }}
                  ></div>
                </div>

                <p className="mt-3 text-black">
                  {restoreCompleted} of {restoreTotal} restored
                </p>

                <p className="text-sm text-gray-600 mt-1">Please wait...</p>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-700 mb-4">
                  All items restored successfully.
                </p>

                <button
                  onClick={() => setIsRestoring(false)}
                  className="mt-2 px-4 py-2 bg-black text-white rounded-lg shadow hover:bg-gray-800 transition w-full"
                >
                  OK
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="ml-2 mt-2 flex flex-col gap-2 max-w-max">
        <div className="flex items-center gap-2 py-1 px-2 bg-red-50 border-l-2 border-red-500 rounded-sm">
          <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
          <p className="text-[11px] text-red-700 font-bold uppercase tracking-tight">
            History expires in 24h
          </p>
        </div>
      </div>
      <LogsTable
        logs={logs}
        openRow={openRow}
        setOpenRow={setOpenRow}
        handleRestore={handleRestoreClick}
        isLoading={isLoading}
      />
    </AppProvider>
  );
}

