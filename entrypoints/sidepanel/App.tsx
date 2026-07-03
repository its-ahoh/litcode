import { useState } from 'react';
import { useProblem } from './useProblem';
import VideosTab from './tabs/VideosTab';
import ReviewTab from './tabs/ReviewTab';
import SolutionsTab from './tabs/SolutionsTab';
import InterviewTab from './tabs/InterviewTab';
import './style.css';

const TABS = [
  { id: 'videos', label: '📺 视频' },
  { id: 'review', label: '📕 错题本' },
  { id: 'solutions', label: '💾 题解' },
  { id: 'interview', label: '⏱ 面试' },
] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('videos');
  const problem = useProblem();

  return (
    <div className="app">
      <header className="header">
        <strong>LitCode</strong>
        <span className="problem-title">
          {problem ? `${problem.frontendId}. ${problem.title}` : '未打开题目页'}
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
        {tab === 'review' && <ReviewTab />}
        {tab === 'solutions' && <SolutionsTab problem={problem} />}
        {tab === 'interview' && <InterviewTab problem={problem} />}
      </main>
    </div>
  );
}
