/**
 * KRS API Client
 *
 * Integrates with Otwarte API Krajowego Rejestru Sądowego (api-krs.ms.gov.pl)
 * to fetch official company registry data.
 *
 * Features:
 * - Caching in CACHE_KV (1 hour TTL)
 * - Error handling for 404 and network failures
 * - Response transformation from API format to widget-friendly format
 */

import type { Env, KrsApiResponse, CompanyData } from "./types.js";

const KRS_API_BASE = "https://api-krs.ms.gov.pl/api/krs";
const CACHE_TTL_SECONDS = 3600; // 1 hour

export class KrsClient {
  constructor(private env: Env) {}

  /**
   * Fetch company data from KRS API
   *
   * @param krs - 10-digit KRS number
   * @param type - Extract type: "aktualny" (current) or "pelny" (full history)
   * @returns Transformed company data ready for widget rendering
   * @throws Error if company not found or API unavailable
   */
  async getCompany(
    krs: string,
    type: "aktualny" | "pelny" = "aktualny"
  ): Promise<CompanyData> {
    const cacheKey = `krs:${krs}:${type}`;

    // Check cache first
    const cached = await this.env.CACHE_KV.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as CompanyData;
    }

    // Fetch from API
    const endpoint = type === "aktualny" ? "OdpisAktualny" : "OdpisPelny";
    const url = `${KRS_API_BASE}/${endpoint}/${krs}?rejestr=P&format=json`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "KRS-Viewer-MCP/1.0",
        },
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error("KRS API timeout - please try again");
      }
      throw new Error("KRS API unavailable - please try again later");
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Company with KRS ${krs} not found in registry`);
      }
      if (response.status === 400) {
        throw new Error(`Invalid KRS number format: ${krs}`);
      }
      throw new Error(`KRS API error: ${response.status}`);
    }

    const raw = (await response.json()) as KrsApiResponse;
    const data = this.transformResponse(raw);

    // Cache for 1 hour
    await this.env.CACHE_KV.put(cacheKey, JSON.stringify(data), {
      expirationTtl: CACHE_TTL_SECONDS,
    });

    return data;
  }

  /**
   * Transform raw KRS API response to widget-friendly format
   */
  private transformResponse(raw: KrsApiResponse): CompanyData {
    const odpis = raw.odpis;
    const dzial1 = odpis.dane.dzial1;
    const dzial2 = odpis.dane.dzial2;
    const dzial3 = odpis.dane.dzial3;

    // Build PKD code helper
    const buildPkdCode = (item: {
      kodDzial: string;
      kodKlasa: string;
      kodPodklasa: string;
    }) => `${item.kodDzial}.${item.kodKlasa}.${item.kodPodklasa}`;

    // Safely extract shareholders with proper null handling
    const shareholders = (dzial1.wspolnicySpzoo || [])
      .filter((s) => s?.imiona?.imie && s?.nazwisko?.nazwisko)
      .map((s) => ({
        name: `${s.imiona.imie} ${s.nazwisko.nazwisko}`,
        shares: s.posiadaneUdzialy || "Brak danych",
      }));

    // Safely extract board members
    const boardMembers = (dzial2?.reprezentacja?.sklad || [])
      .filter((m) => m?.imiona?.imie && m?.nazwisko?.nazwisko)
      .map((m) => ({
        name: `${m.imiona.imie} ${m.nazwisko.nazwisko}`,
        function: m.funkcjaWOrganie || "Brak danych",
      }));

    // Safely extract activities
    const mainActivities = (
      dzial3?.przedmiotDzialalnosci?.przedmiotPrzewazajacejDzialalnosci || []
    ).map((a) => ({
      code: buildPkdCode(a),
      description: a.opis,
    }));

    const otherActivities = (
      dzial3?.przedmiotDzialalnosci?.przedmiotPozostalejDzialalnosci || []
    ).map((a) => ({
      code: buildPkdCode(a),
      description: a.opis,
    }));

    return {
      name: dzial1.danePodmiotu.nazwa,
      krs: odpis.naglowekA.numerKRS,
      nip: dzial1.danePodmiotu.identyfikatory?.nip || null,
      regon: dzial1.danePodmiotu.identyfikatory?.regon || null,
      legalForm: dzial1.danePodmiotu.formaPrawna,

      address: {
        city: dzial1.siedzibaIAdres?.siedziba?.miejscowosc || "",
        voivodeship: dzial1.siedzibaIAdres?.siedziba?.wojewodztwo || "",
        street: dzial1.siedzibaIAdres?.adres?.ulica || "",
        building: dzial1.siedzibaIAdres?.adres?.nrDomu || "",
        unit: dzial1.siedzibaIAdres?.adres?.nrLokalu || null,
        postalCode: dzial1.siedzibaIAdres?.adres?.kodPocztowy || "",
        country: dzial1.siedzibaIAdres?.siedziba?.kraj || "POLSKA",
      },

      capital: dzial1.kapital?.wysokoscKapitaluZakladowego
        ? {
            // Convert Polish decimal format (comma) to standard (dot)
            value: dzial1.kapital.wysokoscKapitaluZakladowego.wartosc.replace(
              ",",
              "."
            ),
            currency: dzial1.kapital.wysokoscKapitaluZakladowego.waluta,
          }
        : null,

      shareholders,

      representation: {
        organName: dzial2?.reprezentacja?.nazwaOrganu || "ZARZĄD",
        method: dzial2?.reprezentacja?.sposobReprezentacji || "Brak danych",
        members: boardMembers,
      },

      mainActivity: mainActivities,
      otherActivities,

      registrationDate: odpis.naglowekA.dataRejestracjiWKRS,
      lastUpdate: odpis.naglowekA.stanZDnia,
      dataTimestamp: odpis.naglowekA.dataCzasOdpisu || new Date().toISOString(),
    };
  }
}

/**
 * Format company data as text for non-UI hosts
 */
export function formatCompanyAsText(data: CompanyData): string {
  const lines: string[] = [];

  lines.push(`=== ${data.name} ===`);
  lines.push("");
  lines.push(`KRS: ${data.krs}`);
  if (data.nip) lines.push(`NIP: ${data.nip}`);
  if (data.regon) lines.push(`REGON: ${data.regon}`);
  lines.push(`Forma prawna: ${data.legalForm}`);
  lines.push("");

  // Address
  lines.push("📍 Adres:");
  const addr = data.address;
  const addressParts = [addr.street, addr.building];
  if (addr.unit) addressParts.push(`lok. ${addr.unit}`);
  lines.push(`   ${addressParts.join(" ")}`);
  lines.push(`   ${addr.postalCode} ${addr.city}`);
  lines.push(`   ${addr.voivodeship}, ${addr.country}`);
  lines.push("");

  // Capital
  if (data.capital) {
    lines.push(`💰 Kapitał zakładowy: ${data.capital.value} ${data.capital.currency}`);
    lines.push("");
  }

  // Board
  if (data.representation.members.length > 0) {
    lines.push(`👥 ${data.representation.organName}:`);
    for (const member of data.representation.members) {
      lines.push(`   • ${member.name} - ${member.function}`);
    }
    lines.push("");
  }

  // Main activity
  if (data.mainActivity.length > 0) {
    lines.push("🏭 Działalność przeważająca:");
    for (const activity of data.mainActivity) {
      lines.push(`   • ${activity.code} - ${activity.description}`);
    }
    lines.push("");
  }

  // Meta
  lines.push(`📅 Data rejestracji: ${data.registrationDate}`);
  lines.push(`📅 Stan na dzień: ${data.lastUpdate}`);

  return lines.join("\n");
}
