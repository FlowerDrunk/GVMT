import type { ReactNode } from "react";
import { diffLineClassName } from "../../lib/utils";

type CodeLanguage =
  | "csharp"
  | "css"
  | "html"
  | "java"
  | "javascript"
  | "json"
  | "markdown"
  | "plain"
  | "python"
  | "rust"
  | "sql"
  | "typescript"
  | "xml"
  | "yaml";

const extensionLanguageMap: Record<string, CodeLanguage> = {
  cs: "csharp",
  css: "css",
  htm: "html",
  html: "html",
  java: "java",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  jsonc: "json",
  md: "markdown",
  py: "python",
  rs: "rust",
  sql: "sql",
  ts: "typescript",
  tsx: "typescript",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

const keywordMap: Partial<Record<CodeLanguage, string[]>> = {
  csharp: [
    "abstract", "async", "await", "base", "bool", "break", "case", "catch", "class", "const", "continue",
    "decimal", "default", "delegate", "do", "double", "else", "enum", "event", "false", "finally", "float",
    "for", "foreach", "if", "in", "int", "interface", "internal", "is", "long", "namespace", "new", "null",
    "object", "override", "private", "protected", "public", "readonly", "record", "return", "sealed",
    "static", "string", "struct", "switch", "this", "throw", "true", "try", "using", "var", "virtual", "void",
    "while",
  ],
  css: [
    "align-items", "animation", "background", "border", "color", "display", "flex", "font", "gap", "grid",
    "height", "justify-content", "margin", "min-height", "padding", "position", "transform", "transition",
    "width",
  ],
  java: [
    "abstract", "boolean", "break", "case", "catch", "class", "const", "continue", "default", "do", "else",
    "enum", "extends", "false", "final", "finally", "for", "if", "implements", "import", "instanceof", "int",
    "interface", "new", "null", "package", "private", "protected", "public", "return", "static", "super",
    "switch", "this", "throw", "true", "try", "void", "while",
  ],
  javascript: [
    "async", "await", "break", "case", "catch", "class", "const", "continue", "default", "do", "else",
    "export", "extends", "false", "finally", "for", "from", "function", "if", "import", "in", "let", "new",
    "null", "of", "return", "static", "switch", "this", "throw", "true", "try", "undefined", "while", "yield",
  ],
  python: [
    "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif", "else",
    "except", "False", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "None",
    "nonlocal", "not", "or", "pass", "raise", "return", "True", "try", "while", "with", "yield",
  ],
  rust: [
    "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else", "enum", "false", "fn",
    "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return", "self",
    "Self", "static", "struct", "super", "trait", "true", "type", "unsafe", "use", "where", "while",
  ],
  sql: [
    "alter", "and", "as", "by", "case", "create", "delete", "distinct", "drop", "else", "end", "from",
    "group", "having", "in", "insert", "into", "is", "join", "left", "like", "limit", "not", "null", "on",
    "or", "order", "right", "select", "set", "table", "then", "update", "values", "when", "where",
  ],
  typescript: [
    "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "default",
    "do", "else", "enum", "export", "extends", "false", "finally", "for", "from", "function", "if",
    "implements", "import", "in", "interface", "let", "namespace", "new", "null", "of", "private",
    "protected", "public", "readonly", "return", "static", "switch", "this", "throw", "true", "try", "type",
    "undefined", "while", "yield",
  ],
};

function detectCodeLanguage(path: string | null | undefined): CodeLanguage {
  if (!path) return "plain";
  const cleanPath = path.toLowerCase().split(/[?#]/)[0];
  const extension = cleanPath.includes(".") ? cleanPath.split(".").pop() ?? "" : "";
  return extensionLanguageMap[extension] ?? "plain";
}

function keywordPattern(language: CodeLanguage) {
  const keywords = keywordMap[language];
  if (!keywords?.length) return "";
  return keywords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

function tokenClass(token: string, language: CodeLanguage) {
  if (/^(\/\/|#|--|<!--|\*\/|\*)/.test(token)) return "syntax-comment";
  if (/^["'`]/.test(token)) return "syntax-string";
  if (/^\d/.test(token)) return "syntax-number";
  if (language === "json" && /^".*"$/.test(token)) return "syntax-property";
  if ((language === "html" || language === "xml") && /^<\/?/.test(token)) return "syntax-tag";
  if (language === "css" && /^--?[\w-]+$/.test(token)) return "syntax-property";
  return "syntax-keyword";
}

function tokenRegex(language: CodeLanguage) {
  const keywordSource = keywordPattern(language);
  const commentSource =
    language === "python" || language === "yaml"
      ? "#.*$"
      : language === "sql"
        ? "--.*$"
        : language === "html" || language === "xml"
          ? "<!--.*?-->"
          : "\\/\\/.*$";
  const stringSource = language === "markdown" ? "`[^`]*`" : "`(?:\\\\.|[^`\\\\])*`|\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'";
  const tagSource = language === "html" || language === "xml" ? "<\\/?[A-Za-z][^>]*?>" : "";
  const jsonPropertySource = language === "json" ? "\"(?:\\\\.|[^\"\\\\])*\"(?=\\s*:)" : "";
  const cssPropertySource = language === "css" ? "--?[A-Za-z][\\w-]*(?=\\s*:)" : "";
  const numberSource = "\\b(?:0x[\\da-fA-F]+|\\d+(?:\\.\\d+)?)\\b";
  const keywordSourcePart = keywordSource ? `\\b(?:${keywordSource})\\b` : "";

  return new RegExp(
    [commentSource, tagSource, jsonPropertySource, cssPropertySource, stringSource, numberSource, keywordSourcePart]
      .filter(Boolean)
      .join("|"),
    "g",
  );
}

function highlightLine(line: string, language: CodeLanguage): ReactNode[] {
  if (language === "plain") return [line || " "];

  const regex = tokenRegex(language);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > cursor) {
      nodes.push(line.slice(cursor, match.index));
    }
    const token = match[0];
    nodes.push(
      <span className={tokenClass(token, language)} key={`${match.index}-${token}`}>
        {token}
      </span>,
    );
    cursor = match.index + token.length;
  }

  if (cursor < line.length) {
    nodes.push(line.slice(cursor));
  }

  return nodes.length > 0 ? nodes : [" "];
}

interface CodeBlockProps {
  content: string;
  path?: string | null;
  className?: string;
}

export function CodeBlock({ content, path, className }: CodeBlockProps) {
  const language = detectCodeLanguage(path);
  const lines = content.split(/\r?\n/);

  return (
    <pre className={`code-block${className ? ` ${className}` : ""}`} data-language={language}>
      <code>
        {lines.map((line, index) => (
          <span className="code-line" key={`${index}-${line.slice(0, 18)}`}>
            <span className="code-gutter" aria-hidden="true">
              {index + 1}
            </span>
            <span className="code-content">{highlightLine(line, language)}</span>
          </span>
        ))}
      </code>
    </pre>
  );
}

export function DiffCodeBlock({ content, path, className }: CodeBlockProps) {
  const language = detectCodeLanguage(path);
  const lines = content.split(/\r?\n/);

  return (
    <pre className={`code-block diff-code-block${className ? ` ${className}` : ""}`} data-language={language}>
      <code>
        {lines.map((line, index) => {
          const lineClassName = diffLineClassName(line);
          const hasPrefix = lineClassName === "added" || lineClassName === "deleted" || lineClassName === "context";
          const prefix = hasPrefix ? line.slice(0, 1) || " " : "";
          const body = hasPrefix ? line.slice(1) : line;

          return (
            <span className={`code-line ${lineClassName}`} key={`${index}-${line.slice(0, 18)}`}>
              <span className="code-gutter" aria-hidden="true">
                {index + 1}
              </span>
              <span className="code-content">
                {hasPrefix ? <span className="diff-prefix">{prefix}</span> : null}
                {lineClassName === "meta" || lineClassName === "hunk" ? body || " " : highlightLine(body, language)}
              </span>
            </span>
          );
        })}
      </code>
    </pre>
  );
}
