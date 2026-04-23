type MarkdownTextProps = {
  content: string;
  pending?: boolean;
};

export function MarkdownText({ content, pending = false }: MarkdownTextProps) {
  if (!content && pending) {
    return <p className="text-sm leading-5 text-slate-400">Thinking...</p>;
  }

  const blocks = content.trim().split(/\n{2,}/);

  return (
    <div className="space-y-2.5 text-sm leading-5 text-slate-200">
      {blocks.map((block, index) => {
        const lines = block.split("\n").filter(Boolean);
        const title = getSectionTitle(lines[0]);

        if (title && lines.length > 1) {
          return (
            <section key={`${index}-${block.slice(0, 16)}`} className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>
              {renderLines(lines.slice(1), `${index}-${block.slice(0, 16)}`)}
            </section>
          );
        }

        return renderLines(lines, `${index}-${block.slice(0, 16)}`);
      })}
    </div>
  );
}

function renderLines(lines: string[], keyBase: string) {
  const isList = lines.every((line) => /^[-*]\s+/.test(line.trim()));
  const isQuote = lines.every((line) => /^>\s?/.test(line.trim()));

  if (isList) {
    return (
      <ul key={`${keyBase}-list`} className="ml-5 list-disc space-y-1">
        {lines.map((line, index) => (
          <li key={`${keyBase}-li-${index}`}>{renderInlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>
        ))}
      </ul>
    );
  }

  if (isQuote) {
    return (
      <blockquote key={`${keyBase}-quote`} className="border-l-2 border-blue-400/60 pl-3 text-slate-100">
        {lines.map((line, index) => (
          <p key={`${keyBase}-quote-${index}`}>{renderInlineMarkdown(line.replace(/^>\s?/, ""))}</p>
        ))}
      </blockquote>
    );
  }

  return (
    <div key={`${keyBase}-text`} className="space-y-1 whitespace-pre-wrap">
      {lines.map((line, index) => (
        <p key={`${keyBase}-p-${index}`}>{renderInlineMarkdown(line)}</p>
      ))}
    </div>
  );
}

function getSectionTitle(line?: string) {
  const match = line?.trim().match(/^\*\*([^*]+)\*\*$/);
  return match?.[1];
}

function renderInlineMarkdown(text: string) {
  const segments = text.split(/(\*\*[^*]+\*\*)/g);

  return segments.map((segment, index) => {
    if (segment.startsWith("**") && segment.endsWith("**")) {
      return (
        <strong key={`${segment}-${index}`} className="font-semibold text-slate-50">
          {segment.slice(2, -2)}
        </strong>
      );
    }

    return segment;
  });
}
