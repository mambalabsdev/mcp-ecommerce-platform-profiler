# Ecommerce Platform Profiler MCP Server

[![Smithery](https://smithery.ai/badge/mambabuilt/mcp-ecommerce-platform-profiler)](https://smithery.ai/servers/mambabuilt/mcp-ecommerce-platform-profiler) [![Glama score](https://glama.ai/mcp/servers/mambalabsdev/mcp-ecommerce-platform-profiler/badges/score.svg)](https://glama.ai/mcp/servers/mambalabsdev/mcp-ecommerce-platform-profiler) [![MCP Registry](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.modelcontextprotocol.io%2Fv0%2Fservers%3Fsearch%3Dcom.mambabuilt%252Fmcp-ecommerce-platform-profiler%26limit%3D1&query=%24.servers%5B0%5D._meta%5B%22io.modelcontextprotocol.registry%2Fofficial%22%5D.status&label=mcp%20registry&color=blue)](https://registry.modelcontextprotocol.io/v0/servers?search=com.mambabuilt/mcp-ecommerce-platform-profiler&limit=1) [![npm version](https://img.shields.io/npm/v/@mambalabsdev/mcp-ecommerce-platform-profiler)](https://www.npmjs.com/package/@mambalabsdev/mcp-ecommerce-platform-profiler) [![npm downloads](https://img.shields.io/npm/dm/@mambalabsdev/mcp-ecommerce-platform-profiler)](https://www.npmjs.com/package/@mambalabsdev/mcp-ecommerce-platform-profiler) [![license](https://img.shields.io/github/license/mambalabsdev/mcp-ecommerce-platform-profiler)](https://github.com/mambalabsdev/mcp-ecommerce-platform-profiler/blob/main/LICENSE) [![mcpservers.org](https://img.shields.io/badge/mcpservers.org-listed-blue)](https://mcpservers.org/servers/mambalabsdev/mcp-ecommerce-platform-profiler)

An MCP server that detects the ecommerce platform, payment providers and catalog size behind a storefront. It wraps the Mamba Labs Ecommerce Platform Profiler actor on Apify and returns a Clay-ready flat JSON row to any MCP client.

## What's Inside

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Prerequisites](#prerequisites)
- [Example prompts](#example-prompts)
- [Inputs](#inputs)
- [Output](#output)
- [Example output](#example-output)
- [Features](#features)
- [Full actor documentation](#full-actor-documentation)
- [Mamba Labs GTM Suite](#mamba-labs-gtm-suite)
- [License](#license)

## What it does

Give it a company domain and it reads the storefront and returns which ecommerce platform it runs on, which payment providers it loads, whether it sells subscriptions, roughly how many products it lists, and which currencies and shipping destinations it takes. One flat row per company.

Detected platforms include Shopify, WooCommerce, Magento, BigCommerce, Salesforce Commerce, Squarespace, Wix, PrestaShop and commercetools. Reads are static: the homepage, the sitemap, and optionally the public cart page. No browser is used, so a storefront that reveals its platform only after JavaScript runs is reported as `not_extractable` rather than labeled with the nearest guess. Confidence follows the kind of evidence, so a vendor header is high and a substring in the HTML is low.

All of the detection runs on Apify. This package is a thin client that calls the actor and hands back the result unchanged.

## Quick start

You need Node.js 18 or newer and an Apify account with an API token.

Add this to your Claude Desktop config:

```json
{
  "mcpServers": {
    "mamba-ecommerce-platform-profiler": {
      "command": "npx",
      "args": ["-y", "@mambalabsdev/mcp-ecommerce-platform-profiler"],
      "env": {
        "APIFY_TOKEN": "your-apify-token"
      }
    }
  }
}
```

Get your token at https://console.apify.com/account/integrations, paste it in, and restart Claude Desktop. The `profile_ecommerce_platform` tool will be available.

## Prerequisites

- Node.js 18 or newer
- An Apify account with an API token

## Example prompts

- "What ecommerce platform does allbirds.com run on?"
- "Profile gymshark.com and include the payment providers loaded on the cart page."
- "Does this storefront sell subscriptions, and roughly how many products does it list?"
- "Check the platform for this domain but fail fast if the site blocks us."

## Inputs

- `company_domain` (optional): bare company domain, for example `allbirds.com`. This is the storefront that gets read, and it is the join key against every other actor in the fleet.
- `company_name` (optional but strongly recommended): what the identity gate checks a discovered record against, so supplying it is the cheapest way to reduce wrong matches.
- `includeProductCount` (optional): when true (the default) the catalog size is estimated, from the Shopify products endpoint where the store is Shopify and from the sitemap otherwise. It costs one or two extra requests.
- `includePaymentProviders` (optional): when true (the default) the payment provider scripts loaded on the storefront are detected. Providers that load only inside a real checkout are invisible from the homepage, which is why `checkCheckout` exists.
- `checkCheckout` (optional): when true the public cart page is also read, because several payment and buy now pay later providers load there and not on the homepage. This never adds an item, never starts a checkout and never submits anything. It is a plain read of a public URL and costs one extra request.
- `escalateOnBlock` (optional): when true (the default) a storefront that answers 403 or 429 is retried once from a residential exit, because a bot challenge on a first read is common. Set false to fail fast and cheap.
- `skipCache` (optional): when false (the default) a successful lookup is cached for seven days and reused. Set true to force a fresh fetch.

## Output

The tool returns the actor's flat JSON row for the company, with 22 snake_case fields and no nested objects. `platform_confidence` and `platform_evidence` travel with the detection rather than a bare label, `coverage` shows how much of the row was filled, and `fetch_status` says whether the read succeeded. See the Apify Store page for the full output schema.

## Example output

```json
{
  "degraded": false,
  "degradation_reason": null,
  "company_domain": "allbirds.com",
  "company_name": "Allbirds",
  "ecommerce_platform": "shopify",
  "platform_confidence": "high",
  "platform_evidence": "header",
  "platforms_all": "shopify",
  "payment_providers": "apple_pay",
  "has_subscriptions": false,
  "subscription_apps": null,
  "has_marketplace": false,
  "product_count_estimate": 250,
  "product_count_source": "products_json",
  "product_count_exact": false,
  "currencies": null,
  "ships_to": null,
  "pages_read": 2,
  "escalated": false,
  "coverage": 0.71,
  "fetch_status": "ok",
  "run_date": "2026-08-22T19:23:53.897Z"
}
```

## Features

- Identifies the ecommerce platform a storefront runs on
- Payment providers, subscription apps and marketplace apps
- Catalog size estimate, currencies and shipping destinations
- Static homepage and sitemap reads only, no browser
- Confidence and evidence recorded per detection, not a bare label
- Coverage reported per row, so a thin read is visible
- 22 flat snake_case fields, one row per company

## Full actor documentation

This server is a thin client and holds no detection logic. For the complete input and output reference, pricing, and run history, see the Apify Store page:

https://apify.com/mambalabs/ecommerce-platform-profiler

---

## Mamba Labs GTM Suite

This server is one of the Mamba Labs GTM Suite MCP servers. Every actor in the suite takes a domain or a company and returns one flat row, so they stack in the same Clay table without reshaping anything. The actor behind this server is the Ecommerce Platform Profiler, immutable Apify actor ID `5G2NeYjBbQTjaTn9L`.

> Built by [Mamba Labs](https://github.com/mambalabsdev) | [npm](https://www.npmjs.com/org/mambalabsdev) | [Apify Store](https://apify.com/mambalabs)

## License

MIT

Built by Mamba Labs. https://apify.com/mambalabs
