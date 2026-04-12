import * as path from 'node:path';
import { nestEnvFilePaths } from './load-env-files';

describe('nestEnvFilePaths', () => {
  const cwd = path.join('tmp', 'fake-project');
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('returns only base .env when NODE_ENV is unset', () => {
    delete process.env.NODE_ENV;
    expect(nestEnvFilePaths(cwd)).toEqual([path.join(cwd, '.env')]);
  });

  it('appends .env.<NODE_ENV> when NODE_ENV is set', () => {
    process.env.NODE_ENV = 'staging';
    expect(nestEnvFilePaths(cwd)).toEqual([path.join(cwd, '.env'), path.join(cwd, '.env.staging')]);
  });
});
