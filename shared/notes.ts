export const NOTE_TYPES = ['word', 'onomatopoeia', 'grammar'] as const;
export type NoteType = (typeof NOTE_TYPES)[number];
export type Category = NoteType | 'all';
export type NoteInput = {
  type: NoteType;
  term: string;
  meaning: string;
  reading?: string;
  accent?: number;
  partOfSpeech?: string;
  example?: string;
  exampleTranslation?: string;
};
export type Note = NoteInput & { id: string; createdAt: string };
export type Counts = Record<Category, number>;
export type NotesResponse = {
  notes: Note[];
  total: number;
  page: number;
  pageSize: number;
  counts: Counts;
};

export const categories: Record<
  NoteType,
  { label: string; japanese: string; english: string; description: string }
> = {
  word: {
    label: '单词',
    japanese: 'ことば',
    english: 'WORDS',
    description: '从一个词，认识更大的世界。',
  },
  onomatopoeia: {
    label: '拟声拟态词',
    japanese: 'オノマトペ',
    english: 'EXPRESSIONS',
    description: '听见声音，也读懂情绪。',
  },
  grammar: {
    label: '语法',
    japanese: '文法',
    english: 'GRAMMAR',
    description: '把零散的词，连成自己的表达。',
  },
};
export const exampleImport: { notes: NoteInput[] } = {
  notes: [
    {
      type: 'word',
      term: '多彩',
      reading: 'たさい',
      accent: 0,
      partOfSpeech: '形动',
      meaning: '丰富多彩',
    },
    {
      type: 'onomatopoeia',
      term: 'あたふた',
      meaning: '慌慌张张',
      example: 'あたふたと資料を探してしまい恥ずかしかった。',
    },
    {
      type: 'grammar',
      term: 'だけあって',
      meaning: '不愧是……',
      example: '彼は留学経験があるだけあって、英語が上手だ。',
    },
  ],
};
export class ValidationError extends Error {
  constructor(public issues: string[]) {
    super(issues.join('\n'));
    this.name = 'ValidationError';
  }
}
const commonFields = ['type', 'term', 'meaning', 'example', 'exampleTranslation'];

/** Shared by browser and Worker. Invalid batches never reach the database. */
export function validateImport(input: unknown): NoteInput[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError(['根对象必须是 { "notes": [...] }。']);
  }
  const root = input as Record<string, unknown>;
  if (Object.keys(root).some((key) => key !== 'notes')) {
    throw new ValidationError(['根对象只支持 notes 字段，请检查拼写。']);
  }
  if (!Array.isArray(root.notes) || root.notes.length === 0 || root.notes.length > 500) {
    throw new ValidationError(['notes 必须是包含 1～500 条笔记的数组。']);
  }
  const issues: string[] = [];
  const notes: NoteInput[] = [];
  root.notes.forEach((value: unknown, index: number) => {
    const prefix = `第 ${index + 1} 条`;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      issues.push(`${prefix}：必须是对象。`);
      return;
    }
    const row = value as Record<string, unknown>;
    if (!NOTE_TYPES.includes(row.type as NoteType)) {
      issues.push(`${prefix}：type 必须是 word、onomatopoeia 或 grammar。`);
      return;
    }
    const type = row.type as NoteType;
    const allowed =
      type === 'word' ? [...commonFields, 'reading', 'accent', 'partOfSpeech'] : commonFields;
    for (const key of Object.keys(row)) {
      if (!allowed.includes(key)) issues.push(`${prefix}：不支持字段 ${key}，请检查类型或拼写。`);
    }
    function stringField(key: string, required: boolean, max: number): string | undefined {
      const raw = row[key];
      if (raw === undefined && !required) return undefined;
      if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > max) {
        issues.push(`${prefix}：${key} 必须是 1～${max} 字的字符串。`);
        return undefined;
      }
      return raw.trim().normalize('NFC');
    }
    const term = stringField('term', true, 200);
    const meaning = stringField('meaning', true, 2000);
    const example = stringField('example', type !== 'word', 2000);
    const exampleTranslation = stringField('exampleTranslation', false, 2000);
    const note: NoteInput = { type, term: term ?? '', meaning: meaning ?? '' };
    if (example) note.example = example;
    if (exampleTranslation) note.exampleTranslation = exampleTranslation;
    if (type === 'word') {
      note.reading = stringField('reading', true, 200);
      note.partOfSpeech = stringField('partOfSpeech', true, 100);
      if (
        typeof row.accent !== 'number' ||
        !Number.isInteger(row.accent) ||
        row.accent < 0 ||
        row.accent > 99
      ) {
        issues.push(`${prefix}：accent 必须是 0～99 的整数，0 表示平板型。`);
      } else note.accent = row.accent;
      if (note.reading && !/^[\u3041-\u3096\u3099\u309aー・\s]+$/u.test(note.reading)) {
        issues.push(`${prefix}：reading 请使用平假名，可包含长音符号和间隔号。`);
      }
    }
    notes.push(note);
  });
  if (issues.length) throw new ValidationError(issues.slice(0, 30));
  return notes;
}
