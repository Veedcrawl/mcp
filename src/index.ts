import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

dotenv.config({ quiet: true });

const DEFAULT_BASE_URL = 'https://api.veedcrawl.com';
const DEFAULT_POLL_INTERVAL = 1500;
const DEFAULT_MAX_POLL_ATTEMPTS = 120;
const PACKAGE_VERSION = '0.1.2';

interface ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
}

interface VeedcrawlConfig {
  apiKey: string;
  baseUrl?: string;
  pollInterval?: number;
  maxPollAttempts?: number;
}

interface TranscriptOptions {
  lang?: string;
  mode?: 'native' | 'generate' | 'auto';
}

interface ExtractOptions {
  prompt: string;
  lang?: string;
  schema?: Record<string, unknown>;
}

interface ProfileLookupOptions {
  username?: string;
  url?: string;
  limit?: number;
}

interface JobResponse {
  jobId: string;
  status: 'queued' | 'active' | 'completed' | 'failed';
  error?: { message: string; code: string };
}

function createApiError(status: number, body: unknown): ApiError {
  const b = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const err = new Error((b['message'] as string) ?? 'Unknown API error') as ApiError;
  err.status = status;
  err.code = (b['error'] as string) ?? 'unknown';
  err.details = b['details'] ?? null;
  return err;
}

class VeedcrawlClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly pollInterval: number;
  private readonly maxPollAttempts: number;

  constructor(config: VeedcrawlConfig) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.headers = {
      'x-api-key': config.apiKey,
      'Content-Type': 'application/json',
      'User-Agent': `veedcrawl-mcp/${PACKAGE_VERSION}`,
    };
    this.pollInterval = config.pollInterval ?? DEFAULT_POLL_INTERVAL;
    this.maxPollAttempts = config.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (query && Object.keys(query).length > 0) {
      url += '?' + new URLSearchParams(query).toString();
    }

    const resp = await fetch(url, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      throw createApiError(resp.status, data);
    }

    return data as T;
  }

  async metadata(url: string): Promise<unknown> {
    return this.request('GET', '/v1/metadata', undefined, { url });
  }

  async tiktokProfile(options: ProfileLookupOptions): Promise<unknown> {
    return this.request('GET', '/v1/tiktok/profile', undefined, buildProfileQuery(options));
  }

  async instagramProfile(options: ProfileLookupOptions): Promise<unknown> {
    return this.request(
      'GET',
      '/v1/instagram/profile',
      undefined,
      buildProfileQuery(options),
    );
  }

  async enqueueTranscript(
    url: string,
    options: TranscriptOptions = {},
  ): Promise<{ jobId: string; status: string }> {
    return this.request('POST', '/v1/transcript', undefined, {
      url,
      lang: options.lang ?? 'en',
      mode: options.mode ?? 'auto',
    });
  }

  async getTranscriptJob(jobId: string): Promise<JobResponse> {
    return this.request('GET', `/v1/transcript/${jobId}`);
  }

  async transcript(url: string, options: TranscriptOptions = {}): Promise<unknown> {
    const { jobId } = await this.enqueueTranscript(url, options);
    return this.pollJob(jobId, 'transcript');
  }

  async enqueueExtract(
    url: string,
    options: ExtractOptions,
  ): Promise<{ jobId: string; status: string }> {
    return this.request(
      'POST',
      '/v1/extract',
      options.schema
        ? { url, prompt: options.prompt, lang: options.lang ?? 'en', schema: options.schema }
        : { url, prompt: options.prompt, lang: options.lang ?? 'en' },
    );
  }

  async getExtractJob(jobId: string): Promise<JobResponse> {
    return this.request('GET', `/v1/extract/${jobId}`);
  }

  async extract(url: string, options: ExtractOptions): Promise<unknown> {
    const { jobId } = await this.enqueueExtract(url, options);
    return this.pollJob(jobId, 'extract');
  }

  private async pollJob(
    jobId: string,
    type: 'transcript' | 'extract',
  ): Promise<unknown> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      const job =
        type === 'transcript'
          ? await this.getTranscriptJob(jobId)
          : await this.getExtractJob(jobId);

      if (job.status === 'completed') return job;
      if (job.status === 'failed') {
        const err = job.error;
        throw createApiError(500, {
          error: err?.code ?? 'job-failed',
          message: err?.message ?? 'Job failed',
        });
      }

      await sleep(this.pollInterval);
    }

    throw createApiError(504, {
      error: 'timeout',
      message: `Job ${jobId} did not complete within the polling window`,
    });
  }
}

function getRequiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createClient(): VeedcrawlClient {
  const apiKey =
    process.env['VEEDCRAWL_API_KEY'] ??
    process.env['X_API_KEY'] ??
    process.env['VEEDCRAWL_X_API_KEY'];

  if (!apiKey) {
    throw new Error('Missing API key. Set VEEDCRAWL_API_KEY. X_API_KEY is also accepted.');
  }

  return new VeedcrawlClient({
    apiKey,
    baseUrl: process.env['VEEDCRAWL_BASE_URL'] ?? DEFAULT_BASE_URL,
    pollInterval:
      parseOptionalInt(process.env['VEEDCRAWL_POLL_INTERVAL_MS']) ?? DEFAULT_POLL_INTERVAL,
    maxPollAttempts:
      parseOptionalInt(process.env['VEEDCRAWL_MAX_POLL_ATTEMPTS']) ?? DEFAULT_MAX_POLL_ATTEMPTS,
  });
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function toToolError(err: unknown): Error {
  if (isApiError(err)) {
    return new Error(`VEEDCRAWL API error (${err.code}, status ${err.status}): ${err.message}`);
  }

  if (err instanceof Error) {
    return err;
  }

  return new Error(String(err));
}

function isApiError(err: unknown): err is ApiError {
  return err instanceof Error && 'status' in err && 'code' in err;
}

function buildProfileQuery(options: ProfileLookupOptions): Record<string, string> {
  const query: Record<string, string> = {};

  if (options.username) {
    query['username'] = options.username.trim();
  }

  if (options.url) {
    query['url'] = options.url.trim();
  }

  if (typeof options.limit === 'number') {
    query['limit'] = String(options.limit);
  }

  return query;
}

function resolveProfileLookup(args: ProfileLookupOptions): ProfileLookupOptions {
  const username = args.username?.trim();
  const url = args.url?.trim();

  if (!username && !url) {
    throw new Error('Provide either username or url.');
  }

  return {
    ...(username ? { username } : {}),
    ...(url ? { url } : {}),
    ...(typeof args.limit === 'number' ? { limit: args.limit } : {}),
  };
}

function buildServer(): McpServer {
  const client = createClient();

  const server = new McpServer({
    name: 'veedcrawl',
    version: PACKAGE_VERSION,
  });

  server.tool(
    'get_video_metadata',
    'Fetch title, description, author, stats, tags, and platform metadata for a public video URL.',
    {
      url: z.string().url().describe('Public video URL from YouTube, TikTok, Instagram, X/Twitter, or Facebook.'),
    },
    async ({ url }) => {
      try {
        const result = await client.metadata(url);
        return { content: [{ type: 'text', text: formatJson(result) }] };
      } catch (err) {
        throw toToolError(err);
      }
    },
  );

  server.tool(
    'get_video_transcript',
    'Return the final transcript for a video URL. This tool hides async polling and returns only the completed result.',
    {
      url: z.string().url().describe('Public video URL or direct file URL.'),
      mode: z.enum(['native', 'generate', 'auto']).optional().default('auto')
        .describe('native = captions only, generate = AI transcription only, auto = captions then AI fallback.'),
      lang: z.string().max(10).optional().describe('Optional language hint such as en, es, or ur.'),
    },
    async ({ url, mode, lang }) => {
      try {
        const result = await client.transcript(url, { mode, lang });
        return { content: [{ type: 'text', text: formatJson(result) }] };
      } catch (err) {
        throw toToolError(err);
      }
    },
  );

  server.tool(
    'extract_from_video',
    'Analyze a video and return structured results based on a prompt and optional JSON schema. This tool hides async polling.',
    {
      url: z.string().url().describe('Public video URL or direct file URL.'),
      prompt: z.string().min(1).max(4096).describe('What to extract or analyze from the video.'),
      lang: z.string().max(10).optional().describe('Optional language hint for transcription.'),
      schema: z.record(z.unknown()).optional().describe('Optional JSON Schema to constrain the returned extraction data.'),
    },
    async ({ url, prompt, lang, schema }) => {
      try {
        const result = await client.extract(url, { prompt, lang, schema });
        return { content: [{ type: 'text', text: formatJson(result) }] };
      } catch (err) {
        throw toToolError(err);
      }
    },
  );

  server.tool(
    'get_tiktok_profile',
    'Fetch a public TikTok profile snapshot with summary stats and recent videos. Provide either a username or a TikTok profile URL.',
    {
      username: z.string().min(1).optional().describe('TikTok username, with or without the leading @.'),
      url: z.string().url().optional().describe('Public TikTok profile URL such as https://www.tiktok.com/@creator.'),
      limit: z.number().int().min(1).max(24).optional().describe('How many recent videos to return, from 1 to 24.'),
    },
    async ({ username, url, limit }) => {
      try {
        const result = await client.tiktokProfile(resolveProfileLookup({ username, url, limit }));
        return { content: [{ type: 'text', text: formatJson(result) }] };
      } catch (err) {
        throw toToolError(err);
      }
    },
  );

  server.tool(
    'get_instagram_profile',
    'Fetch a public Instagram profile snapshot with summary stats and recent posts. Provide either a username or a public profile URL.',
    {
      username: z.string().min(1).optional().describe('Instagram username, with or without the leading @.'),
      url: z.string().url().optional().describe('Public Instagram profile URL such as https://www.instagram.com/creator/.'),
      limit: z.number().int().min(1).max(24).optional().describe('How many recent posts to return, from 1 to 24.'),
    },
    async ({ username, url, limit }) => {
      try {
        const result = await client.instagramProfile(resolveProfileLookup({ username, url, limit }));
        return { content: [{ type: 'text', text: formatJson(result) }] };
      } catch (err) {
        throw toToolError(err);
      }
    },
  );

  return server;
}

async function main() {
  getRequiredEnv('VEEDCRAWL_API_KEY', process.env['X_API_KEY']);

  const transport = new StdioServerTransport();
  const server = buildServer();
  await server.connect(transport);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const isMainModule =
  typeof process.argv[1] === 'string' &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

export { buildServer };
