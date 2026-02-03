import { StrictMode, useState, useCallback, useEffect, useId } from 'react';
import { createRoot } from 'react-dom/client';
import {
  App,
  PostMessageTransport,
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
} from '@modelcontextprotocol/ext-apps';
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';

// Type for tool result - we use a generic interface since CallToolResult may not be exported
interface ToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  _meta?: Record<string, unknown>;
}
import type { WidgetState, ToolResultData } from '../lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import '../styles/globals.css';

// Server configuration - update for your project
const SERVER_NAME = "KRS Viewer";
const SERVER_ID = "krs-viewer";

// Prefixed logging for debugging
const log = {
  info: console.log.bind(console, '[Widget]'),
  warn: console.warn.bind(console, '[Widget]'),
  error: console.error.bind(console, '[Widget]'),
};

// Helper to get safe area padding from host context
function getSafeAreaPaddingStyle(hostContext?: McpUiHostContext): React.CSSProperties {
  if (!hostContext?.safeAreaInsets) return {};
  return {
    paddingTop: hostContext.safeAreaInsets.top,
    paddingRight: hostContext.safeAreaInsets.right,
    paddingBottom: hostContext.safeAreaInsets.bottom,
    paddingLeft: hostContext.safeAreaInsets.left,
  };
}

// Extract data from tool result safely
function extractData<T>(result: ToolResult): T | null {
  try {
    // Method 1: From structuredContent (preferred)
    if ('structuredContent' in result && result.structuredContent) {
      return result.structuredContent as T;
    }

    // Method 2: From content array (fallback)
    if (result.content?.[0]) {
      const firstContent = result.content[0];
      if (firstContent.type === 'text' && firstContent.text) {
        return JSON.parse(firstContent.text) as T;
      }
    }
  } catch (e) {
    log.error('Failed to extract data:', e);
  }
  return null;
}

interface WidgetContentProps {
  app: App;
  hostContext?: McpUiHostContext;
}

