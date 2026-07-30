import * as path from 'node:path';
import { envFileSuffixForNodeEnv, nestEnvFilePaths } from './load-env-files';

describe('load-env-files', () => {
  const cwd = path.join('tmp', 'fake-project');
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  describe('envFileSuffixForNodeEnv', () => {
    it('returns the raw nodeEnv when no override is defined', () => {
      expect(envFileSuffixForNodeEnv('development')).toBe('development');
      expect(envFileSuffixForNodeEnv('staging')).toBe('staging');
    });

    it('maps NODE_ENV=production to the .env.prod suffix', () => {
      expect(envFileSuffixForNodeEnv('production')).toBe('prod');
    });
  });

  describe('nestEnvFilePaths', () => {
    it('uses .env.development when NODE_ENV is unset', () => {
      delete process.env.NODE_ENV;
      expect(nestEnvFilePaths(cwd)).toEqual([path.join(cwd, '.env.development')]);
    });

    it('uses .env.<NODE_ENV> when NODE_ENV is set', () => {
      process.env.NODE_ENV = 'staging';
      expect(nestEnvFilePaths(cwd)).toEqual([path.join(cwd, '.env.staging')]);
    });

    it('uses .env.prod when NODE_ENV=production (with no legacy fallback available)', () => {
      process.env.NODE_ENV = 'production';
      // cwd points to a directory that does not exist; both .env.prod and
      // .env.production are absent, so we still expect the canonical path.
      expect(nestEnvFilePaths(cwd)).toEqual([path.join(cwd, '.env.prod')]);
    });
  });
});
