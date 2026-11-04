import { ArrowRight } from 'lucide-react';
import { categories, NOTE_TYPES, type NoteType } from '../../shared/notes';

export default function BookCover({
  type,
  count,
  onClick,
  active,
}: {
  type: NoteType;
  count: number;
  onClick: () => void;
  active: boolean;
}) {
  const meta = categories[type];
  return (
    <button
      className={`collection ${type} ${active ? 'selected' : ''}`}
      onClick={onClick}
      aria-label={`查看${meta.label}，${count} 条笔记`}
      aria-pressed={active}
    >
      <div className="book-cover">
        <div className="book-spine" />
        <span className="cover-number">
          VOL. {String(NOTE_TYPES.indexOf(type) + 1).padStart(2, '0')}
        </span>
        <div className="cover-letter" lang="ja">
          {type === 'word' ? '言葉' : type === 'onomatopoeia' ? '音と形' : '文法'}
        </div>
        <span className="cover-english">{meta.english}</span>
        <div className="cover-art" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <span className="cover-footer">
          ことばのコレクション <span>日</span>
        </span>
      </div>
      <div className="collection-caption">
        <span>{meta.label}</span>
        <ArrowRight size={16} />
      </div>
      <span className="collection-count">{count} 条笔记</span>
    </button>
  );
}
