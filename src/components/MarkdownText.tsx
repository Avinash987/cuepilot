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
        const isList = lines.every((line) => /^[-*]\s+/.test(line.trim()));

        if (isList) {
          return (
            <ul key={`${index}-${block.slice(0, 16)}`} className="ml-5 list-disc space-y-1">
              {lines.map((line) => (
                <li key={line}>{renderInlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`${index}-${block.slice(0, 16)}`} className="whitespace-pre-wrap">
            {renderInlineMarkdown(block)}
          </p>
        );
      })}
    </div>
  );
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
