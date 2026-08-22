#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
// Distinctive UA so Apify run meta.userAgent marks MCP-originated runs.
const USER_AGENT = `mambalabs-mcp ${pkg.name}@${pkg.version}`;
const APIFY_TOKEN = process.env.APIFY_TOKEN;
// Drop undefined values so optional inputs are not sent to the actor at all.
function compact(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined)
            out[k] = v;
    }
    return out;
}
// The actor types its switches as strings ("true"/"false") for Clay
// compatibility, because Clay sends every input as a string and a boolean typed
// field silently receives "false" and reads it as truthy. The model gets a real
// boolean and the actor gets the string it validates.
function boolToString(v) {
    return v === undefined ? undefined : v ? "true" : "false";
}
// actorPath is the actor's IMMUTABLE Apify actor id, not its slug, so a Store
// rename never breaks these calls.
async function runActor(actorPath, actorLabel, input) {
    if (!APIFY_TOKEN) {
        return { isError: true, content: [{ type: "text", text: "APIFY_TOKEN is not set. Create a token at https://console.apify.com/account/integrations and set it as the APIFY_TOKEN environment variable." }] };
    }
    // memory=512 is deliberate and matches the actor's declared
    // defaultRunOptions.memoryMbytes. run-sync-get-dataset-items runs at 2048 MB
    // unless told otherwise, and `apify-actor-start` bills once per GB with a
    // minimum of one, so leaving the default in place would charge the caller
    // more start events per run than the actor asks for. Keep this in step with
    // the actor's defaultRunOptions.
    const url = `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items?timeout=300&memory=512`;
    let response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${APIFY_TOKEN}`,
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
            },
            body: JSON.stringify(input),
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: "text", text: `Could not reach the Apify API: ${message}` }] };
    }
    if (!response.ok) {
        let detail = "";
        try {
            const body = (await response.json());
            if (body?.error?.message)
                detail = ` ${body.error.message}`;
        }
        catch {
            detail = "";
        }
        let message;
        switch (response.status) {
            case 401:
                message = "Invalid Apify token. Check your APIFY_TOKEN environment variable.";
                break;
            case 402:
                message = "Insufficient Apify credits. Check your account balance at https://console.apify.com/billing";
                break;
            case 408:
                message = `The ${actorLabel} run timed out after 300 seconds. Try again, or run the actor on Apify directly for longer jobs.`;
                break;
            default:
                message = `Apify request to ${actorLabel} failed with status ${response.status}.${detail}`;
        }
        return { isError: true, content: [{ type: "text", text: message }] };
    }
    // A 2xx normally carries the dataset array. Pass actor output through
    // unchanged: the wrapper must never reinterpret a status field, because
    // not_extractable, blocked and not_found are different answers and collapsing
    // them is exactly the defect the actor was built to avoid.
    const items = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
}
const server = new McpServer({
    name: "mamba-ecommerce-platform-profiler",
    version: pkg.version,
});
// Ecommerce Platform Profiler (immutable actor ID 5G2NeYjBbQTjaTn9L)
server.registerTool("profile_ecommerce_platform", {
    title: "Profile Ecommerce Platform",
    description: "Detect which ecommerce platform a storefront runs on (Shopify, WooCommerce, Magento, BigCommerce, Salesforce Commerce, Squarespace, Wix, PrestaShop or commercetools), plus its payment providers, subscription and marketplace apps, an estimated catalogue size, currencies and shipping destinations. Returns one flat Clay ready row. Static homepage and sitemap reads only, no browser, so a storefront that reveals its platform only after JavaScript runs is reported as not_extractable rather than labelled with the nearest guess. Confidence follows the KIND of evidence: a vendor header is high, a substring in the HTML is low. Read only; requires an APIFY_TOKEN and consumes Apify credits per call.",
    annotations: {
        title: "Profile Ecommerce Platform",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
    },
    inputSchema: {
        company_domain: z.string()
            .optional()
            .describe("Bare company domain, for example allbirds.com. This is the storefront that gets read, and it is the join key against every other actor in the fleet including the Pinterest brand presence mapper."),
        company_name: z.string()
            .optional()
            .describe("Optional but strongly recommended. It is what the identity gate checks a discovered record against, so supplying it is the single cheapest way to reduce wrong matches."),
        includeProductCount: z.boolean()
            .optional()
            .describe("When \"true\" (default) the catalogue size is estimated, from the Shopify products endpoint where the store is Shopify and from the sitemap otherwise. It costs one or two extra requests. Sent as a string for Clay compatibility."),
        includePaymentProviders: z.boolean()
            .optional()
            .describe("When \"true\" (default) the payment provider scripts loaded on the storefront are detected. Providers that load only inside a real checkout are invisible from the homepage, which is why checkCheckout exists. Sent as a string for Clay compatibility."),
        checkCheckout: z.boolean()
            .optional()
            .describe("When \"true\" the public cart page is also read, because several payment and buy now pay later providers load there and not on the homepage. This never adds an item, never starts a checkout and never submits anything: it is a plain read of a public URL. Costs one extra request. Sent as a string for Clay compatibility."),
        escalateOnBlock: z.boolean()
            .optional()
            .describe("When \"true\" (default) a storefront that answers 403 or 429 is retried once from a residential exit, because a bot challenge on a first read is common and one retry clears a fair share of them. Set \"false\" to fail fast and cheap. Sent as a string for Clay compatibility."),
        skipCache: z.boolean()
            .optional()
            .describe("When \"false\" (default) a successful lookup is cached for seven days and reused, which costs you nothing on a repeated run. Set \"true\" to force a fresh fetch. Sent as a string for Clay compatibility."),
    },
}, async ({ company_domain, company_name, includeProductCount, includePaymentProviders, checkCheckout, escalateOnBlock, skipCache }) => {
    return runActor("5G2NeYjBbQTjaTn9L", "Ecommerce Platform Profiler", compact({
        company_domain,
        company_name,
        includeProductCount: boolToString(includeProductCount),
        includePaymentProviders: boolToString(includePaymentProviders),
        checkCheckout: boolToString(checkCheckout),
        escalateOnBlock: boolToString(escalateOnBlock),
        skipCache: boolToString(skipCache),
    }));
});
const transport = new StdioServerTransport();
await server.connect(transport);
