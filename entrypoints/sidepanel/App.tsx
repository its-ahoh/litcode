import { useEffect, useState } from 'react';
import { useProblem } from './useProblem';
import VideosTab from './tabs/VideosTab';
import ReviewTab from './tabs/ReviewTab';
import SolutionsTab from './tabs/SolutionsTab';
import AITab from './tabs/AITab';
import './style.css';

const TABS = [
  { id: 'videos', label: '📺 Videos' },
  { id: 'review', label: '📕 Review' },
  { id: 'solutions', label: '💾 My Solutions' },
  { id: 'ai', label: '🤖 AI' },
] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('videos');
  const problem = useProblem();

  // Editor context-menu AI action → auto-switch to the AI tab (the action itself is consumed by AITab)
  useEffect(() => {
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes.pendingAiAction?.newValue) setTab('ai');
    };
    chrome.storage.onChanged.addListener(onChange);
    chrome.storage.session.get('pendingAiAction').then((r) => {
      if (r?.pendingAiAction) setTab('ai');
    });
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  return (
    <div className="app">
      <header className="header">
        <span className="problem-title">
          {problem
            ? problem.frontendId
              ? `${problem.frontendId}. ${problem.title}`
              : problem.title
            : 'No problem page open'}
        </span>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main className="content">
        {tab === 'videos' && <VideosTab problem={problem} />}
        {tab === 'review' && <ReviewTab problem={problem} />}
        {tab === 'solutions' && <SolutionsTab problem={problem} />}
        {tab === 'ai' && <AITab problem={problem} />}
      </main>
    </div>
  );
}
