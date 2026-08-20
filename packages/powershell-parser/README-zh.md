# @unipty/powershell-parser

[English](./README.md) | [简体中文](./README-zh.md) · [GitHub](https://github.com/jixoai/unipty) · [文档](https://unipty.jixoai.com)

UniPty 官方 PowerShell 解析适配器：把 PowerShell 命令**文本**分类到 UniPty 的
结构化启动方向，唯一语义权威是官方 `Parser.ParseInput` API。绝不执行输入，
也绝不回退成“像 Bash 一样解析”。

适配器运行在显式选择的 PowerShell 宿主里（默认 `pwsh`）。静态适配脚本经
`-EncodedCommand` 传入；你的文本以 base64 UTF-8 环境变量单独传输，绝不拼接
进命令行（也规避了 Windows stdin 代码页歧义——实际输入上限约 31 KB）。

## 用法

```ts
import { parsePowershell } from "@unipty/powershell-parser";

await parsePowershell('dotnet build -c "My Config"');
// → { kind: "argv", argv: ["dotnet", "build", "-c", "My Config"] }

await parsePowershell("a | b");
// → { kind: "script", language: "powershell", source: "a | b" }

await parsePowershell("echo 'unterminated");
// → { kind: "incomplete", diagnostics: [...] }
```

结果为 `argv` 时，官方解析器证明了这是恰好一条字面元素命令（字面字符串、
`-c` 这类参数、数字常量）。结果为 `script` 时，文本携带 PowerShell 语义
（管道、重定向、`$变量`、子表达式、多条语句……），**你**必须显式接受该策略
后才能启动任何东西。

## 宿主处理

```ts
import { isPowershellHostAvailable, PowershellParseError } from "@unipty/powershell-parser";

await isPowershellHostAvailable(); // → 无 pwsh 时为 false

await parsePowershell("x", { host: "pwsh-preview" }); // 显式选择宿主
```

- 缺宿主 → 以 `PowershellParseError`、code `capability-unavailable` 拒绝
  （绝不产生 Bash 解释的结果）。
- 宿主启动但失败 → `host-failure`；超时（默认 15 秒，`timeoutMs` 可配）→
  `host-timeout`。
- 默认目标为 PowerShell 7+（`pwsh`）；可用 `options.host` 指定其它可执行
  文件（例如 Windows PowerShell 5.1 的 `powershell`，它同样拥有
  `Parser.ParseInput`）。

## 诊断信息

官方 `ParseError` 记录序列化为 `{ message, errorId, incomplete, range }`，
带 UTF-16 偏移区间；标记 `IncompleteInput` 的错误映射为 `incomplete`，
其余映射为 `invalid`。
