import type { Note } from '../../shared/notes';

export default function NoteContent({ note, full = false }: { note: Note; full?: boolean }) {
  const example = note.example && (
    <div className="note-example">
      <span className="example-label">例句</span>
      <p lang="ja">{note.example}</p>
      {full && note.exampleTranslation && (
        <p className="example-translation">{note.exampleTranslation}</p>
      )}
    </div>
  );
  if (note.type === 'word')
    return (
      <div className="word-entry">
        <div className="word-heading">
          <h3 className="note-term word-term" lang="ja">
            {note.term}
          </h3>
          <span
            className="accent"
            aria-label={`声调 ${note.accent}`}
            title={`${note.accent} 调${note.accent === 0 ? ' · 平板型' : ''}`}
          >
            {note.accent}
          </span>
        </div>
        <p className="pronunciation" lang="ja">
          {note.reading}
        </p>
        <p className="part-of-speech">
          <span>{note.partOfSpeech}</span>
        </p>
        <p className="note-meaning">{note.meaning}</p>
        {example}
      </div>
    );
  return (
    <div className="expression-entry">
      <h3 className="note-term" lang="ja">
        {note.term}
      </h3>
      <p className="note-meaning">{note.meaning}</p>
      {example}
    </div>
  );
}
