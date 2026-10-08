/** 받침에 따라 조사 고르기: josa("아름", "이", "가") → "아름이" */
export function josa(word: string, withBatchim: string, without: string): string {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return word + without;
  return word + ((code - 0xac00) % 28 ? withBatchim : without);
}
