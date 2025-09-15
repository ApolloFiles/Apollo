export function formatPlaybackTime(time: number, forceWithHours: boolean = false): string {
  if (Number.isNaN(time)) {
    return '00:00';
  }

  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time - (hours * 3600)) / 60);
  const seconds = Math.floor(time - (hours * 3600) - (minutes * 60));

  const timeArgs = [
    padWithZeroes(minutes.toString(), 2),
    padWithZeroes(seconds.toString(), 2)
  ];

  if (forceWithHours || hours > 0) {
    timeArgs.unshift(padWithZeroes(hours.toString(), 2));
  }
  return timeArgs.join(':');
}

function padWithZeroes(string: string, length: number): string {
  let str = string;
  while (str.length < length) {
    str = `0${str}`;
  }
  return str;
}
