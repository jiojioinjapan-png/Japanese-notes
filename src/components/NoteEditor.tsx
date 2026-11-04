import { useState, type FormEvent } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import {
  categories,
  NOTE_TYPES,
  validateImport,
  ValidationError,
  type Note,
  type NoteType,
  type NoteUpdateResponse,
} from '../../shared/notes';
import { responseBody } from '../api';
import Modal from './Modal';
import type { ReaderSource } from './Reader';

function fields(note: Note) {
  return {
    type: note.type,
    term: note.term,
    reading: note.reading ?? '',
    accent: note.accent === undefined ? '' : String(note.accent),
    partOfSpeech: note.partOfSpeech ?? '',
    meaning: note.meaning ?? '',
    example: note.example ?? '',
    exampleTranslation: note.exampleTranslation ?? '',
  };
}
export default function NoteEditor({
  note,
  source,
  close,
  onSaved,
  onBusy,
}: {
  note: Note;
  source: ReaderSource;
  close: () => void;
  onSaved: (result: NoteUpdateResponse) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => fields(note));
  const [revision, setRevision] = useState(note.revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [latest, setLatest] = useState<Note | null>(null);
  const change = (key: keyof typeof draft, value: string) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setError('');
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      const [validated] = validateImport({
        notes: [{ ...draft, accent: draft.accent.trim() ? Number(draft.accent) : null }],
      });
      const params = new URLSearchParams({
        category: source.category,
        q: source.query,
        sort: source.sort,
      });
      const response = await fetch(`/api/notes/${encodeURIComponent(note.id)}?${params}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: validated, revision }),
      });
      if (response.status === 409) {
        const body = (await response.json()) as { error: string; code?: string; note?: Note };
        if (body.code === 'NOTE_CHANGED' && body.note) setLatest(body.note);
        throw new Error(body.error);
      }
      onSaved(await responseBody<NoteUpdateResponse>(response));
    } catch (cause) {
      setError(
        cause instanceof ValidationError
          ? cause.issues[0].replace(/^第 1 条：/, '')
          : cause instanceof Error
            ? cause.message
            : '保存失败，请稍后重试。',
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <Modal
      title="编辑词条"
      className="note-editor"
      close={() => {
        if (!busy) close();
      }}
    >
      <header className="editor-header">
        <button className="icon-button" aria-label="取消编辑" disabled={busy} onClick={close}>
          <X size={22} />
        </button>
        <h2 tabIndex={-1} data-dialog-focus>
          编辑词条
        </h2>
        <button
          className="text-button editor-save"
          type="submit"
          form="note-edit-form"
          disabled={busy}
        >
          {busy ? <LoaderCircle size={18} className="spin" /> : <Check size={18} />}{' '}
          {busy ? '保存中' : '保存'}
        </button>
      </header>
      <form id="note-edit-form" className="editor-form" onSubmit={save}>
        <p className="editor-hint">分类和词条必填，其他内容可以留空。</p>
        <fieldset disabled={busy}>
          <label>
            分类
            <select
              aria-label="分类"
              value={draft.type}
              onChange={(e) => change('type', e.target.value as NoteType)}
            >
              {NOTE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {categories[type].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            词条
            <input
              aria-label="词条"
              value={draft.term}
              required
              maxLength={200}
              lang="ja"
              onChange={(e) => change('term', e.target.value)}
            />
          </label>
          <label>
            平假名读音
            <input
              aria-label="平假名读音"
              value={draft.reading}
              maxLength={200}
              lang="ja"
              onChange={(e) => change('reading', e.target.value)}
            />
          </label>
          <div className="editor-pair">
            <label>
              声调
              <input
                aria-label="声调"
                type="number"
                inputMode="numeric"
                min="0"
                max="99"
                step="1"
                value={draft.accent}
                placeholder="未知可留空"
                onChange={(e) => change('accent', e.target.value)}
              />
            </label>
            <label>
              词性
              <input
                aria-label="词性"
                value={draft.partOfSpeech}
                maxLength={100}
                onChange={(e) => change('partOfSpeech', e.target.value)}
              />
            </label>
          </div>
          <label>
            中文释义
            <textarea
              aria-label="中文释义"
              value={draft.meaning}
              maxLength={2000}
              rows={3}
              onChange={(e) => change('meaning', e.target.value)}
            />
          </label>
          <label>
            日语例句
            <textarea
              aria-label="日语例句"
              value={draft.example}
              maxLength={2000}
              rows={4}
              lang="ja"
              onChange={(e) => change('example', e.target.value)}
            />
          </label>
          <label>
            例句中文翻译
            <textarea
              aria-label="例句中文翻译"
              value={draft.exampleTranslation}
              maxLength={2000}
              rows={3}
              onChange={(e) => change('exampleTranslation', e.target.value)}
            />
          </label>
        </fieldset>
      </form>
      {error && (
        <div className="editor-error" role="alert">
          <p>{error}</p>
          {latest && (
            <button
              className="text-button"
              onClick={() => {
                setDraft(fields(latest));
                setRevision(latest.revision);
                setLatest(null);
                setError('已载入最新内容，请重新修改后保存。');
              }}
            >
              载入最新内容
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
