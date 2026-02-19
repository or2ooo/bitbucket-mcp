import { Config } from "../config.js";
import type { PaginatedResponse } from "./types.js";

export class BitbucketApiError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "BitbucketApiError";
  }
}

export class BitbucketClient {
  private authHeader: string;
  private baseUrl: string;
  private timeout: number;

  constructor(config: Config, timeout = 30000) {
    this.authHeader = `Basic ${btoa(config.email + ":" + config.apiToken)}`;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.timeout = timeout;
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      formData?: FormData;
      params?: Record<string, string | number | boolean | undefined>;
      rawResponse?: boolean;
    } = {}
  ): Promise<T> {
    let url: string;
    if (path.startsWith("http://") || path.startsWith("https://")) {
      url = path;
    } else {
      url = `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    }

    if (options.params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          searchParams.set(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
    };

    let bodyPayload: BodyInit | undefined;

    if (options.formData) {
      bodyPayload = options.formData;
    } else if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyPayload = JSON.stringify(options.body);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: bodyPayload,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        const truncated =
          text.length > 2000 ? text.substring(0, 2000) + "..." : text;
        throw new BitbucketApiError(
          response.status,
          `Bitbucket API error ${response.status}: ${truncated}`
        );
      }

      if (options.rawResponse) {
        const text = await response.text();
        return text as T;
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return (await response.json()) as T;
      }
      const text = await response.text();
      return text as T;
    } catch (error) {
      if (error instanceof BitbucketApiError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new BitbucketApiError(408, "Request timed out");
      }
      throw new BitbucketApiError(
        0,
        `Network error: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>("GET", path, { params });
  }

  async getRaw(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<string> {
    return this.request<string>("GET", path, { params, rawResponse: true });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body });
  }

  async del<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  async postFormData<T>(path: string, formData: FormData): Promise<T> {
    return this.request<T>("POST", path, { formData });
  }

  async paginateAll<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
    maxPages = 10
  ): Promise<T[]> {
    const allValues: T[] = [];
    let currentPath: string | undefined = path;
    let currentParams: Record<string, string | number | boolean | undefined> | undefined = params;
    let page = 0;

    while (currentPath && page < maxPages) {
      const response: PaginatedResponse<T> = await this.get<PaginatedResponse<T>>(
        currentPath,
        currentParams
      );
      allValues.push(...response.values);

      if (response.next) {
        currentPath = response.next;
        currentParams = undefined; // next URL includes params
      } else {
        break;
      }
      page++;
    }

    return allValues;
  }
}
