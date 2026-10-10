import { execFileSync } from 'node:child_process';
import { GO_MODULE_ROOT } from '../lib/constructs/go-lambda.js';

// One cold build here (module download, compile) instead of inside whichever
// stack test synthesizes a GoLambda first; later builds hit Go's build cache.
export default function setup(): void {
  execFileSync('go', ['build', '-trimpath', '-tags', 'lambda.norpc', './...'], {
    cwd: GO_MODULE_ROOT,
    env: { ...process.env, CGO_ENABLED: '0', GOOS: 'linux', GOARCH: 'arm64' },
    stdio: 'inherit',
  });
}
