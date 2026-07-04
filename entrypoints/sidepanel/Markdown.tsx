import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Render LLM output as Markdown; sanitize before injecting, to guard against HTML smuggled in model output
export default function Markdown({ text }: { text: string }) {
  const html = DOMPurify.sanitize(marked.parse(text, { async: false, breaks: true }) as string);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
