import * as Fs from 'fs';
import Os from 'os';
import Path from 'path';

describe('#isProduction', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    jest.resetModules();
  });

  afterEach(() => {
    if (originalNodeEnv == null) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  test.each([
    ['production', true],
    ['proDUCTION', true],
    ['development', false],
    ['test', false],
    ['', false],
    [undefined, false]
  ])('process.env.NODE_ENV set to %s', (env, expected) => {
    if (env == null) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = env;
    }

    expect(require('../src/Constants').isProduction()).toBe(expected);
  });
});

describe('path getters', () => {
  const Constants = require('../src/Constants');

  test.each([
    Constants.getWorkingRoot,
    Constants.getAppConfigDir,
    Constants.getAppResourcesDir,
    Constants.getUserStorageRoot,
    Constants.getAppTmpDir,
    Constants.getUserStorageTmpRoot
  ])('Test for %O', (getterFunction: Function) => {
    const path = getterFunction();

    expect(typeof path).toBe('string');
    expect(Path.isAbsolute(path)).toBe(true);
  });
});

describe('#getWorkingRoot and #getAppResourcesDir', () => {
  const Constants = require('../src/Constants');

  test.each([Constants.getWorkingRoot, Constants.getAppResourcesDir])('Path of %O exists', (getter) => {
    const workingRoot = getter();

    expect(Fs.existsSync(workingRoot)).toBe(true);
  });
});

describe('#getFileNameCollator', () => {
  const fileNameCollator = require('../src/Constants').getFileNameCollator();

  test('For simple alphabetic values', () => {
    expect(fileNameCollator.compare('a', 'b')).toBe(-1);
    expect(fileNameCollator.compare('b', 'a')).toBe(1);
    expect(fileNameCollator.compare('a', 'a')).toBe(0);

    expect(fileNameCollator.compare('a', 'A')).toBe(0);
  });

  test('For numeric values', () => {
    expect(fileNameCollator.compare('1', '10')).toBe(-1);
    expect(fileNameCollator.compare('01', '10')).toBe(-1);
    expect(fileNameCollator.compare('01', '0')).toBe(1);
    expect(fileNameCollator.compare('01', '1')).toBe(0);
  });

  test('For different lengthened values', () => {
    expect(fileNameCollator.compare('Test', 'Test File')).toBe(-1);
    expect(fileNameCollator.compare('Test.txt', 'Test')).toBe(1);
  });

  test('For alphabetic values with accents', () => {
    expect(fileNameCollator.compare('??', 'e')).toBe(1);
    expect(fileNameCollator.compare('??', 'o')).toBe(1);
    expect(fileNameCollator.compare('Doener', 'D??ner')).toBe(-1);
  });
});

describe('Correct working dir detected', () => {
  let consoleWarnMock = jest.spyOn(console, 'warn').mockImplementation();

  let originalWorkingDir: string | undefined;

  beforeEach(() => {
    originalWorkingDir = process.env.APOLLO_WORKING_ROOT;
    jest.resetModules();
  });

  afterEach(() => {
    if (originalWorkingDir == null) {
      delete process.env.APOLLO_WORKING_ROOT;
    } else {
      process.env.APOLLO_WORKING_ROOT = originalWorkingDir;
    }
  });

  test('For default test environment', () => {
    const workingRoot = require('../src/Constants').getWorkingRoot();

    expect(consoleWarnMock).toBeCalledTimes(0);
    expect(workingRoot.startsWith(Os.tmpdir())).toBe(true);
    expect(workingRoot.endsWith('/')).toBe(true);
  });

  test.each(['', undefined])('Without path set in environment (%O)', (pathToSet) => {
    if (pathToSet == undefined) {
      delete process.env.APOLLO_WORKING_ROOT;
    } else {
      process.env.APOLLO_WORKING_ROOT = pathToSet;
    }

    const workingRoot = require('../src/Constants').getWorkingRoot();

    expect(consoleWarnMock).toBeCalledTimes(1);
    expect(consoleWarnMock.mock.calls[0][0].indexOf('APOLLO_WORKING_ROOT')).not.toBe(-1);
    expect(consoleWarnMock.mock.calls[0][0].indexOf(Os.homedir())).not.toBe(-1);
    expect(workingRoot.startsWith(Os.homedir())).toBe(true);
    expect(workingRoot.endsWith('/ApolloFiles/')).toBe(true);
  });
});
