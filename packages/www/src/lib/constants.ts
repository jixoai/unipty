// Orthogonal intents (maintained 2026-09-06 Asia/Shanghai): added SITE_URL
// (the absolute origin behind the CNAME) for canonical + hreflang links on
// every page; the header subtitle moved into the i18n dictionaries
// (src/lib/i18n/locales) with the zh mirror.
//
// Original role (2026-08-20 restyle): shared site constants. SITE_DOMAIN is
// the CNAME target (unipty.jixoai.com); SITE_URL must stay in sync with
// scripts/build.mjs LLMS_TXT_CONFIG.siteUrl.
export const GITHUB_URL = "https://github.com/jixoai/unipty";
export const SITE_DOMAIN = "unipty.jixoai.com";
export const SITE_URL = "https://unipty.jixoai.com";
