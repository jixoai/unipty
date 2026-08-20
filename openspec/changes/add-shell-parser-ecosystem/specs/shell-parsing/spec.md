## ADDED Requirements

### Requirement: Parser result classification contract

The system SHALL expose parser packages whose top-level result is exactly one
of: a direct structured launch candidate (`argv`), an explicit Shell Script
Request (`script` with language and original source), or `incomplete`,
`unsupported`, or `invalid` with serializable diagnostics. `argv` is a
**lexical** classification — one simple command whose words are literal after
static quote processing — and the caller owns executable resolution (PATH,
builtins, shell functions, aliases); the parser never proves process-launch
equivalence for a command name. A parser SHALL NOT execute a process, SHALL
NOT implicitly select or invoke a shell, and SHALL NOT expose the wrapped
parser's AST types in its public result. The caller SHALL be required to
explicitly accept a `script` result's shell semantics before constructing
any launch.

#### Scenario: Direct invocation classifies as argv

- **WHEN** a caller parses text that is a single simple command whose words
  are entirely literal after quote processing
- **THEN** the result is `argv` with the executable first and the literal
  words in order, and no shell is selected or invoked

#### Scenario: Builtin-named commands stay lexical argv candidates

- **WHEN** the single literal command names a shell builtin such as `cd` or
  `exec`
- **THEN** the result is still `argv` (dispatch is the caller's decision);
  the parser neither denies nor proves builtin resolution

#### Scenario: Shell constructs classify as an explicit script request

- **WHEN** the text uses pipelines, redirection, variable or command
  expansion, or any construct that cannot be proven equivalent to a literal
  argv vector
- **THEN** the result is `script` carrying the language identity and the
  original source, and the parser performs no execution

#### Scenario: Unterminated input classifies as incomplete

- **WHEN** the text ends inside an open quote or otherwise needs more input
- **THEN** the result is `incomplete` with positioned diagnostics

### Requirement: Bash thin-wrapper safe downgrade

The `@unipty/shell-parser` package SHALL wrap `unbash` and SHALL check the
root script and every nested script it visits for diagnostics before claiming
`argv`. It SHALL claim `argv` only when the input is one simple command whose
name and arguments are literal (quoted or unquoted) with no expansion,
substitution, variable, tilde, brace, or glob metacharacter semantics, no
locale-string expansion (`$"..."`), no ANSI-C string containing a NUL
character (which cannot become an argv element), no redirection, no
environment-assignment prefix, no control or compound statement, and no
background or sequential operators. Everything else that parses cleanly SHALL
become `script`; recognized-but-unprovable constructs SHALL become
`unsupported`; parse errors SHALL become `invalid`, except end-of-input
errors which SHALL become `incomplete`.

#### Scenario: Quoting and empty arguments survive to argv

- **WHEN** the input is a single command containing quoted words, preserved
  spaces, or an empty quoted argument
- **THEN** the result `argv` contains the post-quote-processing values

#### Scenario: Any non-literal semantics never claim argv

- **WHEN** any word contains a variable, substitution, glob, tilde, or brace
  expansion, or the command carries a redirect, assignment prefix, pipeline,
  list, compound, or background operator
- **THEN** the result is `script` and carries the original source unchanged

### Requirement: PowerShell official-parser adapter

The `@unipty/powershell-parser` package SHALL treat the official PowerShell
`Parser.ParseInput` API as its only semantic authority, invoked through an
explicitly selected host executable (`pwsh` by default). User text SHALL
travel to the host over stdin as base64-encoded UTF-8 (transport-safe under
any console code page), never on the command line, and the adapter SHALL
never execute the user text. When the host is missing, exits non-zero
without a valid adapter result, or returns an unknown result kind, the
package SHALL report a typed `capability-unavailable` or `host-failure`
error and SHALL NOT fall back to Bash-like or POSIX parsing and SHALL NOT
silently degrade an unusable response to `script`. PowerShell fixtures SHALL
be judged only by the official parser.

#### Scenario: Missing host is explicit

- **WHEN** no PowerShell host is available and a caller requests a parse
- **THEN** the call fails with a typed capability error and never produces a
  Bash-interpreted result

#### Scenario: Official diagnostics map to the shared contract

- **WHEN** the official parser reports errors flagged as incomplete input
- **THEN** the result is `incomplete` with serialized message, error id, and
  extent offsets; recoverable-but-nonliteral commands become `script`

### Requirement: Ecosystem independence

Parser packages SHALL be standalone: they SHALL NOT depend on `unipty`, on
any `@unipty/backend-*` package, on the acquisition/helper layers, or on each
other at runtime, and no runtime package SHALL depend on them. Their
verification SHALL be ordinary per-package unit corpora, not the PTY
conformance/evidence matrix. Their publication shares the one release chain
under a deliberate atomicity decision: the new names publish **before** the
established packages so a missing Trusted Publisher fails before any
already-published package creates an irreversible partial release; the
residual partiality between the two parser names themselves is closed by the
Owner-side gate that configures both Trusted Publishers before the first
tag carrying them.

#### Scenario: Ownership rules hold

- **WHEN** the workspace architecture check runs with both parser packages
  present
- **THEN** the standalone ownership rules pass without exceptions for the
  parser packages
