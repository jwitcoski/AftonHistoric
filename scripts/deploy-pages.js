import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(repositoryRoot, 'dist');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'aftonhistoric-pages-'));

function git(args, cwd = repositoryRoot) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}

try {
  if (!existsSync(join(outputDirectory, 'index.html'))) {
    throw new Error('Build output is missing. Run npm run build first.');
  }

  const remote = git(['remote', 'get-url', 'origin']);
  const hasPagesBranch = Boolean(git(['ls-remote', '--heads', 'origin', 'gh-pages']));
  if (hasPagesBranch) {
    git(['clone', '--branch', 'gh-pages', '--single-branch', '--depth', '1', remote, temporaryDirectory]);
  } else {
    git(['clone', '--depth', '1', remote, temporaryDirectory]);
    git(['checkout', '--orphan', 'gh-pages'], temporaryDirectory);
    for (const entry of readdirSync(temporaryDirectory)) {
      if (entry !== '.git') rmSync(join(temporaryDirectory, entry), { recursive: true, force: true });
    }
  }

  cpSync(outputDirectory, temporaryDirectory, { recursive: true });
  writeFileSync(join(temporaryDirectory, '.nojekyll'), '');
  git(['add', '--all'], temporaryDirectory);
  if (!git(['status', '--porcelain'], temporaryDirectory)) {
    console.log('GitHub Pages is already up to date.');
  } else {
    git(['-c', 'user.name=GitHub Pages Deploy', '-c', 'user.email=pages-deploy@users.noreply.github.com', 'commit', '-m', 'Deploy AftonHistoric site'], temporaryDirectory);
    git(['push', 'origin', 'gh-pages'], temporaryDirectory);
    console.log('Published https://jwitcoski.github.io/AftonHistoric/');
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
