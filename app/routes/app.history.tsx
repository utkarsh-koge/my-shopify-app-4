import { useEffect, useState, type ReactNode } from "react";
import { useFetcher, useNavigate } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import ConfirmationModal from "app/component/ConfirmationModal";
import { LogsTable, type Log } from "app/component/HistoryForm";
import { CheckCircle, Loader2 } from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

interface ModalState {
  isOpen?: boolean;
  title?: string;
  message?: ReactNode;
  logToRestore?: Log | null;
}

interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

interface FetchParams {
  cursor: string | null;
  direction: string;
}

export default function LogsPage() {
  const fetcher = useFetcher<any>();
  const navigate = useNavigate();
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreTotal, setRestoreTotal] = useState(0);
  const [restoreCompleted, setRestoreCompleted] = useState(0);
  const [globalId, setGlobalId] = useState<string | null>(null);
  const [restore, setRestore] = useState(true);
  const [logs, setLogs] = useState<Log[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [iscreateDB, setIscreateDB] = useState(true);
  const [pageInfo, setPageInfo] = useState<PageInfo>({
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: null,
    endCursor: null,
  });

  const [lastFetchParams, setLastFetchParams] = useState<FetchParams>({
    cursor: null,
    direction: "next",
  });

  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    title: "",
    message: "",
    logToRestore: null,
  });

  //  Run fetch only when restore is triggered manually
  function createDatabase() {
    fetcher.submit(
      {}, // no body needed
      {
        method: "post",
        action: "/api/metaCreate/db",
      },
    );
  }

  const handleCreateDatabaseClick = () => {
    setModalState({
      isOpen: true,
      title: "Create Database",
      message: (
        <span>
          Creating a metaobject named{" "}
          <span className="font-bold">"Tag Metafield App Database"</span> to
          store your app activity history. Would you like to continue?
        </span>
      ),
      logToRestore: null, // Not a restore action
    });
  };

  //  Run fetch only when restore is triggered manually
  useEffect(() => {
    if (!restore) return;

    const timeout = setTimeout(() => {
      const { cursor, direction } = lastFetchParams;
      const url = cursor
        ? `/api/check/db?cursor=${cursor}&direction=${direction}`
        : "/api/check/db";
      fetcher.load(url);
    }, 50);

    return () => clearTimeout(timeout);
  }, [restore, lastFetchParams]);

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
      const shouldRunRestore = restoreCompleted >= restoreTotal && isRestoring;
      if (!shouldRunRestore) return;

      const formData = new FormData();
      formData.append("rowId", globalId || "");

      const response = await fetch("/api/update-restore/db", {
        method: "POST",
        body: formData,
      });

      const res = await response.json();
      console.log(res, "........resuuuu");
      if (res.success) {
        setRestore(true); // triggers fetcher.load
      } else {
        console.error("Restore failed:", res.errors);
      }
    };

    runRestore();
  }, [restoreCompleted, restoreTotal]);

  useEffect(() => {
    if (modalState?.isOpen) {
      setGlobalId(modalState?.logToRestore?.id || null);
    }
  }, [modalState]);
  console.log(iscreateDB, "..........logssssssss");

  // Handle fetch results safely
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (!fetcher?.data?.success) {
      setIscreateDB(false);
    } else {
      setIscreateDB(true);
    }
    console.log(fetcher?.data?.database, "..........logssssssss");
    setRestore(false);
    setLogs(fetcher?.data?.database);
    if (fetcher?.data?.pageInfo) {
      setPageInfo(fetcher.data.pageInfo);
    }
    setIsLoading(false);
  }, [fetcher.state, fetcher.data]);

  // Pagination Handlers
  const handleNextPage = () => {
    if (pageInfo.hasNextPage) {
      setOpenRow(null);
      setIsLoading(true);
      const params = { cursor: pageInfo.endCursor, direction: "next" };
      setLastFetchParams(params);
      fetcher.load(
        `/api/check/db?cursor=${params.cursor}&direction=${params.direction}`,
      );
      console.log(pageInfo.endCursor, "........cursor");
    }
  };

  const handlePrevPage = () => {
    if (pageInfo.hasPreviousPage) {
      setOpenRow(null);
      setIsLoading(true);
      const params = { cursor: pageInfo.startCursor, direction: "prev" };
      setLastFetchParams(params);
      fetcher.load(
        `/api/check/db?cursor=${params.cursor}&direction=${params.direction}`,
      );
    }
  };

  //  User clicks restore
  const handleRestoreClick = (log: Log) => {
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

  //  Confirm restore or create DB
  const handleConfirmAction = async () => {
    const { title } = modalState;

    // Close modal first
    setModalState({
      isOpen: false,
      title: "",
      message: "",
      logToRestore: null,
    });

    if (title === "Create Database") {
      createDatabase();
      return;
    }

    const log = modalState.logToRestore;
    if (!log) return;

    // ... (existing restore logic)
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
        payload.tags = v.tagList
          ? v.tagList.split(",").map((t: string) => t.trim())
          : [];
      } else if (operation === "Metafield-removed") {
        payload.namespace = v.namespace || v.data?.namespace;
        payload.key = v.key || v.data?.key;
        payload.type = v.type || v.data?.type;
        payload.value = v.value || v.data?.value;
      } else if (operation === "Metafield-updated") {
        payload.namespace = v.namespace || v.data?.namespace;
        payload.key = v.key || v.data?.key;
        payload.type = v.type || v.data?.type;
        payload.value = v.value || v.data?.value;
      }
      console.log(payload, "..........payload");
      const formData = new FormData();
      formData.append("rows", JSON.stringify([payload]));

      const res = await fetch("/api/revert/db", {
        method: "POST",
        body: formData,
      }).then((r) => r.json());

      if (res.success) {
        setRestoreCompleted((prev) => prev + 1);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f2f4] p-4 md:pt-2 p-8 font-sans relative">
      <div className="max-w-[1100px] mx-auto space-y-4">
        {/* Page Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            {/* <button
              onClick={() => navigate("/app")}
              className="px-3 py-2 text-sm font-medium text-[#202223] bg-white border border-[#d4d4d4] rounded-lg shadow-sm hover:bg-[#f6f6f7] transition-colors"
            >
              Back to Home
            </button> */}
          </div>
        </div>

        <ConfirmationModal
          modalState={modalState}
          setModalState={setModalState}
          onConfirm={handleConfirmAction}
          confirmText={
            modalState.title === "Create Database" ? "Yes, Create" : "Restore"
          }
          cancelText={
            modalState.title === "Create Database" ? "Maybe Later" : "Cancel"
          }
          isRemoving={false}
        />

        {/* Restoring Modal */}
        {isRestoring && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden border border-gray-200">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-gray-900">
                    {restoreCompleted < restoreTotal
                      ? "Restoring Data..."
                      : "Restore Complete"}
                  </h3>
                  {restoreCompleted < restoreTotal ? (
                    <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                  ) : (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                </div>

                {restoreCompleted < restoreTotal ? (
                  <div className="space-y-3">
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                        style={{
                          width: `${(restoreCompleted / restoreTotal) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Progress</span>
                      <span>
                        {Math.round((restoreCompleted / restoreTotal) * 100)}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 text-center pt-2">
                      Restoring item {restoreCompleted} of {restoreTotal}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 ">
                    <p className="text-sm text-gray-600 mb-2">
                      Successfully restored {restoreTotal} items.
                    </p>
                    <button
                      onClick={() => setIsRestoring(false)}
                      className="mt-2 cursor-pointer w-full inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-[#1a1a1a] hover:bg-[#303030] transition-colors shadow-sm"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Warning Banner */}
        <div className=" flex flex-col gap-2 max-w-max mb-2">
          <div className="flex items-center gap-2 py-1 px-2 bg-red-50 border-l-2 border-red-500 rounded-sm">
            <svg
              className="w-3 h-3 text-red-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-[11px] text-red-700 font-bold uppercase tracking-tight">
              History expires in 2 Days
            </p>
          </div>
        </div>

        <LogsTable
          logs={logs}
          openRow={openRow}
          setOpenRow={setOpenRow}
          handleRestore={handleRestoreClick}
          isLoading={isLoading}
          onNext={handleNextPage}
          onPrev={handlePrevPage}
          hasNext={pageInfo.hasNextPage}
          hasPrev={pageInfo.hasPreviousPage}
          isDbCreated={iscreateDB}
          onCreateDb={handleCreateDatabaseClick}
        />
      </div>
    </div>
  );
}
