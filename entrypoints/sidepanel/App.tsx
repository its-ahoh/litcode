import { useEffect, useState } from 'react';
import { useProblem } from './useProblem';
import VideosTab from './tabs/VideosTab';
import ReviewTab from './tabs/ReviewTab';
import SolutionsTab from './tabs/SolutionsTab';
import AITab from './tabs/AITab';
import NotesTab from './tabs/NotesTab';
import { finalizePending } from '@/lib/notes';
import { writeNote } from '@/lib/vault';
import { updateStore } from '@/lib/storage';
import type { ThemePreference } from '@/lib/types';
import { useStore } from './useStore';
import './style.css';

const TABS = [
  { id: 'solutions', label: 'My Codes' },
  { id: 'review', label: 'Review' },
  { id: 'videos', label: 'Videos' },
  { id: 'ai', label: 'AI Chat' },
  { id: 'notes', label: 'Notes' },
] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('solutions');
  const problem = useProblem();
  const store = useStore();
  const theme = store?.settings.theme ?? 'system';

  useEffect(() => {
    const root = document.documentElement;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      root.dataset.theme = theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : theme;
    };
    applyTheme();
    if (theme === 'system') systemTheme.addEventListener('change', applyTheme);
    return () => systemTheme.removeEventListener('change', applyTheme);
  }, [theme]);

  async function setTheme(nextTheme: ThemePreference) {
    await updateStore((s) => ({ settings: { ...s.settings, theme: nextTheme } }));
  }

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

  // A conversation left over from a previous sidepanel session → distill it now
  useEffect(() => {
    finalizePending({ writeNoteFn: writeNote }).catch(() => {});
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
        <label className="theme-control">
          <span>Appearance</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value as ThemePreference)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
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
        {tab === 'notes' && <NotesTab />}
      </main>
    </div>
  );
}
