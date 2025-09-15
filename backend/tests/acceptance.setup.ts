import '../../src/container-init.js';
import { container } from 'tsyringe';

beforeEach(() => {
  container.clearInstances();
});
