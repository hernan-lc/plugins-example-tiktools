import { describe, expect, test } from 'bun:test';
import workflow from '../../.github/workflows/release.yml';

type Step = { name?: string; run?: string; uses?: string; with?: Record<string, string> };
const buildSteps = (workflow as unknown as { jobs: { build: { steps: Step[] } } }).jobs.build.steps;

describe('release workflow', () => {
  test('every release CLI invocation interpolates RELEASE_CLI for the active shell', () => {
    const runs = buildSteps.filter((step) => step.run?.includes('RELEASE_CLI'));
    expect(runs.length).toBeGreaterThan(0);
    for (const step of runs) {
      // Bare `$RELEASE_CLI` only expands in bash: Windows `run` steps use
      // PowerShell, where it is an undefined variable and silently becomes "".
      expect(step.run).not.toContain('$RELEASE_CLI');
      expect(step.run).toContain('${{ env.RELEASE_CLI }}');
    }
  });

  test('plugin archives are verified before they are uploaded', () => {
    const verify = buildSteps.findIndex((step) => step.name === 'Verify plugin artifacts');
    const upload = buildSteps.findIndex((step) => step.uses?.startsWith('actions/upload-artifact@'));
    expect(verify).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(verify);
    expect(buildSteps[verify]?.run).toContain('out/*.plugin');
    expect(buildSteps[upload]?.with?.['if-no-files-found']).toBe('error');
  });
});
