import { describe, it, expect } from 'vitest';
import { stripLeadingBismillah } from './quranData';

describe('stripLeadingBismillah', () => {
  it('supprime la Basmala uthmani en tête et conserve le reste (ex. sourate 2)', () => {
    expect(stripLeadingBismillah('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ الٓمٓ')).toBe('الٓمٓ');
  });

  it('conserve le reste verbatim (ex. sourate 55)', () => {
    expect(stripLeadingBismillah('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ٱلرَّحْمَٰنُ')).toBe(
      'ٱلرَّحْمَٰنُ',
    );
  });

  it('laisse intacte une ayah sans Basmala (ex. sourate 9)', () => {
    const ayah =
      'بَرَٓاءَةٌۭ مِّنَ ٱللَّهِ وَرَسُولِهِۦٓ إِلَى ٱلَّذِينَ عَٰهَدتُّم مِّنَ ٱلْمُشْرِكِينَ';
    expect(stripLeadingBismillah(ayah)).toBe(ayah);
  });

  it('ne touche pas une Basmala située au milieu du verset (ex. 27:30)', () => {
    const ayah = 'إِنَّهُ مِن سُلَيْمَٰنَ وَإِنَّهُ بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
    expect(stripLeadingBismillah(ayah)).toBe(ayah);
  });

  it('préserve un texte constitué uniquement de la Basmala (sourate 1)', () => {
    const bismillah = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
    expect(stripLeadingBismillah(bismillah)).toBe(bismillah);
  });

  it('gère la variante standard (non uthmani)', () => {
    expect(stripLeadingBismillah('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ الم')).toBe('الم');
  });
});
