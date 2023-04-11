export function formatPlaybackTime(time: number): string {
  if (Number.isNaN(time)) {
    return '00:00';
  }

  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time - minutes * 60);
  return [
    padWithZeroes(minutes.toString(), 2),
    padWithZeroes(seconds.toString(), 2)
  ].join(':');
}

function padWithZeroes(string: string, length: number): string {
  let str = string;
  while (str.length < length) {
    str = `0${str}`;
  }
  return str;
}
