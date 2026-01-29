import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  App,
  PostMessageTransport,
  applyDocumentTheme,
} from "@modelcontextprotocol/ext-apps";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import "../styles/globals.css";

// Company data type (matches server output)
interface CompanyData {
  name: string;
  krs: string;
  nip: string | null;
  regon: string | null;
  legalForm: string;
  address: {
    city: string;
    voivodeship: string;
    street: string;
    building: string;
    unit: string | null;
    postalCode: string;
    country: string;
  };
  capital: {
    value: string;
    currency: string;
  } | null;
  shareholders: Array<{
    name: string;
    shares: string;
  }>;
  representation: {
    organName: string;
    method: string;
    members: Array<{
      name: string;
      function: string;
    }>;
  };
  mainActivity: Array<{
    code: string;
    description: string;
  }>;
  otherActivities: Array<{
    code: string;
    description: string;
  }>;
  registrationDate: string;
  lastUpdate: string;
  dataTimestamp: string;
}

// Prefixed logging
const log = {
  info: console.log.bind(console, "[CompanyCard]"),
  warn: console.warn.bind(console, "[CompanyCard]"),
  error: console.error.bind(console, "[CompanyCard]"),
};

// Safe area padding helper
function getSafeAreaPaddingStyle(
  hostContext?: McpUiHostContext
): React.CSSProperties {
  if (!hostContext?.safeAreaInsets) return {};
  return {
    paddingTop: hostContext.safeAreaInsets.top,
    paddingRight: hostContext.safeAreaInsets.right,
    paddingBottom: hostContext.safeAreaInsets.bottom,
    paddingLeft: hostContext.safeAreaInsets.left,
  };
}

