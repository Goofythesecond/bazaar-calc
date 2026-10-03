// Website entry: data fetching (React Query), saved settings, and the page routes (the static build swaps in the
// pages from Static.tsx).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./styles.css";
import { Layout } from "./components/Layout";
import { Flips } from "./pages/Flips";
import { About, ApiDocs, Contribute, Status, Timing } from "./pages/Info";
import { Events, Item, Items, Outlook } from "./pages/Market";
import { Planner } from "./pages/Planner";
import { ApiDocsStatic, ContributeStatic, StatusStatic } from "./pages/Static";
import { STATIC } from "./lib";
import { AppState } from "./state";

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1 } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <AppState>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Planner />} />
              <Route path="flips/:kind" element={<Flips />} />
              <Route path="outlook" element={<Outlook />} />
              <Route path="items" element={<Items />} />
              <Route path="item/:id" element={<Item />} />
              <Route path="events" element={<Events />} />
              <Route path="timing" element={<Timing />} />
              <Route path="contribute" element={STATIC ? <ContributeStatic /> : <Contribute />} />
              <Route path="api-docs" element={STATIC ? <ApiDocsStatic /> : <ApiDocs />} />
              <Route path="status" element={STATIC ? <StatusStatic /> : <Status />} />
              <Route path="about" element={<About />} />
              <Route path="*" element={<p>Page not found.</p>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppState>
    </QueryClientProvider>
  </StrictMode>,
);
