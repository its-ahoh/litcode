import { useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Render LLM output as markdown; sanitize before injecting so any HTML in the
// model output can't be injected. After render, add a per-code-block copy button.
export default function Markdown({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = DOMPurify.sanitize(marked.parse(text, { async: false, breaks: true }) as string);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll('pre').forEach((pre) => {
      const code = pre.textContent ?? ''; // capture before appending the button
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(code).then(() => {
          btn.textContent = 'Copied';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
        }).catch(() => {});
      });
      pre.appendChild(btn);
    });
  }, [html]);

  return <div className="md" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}
