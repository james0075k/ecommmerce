/**
 * Minimal Meilisearch REST client.
 *
 * The official SDK is ESM-only from v0.60, which a CommonJS Nest build cannot
 * `require`. The API surface used here is seven endpoints, so calling it over
 * `fetch` (global in Node 20+) is less machinery than the workarounds - and it
 * pins us to the documented HTTP contract rather than an SDK's release cadence.
 */

export interface MeiliSearchRequest {
  q: string;
  offset?: number;
  limit?: number;
  filter?: string;
  sort?: string[];
  facets?: string[];
  attributesToRetrieve?: string[];
}

export interface MeiliSearchResponse<T> {
  hits: T[];
  estimatedTotalHits?: number;
  facetDistribution?: Record<string, Record<string, number>>;
  facetStats?: Record<string, { min: number; max: number }>;
}

export interface MeiliIndexSettings {
  rankingRules?: string[];
  searchableAttributes?: string[];
  filterableAttributes?: string[];
  sortableAttributes?: string[];
  typoTolerance?: Record<string, unknown>;
  faceting?: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 8000;

export class MeilisearchClient {
  constructor(
    private readonly host: string,
    private readonly apiKey?: string,
  ) {}

  async health(): Promise<boolean> {
    const response = await this.request('GET', '/health', undefined, 3000);
    return response.ok;
  }

  async createIndex(uid: string, primaryKey: string): Promise<void> {
    // 409 means it already exists, which is the normal case after first boot.
    const response = await this.request('POST', '/indexes', { uid, primaryKey });
    if (!response.ok && response.status !== 409) {
      throw new Error(await describe(response));
    }
  }

  async updateSettings(uid: string, settings: MeiliIndexSettings): Promise<void> {
    const response = await this.request('PATCH', `/indexes/${uid}/settings`, settings);
    if (!response.ok) throw new Error(await describe(response));
  }

  async addDocuments<T>(uid: string, documents: T[], primaryKey: string): Promise<void> {
    const response = await this.request(
      'POST',
      `/indexes/${uid}/documents?primaryKey=${encodeURIComponent(primaryKey)}`,
      documents,
    );
    if (!response.ok) throw new Error(await describe(response));
  }

  async deleteDocument(uid: string, id: string): Promise<void> {
    const response = await this.request(
      'DELETE',
      `/indexes/${uid}/documents/${encodeURIComponent(id)}`,
    );
    if (!response.ok && response.status !== 404) throw new Error(await describe(response));
  }

  async deleteAllDocuments(uid: string): Promise<void> {
    const response = await this.request('DELETE', `/indexes/${uid}/documents`);
    if (!response.ok) throw new Error(await describe(response));
  }

  async search<T>(uid: string, body: MeiliSearchRequest): Promise<MeiliSearchResponse<T>> {
    const response = await this.request('POST', `/indexes/${uid}/search`, body);
    if (!response.ok) throw new Error(await describe(response));
    return (await response.json()) as MeiliSearchResponse<T>;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(`${this.host.replace(/\/$/, '')}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function describe(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  return `Meilisearch responded ${response.status}: ${text.slice(0, 300)}`;
}
