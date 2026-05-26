import { codeToHtml } from "shiki";

export interface CodeBlockProps {
  code: string;
  /** Shiki language identifier. Defaults to "solidity". */
  lang?: string;
  className?: string;
}

/**
 * Server-rendered syntax-highlighted code block using shiki. The HTML is
 * generated at build/SSR time so the client bundle does not pay for the
 * tokeniser. Theme is fixed to match the Sentinel palette.
 */
export async function CodeBlock({ code, lang = "solidity", className }: CodeBlockProps) {
  const html = await codeToHtml(code, {
    lang,
    theme: "github-dark-dimmed",
    transformers: [
      {
        pre(node) {
          node.properties.style =
            "background:#0A0A0A; padding:1rem 1.25rem; border-radius:4px; overflow-x:auto;";
          node.properties.class = "font-mono text-sm leading-relaxed";
        },
      },
    ],
  });

  return (
    <div
      className={["hairline", className ?? ""].filter(Boolean).join(" ")}
      // shiki output is trusted (server-rendered from fixed input).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
