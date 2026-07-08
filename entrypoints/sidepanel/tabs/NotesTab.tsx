import { useEffect, useState } from 'react';
import { updateStore } from '@/lib/storage';
import { buildNoteFile, finalizePending, noteFileName, syncNotes, MIN_TURNS } from '@/lib/notes';
import {
  connectVault,
  disconnectVault,
  requestVaultPermission,
  vaultStatus,
  writeNote,
  type VaultStatus,
} from '@/lib/vault';
import type { StudyNotesEntry } from '@/lib/types';
import { useStore } from '../useStore';
import Markdown from '../Markdown';

function download(fileName: string, text: string) {
  const blob = new Blob([text], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function NotesTab() {
  const store = useStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [vault, setVault] = useState<VaultStatus>('disconnected');
  // Guards double-clicks within this sidepanel window; lib/notes' finalize
  // chain additionally serializes per-JS-context.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    vaultStatus().then(setVault);
  }, []);

  if (!store) return null;

  const entries = Object.entries(store.studyNotes).sort(
    ([, a], [, b]) =>
      (b.sessions[b.sessions.length - 1]?.createdAt ?? 0) -
      (a.sessions[a.sessions.length - 1]?.createdAt ?? 0),
  );
  const unsynced = entries.reduce(
    (n, [, e]) => n + e.sessions.filter((s) => !s.synced).length,
    0,
  );
  const waiting = Boolean(
    store.pendingConversation && store.pendingConversation.turns.length >= MIN_TURNS,
  );

  async function onConnect() {
    if (await connectVault()) setVault(await vaultStatus());
  }

  async function onDisconnect() {
    await disconnectVault();
    setVault('disconnected');
  }

  async function onSync() {
    setBusy(true);
    try {
      if ((await vaultStatus()) === 'needs-permission' && !(await requestVaultPermission())) {
        setError('Folder access was not granted — notes remain unsynced.');
        return;
      }
      const n = await syncNotes({ writeNoteFn: writeNote });
      setError(
        n === 0 && unsynced > 0
          ? 'Sync did not write any notes — is the vault folder still available?'
          : '',
      );
      setVault(await vaultStatus());
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateNow() {
    setBusy(true);
    try {
      const result = await finalizePending({ writeNoteFn: writeNote });
      setError(
        result === 'failed'
          ? 'Could not generate notes — check your API key in the AI tab, then try again.'
          : '',
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(slug: string) {
    if (!confirm('Delete the notes for this problem from the extension? (Vault files are not touched.)')) return;
    await updateStore((s) => {
      const next = { ...s.studyNotes };
      delete next[slug];
      return { studyNotes: next };
    });
  }

  function entryFile(slug: string, entry: StudyNotesEntry) {
    return { name: noteFileName({ slug, ...entry }), text: buildNoteFile(slug, entry) };
  }

  return (
    <div className="notes">
      {waiting && (
        <div className="card">
          1 conversation is waiting to be distilled into notes.
          <button className="ghost small" disabled={busy} onClick={onGenerateNow}>
            Generate now
          </button>
        </div>
      )}

      {error && <div className="card error-card">{error}</div>}

      {entries.length === 0 && !waiting && (
        <p className="muted">
          No study notes yet. Chat with the AI tutor about a problem — notes are generated
          automatically when the conversation ends.
        </p>
      )}

      {entries.map(([slug, entry]) => (
        <div className="card" key={slug}>
          <div className="btn-row">
            <button
              className="ghost"
              aria-expanded={expanded === slug}
              onClick={() => setExpanded(expanded === slug ? null : slug)}
            >
              {entry.frontendId ? `${entry.frontendId}. ` : ''}{entry.title}
              <span className="muted"> · {entry.sessions.length} session{entry.sessions.length > 1 ? 's' : ''}
                {entry.sessions.some((s) => !s.synced) ? ' · unsynced' : ''}</span>
            </button>
            <button className="ghost small" onClick={() => { const f = entryFile(slug, entry); download(f.name, f.text); }}>
              Download .md
            </button>
            <button className="ghost small" onClick={() => remove(slug)}>Delete</button>
          </div>
          {expanded === slug && <Markdown text={buildNoteFile(slug, entry)} />}
        </div>
      ))}

      {entries.length > 0 && (
        <button
          className="ghost small"
          onClick={() =>
            download(
              `litcode-notes-${new Date().toISOString().slice(0, 10)}.md`,
              entries.map(([slug, e]) => buildNoteFile(slug, e)).join('\n---\n\n'),
            )
          }
        >
          Download all notes
        </button>
      )}

      <details className="settings">
        <summary>📁 Obsidian vault folder {vault === 'granted' ? '· connected' : ''}</summary>
        <p className="muted">
          Pick a folder inside your vault (e.g. <code>Vault/LeetCode/</code>). New notes are
          written there automatically as <code>&lt;id&gt;-&lt;slug&gt;.md</code>.
          {vault === 'needs-permission' && ' Chrome needs a click to re-grant access after a restart.'}
        </p>
        <div className="btn-row">
          {vault === 'disconnected' && <button className="primary small" onClick={onConnect}>Connect folder</button>}
          {vault === 'needs-permission' && <button className="primary small" disabled={busy} onClick={onSync}>Re-grant access</button>}
          {vault !== 'disconnected' && <button className="ghost small" onClick={onDisconnect}>Disconnect</button>}
          {unsynced > 0 && vault !== 'disconnected' && (
            <button className="ghost small" disabled={busy} onClick={onSync}>
              Sync {unsynced} note{unsynced > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </details>
    </div>
  );
}
