import Crypto from 'node:crypto';
import AbstractUser from '../../AbstractUser';
import TaskStorage from './TaskStorage';

export default class CompletableTask<T> {
  public readonly taskId = Crypto.randomUUID();
  public readonly owningUser?: AbstractUser['id'];
  public readonly creationTime = Date.now();

  private readonly task: Promise<T>;
  private resolve?: (value: (T | PromiseLike<T>)) => void;
  private reject?: (err: Error) => void;
  private finishedExecution?: number;

  private constructor(owningUser?: AbstractUser['id']) {
    this.owningUser = owningUser;

    this.task = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    this.task
      .catch(console.error)
      .finally(() => this.finishedExecution = Date.now());
  }

  hasFinishedExecution(): boolean {
    return this.finishedExecution !== undefined;
  }

  getFinishedTime(): number | undefined {
    return this.finishedExecution;
  }

  complete(data: T): void {
    this.resolve!(data);
  }

  fail(err: Error): void {
    this.reject!(err);
  }

  waitForCompletion(): Promise<T> {
    return this.task;
  }

  static create<T>(runnable: (taskId: string) => Promise<T>, owningUser?: AbstractUser['id']): CompletableTask<T> {
    const task = new CompletableTask<T>(owningUser);
    TaskStorage.addTask(task);

    runnable(task.taskId)
      .then(task.complete.bind(task))
      .catch(task.fail.bind(task));

    return task;
  }
}
