import { test, expect } from "@playwright/test";

test(
  "dashboard: search, algorithms, insertion, documents, RAG and responsive layout",
  async ({ page }) => {
    const errors: string[] = [];

    page.on(
      "pageerror",
      (error) =>
        errors.push(error.message),
    );

    await page.goto("/");

    await expect(
      page.locator("#statsLabel"),
    ).toHaveText(
      "20 vectors · 16 dims",
    );

    await page
      .getByRole("textbox", {
        name: "Search query",
        exact: true,
      })
      .fill("binary tree");

    await page
      .getByRole("button", {
        name: "⚡ SEARCH",
        exact: true,
      })
      .click();

    await expect(
      page.locator(".rcard"),
    ).toHaveCount(5);

    await expect(
      page.locator(".lat-big"),
    ).not.toHaveText("—");

    await page
      .getByRole("button", {
        name: "KD-TREE",
        exact: true,
      })
      .click();

    await page
      .getByLabel("Distance metric")
      .selectOption("manhattan");

    await page
      .getByRole("button", {
        name: "⚡ SEARCH",
        exact: true,
      })
      .click();

    await expect(
      page.locator(".lat-sub"),
    ).toContainText(
      "kdtree".toUpperCase(),
    );

    await page
      .getByRole("button", {
        name: "▶ COMPARE ALL ALGOS",
      })
      .click();

    await expect(
      page.locator(".brow"),
    ).toHaveCount(3);

    await page
      .getByLabel("Vector description")
      .fill("Browser test binary search");

    await page
      .getByRole("button", {
        name: "+ INSERT",
        exact: true,
      })
      .click();

    await expect(
      page.locator("#statsLabel"),
    ).toHaveText(
      "21 vectors · 16 dims",
    );

    // Verify user-provided markup stays plain text.
    await page
      .getByRole("tab", {
        name: "DOCUMENTS",
        exact: true,
      })
      .click();

    await expect(
      page.locator(".ollama-status"),
    ).toContainText("Ready");

    await page
      .getByLabel("Document title", {
        exact: true,
      })
      .fill(
        "DP <img src=x onerror=alert(1)>",
      );

    await page
      .getByLabel("Document text", {
        exact: true,
      })
      .fill(
        "Dynamic programming solves overlapping subproblems through memoization.",
      );

    await page
      .getByRole("button", {
        name: "⚡ EMBED & INSERT",
      })
      .click();

    await expect(
      page.locator(".dcard"),
    ).toHaveCount(1);

    await expect(
      page.locator(".dcard img"),
    ).toHaveCount(0);

    await expect(
      page.locator("#statsLabel"),
    ).toHaveText(
      "22 vectors · 16 dims",
    );

    await page
      .getByRole("tab", {
        name: "ASK AI",
        exact: true,
      })
      .click();

    await page
      .getByLabel("Question for AI")
      .fill(
        "What is dynamic programming?",
      );

    await page
      .getByRole("button", {
        name: "🤖 ASK AI",
        exact: true,
      })
      .click();

    await expect(
      page.locator(".chat-a"),
    ).toBeVisible();

    await expect(
      page.locator(".chat-ctx-label"),
    ).toContainText("1 chunks");

    await page
      .locator(".ctx-chip")
      .click();

    await expect(
      page.locator(".ctx-expand"),
    ).toContainText(
      "memoization",
    );

    await expect(
      page.locator(
        '.chat-a-text[aria-hidden=true]',
      ),
    ).toContainText(
      "[TEST FIXTURE]",
    );

    await page
      .getByRole("tab", {
        name: "DOCUMENTS",
        exact: true,
      })
      .click();

    await page
      .getByRole("button", {
        name: /Delete chunk DP/,
      })
      .click();

    await expect(
      page.locator(".dcard"),
    ).toHaveCount(0);

    await expect(
      page.locator("#statsLabel"),
    ).toHaveText(
      "21 vectors · 16 dims",
    );

    await page
      .getByRole("tab", {
        name: "SEARCH",
        exact: true,
      })
      .click();

    await page
      .getByRole("button", {
        name: "HNSW",
        exact: true,
      })
      .click();

    await page
      .getByLabel("Distance metric")
      .selectOption("cosine");

    await page
      .getByRole("textbox", {
        name: "Search query",
        exact: true,
      })
      .fill("sushi ramen");

    await page
      .getByRole("button", {
        name: "⚡ SEARCH",
        exact: true,
      })
      .click();

    await expect(
      page.locator(".rcard"),
    ).toHaveCount(5);

    await page.screenshot({
      path: "test-results/dashboard-desktop.png",
      fullPage: true,
    });

    await page
      .locator(".rcard")
      .first()
      .getByRole("button")
      .click();

    await expect(
      page.locator("#statsLabel"),
    ).toHaveText(
      "20 vectors · 16 dims",
    );

    await page.setViewportSize({
      width: 390,
      height: 844,
    });

    await expect(
      page.getByRole("textbox", {
        name: "Search query",
        exact: true,
      }),
    ).toBeVisible();

    expect(
      await page.evaluate(
        () =>
          document.documentElement
            .scrollWidth <=
          window.innerWidth,
      ),
    ).toBe(true);

    await page.screenshot({
      path: "test-results/dashboard-mobile.png",
      fullPage: true,
    });

    expect(errors).toEqual([]);
  },
);

test(
  "offline model status and generation errors are visible and recoverable",
  async ({ page }) => {
    await page.route(
      "**/api/status",
      (route) =>
        route.fulfill({
          json: {
            ollamaAvailable: false,
            modelsReady: false,
            missingModels: [
              "nomic-embed-text",
              "llama3.2",
            ],
            embedModel:
              "nomic-embed-text",
            genModel: "llama3.2",
            docCount: 0,
            docDims: 0,
            demoDims: 16,
            demoCount: 20,
          },
        }),
    );

    await page.goto("/");

    await page
      .getByRole("tab", {
        name: "DOCUMENTS",
        exact: true,
      })
      .click();

    await expect(
      page.locator(".ollama-status"),
    ).toContainText("Offline");

    await page.route(
      "**/api/doc/ask",
      (route) =>
        route.fulfill({
          status: 503,
          json: {
            error:
              "Cannot reach Ollama. Start the local model service.",
          },
        }),
    );

    await page
      .getByRole("tab", {
        name: "ASK AI",
        exact: true,
      })
      .click();

    await page
      .getByLabel("Question for AI")
      .fill(
        "Question while offline",
      );

    await page
      .getByRole("button", {
        name: "🤖 ASK AI",
        exact: true,
      })
      .click();

    await expect(
      page.getByRole("alert"),
    ).toContainText(
      "Cannot reach Ollama",
    );

    await expect(
      page.getByRole("button", {
        name: "🤖 ASK AI",
        exact: true,
      }),
    ).toBeEnabled();

    await page
      .getByRole("button", {
        name: "Dismiss error",
      })
      .click();

    await expect(
      page.getByRole("alert"),
    ).toHaveCount(0);
  },
);