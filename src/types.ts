/**
 * Cloudflare Workers Environment Bindings for KRS Viewer
 */
export interface Env {
  // ========================================================================
  // REQUIRED: OAuth and Authentication Bindings
  // ========================================================================

  /** KV namespace for storing OAuth tokens and session data */
  OAUTH_KV: KVNamespace;

  /** Durable Object namespace for MCP server instances (required by McpAgent) */
  MCP_OBJECT: DurableObjectNamespace;

  /** D1 Database for user and API key management (shared mcp-oauth database) */
  DB: D1Database;

  /** WorkOS Client ID (public, used to initiate OAuth flows) */
  WORKOS_CLIENT_ID: string;

  /** WorkOS API Key (sensitive, starts with sk_, used to initialize WorkOS SDK) */
  WORKOS_API_KEY: string;

  /**
   * KV namespace for centralized custom login session storage (MANDATORY)
   */
  USER_SESSIONS: KVNamespace;

  // ========================================================================
  // REQUIRED: MCP Apps (SEP-1865) Bindings
  // ========================================================================

  /**
   * Cloudflare Assets Binding for MCP Apps
   */
  ASSETS: Fetcher;

  // ========================================================================
  // KRS Viewer Specific Bindings
  // ========================================================================

  /**
   * Cache KV for API response caching (1 hour TTL for KRS data)
   */
  CACHE_KV: KVNamespace;

  /**
   * AI Gateway configuration
   */
  AI_GATEWAY_ID?: string;
}

// ========================================================================
// KRS API Response Types
// ========================================================================

/**
 * Raw KRS API response structure
 */
export interface KrsApiResponse {
  odpis: {
    rodzaj: "Aktualny" | "Pelny";
    naglowekA: {
      numerKRS: string;
      dataRejestracjiWKRS: string;
      stanZDnia: string;
      dataCzasOdpisu?: string;
    };
    dane: {
      dzial1: {
        danePodmiotu: {
          formaPrawna: string;
          identyfikatory?: {
            nip?: string;
            regon?: string;
          };
          nazwa: string;
        };
        siedzibaIAdres: {
          siedziba: {
            kraj: string;
            wojewodztwo: string;
            miejscowosc: string;
          };
          adres: {
            ulica: string;
            nrDomu: string;
            nrLokalu?: string;
            kodPocztowy: string;
          };
        };
        kapital?: {
          wysokoscKapitaluZakladowego: {
            wartosc: string;
            waluta: string;
          };
        };
        wspolnicySpzoo?: Array<{
          nazwisko: { nazwisko: string };
          imiona: { imie: string };
          posiadaneUdzialy: string;
        }>;
      };
      dzial2: {
        reprezentacja: {
          nazwaOrganu: string;
          sposobReprezentacji: string;
          sklad: Array<{
            nazwisko: { nazwisko: string };
            imiona: { imie: string };
            funkcjaWOrganie: string;
          }>;
        };
      };
      dzial3: {
        przedmiotDzialalnosci: {
          przedmiotPrzewazajacejDzialalnosci: Array<{
            opis: string;
            kodDzial: string;
            kodKlasa: string;
            kodPodklasa: string;
          }>;
          przedmiotPozostalejDzialalnosci?: Array<{
            opis: string;
            kodDzial: string;
            kodKlasa: string;
            kodPodklasa: string;
          }>;
        };
      };
    };
  };
}

// ========================================================================
// Transformed Company Data (Widget-Ready)
// ========================================================================

/**
 * Company data structure for widget rendering
 */
export interface CompanyData {
  // Header
  name: string;
  krs: string;
  nip: string | null;
  regon: string | null;
  legalForm: string;

  // Address
  address: {
    city: string;
    voivodeship: string;
    street: string;
    building: string;
    unit: string | null;
    postalCode: string;
    country: string;
  };

  // Capital
  capital: {
    value: string;
    currency: string;
  } | null;
  shareholders: Array<{
    name: string;
    shares: string;
  }>;

  // Board
  representation: {
    organName: string;
    method: string;
    members: Array<{
      name: string;
      function: string;
    }>;
  };

  // Activities
  mainActivity: Array<{
    code: string;
    description: string;
  }>;
  otherActivities: Array<{
    code: string;
    description: string;
  }>;

  // Meta
  registrationDate: string;
  lastUpdate: string;
  dataTimestamp: string;
}

// ========================================================================
// Tool Input Types
// ========================================================================

export interface ViewCompanyParams {
  krs: string;
  type?: "aktualny" | "pelny";
}
