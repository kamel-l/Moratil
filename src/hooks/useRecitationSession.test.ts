import { describe, expect, it } from 'vitest';
import { extractWords } from '../utils/arabicUtils';
import { evaluateSpokenText, type RecognitionState } from './useRecitationSession';

const words = extractWords('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ');

const emptyState: RecognitionState = {
  currentWordIdx: 0,
  matchedWords: [],
  failedWords: {},
  activeMistakeAlert: null,
};

describe('evaluateSpokenText', () => {
  it('continues matching after a misrecognized word', () => {
    const firstChunk = evaluateSpokenText(words, emptyState, 'خطأ');
    const result = evaluateSpokenText(words, firstChunk, 'الله الرحمن الرحيم');

    expect(result.completed).toBe(true);
    expect(result.isFlawless).toBe(false);
    expect(result.failedWords[0]).toBe('خطأ');
    expect(result.currentWordIdx).toBe(words.length);
  });

  it('marks a skipped word but continues with following words', () => {
    const result = evaluateSpokenText(words, emptyState, 'بسم الرحمن');

    expect(result.completed).toBe(false);
    expect(result.failedWords[1]).toBe('تم تخطيها');
    expect(result.currentWordIdx).toBe(3);
    expect(result.matchedWords).toEqual([0, 2]);
  });

  it('completes an ayah with an error in its last word', () => {
    const result = evaluateSpokenText(words, emptyState, 'بسم الله الرحمن خطأ');

    expect(result.completed).toBe(true);
    expect(result.isFlawless).toBe(false);
    expect(result.failedWords[3]).toBe('خطأ');
  });

  it('marks a fully matching recitation as flawless', () => {
    const result = evaluateSpokenText(words, emptyState, 'بسم الله الرحمن الرحيم');

    expect(result.completed).toBe(true);
    expect(result.isFlawless).toBe(true);
    expect(result.failedWords).toEqual({});
  });
});
