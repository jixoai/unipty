// Orthogonal intents (maintained 2026-09-06 Asia/Shanghai): locale resolution
// — route → content dictionary. `/` = en (URL stability law: the existing
// artifact URLs never move), `/zh/**` = zh mirror. routeOfPath strips the kit
// base first, so the answer is base-independent.
//
// Original request (2026-09-06 Asia/Shanghai): openspec/changes/
// 2026-09-06-site-i18n-zh.
import { en } from '$lib/i18n/locales/en';
import { zh } from '$lib/i18n/locales/zh';
import type { SiteContent } from '$lib/i18n/schema';

export type SiteLocale = 'en' | 'zh';

export const siteLocales: readonly SiteLocale[] = ['en', 'zh'];

export function getLocaleContent(locale: SiteLocale): SiteContent {
  return locale === 'zh' ? zh : en;
}

/** Normalize a pathname into route space: strip the kit base prefix when
 *  present, always return a leading '/'. */
export function routeOfPath(pathname: string, base: string): string {
  const stripped =
    base !== '' && pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

/** Whether a route belongs to the zh mirror ('/zh', '/zh/', '/zh/…' — but
 *  not '/zh-foo'). */
export function isZhRoute(route: string): boolean {
  return route === '/zh' || route === '/zh/' || route.startsWith('/zh/');
}

/** route → locale (en is the default: the root and every non-/zh path). */
export function localeOfRoute(route: string): SiteLocale {
  return isZhRoute(route) ? 'zh' : 'en';
}

/**
 * Map a route onto its counterpart in the target locale, preserving the
 * page (and, at the call site, the anchor). The en↔zh pair table:
 *   '/' ↔ '/zh/'   '/docs.html' ↔ '/zh/docs.html'   '/compatibility.html' ↔ …
 * Unknown routes degrade to the target locale's home. Base is prepended
 * when the site runs under one (unipty serves at the domain root, '').
 */
export function localizedPath(route: string, locale: SiteLocale, base = ''): string {
  const isZh = isZhRoute(route);
  const path = route.replace(/\/+$/, '') || '/';
  if (locale === 'zh' && !isZh) {
    const target = path === '/' ? '/zh/' : `/zh${path}`;
    return `${base}${target}`;
  }
  if (locale === 'en' && isZh) {
    const stripped = path.slice('/zh'.length);
    return `${base}${stripped === '' ? '/' : stripped}`;
  }
  return `${base}${path === '/' && isZh ? '/zh/' : path}`;
}
