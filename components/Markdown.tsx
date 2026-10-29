import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renderiza markdown dos artefatos da squad. HTML bruto é ignorado (seguro por padrão). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          // comentários HTML (<!-- -->) aparecem como texto em markdown seguro: descartamos
          p: ({ children }) => <p>{children}</p>,
        }}
      >
        {children.replace(/<!--[\s\S]*?-->/g, "")}
      </ReactMarkdown>
    </div>
  );
}
