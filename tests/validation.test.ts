import { describe, expect, it } from 'vitest';
import { exampleImport, NOTE_TYPES, validateImport, ValidationError } from '../shared/notes';

describe('JSON import contract', () => {
  it('accepts the three required note types and preserves zero accent', () => {
    expect(validateImport(exampleImport)).toEqual(exampleImport.notes);
    expect(validateImport(exampleImport)[0].accent).toBe(0);
  });
  it('normalizes surrounding whitespace and decomposed Japanese text', () => {
    const note = { ...exampleImport.notes[0], term: '  多彩  ', reading: 'か\u3099' };
    expect(validateImport({ notes: [note] })[0]).toMatchObject({ term: '多彩', reading: 'が' });
  });
  it.each([undefined, null, '', ' \n\t '])(
    'allows every optional field to be empty (%j) for all types',
    (empty) => {
      const notes = NOTE_TYPES.map((type) => ({
        type,
        term: '記録',
        reading: empty,
        accent: empty,
        partOfSpeech: empty,
        meaning: empty,
        example: empty,
        exampleTranslation: empty,
      }));
      expect(validateImport({ notes })).toEqual(NOTE_TYPES.map((type) => ({ type, term: '記録' })));
    },
  );
  it('accepts type and term alone, retains non-word metadata, and distinguishes unknown from zero accent', () => {
    expect(
      validateImport({ notes: NOTE_TYPES.map((type) => ({ type, term: '記録' })) }),
    ).toHaveLength(3);
    const notes = validateImport({
      notes: [
        { type: 'word', term: 'ある', accent: null },
        { type: 'word', term: 'ある', accent: 0 },
        { type: 'onomatopoeia', term: 'じっくり', accent: 3, partOfSpeech: '副' },
        { type: 'grammar', term: 'にとって', exampleTranslation: '对我来说' },
      ],
    });
    expect(notes[0]).not.toHaveProperty('accent');
    expect(notes[1].accent).toBe(0);
    expect(notes[2]).toMatchObject({ accent: 3, partOfSpeech: '副' });
    expect(notes[3].exampleTranslation).toBe('对我来说');
  });
  it.each([
    null,
    [],
    {},
    { notes: [] },
    { notes: [null] },
    { notes: [{ type: 'other' }] },
    { notes: [{ ...exampleImport.notes[0], accent: '0' }] },
    { notes: [{ ...exampleImport.notes[0], accent: -1 }] },
    { notes: [{ ...exampleImport.notes[0], reading: 'タサイ' }] },
    { notes: [{ type: 'word' }] },
    { notes: [{ type: 'grammar', term: null }] },
    { notes: [{ type: 'onomatopoeia', term: '   ' }] },
    { notes: [{ ...exampleImport.notes[0], meaning: 42 }] },
    { notes: [{ ...exampleImport.notes[0], reading: false }] },
    { notes: [{ ...exampleImport.notes[0], accent: false }] },
    { notes: [{ ...exampleImport.notes[0], unknownField: true }] },
    { notes: [{ ...exampleImport.notes[1], example: [] }] },
    { notes: [{ ...exampleImport.notes[2], meaning: '长'.repeat(2001) }] },
    { notes: Array.from({ length: 501 }, () => exampleImport.notes[0]) },
  ])('rejects malformed fields or missing identity: %j', (value) => {
    expect(() => validateImport(value)).toThrow(ValidationError);
  });
  it('reports which row failed and allows optional example translations', () => {
    expect(() =>
      validateImport({
        notes: [exampleImport.notes[0], { ...exampleImport.notes[2], term: '' }],
      }),
    ).toThrow('第 2 条');
    expect(
      validateImport({
        notes: [{ ...exampleImport.notes[1], exampleTranslation: '慌张地找资料，真不好意思。' }],
      })[0].exampleTranslation,
    ).toBeTruthy();
  });
});