function CompanyCardWidget() {
  const [app, setApp] = useState<App | null>(null);
  const [appError, setAppError] = useState<Error | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext>();
  const [data, setData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Manual App instantiation with autoResize: false
    const appInstance = new App(
      { name: "krs-viewer", version: "1.0.0" },
      {}, // capabilities
      { autoResize: false } // CRITICAL: Prevents width narrowing
    );

    // Handle tool input (show loading)
    appInstance.ontoolinput = () => {
      log.info("Tool input received");
      setLoading(true);
      setError(null);
    };

    // Handle tool result
    appInstance.ontoolresult = (result) => {
      log.info("Tool result received:", result);
      setLoading(false);
      try {
        // Extract data from structuredContent
        if (result.structuredContent) {
          setData(result.structuredContent as CompanyData);
          setError(null);
        } else if (result.content?.[0]) {
          const firstContent = result.content[0];
          if (firstContent.type === "text" && "text" in firstContent) {
            // Check if it's an error response
            if ((result as unknown as { isError?: boolean }).isError) {
              setError(firstContent.text);
            } else {
              setData(JSON.parse(firstContent.text) as CompanyData);
            }
          }
        }
      } catch (e) {
        log.error("Failed to parse result:", e);
        setError("Failed to parse company data");
      }
    };

    // Handle errors
    appInstance.onerror = (err) => {
      log.error("Error:", err);
      setAppError(err);
      setError(String(err));
      setLoading(false);
    };

    // Handle theme, viewport, and display mode changes
    appInstance.onhostcontextchanged = (ctx) => {
      setHostContext((prev) => ({ ...prev, ...ctx }));
      if (ctx.theme) {
        applyDocumentTheme(ctx.theme);
        document.documentElement.classList.toggle("dark", ctx.theme === "dark");
      }
    };

    // Handle teardown
    appInstance.onteardown = async () => {
      log.info("Teardown requested");
      return {};
    };

    // Connect using PostMessageTransport
    const transport = new PostMessageTransport(window.parent, window.parent);
    appInstance
      .connect(transport)
      .then(() => {
        setApp(appInstance);
        setHostContext(appInstance.getHostContext());
        log.info("Connected to host");
      })
      .catch((err) => {
        log.error("Connection failed:", err);
        setAppError(err);
      });

    return () => appInstance.close();
  }, []);

  // Error state
  if (appError) {
    return (
      <div
        className="h-[600px] w-full flex items-center justify-center bg-white dark:bg-slate-900"
        style={getSafeAreaPaddingStyle(hostContext)}
      >
        <Card className="w-full max-w-md mx-4 border-red-200">
          <CardHeader>
            <CardTitle className="text-red-500">Błąd połączenia</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">{appError.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (loading || !app) {
    return (
      <div
        className="h-[600px] w-full flex items-center justify-center bg-white dark:bg-slate-900"
        style={getSafeAreaPaddingStyle(hostContext)}
      >
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-3">Pobieranie danych z KRS...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error from tool result
  if (error) {
    return (
      <div
        className="h-[600px] w-full flex items-center justify-center bg-white dark:bg-slate-900"
        style={getSafeAreaPaddingStyle(hostContext)}
      >
        <Card className="w-full max-w-md mx-4 border-red-200">
          <CardHeader>
            <CardTitle className="text-red-500">Błąd</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No data state
  if (!data) {
    return (
      <div
        className="h-[600px] w-full flex items-center justify-center bg-white dark:bg-slate-900"
        style={getSafeAreaPaddingStyle(hostContext)}
      >
        <Card className="w-full max-w-md mx-4">
          <CardHeader>
            <CardTitle>KRS Viewer</CardTitle>
            <CardDescription>
              Podaj numer KRS aby wyświetlić dane firmy
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Success - render company card
  return (
    <div
      className="h-[600px] w-full flex flex-col bg-white dark:bg-slate-900 overflow-hidden"
      style={getSafeAreaPaddingStyle(hostContext)}
    >
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-xl">{data.name}</CardTitle>
                <CardDescription className="mt-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">KRS: {data.krs}</Badge>
                    {data.nip && (
                      <Badge variant="outline">NIP: {data.nip}</Badge>
                    )}
                    {data.regon && (
                      <Badge variant="outline">REGON: {data.regon}</Badge>
                    )}
                  </div>
                </CardDescription>
              </div>
            </div>
            <Badge className="mt-2 w-fit">{data.legalForm}</Badge>
          </CardHeader>
        </Card>

        {/* Address Section */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <span>📍</span> Adres siedziby
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm">
              {data.address.street} {data.address.building}
              {data.address.unit && ` lok. ${data.address.unit}`}
            </p>
            <p className="text-sm">
              {data.address.postalCode} {data.address.city}
            </p>
            <p className="text-sm text-muted-foreground">
              {data.address.voivodeship}, {data.address.country}
            </p>
          </CardContent>
        </Card>

        {/* Capital Section */}
        {data.capital && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <span>💰</span> Kapitał zakładowy
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-lg font-semibold">
                {parseFloat(data.capital.value).toLocaleString("pl-PL", {
                  minimumFractionDigits: 2,
                })}{" "}
                {data.capital.currency}
              </p>
              {data.shareholders.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Wspólnicy:
                  </p>
                  <ul className="text-sm space-y-1">
                    {data.shareholders.map((s, i) => (
                      <li key={i} className="flex justify-between">
                        <span>{s.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {s.shares}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Board Section */}
        {data.representation.members.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <span>👥</span> {data.representation.organName}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="text-sm space-y-2">
                {data.representation.members.map((m, i) => (
                  <li key={i} className="flex justify-between items-center">
                    <span className="font-medium">{m.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {m.function}
                    </Badge>
                  </li>
                ))}
              </ul>
              {data.representation.method && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {data.representation.method}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Activities Section */}
        {data.mainActivity.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <span>🏭</span> Działalność
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    PRZEWAŻAJĄCA:
                  </p>
                  {data.mainActivity.map((a, i) => (
                    <p key={i} className="text-sm">
                      <Badge variant="secondary" className="mr-2">
                        {a.code}
                      </Badge>
                      {a.description}
                    </p>
                  ))}
                </div>
                {data.otherActivities.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs font-medium text-muted-foreground cursor-pointer">
                      POZOSTAŁA DZIAŁALNOŚĆ ({data.otherActivities.length})
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {data.otherActivities.slice(0, 10).map((a, i) => (
                        <li key={i} className="text-sm">
                          <Badge
                            variant="outline"
                            className="mr-2 text-xs font-mono"
                          >
                            {a.code}
                          </Badge>
                          <span className="text-muted-foreground">
                            {a.description}
                          </span>
                        </li>
                      ))}
                      {data.otherActivities.length > 10 && (
                        <li className="text-xs text-muted-foreground">
                          ... i {data.otherActivities.length - 10} więcej
                        </li>
                      )}
                    </ul>
                  </details>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Meta Section */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <span>📅</span> Informacje o wpisie
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">
                  Data rejestracji:
                </p>
                <p>{data.registrationDate}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Stan na dzień:</p>
                <p>{data.lastUpdate}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Źródło: Krajowy Rejestr Sądowy (api-krs.ms.gov.pl)
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Mount the app
const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <CompanyCardWidget />
    </StrictMode>
  );
}
