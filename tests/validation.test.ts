import { describe, expect, it } from 'vitest';
import { exampleImport, validateImport, ValidationError } from '../shared/notes';

describe('JSON import contract', () => {
  it('accepts the three required note types and preserves zero accent', () => {
    expect(validateImport(exampleImport)).toEqual(exampleImport.notes);
    expect(validateImport(exampleImport)[0].accent).toBe(0);
  });
  it('normalizes surrounding whitespace and decomposed Japanese text', () => {
    const note = { ...exampleImport.notes[0], term: '  多彩  ', reading: 'か\u3099' };
    expect(validateImport({ notes: [note] })[0]).toMatchObject({ term: '多彩', reading: 'が' });
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
    { notes: [{ ...exampleImport.notes[0], partOfSpeech: '' }] },
    { notes: [{ ...exampleImport.notes[0], unknownField: true }] },
    { notes: [{ ...exampleImport.notes[1], example: undefined }] },
    { notes: [{ ...exampleImport.notes[2], meaning: ' '.repeat(3) }] },
    { notes: Array.from({ length: 501 }, () => exampleImport.notes[0]) },
  ])('rejects malformed or incomplete data: %j', (value) => {
    expect(() => validateImport(value)).toThrow(ValidationError);
  });
  it('reports which row failed and allows optional example translations', () => {
    expect(() =>
      validateImport({
        notes: [exampleImport.notes[0], { ...exampleImport.notes[2], example: '' }],
      }),
    ).toThrow('第 2 条');
    expect(
      validateImport({
        notes: [{ ...exampleImport.notes[1], exampleTranslation: '慌张地找资料，真不好意思。' }],
      })[0].exampleTranslation,
    ).toBeTruthy();
  });
});
