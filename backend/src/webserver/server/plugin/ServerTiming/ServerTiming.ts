import type { FastifyReply } from 'fastify';

type TimingEntry = {
  name: string,
  description?: string,
  nanos: bigint,
}


export default class ServerTiming {
  private readonly timings: TimingEntry[] = [];
  private currTiming: TimingEntry | null;

  constructor() {
    this.currTiming = { name: 'init', nanos: process.hrtime.bigint() };
  }

  startNext(name: TimingEntry['name'], description?: TimingEntry['description']): void {
    this.stopCurrent();

    this.currTiming = { name, description, nanos: process.hrtime.bigint() };
  }

  stopCurrent(): void {
    if (this.currTiming) {
      const elapsedNanos = process.hrtime.bigint() - this.currTiming.nanos;

      this.timings.push({ name: this.currTiming.name, description: this.currTiming.description, nanos: elapsedNanos });
      this.currTiming = null;
    }
  }

  setHttpHeader(reply: FastifyReply): void {
    if (this.timings.length > 0) {  // If no own timings have been created, we don't have to send the 'init' one
      this.stopCurrent();
      reply.header('Server-Timing', this.toHttpHeader());
    }
  }

  private toHttpHeader(): string {
    let result = '';

    for (const timing of this.timings) {
      if (result.length > 0) {
        result += ', ';
      }

      result += `${timing.name};${timing.description ? `desc="${timing.description.replace(/"/g, '\\"')}";` : ''}dur=${Number(timing.nanos) * 0.000001}`;
    }

    return result;
  }
}