function WidgetContent({ app, hostContext }: WidgetContentProps) {
  const [state, setState] = useState<WidgetState>({ status: 'idle' });
  const [data, setData] = useState<ToolResultData | null>(null);
  const [viewUUID, setViewUUID] = useState<string | null>(null);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Generate unique IDs for ARIA associations
  const loadingId = useId();
  const errorId = useId();
  const resultId = useId();

  // Register handlers
  useEffect(() => {
    // Handle tool input parameters
    app.ontoolinput = (params) => {
      log.info('Tool input received:', params.arguments);
      setState({ status: 'loading' });
    };

    // Handle streaming partial inputs for lower perceived latency
    app.ontoolinputpartial = (params) => {
      log.info('Partial input:', params.arguments);
    };

    // Handle tool result
    app.ontoolresult = (result) => {
      log.info('Tool result received:', result);

      // Extract viewUUID for state persistence
      const uuid = (result._meta as Record<string, unknown>)?.viewUUID as string | undefined;
      if (uuid) {
        setViewUUID(uuid);
        const savedState = localStorage.getItem(`view-state-${uuid}`);
        if (savedState) {
          log.info('Restoring saved state for viewUUID:', uuid);
        }
      }

      const resultData = extractData<ToolResultData>(result);
      if (resultData) {
        setData(resultData);
        setState({ status: 'success', data: resultData });
      } else {
        setState({ status: 'error', error: 'Failed to parse result' });
      }
    };

    // Handle tool cancellation
    app.ontoolcancelled = () => {
      log.info('Tool cancelled');
      setState({ status: 'idle' });
    };

    // Handle errors
    app.onerror = (error) => {
      log.error('Error:', error);
      setState({ status: 'error', error: String(error) });
    };

    // Handle theme, viewport, and display mode changes
    app.onhostcontextchanged = (context) => {
      // Theme handling
      if (context.theme) {
        applyDocumentTheme(context.theme);
        document.documentElement.classList.toggle('dark', context.theme === 'dark');
      }
      if (context.styles?.variables) {
        applyHostStyleVariables(context.styles.variables);
      }
      if (context.styles?.css?.fonts) {
        applyHostFonts(context.styles.css.fonts);
      }

      // Fullscreen mode support
      if (context.availableDisplayModes) {
        setCanFullscreen(context.availableDisplayModes.includes('fullscreen'));
      }
      if (context.displayMode) {
        setIsFullscreen(context.displayMode === 'fullscreen');
        document.body.classList.toggle('fullscreen', context.displayMode === 'fullscreen');
      }

      if (context.viewport) {
        log.info('Viewport:', context.viewport);
      }
    };

    // Handle teardown - save state before widget closes
    app.onteardown = async () => {
      log.info('Teardown requested');
      if (viewUUID) {
        localStorage.setItem(`view-state-${viewUUID}`, JSON.stringify({ data }));
      }
      return {};
    };
  }, [app, data, viewUUID]);

  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(async () => {
    if (!canFullscreen) return;
    const ctx = app.getHostContext();
    const targetMode = ctx?.displayMode === 'fullscreen' ? 'inline' : 'fullscreen';
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (app as any).requestDisplayMode({ mode: targetMode });
      log.info('Display mode changed to:', result.mode);
    } catch (e) {
      log.error('Failed to change display mode:', e);
    }
  }, [app, canFullscreen]);

  // Keyboard shortcut for fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to exit fullscreen
      if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      // Ctrl/Cmd+Enter to toggle fullscreen
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.altKey && canFullscreen) {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, canFullscreen, toggleFullscreen]);

  // Reset handler
  const handleReset = useCallback(() => {
    setState({ status: 'idle' });
    setData(null);
  }, []);

  // Idle state
  if (state.status === 'idle') {
    return (
      <div
        className="h-[600px] flex flex-col items-center justify-center bg-background"
        style={getSafeAreaPaddingStyle(hostContext)}
        role="main"
        aria-label={`${SERVER_NAME} widget`}
      >
        <Card className="w-full max-w-md mx-4">
          <CardHeader>
            <CardTitle>{SERVER_NAME}</CardTitle>
            <CardDescription>
              Polish Company Registry (KRS) lookup with visual display
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground" aria-live="polite">
              Waiting for tool input...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (state.status === 'loading') {
    return (
      <div
        className="h-[600px] flex flex-col items-center justify-center bg-background"
        style={getSafeAreaPaddingStyle(hostContext)}
        role="main"
        aria-label={`${SERVER_NAME} widget loading`}
        aria-busy="true"
      >
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div
              className="flex items-center justify-center"
              role="status"
              aria-live="polite"
              aria-labelledby={loadingId}
            >
              <div
                className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
                aria-hidden="true"
              />
              <span id={loadingId} className="ml-3">
                Loading company data...
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (state.status === 'error') {
    return (
      <div
        className="h-[600px] flex flex-col items-center justify-center bg-background"
        style={getSafeAreaPaddingStyle(hostContext)}
        role="main"
        aria-label={`${SERVER_NAME} widget error`}
      >
        <Card className="w-full max-w-md mx-4 border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive" id={errorId}>
              Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className="text-destructive"
              role="alert"
              aria-describedby={errorId}
            >
              {state.error}
            </p>
            <Button
              className="mt-4"
              onClick={handleReset}
              aria-label="Dismiss error and try again"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state - display result
  return (
    <div
      className="h-[600px] flex flex-col bg-background overflow-hidden"
      style={getSafeAreaPaddingStyle(hostContext)}
      role="main"
      aria-label={`${SERVER_NAME} widget results`}
    >
      <Card className="flex-1 m-4 flex flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between flex-shrink-0">
          <div>
            <CardTitle>{SERVER_NAME}</CardTitle>
            <CardDescription aria-live="polite">
              {data?.message || 'Company data retrieved successfully'}
            </CardDescription>
          </div>
          {canFullscreen && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen mode (Escape)' : 'Enter fullscreen mode (Ctrl+Enter)'}
              aria-pressed={isFullscreen}
            >
              {isFullscreen ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              )}
            </Button>
          )}
        </CardHeader>
        <CardContent
          className="flex-1 overflow-auto"
          id={resultId}
          aria-label="Company data result"
          tabIndex={0}
        >
          <pre
            className="text-sm bg-muted p-4 rounded overflow-auto"
            aria-label="JSON data display"
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function Widget() {
  const [app, setApp] = useState<App | null>(null);
  const [appError, setAppError] = useState<Error | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext>();

  useEffect(() => {
    // CRITICAL: Manual App instantiation with autoResize: false
    // This prevents width narrowing issues in production
    const appInstance = new App(
      { name: `${SERVER_ID}-mcp`, version: '1.0.0' },
      {}, // capabilities
      { autoResize: false } // CRITICAL: Prevents width narrowing
    );

    // Initial host context change handler
    appInstance.onhostcontextchanged = (ctx) => {
      setHostContext((prev) => ({ ...prev, ...ctx }));
      if (ctx.theme) {
        applyDocumentTheme(ctx.theme);
        document.documentElement.classList.toggle('dark', ctx.theme === 'dark');
      }
      if (ctx.styles?.variables) {
        applyHostStyleVariables(ctx.styles.variables);
      }
      if (ctx.styles?.css?.fonts) {
        applyHostFonts(ctx.styles.css.fonts);
      }
    };

    // Connect using PostMessageTransport
    const transport = new PostMessageTransport(window.parent, window.parent);
    appInstance
      .connect(transport)
      .then(() => {
        setApp(appInstance);
        setHostContext(appInstance.getHostContext());
        log.info('App connected successfully');
      })
      .catch((err) => {
        log.error('Failed to connect:', err);
        setAppError(err instanceof Error ? err : new Error(String(err)));
      });

    return () => {
      appInstance.close();
    };
  }, []);

  // Connection error state
  if (appError) {
    return (
      <div
        className="h-[600px] flex flex-col items-center justify-center bg-background"
        role="alert"
        aria-label="Connection error"
      >
        <Card className="w-full max-w-md mx-4 border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Connection Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{appError.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Connecting state
  if (!app) {
    return (
      <div
        className="h-[600px] flex flex-col items-center justify-center bg-background"
        role="status"
        aria-label="Connecting to host"
        aria-busy="true"
      >
        <div className="flex items-center justify-center">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
            aria-hidden="true"
          />
          <span className="ml-3 text-muted-foreground">Connecting...</span>
        </div>
      </div>
    );
  }

  return <WidgetContent app={app} hostContext={hostContext} />;
}

// Mount the app
const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Widget />
    </StrictMode>
  );
}
