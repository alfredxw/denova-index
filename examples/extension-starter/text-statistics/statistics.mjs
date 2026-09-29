/** Character counts use graphemes; word/sentence boundaries use Unicode segmentation. */
export function statistics(text) {
  if (typeof text !== 'string' || text.length > 100000) throw new TypeError('Expected at most 100000 UTF-16 code units');
  const segment = granularity => Array.from(new Intl.Segmenter('en', { granularity }).segment(text));
  return {
    characters: segment('grapheme').filter(item => !/^\s+$/u.test(item.segment)).length,
    wordSegments: segment('word').filter(item => item.isWordLike).length,
    paragraphs: text.split(/\r?\n\s*\r?\n/u).filter(item => item.trim()).length,
    sentences: segment('sentence').filter(item => /[\p{L}\p{N}]/u.test(item.segment)).length,
  };
}
