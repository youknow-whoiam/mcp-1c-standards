# NOTICE

## Upstream

This project is derived from [1CWorkers/mcp-1c-standards](https://github.com/1CWorkers/mcp-1c-standards),
which was distributed under the MIT License.

Portions of the original work are used and modified herein under the terms of the MIT License.
See `LICENSE` for the full license text applicable to the code in this repository.

## Modifications

This fork includes, among other changes:

- Improvements to the ITS / its.1c.ru scraper and loading flow
- A **demo** standards seed in `data/standards.seed.json` (synthetic text, not from ITS)
- Full ITS texts are **not** shipped in the Git repository; load them locally via scrape (ITS subscription required)

## Third-party content (not under MIT)

Official texts of 1C development standards on [its.1c.ru](https://its.1c.ru/db/v8std) are the property of Firma "1C"
(фирма «1С»). They are not licensed under MIT. Use them only under your ITS subscription and applicable terms of use.
Do not commit scraped `data/standards.json` to a public repository.
