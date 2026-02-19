import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { BitbucketClient, BitbucketApiError } from "../src/bitbucket/client.js";
import type { Config } from "../src/config.js";

const BASE_URL = "https://api.bitbucket.org/2.0";

const mockConfig: Config = {
  email: "test@example.com",
  apiToken: "test-token",
  defaultWorkspace: "test-workspace",
  allowedWorkspaces: undefined,
  allowedRepos: undefined,
  readonly: false,
  baseUrl: BASE_URL,
};

const mswServer = setupServer();

beforeAll(() => mswServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe("BitbucketClient", () => {
  describe("get", () => {
    it("makes GET request with auth header", async () => {
      let capturedAuth = "";
      mswServer.use(
        http.get(`${BASE_URL}/user`, ({ request }) => {
          capturedAuth = request.headers.get("authorization") || "";
          return HttpResponse.json({ display_name: "Test", type: "user" });
        })
      );

      const client = new BitbucketClient(mockConfig);
      const result = await client.get<{ display_name: string }>("/user");

      expect(result.display_name).toBe("Test");
      expect(capturedAuth).toMatch(/^Basic /);
    });

    it("passes query parameters", async () => {
      let capturedUrl = "";
      mswServer.use(
        http.get(`${BASE_URL}/repositories/ws`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({
            values: [],
            page: 1,
            size: 0,
            pagelen: 10,
          });
        })
      );

      const client = new BitbucketClient(mockConfig);
      await client.get("/repositories/ws", { page: 2, pagelen: 10 });

      expect(capturedUrl).toContain("page=2");
      expect(capturedUrl).toContain("pagelen=10");
    });

    it("omits undefined params", async () => {
      let capturedUrl = "";
      mswServer.use(
        http.get(`${BASE_URL}/test`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ ok: true });
        })
      );

      const client = new BitbucketClient(mockConfig);
      await client.get("/test", { a: "1", b: undefined });

      expect(capturedUrl).toContain("a=1");
      expect(capturedUrl).not.toContain("b=");
    });
  });

  describe("getRaw", () => {
    it("returns raw text content", async () => {
      mswServer.use(
        http.get(`${BASE_URL}/raw-endpoint`, () => {
          return new HttpResponse("raw text content", {
            headers: { "Content-Type": "text/plain" },
          });
        })
      );

      const client = new BitbucketClient(mockConfig);
      const result = await client.getRaw("/raw-endpoint");

      expect(result).toBe("raw text content");
    });
  });

  describe("post", () => {
    it("sends JSON body with POST", async () => {
      let capturedBody: unknown = null;
      let capturedContentType = "";
      mswServer.use(
        http.post(`${BASE_URL}/create`, async ({ request }) => {
          capturedContentType = request.headers.get("content-type") || "";
          capturedBody = await request.json();
          return HttpResponse.json({ id: 1 });
        })
      );

      const client = new BitbucketClient(mockConfig);
      const result = await client.post<{ id: number }>("/create", {
        title: "Test",
      });

      expect(result.id).toBe(1);
      expect(capturedContentType).toBe("application/json");
      expect(capturedBody).toEqual({ title: "Test" });
    });
  });

  describe("put", () => {
    it("sends JSON body with PUT", async () => {
      mswServer.use(
        http.put(`${BASE_URL}/update/1`, () => {
          return HttpResponse.json({ id: 1, updated: true });
        })
      );

      const client = new BitbucketClient(mockConfig);
      const result = await client.put<{ updated: boolean }>("/update/1", {
        title: "Updated",
      });

      expect(result.updated).toBe(true);
    });
  });

  describe("del", () => {
    it("sends DELETE request", async () => {
      let methodUsed = "";
      mswServer.use(
        http.delete(`${BASE_URL}/remove/1`, ({ request }) => {
          methodUsed = request.method;
          return new HttpResponse(null, { status: 204 });
        })
      );

      const client = new BitbucketClient(mockConfig);
      await client.del("/remove/1");

      expect(methodUsed).toBe("DELETE");
    });
  });

  describe("postFormData", () => {
    it("sends FormData without setting Content-Type", async () => {
      let capturedContentType = "";
      mswServer.use(
        http.post(`${BASE_URL}/upload`, ({ request }) => {
          capturedContentType = request.headers.get("content-type") || "";
          return HttpResponse.json({ ok: true });
        })
      );

      const client = new BitbucketClient(mockConfig);
      const form = new FormData();
      form.set("message", "test commit");
      form.set("branch", "main");
      await client.postFormData("/upload", form);

      // FormData should set its own content-type with boundary
      expect(capturedContentType).toContain("multipart/form-data");
    });
  });

  describe("error handling", () => {
    it("throws BitbucketApiError on 4xx", async () => {
      mswServer.use(
        http.get(`${BASE_URL}/not-found`, () => {
          return HttpResponse.json(
            { error: { message: "Not found" } },
            { status: 404 }
          );
        })
      );

      const client = new BitbucketClient(mockConfig);
      await expect(client.get("/not-found")).rejects.toThrow(
        BitbucketApiError
      );

      try {
        await client.get("/not-found");
      } catch (e) {
        expect(e).toBeInstanceOf(BitbucketApiError);
        expect((e as BitbucketApiError).statusCode).toBe(404);
      }
    });

    it("throws BitbucketApiError on 5xx", async () => {
      mswServer.use(
        http.get(`${BASE_URL}/server-error`, () => {
          return HttpResponse.json(
            { error: "Internal" },
            { status: 500 }
          );
        })
      );

      const client = new BitbucketClient(mockConfig);
      await expect(client.get("/server-error")).rejects.toThrow(
        BitbucketApiError
      );
    });

    it("truncates long error messages", async () => {
      const longMessage = "x".repeat(3000);
      mswServer.use(
        http.get(`${BASE_URL}/long-error`, () => {
          return new HttpResponse(longMessage, { status: 400 });
        })
      );

      const client = new BitbucketClient(mockConfig);
      try {
        await client.get("/long-error");
      } catch (e) {
        expect((e as BitbucketApiError).message.length).toBeLessThan(2100);
      }
    });
  });

  describe("paginateAll", () => {
    it("follows next URLs to collect all values", async () => {
      mswServer.use(
        http.get(`${BASE_URL}/items`, ({ request }) => {
          const url = new URL(request.url);
          const page = url.searchParams.get("page");
          if (page === "2") {
            return HttpResponse.json({
              values: [{ id: 3 }, { id: 4 }],
              page: 2,
              size: 4,
              pagelen: 2,
            });
          }
          return HttpResponse.json({
            values: [{ id: 1 }, { id: 2 }],
            next: `${BASE_URL}/items?page=2`,
            page: 1,
            size: 4,
            pagelen: 2,
          });
        })
      );

      const client = new BitbucketClient(mockConfig);
      const items = await client.paginateAll<{ id: number }>("/items");

      expect(items).toHaveLength(4);
      expect(items[0].id).toBe(1);
      expect(items[3].id).toBe(4);
    });

    it("respects maxPages limit", async () => {
      mswServer.use(
        http.get(`${BASE_URL}/infinite`, () => {
          return HttpResponse.json({
            values: [{ id: 1 }],
            next: `${BASE_URL}/infinite`,
            page: 1,
            size: 100,
            pagelen: 1,
          });
        })
      );

      const client = new BitbucketClient(mockConfig);
      const items = await client.paginateAll<{ id: number }>(
        "/infinite",
        undefined,
        3
      );

      expect(items).toHaveLength(3);
    });

    it("stops when there is no next URL", async () => {
      mswServer.use(
        http.get(`${BASE_URL}/single-page`, () => {
          return HttpResponse.json({
            values: [{ id: 1 }],
            page: 1,
            size: 1,
            pagelen: 10,
          });
        })
      );

      const client = new BitbucketClient(mockConfig);
      const items = await client.paginateAll<{ id: number }>("/single-page");

      expect(items).toHaveLength(1);
    });
  });

  describe("full URL support", () => {
    it("uses full URL when path starts with http", async () => {
      mswServer.use(
        http.get("https://other.example.com/api/data", () => {
          return HttpResponse.json({ found: true });
        })
      );

      const client = new BitbucketClient(mockConfig);
      const result = await client.get<{ found: boolean }>(
        "https://other.example.com/api/data"
      );

      expect(result.found).toBe(true);
    });
  });
});
