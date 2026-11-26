import { describe, expect, it } from 'vitest';
import {
  getAyahAudioUrl,
  getRecitersByRiwaya,
  HAFS_RECITERS,
  POPULAR_RECITERS,
} from './audioReciters';

describe('Minshawi audio source', () => {
  const minshawy = POPULAR_RECITERS.find((r) => r.id === 'minshawy_teacher');

  it('uses the Murattal collection so only the sheikh is heard', () => {
    expect(minshawy).toBeDefined();
    expect(minshawy?.folder).toBe('Minshawy_Murattal_128kbps');
    expect(minshawy?.folder).not.toContain('Teacher');
  });

  it('is no longer marked as a teaching (child echo) recitation', () => {
    expect(minshawy?.hasTeacherStyle).toBeFalsy();
    expect(minshawy?.description).toContain('صوت الشيخ وحده');
  });

  it('builds the reciter audio URL from the Murattal folder', () => {
    expect(getAyahAudioUrl('minshawy_teacher', 2, 255)).toBe(
      'https://everyayah.com/data/Minshawy_Murattal_128kbps/002255.mp3',
    );
  });

  it('keeps the legacy id so saved preferences still resolve', () => {
    expect(getRecitersByRiwaya('hafs').some((r) => r.id === 'minshawy_teacher')).toBe(true);
  });

  it('does not affect other teacher-style reciters', () => {
    const husary = HAFS_RECITERS.find((r) => r.id === 'husary_teacher');
    expect(husary?.hasTeacherStyle).toBe(true);
    expect(husary?.folder).toBe('Husary_Muallim_128kbps');
  });
});
