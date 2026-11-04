import type { Note } from '../../shared/notes';

export default function NoteContent({ note, full = false }: { note: Note; full?: boolean }) {
  const isWord = note.type === 'word';
  const hasAccent = typeof note.accent === 'number' && note.accent >= 0;
  const term = (
    <h3 className={`note-term${isWord ? ' word-term' : ''}`} lang="ja">
      {note.term}
    </h3>
  );
  return (
    <div className={isWord ? 'word-entry' : 'expression-entry'}>
      {isWord || hasAccent ? (
        <div className="word-heading">
          {term}
          {hasAccent && (
            <span
              className="accent"
              aria-label={`声调 ${note.accent}`}
              title={`${note.accent} 调${note.accent === 0 ? ' · 平板型' : ''}`}
            >
              {note.accent}
            </span>
          )}
        </div>
      ) : (
        term
      )}
      {note.reading && (
        <p className="pronunciation" lang="ja">
          {note.reading}
        </p>
      )}
      {note.partOfSpeech && (
        <p className="part-of-speech">
          <span>{note.partOfSpeech}</span>
        </p>
      )}
      {note.meaning && <p className="note-meaning">{note.meaning}</p>}
      {(note.example || (full && note.exampleTranslation)) && (
        <div className="note-example">
          <span className="example-label">{note.example ? '例句' : '例句译文'}</span>
          {note.example && <p lang="ja">{note.example}</p>}
          {full && note.exampleTranslation && (
            <p className="example-translation">{note.exampleTranslation}</p>
          )}
        </div>
      )}
    </div>
  );
}
