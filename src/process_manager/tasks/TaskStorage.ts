import CompletableTask from './CompletableTask';

export type TaskProgressInfo = {
  progress?: number;
  text?: string;
};

setInterval(() => {
  const totalTaskCount = TaskStorage.getTotalTaskCount();
  TaskStorage.clearStaleTasks();
  const newTotalTaskCount = TaskStorage.getTotalTaskCount();

  if (newTotalTaskCount !== totalTaskCount) {
    console.log(`Cleared ${totalTaskCount - newTotalTaskCount} stale CompletableTask from TaskStorage.`);
  }
}, 1000 * 60 * 60 /* 1 hour */);

export default class TaskStorage {
  private static readonly tasks: Map<string, CompletableTask<any>> = new Map();
  private static readonly additionalTaskProgressInfo: Map<string, TaskProgressInfo> = new Map();

  static getTotalTaskCount(): number {
    return this.tasks.size;
  }

  static addTask<T>(task: CompletableTask<T>): void {
    this.tasks.set(task.taskId, task);
  }

  static getTask<T>(taskId: string): CompletableTask<T> | null {
    return this.tasks.get(taskId) ?? null;
  }

  static getTaskProgressInfo(taskId: string): TaskProgressInfo | null {
    return this.additionalTaskProgressInfo.get(taskId) ?? null;
  }

  static setAdditionalTaskProgressInfo(taskId: string, info: TaskProgressInfo): void {
    if (this.tasks.has(taskId)) {
      this.additionalTaskProgressInfo.set(taskId, info);
    }
  }

  static clearStaleTasks(): void {
    for (const [taskId, task] of this.tasks.entries()) {
      if (!task.hasFinishedExecution()) {
        continue;
      }

      const timeSinceFinished = Date.now() - task.getFinishedTime()!;
      if (timeSinceFinished > 1000 * 60 * 60 * 4 /* 4 hours */) {
        this.tasks.delete(taskId);
        this.additionalTaskProgressInfo.delete(taskId);
      }
    }
  }
}
