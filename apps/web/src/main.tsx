import "./styles.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, type ReactNode, StrictMode, Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

import { useApi } from "./api";
import { AuthProvider, useAppAuth } from "./auth";
import { AppShell, ErrorBoundary } from "./components/AppShell";
import { Spinner } from "./components/bits";
import { loadConfig } from "./config";
import { LoginPage, NotFound } from "./pages/OtherPages";
import { ReceiptsPage } from "./pages/ReceiptsPage";

// Loaded on first visit: the receipts list is what most sessions need, so it ships in the main bundle.
const ReviewPage = lazy(() => import("./pages/ReviewPage").then((m) => ({ default: m.ReviewPage })));
const ExportPage = lazy(() => import("./pages/ExportPage").then((m) => ({ default: m.ExportPage })));
const later = (page: ReactNode) => <Suspense fallback={<Spinner label="Loading" />}>{page}</Suspense>;

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
});

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <ReceiptsPage /> },
      { path: "receipts/:id", element: later(<ReviewPage />) },
      { path: "export", element: later(<ExportPage />) },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

/** Reports errors that escape React (failed promises, script errors) to the API's logs. */
function GlobalErrorReporting() {
  const api = useApi();
  useEffect(() => {
    const onError = (e: ErrorEvent) => api.reportError({ message: e.message, stack: e.error?.stack });
    const onRejection = (e: PromiseRejectionEvent) => api.reportError({ message: String(e.reason?.message ?? e.reason), stack: e.reason?.stack });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [api]);
  return null;
}

function Root() {
  const auth = useAppAuth();
  const api = useApi();
  if (auth.loading) return <Spinner label="Signing in" />;
  if (!auth.signedIn) return <LoginPage />;
  return (
    <ErrorBoundary api={api}>
      <GlobalErrorReporting />
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}

loadConfig()
  .then((config) => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <AuthProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <Root />
          </QueryClientProvider>
        </AuthProvider>
      </StrictMode>,
    );
  })
  .catch((err: Error) => {
    document.getElementById("root")!.textContent = `Receipt Box could not start: ${err.message}`;
  });
