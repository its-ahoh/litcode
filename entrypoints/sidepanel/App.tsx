import { useState } from 'react';
import { useProblem } from './useProblem';
import VideosTab from './tabs/VideosTab';
import ReviewTab from './tabs/ReviewTab';
import SolutionsTab from './tabs/SolutionsTab';
import AITab from './tabs/AITab';
import './style.css';

const TABS = [
  { id: 'videos', label: '📺 Videos' },
  { id: 'review', label: '📕 Review' },
  { id: 'solutions', label: '💾 Solutions' },
  { id: 'ai', label: '🤖 AI' },
] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('videos');
  const problem = useProblem();

  return (
    <div className="app">
      <header className="header">
        <strong>LitCode</strong>
        <span className="problem-title">
          {problem ? `${problem.frontendId}. ${problem.title}` : 'No problem page open'}
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
