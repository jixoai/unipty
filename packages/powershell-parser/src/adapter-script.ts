/**
> Orthogonal intents (2026-08-20): the static PowerShell adapter script that
 * runs Parser.ParseInput inside the host and prints one JSON result.
 *
 * Original request (2026-08-18): the official Parser.ParseInput API is the
 * only semantic authority; this script parses, classifies, and never
 * executes the caller's text.
 */

/**
 * The script is static package code delivered via `-EncodedCommand`; user
 * text travels separately as base64-encoded UTF-8 on stdin, so no caller
 * text is ever interpolated into a command line and no Windows stdin
 * code-page ambiguity applies (the base64 payload is pure ASCII).
 *
 * Classification rules mirror the package design: errors map by their
 * IncompleteInput flag; otherwise `argv` requires exactly one statement that
 * is a one-element pipeline whose CommandAst has no redirections and only
 * literal command elements (StringConstantExpressionAst values, and
 * CommandParameterAst / non-string ConstantExpressionAst extent text);
 * everything else keeps shell semantics as `script`.
 */
export const ADAPTER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
try {
  $b64 = [System.Console]::In.ReadToEnd().Trim()
  $raw = [System.Text.Encoding]::UTF8.GetString(
    [System.Convert]::FromBase64String($b64))
  $tokens = $null
  $parseErrors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseInput(
    $raw, [ref]$tokens, [ref]$parseErrors)
  $out = [ordered]@{ kind = 'script'; argv = $null; diagnostics = @() }
  if ($parseErrors -and @($parseErrors).Count -gt 0) {
    $anyInvalid = $false
    $diagnostics = @()
    foreach ($e in @($parseErrors)) {
      if (-not $e.IncompleteInput) { $anyInvalid = $true }
      $diagnostics += [ordered]@{
        message = $e.Message
        errorId = $e.ErrorId
        incomplete = [bool]$e.IncompleteInput
        start = $e.Extent.StartScriptPosition.Offset
        end = $e.Extent.EndScriptPosition.Offset
      }
    }
    $out.kind = [string]$(if ($anyInvalid) { 'invalid' } else { 'incomplete' })
    $out.diagnostics = $diagnostics
  } elseif ([string]::IsNullOrWhiteSpace($raw)) {
    $out.kind = 'invalid'
    $out.diagnostics = @([ordered]@{
      message = 'empty input'; errorId = 'EmptyInput'; incomplete = $false; start = 0; end = 0 })
  } else {
    $statements = @($ast.EndBlock.Statements)
    if ($statements.Count -eq 1) {
      $pipeline = $statements[0] -as [System.Management.Automation.Language.PipelineAst]
      if ($pipeline -and @($pipeline.PipelineElements).Count -eq 1) {
        $command = $pipeline.PipelineElements[0] -as [System.Management.Automation.Language.CommandAst]
        if ($command -and @($command.Redirections).Count -eq 0) {
          $ok = $true
          $argv = @()
          foreach ($element in @($command.CommandElements)) {
            if ($element -is [System.Management.Automation.Language.StringConstantExpressionAst]) {
              $argv += [string]$element.Value
            } elseif ($element -is [System.Management.Automation.Language.CommandParameterAst] -or
                $element -is [System.Management.Automation.Language.ConstantExpressionAst]) {
              $argv += [string]$element.Extent.Text
            } else {
              $ok = $false
              break
            }
          }
          if ($ok -and $argv.Count -gt 0) {
            $out.kind = 'argv'
            $out.argv = $argv
          }
        }
      }
    }
  }
  [System.Console]::Out.Write(($out | ConvertTo-Json -Depth 6 -Compress))
} catch {
  [System.Console]::Out.Write((@{ kind = 'adapter-error'; message = [string]$_.Exception.Message } | ConvertTo-Json -Compress))
  exit 1
}
`;
