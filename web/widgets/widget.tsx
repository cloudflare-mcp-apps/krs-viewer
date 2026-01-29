import { StrictMode, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { useApp, useHostStyles } from '@modelcontextprotocol/ext-apps/react';
import type { WidgetState, ToolResultData } from '../lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import '../styles/globals.css';

// Template placeholders - replaced during project creation
// These use double-brace syntax: {{PLACEHOLDER}} which gets replaced when creating a new project
const SERVER_NAME = "Example Server";  // TODO: Replace with "{{SERVER_NAME}}" after template processing is set up
const SERVER_ID = "example-server";    // TODO: Replace with "{{SERVER_ID}}" after template processing is set up

// Prefixed logging pattern for better debugging
const log = {
  info: console.log.bind(console, '[Widget]'),
  warn: console.warn.bind(console, '[Widget]'),
  error: console.error.bind(console, '[Widget]'),
};

function Widget() {
  const [state, setState] = useState<WidgetState>({ status: 'idle' });
  const [data, setData] = useState<ToolResultData | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [viewUUID, setViewUUID] = useState<string | null>(null); // V0.4.1: Used for state persistence
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { app } = useApp({
    appInfo: {
      name: `${SERVER_ID}-mcp`,
      version: "1.0.0",
    },
    capabilities: {},
    onAppCreated: (appInstance) => {
      // Handle tool input parameters
      appInstance.ontoolinput = (params) => {
        log.info('Tool input received:', params.arguments);
        setState({ status: 'loading' });
      };

      // V0.4.1: Handle streaming partial inputs for lower perceived latency
      appInstance.ontoolinputpartial = (params) => {
        log.info('Partial input:', params.arguments);
        // Show preview while streaming (optional)
      };

      // Handle tool result
      appInstance.ontoolresult = (result) => {
        log.info('Tool result received:', result);
        try {
          // V0.4.1: Extract viewUUID for state persistence across reloads
          const uuid = (result._meta as Record<string, unknown>)?.viewUUID as string | undefined;
          if (uuid) {
            setViewUUID(uuid);
            // Restore saved state if exists
            const savedState = localStorage.getItem(`view-state-${uuid}`);
            if (savedState) {
              log.info('Restoring saved state for viewUUID:', uuid);
              // TODO: Apply restored state to your widget
            }
          }

          // Extract data from structuredContent or content
          let resultData = result.structuredContent;
          if (!resultData && result.content?.[0]) {
            const firstContent = result.content[0];
            if (firstContent.type === 'text' && 'text' in firstContent) {
              resultData = JSON.parse(firstContent.text);
            }
          }

          if (resultData) {
            setData(resultData);
            setState({ status: 'success', data: resultData });
          }
        } catch (e) {
          log.error('Failed to parse result:', e);
          setState({ status: 'error', error: 'Failed to parse result' });
        }
      };

      // Handle errors
      appInstance.onerror = (error) => {
        log.error('Error:', error);
        setState({ status: 'error', error: String(error) });
      };

      // Handle theme, viewport, and display mode changes
      appInstance.onhostcontextchanged = (context) => {
        // Theme handling
        if (context.theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }

        // V0.4.1: Fullscreen mode support
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
      appInstance.onteardown = async (params) => {
        log.info('Teardown requested:', params);
        // V0.4.1: Save view state using viewUUID
        // if (viewUUID) {
        //   localStorage.setItem(`view-state-${viewUUID}`, JSON.stringify({ /* your state */ }));
        // }
        return {};
      };
    },
  });

  // V0.4.1: Apply host styles (CSS variables, theme, fonts)
  useHostStyles(app, app?.getHostContext());

  // =========================================================================
  // V0.4.1 FEATURES
  // These use runtime checks since types may not be available until npm install
  // =========================================================================

  // 1. YAML Frontmatter for Model Context Updates
  // Use when widget state should inform the AI model
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const updateModelContext = useCallback(async (contextData: Record<string, unknown>) => {
    if (!app) return;
    // Check if updateModelContext method exists (v1.0.0+ stable)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appAny = app as any;
    if (typeof appAny.updateModelContext !== 'function') {
      log.warn('updateModelContext not available - requires ext-apps v1.0.0+');
      return;
    }
    const yamlFrontmatter = Object.entries(contextData)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');

    await appAny.updateModelContext({
      content: [{
        type: "text",
        text: `---\n${yamlFrontmatter}\n---\n\nWidget state updated.`
      }]
    });
  }, [app]);

  // 2. Fullscreen Mode Toggle (when supported by host)
  const toggleFullscreen = useCallback(async () => {
    if (!app || !canFullscreen) return;
    const ctx = app.getHostContext();
    const targetMode = ctx?.displayMode === "fullscreen" ? "inline" : "fullscreen";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (app as any).requestDisplayMode({ mode: targetMode });
      log.info('Display mode changed to:', result.mode);
    } catch (e) {
      log.error('Failed to change display mode:', e);
    }
  }, [app, canFullscreen]);

  // 3. Report errors to model (for graceful degradation)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const reportErrorToModel = useCallback(async (errorMessage: string) => {
    if (!app) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appAny = app as any;
    if (typeof appAny.updateModelContext !== 'function') return;
    await appAny.updateModelContext({
      content: [{
        type: "text",
        text: `Error: ${errorMessage}`
      }]
    });
  }, [app]);

  // TODO: Implement your widget UI here
  // This is a template - replace with actual functionality

  if (state.status === 'idle') {
    return (
      <div className="h-[600px] flex flex-col items-center justify-center bg-white dark:bg-slate-900">
        <Card className="w-full max-w-md mx-4">
          <CardHeader>
            <CardTitle>{SERVER_NAME}</CardTitle>
            <CardDescription>
              TODO: Add widget description and initial state
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-gray-500 dark:text-gray-400">
              Waiting for tool input...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="h-[600px] flex flex-col items-center justify-center bg-white dark:bg-slate-900">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-3">Loading...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="h-[600px] flex flex-col items-center justify-center bg-white dark:bg-slate-900">
        <Card className="w-full max-w-md mx-4 border-red-200">
          <CardHeader>
            <CardTitle className="text-red-500">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">{state.error}</p>
            <Button
              className="mt-4"
              onClick={() => setState({ status: 'idle' })}
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
    <div className="h-[600px] flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
      <Card className="flex-1 m-4 flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{SERVER_NAME}</CardTitle>
            <CardDescription>
              {data?.message || 'Result received'}
            </CardDescription>
          </div>
          {/* V0.4.1: Fullscreen toggle button (shows only when supported) */}
          {canFullscreen && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? '⛶' : '⛶'}
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex-1 overflow-auto">
          {/* TODO: Render your result data here */}
          <pre className="text-sm bg-gray-100 dark:bg-gray-800 p-4 rounded overflow-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
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
