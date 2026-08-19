Type: research
Status: resolved

Part of: [UniPty v1 Wayfinder Map](../map.md)

## Question

调查 npm 及相邻生态中 POSIX/Bash 风格和 PowerShell parser/tokenizer/AST 包：语法覆盖、输出形态、错误与不完整输入、维护活跃度、许可证、运行时兼容性和可包装性。给出直接依赖、薄包装、fork 或自研各自成立的条件，不预设包名和统一 AST。

## Answer

研究日期：2026-08-18。以下“包元数据”来自 npm registry 的当前
metadata；“行为”来自包作者 README、导出类型/源码，及本机 Node 24
探针。该探针只检查解析行为，不执行输入文本。

### Facts

| 候选                                                                                                                                                                 | 语法与输出                                                                                                                                                                                                                                                                        | 错误 / 不完整输入                                                                                                                                      | 当前维护、许可、运行时                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| [`unbash` 4.0.10](https://www.npmjs.com/package/unbash)                                                                                                              | Bash 的同步、零运行时依赖 TypeScript ESM parser；返回带 UTF-16 半开 source range 的 AST，词可懒解析为 expansion/substitution。其 README 明列 commands、control flows、pipelines、redirects、assignments、compound statements、heredocs、process/nested substitutions、coproc 等。 | 返回 best-effort partial AST 和 source-positioned `errors`；README 特别要求遍历懒解析的嵌套 script 的 `errors`。                                       | 2026-08-09 发布；ISC；声明 Node `>=14`。其发布包是纯 JS，故可由兼容 ESM 的 Bun/Deno 使用，但作者只声明 Node 引擎。                    |
| [`sh-syntax` 0.6.0](https://www.npmjs.com/package/sh-syntax)                                                                                                         | `mvdan/sh` 的 WASM parser/formatter；异步 `parse` 返回 `File` AST，`print` 可格式化。导出类型标示 Bash、POSIX sh、mksh、Bats 和实验性/不完整 Zsh variant。                                                                                                                        | `recoverErrors` 可请求 best-effort recovery；探针中未闭合引号被 reject（`reached EOF without closing quote`），正常 pipeline / substitution 返回 AST。 | 2026-07-08 发布；MIT；声明 Node `>=16`，并提供 browser 入口与需加载的 WASM。                                                          |
| [`tree-sitter-bash` 0.25.1](https://www.npmjs.com/package/tree-sitter-bash) + [`web-tree-sitter`](https://www.npmjs.com/package/web-tree-sitter)                     | Bash grammar 产生增量 CST，保留 token/punctuation；Node 包有 native binding，也附带 language WASM。`web-tree-sitter` 以 WASM 提供 Web、Node 和 Deno 的 parser runtime。                                                                                                           | Tree-sitter 的恢复模型以 `ERROR` / missing nodes 表示，不提供可直接启动的 argv AST。                                                                   | bash grammar 于 2025-12-02 发布，MIT；Node 入口依赖 native addon 和 `tree-sitter` peer dependency。浏览器/Deno 要改走 WASM 加载路径。 |
| [`shell-quote` 1.10.0](https://www.npmjs.com/package/shell-quote)                                                                                                    | 不是完整 AST parser；输出扁平 `string                                                                                                                                                                                                                                             | { op }                                                                                                                                                 | { comment }`token 流，可处理部分 POSIX quoting 与操作符。它会按调用方传入`env`做简单`$VARNAME` / `${VARNAME}` 插值。                  | 仅支持普通变量；不解释 command/arithmetic substitution，复杂 parameter expansion 不等价于 shell。探针显示未闭合双引号仍可得到 token，`$(id)` 被拆为 `$`、`(`、`id`、`)`。 | 2026-07-10 发布；MIT；声明 Node `>=0.4`，有 TypeScript declarations。作者明确其 quote 输出不适用于 PowerShell 或 `cmd.exe`。 |
| [`bash-parser` 0.5.0](https://www.npmjs.com/package/bash-parser)                                                                                                     | 返回 AST，默认 POSIX mode，可选 Bash mode。                                                                                                                                                                                                                                       | 源码会将 `SyntaxError` 抛给调用方；无 partial-tree 合约。                                                                                              | 最后发布 2017-06-22；MIT；依赖链老旧且无类型声明，声明 Node `>=4`。                                                                   |
| [`tree-sitter-powershell` 0.26.4](https://www.npmjs.com/package/tree-sitter-powershell)                                                                              | PowerShell grammar 产生 Tree-sitter CST，包附 Node prebuild 和 language WASM；README 参照 PowerShell 7.3 grammar。                                                                                                                                                                | 同样是 Tree-sitter `ERROR` / missing-node recovery，不是 PowerShell runtime AST。                                                                      | 2026-05-04 发布；MIT；Node 入口依赖 native addon 和 `tree-sitter` peer dependency。WASM 可与 `web-tree-sitter` 配合。                 |
| [PowerShell 官方 `Parser.ParseInput`](https://learn.microsoft.com/en-us/dotnet/api/system.management.automation.language.parser.parseinput?view=powershellsdk-7.4.0) | `ParseInput(string, out Token[], out ParseError[])` 返回 `ScriptBlockAst`；官方源码中 AST、tokens、error list 均来自同一 parse。`CommandAst` 还明确说明 command name 可能无法静态确定。                                                                                           | `ParseError` 有 `Extent`、`Message`、`ErrorId` 和 `IncompleteInput`；不可恢复故障才抛 `ParseException`。                                               | PowerShell 源码为 MIT；这是 .NET/PowerShell API，不是 JS/browser API。当前环境未安装 `pwsh`，未能作本机 runtime probe。               |

PowerShell 没有发现可作为官方 JS parser 的 npm 发布物：2026-08-18 对
`@microsoft/powershell-parser`、`powershell-parser`、`powershell-ast` 的
registry lookup 都是 404。这个否定结果只说明上述名称和当前 registry
结果，不是“没有任何第三方 PowerShell parser”的全称断言。

### Measurements

本机 Node 24 的最小探针：

| 输入                 | `unbash`                                                   | `sh-syntax`          | `shell-quote`                             |
| -------------------- | ---------------------------------------------------------- | -------------------- | ----------------------------------------- |
| `echo "unterminated` | partial `Script` + `unterminated double quote` at offset 5 | reject：未闭合 quote | `['echo', 'unterminated']`                |
| `echo $(id)`         | `Script`，含 structured command expansion                  | 一条 AST statement   | `['echo', '$', {op:'('}, 'id', {op:')'}]` |
| `echo a              | cat`                                                       | `Script`             | 一条 AST statement                        | `['echo', 'a', {op:' | '}, 'cat']` |

这不是语法覆盖率或性能比较，只是验证了错误形态与输出类别；不得将它外推
为生产兼容性结论。

### Judgments

1. Bash first-party ecosystem 包可从 `unbash` 开始做**薄包装**：将其 AST 和
   diagnostics 映射到 UniPty parser package 的公开“classification /
   structured request / explicit shell-script request”结果，不泄漏其 AST。
   转换前必须检查 root 和所有已访问的 nested script diagnostics；发现任一
   error、expansion、substitution、pipeline、redirect 或非单一 literal command
   时，不得声称可安全降为 `file + args`。
2. 需要 POSIX/Bash/mksh/Bats/Zsh 方言、或 formatter 的产品再候选
   `sh-syntax`。它有 WASM 初始化与异步 API 成本，且其容错范围必须先经
   UniPty parser contract corpus 实测，不能从 README 推断。
3. 需要编辑器级别增量解析、保留 punctuation 或容错 CST 时，选择
   Tree-sitter（Bash / PowerShell）并把它限定为分析/编辑器适配器。它不是
   启动请求语义的直接来源；不应把 CST 或 Tree-sitter runtime 设为 core
   dependency。
4. `shell-quote` 可作为 POSIX quote/token utility 的**直接依赖**，但不可作为
   `Shell Script Request -> Structured Launch Request` 的 parser。其调用方提供
   env 就会引入解释语义，官方 adapter 不应默认传入 process environment。
5. 不新接入 `bash-parser`；只有维护既有使用方并需要修安全或兼容问题时，才
   考虑有范围的 fork。它不是 v1 新生态的候选。
6. PowerShell 的语义权威应是官方 parser。`@unipty/powershell-parser` 若要
   提供 AST/diagnostics，应以**可选 adapter**调用已安装 `pwsh` 或小型 .NET
   helper 的 `Parser.ParseInput`，序列化稳定且自定义的 diagnostics /
   classification result；缺少该 runtime 时显式报告 capability unavailable。
   Parser 不得执行用户输入。
7. 自研只在已有候选无法满足已批准的公开 parser contract，且长期可维护 owner
   与 corpus 已经存在时成立。不能为了统一 AST 自研两门语言：UniPty 的稳定
   边界应是结果分类与启动请求，而不是跨语言 AST。

### Unknowns And Required Follow-up

- `unbash` 和 `sh-syntax` 在 Bun、Deno 的实际安装、导入和产物体积，尚未在
  目标 runtime probe 中验证。
- `sh-syntax` 的 `recoverErrors` 对所有 UniPty 目标的不完整输入是否可靠，未
  建立 corpus。
- 官方 PowerShell parser adapter 的 host selection、AST 序列化范围、Windows
  PowerShell 5.1 与 PowerShell 7.x compatibility，尚未决定或探针验证。
- Tree-sitter PowerShell grammar 与实际 PowerShell runtime grammar 的差异、
  Node native prebuild 在所有 UniPty target matrix 的可用性，尚未验证。
- parser packages 不作为 v1 Core/Backend 发布阻塞项；生态包命名固定为
  `@unipty/shell-parser` 与 `@unipty/powershell-parser`，但可以在 v1 Core 稳定后
  独立发布。

## Product Boundary

官方 parser 包只承诺一个小的、语言特定的分类结果，不暴露第三方 AST：

```ts
type ShellParseResult =
  | { kind: "argv"; argv: readonly string[] }
  | { kind: "script"; language: string; source: string }
  | { kind: "incomplete" | "unsupported" | "invalid"; diagnostics: readonly unknown[] };
```

`@unipty/shell-parser` v1 方向是对 `unbash` 的薄包装；只有在目标 runtime probe
或安全/许可证审查不成立时才 fork。`@unipty/powershell-parser` 以 PowerShell
官方 `Parser.ParseInput` 为语义权威，通过 `pwsh` 或 .NET helper adapter 提供
可序列化结果；缺少 host 时报告 capability unavailable，绝不回退到“像 Bash 一样
解析”。两个包都只解析不执行，调用方必须显式接受 `script` 结果的 shell policy。

### Primary Sources

- [unbash package metadata](https://registry.npmjs.org/unbash) and
  [README / supported syntax](https://github.com/webpro-nl/unbash#supported-syntax)
- [sh-syntax package metadata](https://registry.npmjs.org/sh-syntax),
  [API](https://github.com/un-ts/sh-syntax#api), and
  [mvdan/sh JavaScript guidance](https://github.com/mvdan/sh#javascript)
- [tree-sitter-bash package metadata](https://registry.npmjs.org/tree-sitter-bash),
  [grammar](https://github.com/tree-sitter/tree-sitter-bash), and
  [web-tree-sitter runtime docs](https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web)
- [shell-quote package metadata](https://registry.npmjs.org/shell-quote) and
  [parse / quote contract](https://github.com/ljharb/shell-quote#parsecmd-env)
- [bash-parser package metadata](https://registry.npmjs.org/bash-parser) and
  [parse source](https://github.com/vorpaljs/bash-parser/blob/master/src/index.js)
- [tree-sitter-powershell package metadata](https://registry.npmjs.org/tree-sitter-powershell) and
  [grammar source](https://github.com/airbus-cert/tree-sitter-powershell/blob/master/grammar.js)
- [PowerShell grammar](https://learn.microsoft.com/en-us/powershell/scripting/lang-spec/chapter-15?view=powershell-7.5),
  [Parser API](https://learn.microsoft.com/en-us/dotnet/api/system.management.automation.language.parser.parseinput?view=powershellsdk-7.4.0),
  [ParseError API](https://learn.microsoft.com/en-us/dotnet/api/system.management.automation.language.parseerror?view=powershellsdk-7.4.0),
  [parser source](https://github.com/PowerShell/PowerShell/blob/master/src/System.Management.Automation/engine/parser/Parser.cs), and
  [license](https://github.com/PowerShell/PowerShell/blob/master/LICENSE.txt)
