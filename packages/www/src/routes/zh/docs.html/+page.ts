// zh docs 镜像的 ToC 数据（2026-09-06 site-i18n-zh）：zh 标签、与 en 完全
// 相同的锚点 id（语言切换保持当前锚点的前提；check-site 断言两 locale
// 锚点集合一致）。结构见 docs.html/+page.ts。
import { zh } from "$lib/i18n/locales/zh";

export function load(): { toc: typeof zh.docs.toc } {
  return { toc: zh.docs.toc };
}
