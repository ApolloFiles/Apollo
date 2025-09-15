export default interface App {
  boot(): Promise<void>;

  shutdown(): Promise<void>;
}
