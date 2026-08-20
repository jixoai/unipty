# @unipty/shell-parser

[English](./README.md) | [简体中文](./README-zh.md) · [GitHub](https://github.com/jixoai/unipty) · [文档](https://unipty.jixoai.com)

UniPty 官方 Bash shell 解析器：把命令**文本**分类到 UniPty 的结构化启动方向，
全程不执行任何东西。它是可选生态包——UniPty 核心没有字符串命令重载，也绝不
通过 shell 求值文本。

它是对 [`unbash`](https://www.npmjs.com/package/unbash)（精确锁版）的薄包装，
唯一公开面是分类结果；绝不暴露 unbash 的 AST。

## 用法

```ts
import { parse } from "@unipty/shell-parser";

parse("git status --force");
// → { kind: "argv", argv: ["git", "status", "--force"] }

parse("ls *.txt | wc -l");
// → { kind: "script", language: "bash", source: "ls *.txt | wc -l" }

parse("echo 'unterminated");
// → { kind: "incomplete", diagnostics: [...] }
```

结果为 `argv` 时，文本被证明是单个简单命令、全部字面词（保留引号语义与空参数），
可直接作为 `unipty.spawn(argv)`。结果为 `script` 时，文本携带 shell 语义
（管道、重定向、展开、替换、glob、波浪号、后台、赋值前缀、复合语句……），
**你**必须显式接受该 shell 策略后才能启动任何东西。

## 分类策略

- `argv`——恰好一个简单命令；每个词在引号处理后都是字面量；没有展开、替换、
  glob、波浪号、转义、重定向、赋值前缀、操作符或复合构造。
- `script`——解析干净且携带 shell 语义（或仅注释 / 带 shebang）；原样返回
  原始 source。
- `incomplete` / `invalid`——unbash 诊断信息，按“输入末尾未闭合”类消息区分；
  诊断携带 UTF-16 源码区间。
- `unsupported`——walker 无法判定的词构造；绝不猜测。

转义元字符（`echo \*`）与未加引号的方括号字符（`[ -f x ]`）同样归入
`script`：walker 从原始词文本证明字面性，任何歧义都保持为 shell 请求。

## 环境要求

纯 JavaScript、零平台 API：只要 ESM import 可解析，Node、Bun、Deno 皆可使
用。运行时与 `unipty` 没有依赖关系——两个包按设计保持结构兼容，而非依赖
耦合。
