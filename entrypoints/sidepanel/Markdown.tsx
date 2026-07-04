import { marked } from 'marked';
import DOMPurify from 'dompurify';

// LLM 输出按 Markdown 渲染；先 sanitize 再注入，防止模型输出里夹带 HTML
export default function Markdown({ text }: { text: string }) {
  const html = DOMPurify.sanitize(marked.parse(text, { async: false, breaks: true }) as string);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
