CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('word', 'onomatopoeia', 'grammar')),
  term TEXT NOT NULL,
  reading TEXT NOT NULL DEFAULT '',
  accent INTEGER NOT NULL DEFAULT -1,
  part_of_speech TEXT NOT NULL DEFAULT '',
  meaning TEXT NOT NULL,
  example TEXT NOT NULL DEFAULT '',
  example_translation TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Exact duplicates are skipped; a different meaning/example remains a new note.
CREATE UNIQUE INDEX notes_content_unique ON notes (
  type, term, reading, accent, part_of_speech, meaning, example, example_translation
);
CREATE INDEX notes_type_created ON notes(type, created_at DESC, id DESC);
CREATE INDEX notes_created ON notes(created_at DESC, id DESC);

-- The three examples from the brief, available on the first deployment.
INSERT INTO notes (id, type, term, reading, accent, part_of_speech, meaning)
VALUES ('example-word', 'word', '多彩', 'たさい', 0, '形动', '丰富多彩');
INSERT INTO notes (id, type, term, meaning, example)
VALUES ('example-onomatopoeia', 'onomatopoeia', 'あたふた', '慌慌张张', 'あたふたと資料を探してしまい恥ずかしかった。');
INSERT INTO notes (id, type, term, meaning, example)
VALUES ('example-grammar', 'grammar', 'だけあって', '不愧是……', '彼は留学経験があるだけあって、英語が上手だ。');
