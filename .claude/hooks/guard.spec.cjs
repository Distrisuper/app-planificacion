// Tests del guard. Se corren con `npm run check:hooks` (node:test, sin Vitest: el guard
// tiene que poder probarse con `node` pelado, igual que se ejecuta).
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { evaluar, esAgente, nombreDeComando } = require('./guard.cjs')

const PROJECT = path.resolve(__dirname, '..', '..')

function ctx(rama = 'feature/algo', agente = true, hooks = '.githooks') {
  return { projectDir: PROJECT, ramaActual: () => rama, hooksPath: () => hooks, esAgente: agente }
}

const bash = (command, rama) => evaluar({ tool_name: 'Bash', tool_input: { command }, cwd: PROJECT }, ctx(rama))
const ps = command => evaluar({ tool_name: 'PowerShell', tool_input: { command }, cwd: PROJECT }, ctx())
const tool = (tool_name, tool_input, agente = true) => evaluar({ tool_name, tool_input, cwd: PROJECT }, ctx('feature/algo', agente))
const humano = command => evaluar({ tool_name: 'Bash', tool_input: { command }, cwd: PROJECT }, ctx('master', false))

const deny = r => assert.equal(r && r.permissionDecision, 'deny', JSON.stringify(r))
const pasa = r => assert.equal(r, null, JSON.stringify(r))

describe('detección de modo agente', () => {
  test('PAPERCLIP_RUN_ID activa el modo agente', () => assert.equal(esAgente({ PAPERCLIP_RUN_ID: 'x' }), true))
  test('cualquier PAPERCLIP_* lo activa', () => assert.equal(esAgente({ PAPERCLIP_TASK_ID: 'x' }), true))
  test('sin PAPERCLIP_* no', () => assert.equal(esAgente({ PATH: '/bin', NODE_ENV: 'test' }), false))
})

describe('secretos (.env*)', () => {
  test('bloquea cat .env.test', () => deny(bash('cat .env.test')))
  test('bloquea cat .env', () => deny(bash('cat .env')))
  test('bloquea cat .env.local', () => deny(bash('cat .env.local')))
  test('bloquea glob .env*', () => deny(bash('cat .env*')))
  test('bloquea .env de otro repo', () => deny(bash('cat ../../app-vendedores/.env.production')))
  test('bloquea Get-Content .env.test (PowerShell)', () => deny(ps('Get-Content .\\.env.test')))
  test('bloquea git show HEAD:.env.test', () => deny(bash('git show HEAD:.env.test')))
  test('bloquea cp hacia .env.local', () => deny(bash('cp .env-example .env.local')))
  test('bloquea --env-file', () => deny(bash('node --env-file=.env.test x.js')))
  test('bloquea printenv', () => deny(bash('printenv')))
  test('bloquea env solo', () => deny(bash('env')))
  test('bloquea env | grep', () => deny(bash('env | grep PAPERCLIP')))
  test('bloquea Get-ChildItem env:', () => deny(ps('Get-ChildItem env:')))
  test('bloquea GetEnvironmentVariables', () => deny(ps('[Environment]::GetEnvironmentVariables()')))
  test('bloquea ALLOW_MASTER_PUSH', () => deny(bash('ALLOW_MASTER_PUSH=1 git push origin master')))
  test('permite .env-example', () => pasa(bash('cat .env-example')))
  test('permite env con comando', () => pasa(bash('env NODE_ENV=test npx vitest run')))
  test('permite leer una variable de Paperclip', () => pasa(ps('curl.exe -s $env:PAPERCLIP_API_URL/api/health')))
  test('permite un archivo que solo se parece', () => pasa(bash('cat src/lib/env.ts')))
})

describe('tools de archivo', () => {
  test('bloquea Read de .env.test', () => deny(tool('Read', { file_path: path.join(PROJECT, '.env.test') })))
  test('bloquea Read de .env relativo', () => deny(tool('Read', { file_path: '.env.local' })))
  test('bloquea Edit de .env.test', () => deny(tool('Edit', { file_path: '.env.test' })))
  test('bloquea Write de .env', () => deny(tool('Write', { file_path: '.env' })))
  test('bloquea Grep con path .env.test', () => deny(tool('Grep', { pattern: 'VITE', path: '.env.test' })))
  test('bloquea Grep con glob .env*', () => deny(tool('Grep', { pattern: 'VITE', glob: '.env*' })))
  test('bloquea Grep con glob en llaves', () => deny(tool('Grep', { pattern: 'VITE', glob: '{src/**,.env.test}' })))
  test('permite Read de .env-example', () => pasa(tool('Read', { file_path: '.env-example' })))
  test('permite Grep en src', () => pasa(tool('Grep', { pattern: 'VITE', path: 'src', glob: '*.ts' })))
  test('permite editar código', () => pasa(tool('Edit', { file_path: 'src/App.tsx' })))
  test('bloquea editar el guard', () => deny(tool('Edit', { file_path: '.claude/hooks/guard.cjs' })))
  test('bloquea editar settings.json', () => deny(tool('Write', { file_path: '.claude/settings.json' })))
  test('bloquea editar settings.local.json', () => deny(tool('Edit', { file_path: '.claude/settings.local.json' })))
  test('bloquea editar .githooks', () => deny(tool('MultiEdit', { file_path: '.githooks/pre-push.cjs' })))
  test('bloquea editar .git/hooks', () => deny(tool('Write', { file_path: path.join(PROJECT, '.git', 'hooks', 'pre-push') })))
  test('permite leer el guard', () => pasa(tool('Read', { file_path: '.claude/hooks/guard.cjs' })))
})

describe('deploy', () => {
  test('bloquea vercel', () => deny(bash('vercel')))
  test('bloquea vercel --prod', () => deny(bash('vercel --prod')))
  test('bloquea vercel env pull', () => deny(bash('vercel env pull')))
  test('bloquea vc (alias)', () => deny(bash('vc deploy')))
  test('bloquea npx vercel', () => deny(bash('npx vercel deploy')))
  test('bloquea npx -y vercel@latest', () => deny(bash('npx -y vercel@latest --prod')))
  test('bloquea npx --package=vercel', () => deny(bash('npx --package=vercel vercel deploy')))
  test('bloquea npm exec vercel', () => deny(bash('npm exec vercel -- --prod')))
  test('bloquea pnpm dlx vercel', () => deny(bash('pnpm dlx vercel')))
  test('bloquea vercel.cmd por ruta', () => deny(ps('.\\node_modules\\.bin\\vercel.cmd --prod')))
  test('bloquea vercel en comando compuesto', () => deny(bash('npm run build && vercel --prod')))
  test('bloquea firebase deploy', () => deny(bash('firebase deploy --only hosting')))
  test('bloquea npx firebase-tools deploy', () => deny(bash('npx firebase-tools deploy')))
  test('bloquea firebase hosting:channel:deploy', () => deny(bash('firebase hosting:channel:deploy pr-1')))
  test('permite firebase --version', () => pasa(bash('firebase --version')))
  test('permite leer vercel.json', () => pasa(bash('cat vercel.json')))
})

describe('servidores (solo por runtime service)', () => {
  test('bloquea npm run dev', () => deny(bash('npm run dev')))
  test('bloquea npm run preview', () => deny(bash('npm run preview')))
  test('bloquea npm start', () => deny(bash('npm start')))
  test('bloquea pnpm dev', () => deny(bash('pnpm dev')))
  test('bloquea npm run e2e (webServer = npm run dev)', () => deny(bash('npm run e2e')))
  test('bloquea npm run e2e:ui', () => deny(bash('npm run e2e:ui')))
  test('bloquea npx playwright test', () => deny(bash('npx playwright test')))
  test('bloquea vite pelado', () => deny(bash('vite')))
  test('bloquea npx vite', () => deny(bash('npx vite --port 5174')))
  test('bloquea npx vite preview', () => deny(bash('npx vite preview')))
  test('bloquea vite dev', () => deny(bash('vite dev')))
  test('permite npm run build', () => pasa(bash('npm run build')))
  test('permite npx vite build', () => pasa(bash('npx vite build')))
  test('permite npm test', () => pasa(bash('npm test')))
  test('permite npm run test', () => pasa(bash('npm run test')))
  test('permite npx vitest run', () => pasa(bash('npx vitest run src/lib')))
  test('permite npm run lint', () => pasa(bash('npm run lint')))
  test('permite npx playwright install', () => pasa(bash('npx playwright install chromium')))
})

describe('git push', () => {
  test('permite git push -u origin rama', () => pasa(bash('git push -u origin feature/x')))
  test('permite git push origin rama', () => pasa(bash('git push origin feature/x')))
  test('permite git push parado en una rama', () => pasa(bash('git push')))
  test('permite git push --set-upstream origin HEAD', () => pasa(bash('git push --set-upstream origin HEAD')))
  test('permite push en compuesto', () => pasa(bash('git add -A && git commit -m x && git push -u origin feature/x')))
  test('permite push en PowerShell', () => pasa(ps('git push -u origin feature/x')))
  test('permite rama con master en el nombre', () => pasa(bash('git push -u origin feature/masterclass')))
  test('bloquea push parado en master', () => deny(bash('git push', 'master')))
  test('bloquea push -u origin HEAD parado en master', () => deny(bash('git push -u origin HEAD', 'master')))
  test('bloquea push a master', () => deny(bash('git push origin master')))
  test('bloquea push HEAD:master', () => deny(bash('git push origin HEAD:master')))
  test('bloquea push rama:master', () => deny(bash('git push origin feature/x:master')))
  test('bloquea push refs/heads/master', () => deny(bash('git push origin HEAD:refs/heads/master')))
  test('bloquea push con -C a master', () => deny(bash('git -C ../otro push origin HEAD:master')))
  test('bloquea --force', () => deny(bash('git push --force origin feature/x')))
  test('bloquea -f', () => deny(bash('git push -f origin feature/x')))
  test('bloquea -uf', () => deny(bash('git push -uf origin feature/x')))
  test('bloquea --force-with-lease', () => deny(bash('git push --force-with-lease origin feature/x')))
  test('bloquea --force-if-includes', () => deny(bash('git push --force-if-includes origin feature/x')))
  test('bloquea refspec +rama (force)', () => deny(bash('git push origin +feature/x')))
  test('bloquea git.exe push --force (PowerShell)', () => deny(ps('git.exe push --force origin feature/x')))
  test('bloquea --no-verify', () => deny(bash('git push --no-verify origin feature/x')))
  test('bloquea -c core.hooksPath= push', () => deny(bash('git -c core.hooksPath=/dev/null push origin feature/x')))
  test('bloquea --delete', () => deny(bash('git push origin --delete feature/x')))
  test('bloquea -d', () => deny(bash('git push -d origin feature/x')))
  test('bloquea refspec :rama (borrar)', () => deny(bash('git push origin :feature/x')))
  for (const f of ['--all', '--branches', '--mirror', '--tags', '--prune'])
    test(`bloquea ${f}`, () => deny(bash(`git push ${f} origin`)))
  test('si ramaActual lanza, git push se niega', () =>
    deny(
      evaluar(
        { tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: PROJECT },
        {
          projectDir: PROJECT,
          esAgente: true,
          ramaActual: () => {
            throw new Error('sin git')
          },
        },
      ),
    ))
})

describe('git', () => {
  test('bloquea commit en master', () => deny(bash('git commit -m x', 'master')))
  test('bloquea core.hooksPath', () => deny(bash('git config core.hooksPath /dev/null')))
  test('bloquea git -c core.hooksPath=', () => deny(bash('git -c core.hooksPath= commit -m x')))
  test('bloquea reset --hard', () => deny(bash('git reset --hard HEAD~1')))
  test('bloquea checkout .', () => deny(bash('git checkout -- .')))
  test('bloquea restore .', () => deny(bash('git restore .')))
  test('bloquea clean -f', () => deny(bash('git clean -fd')))
  test('bloquea branch -D master', () => deny(bash('git branch -D master')))
  test('permite leer core.hooksPath', () => pasa(bash('git config --get core.hooksPath')))
  test('permite commit en rama', () => pasa(bash('git commit -m x')))
  test('permite status/diff/log', () => pasa(bash('git status && git diff && git log --oneline')))
  test('si ramaActual lanza, commit se niega', () =>
    deny(
      evaluar(
        { tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: PROJECT },
        {
          projectDir: PROJECT,
          esAgente: true,
          ramaActual: () => {
            throw new Error('sin git')
          },
        },
      ),
    ))
})

describe('gh', () => {
  test('bloquea gh pr merge', () => deny(bash('gh pr merge 12 --squash')))
  test('bloquea gh pr ready', () => deny(bash('gh pr ready 12')))
  test('bloquea gh pr create sin --draft', () => deny(bash('gh pr create --base master --fill')))
  test('bloquea gh pr new sin --draft', () => deny(bash('gh pr new --fill')))
  test('bloquea gh pr create --draft=false', () => deny(bash('gh pr create --draft --draft=false --fill')))
  test('permite gh pr create --draft', () => pasa(bash('gh pr create --draft --base master --title x --body y')))
  test('permite gh pr create -d', () => pasa(bash('gh pr create -d --fill')))
  test('permite gh pr create con --draft al final', () => pasa(bash('gh pr create --base master --fill --draft')))
  test('bloquea gh pr review --approve', () => deny(bash('gh pr review 12 --approve')))
  test('bloquea gh pr review -a', () => deny(bash('gh pr review 12 -a')))
  test('bloquea gh pr review --approve con body', () => deny(bash('gh pr review --approve -b "LGTM"')))
  test('bloquea gh pr review -ab combinado', () => deny(bash('gh pr review 12 -ab "LGTM"')))
  test('bloquea gh pr review --approve=true', () => deny(bash('gh pr review 12 --approve=true')))
  test('bloquea gh pr review --approve en comando compuesto', () => deny(bash('gh pr checks 12 && gh pr review 12 --approve')))
  test('permite gh pr review --comment', () => pasa(bash('gh pr review 12 --comment -b "falta el caso vacío"')))
  test('permite gh pr review --request-changes', () => pasa(bash('gh pr review 12 --request-changes -b "ver tests"')))
  test('bloquea gh api reviews con event=APPROVE (POST implícito)', () => deny(bash('gh api repos/o/r/pulls/12/reviews -f event=APPROVE')))
  test('bloquea gh api -X POST reviews con event=APPROVE', () => deny(bash('gh api -X POST repos/o/r/pulls/12/reviews -f event=APPROVE')))
  test('bloquea gh api --method=POST reviews/<id>/events APPROVE', () => deny(bash('gh api --method=POST repos/o/r/pulls/12/reviews/5/events -F event=APPROVE')))
  test('bloquea gh api reviews con --input', () => deny(bash('gh api repos/o/r/pulls/12/reviews --input review.json')))
  test('permite gh api GET de reviews', () => pasa(bash('gh api repos/o/r/pulls/12/reviews')))
  test('bloquea gh workflow run', () => deny(bash('gh workflow run ci.yml')))
  test('bloquea gh api -X POST', () => deny(bash('gh api -X POST repos/o/r/merges')))
  test('bloquea gh api con -f', () => deny(bash('gh api repos/o/r/merges -f base=master')))
  test('permite gh pr view', () => pasa(bash('gh pr view 12')))
  test('permite gh api GET', () => pasa(bash('gh api repos/o/r/pulls')))
})

describe('rm y ssh', () => {
  test('bloquea rm -rf fuera del repo', () => deny(bash('rm -rf /c/Users/matia')))
  test('bloquea rm -rf ..', () => deny(bash('rm -rf ../MAT-19-guardia-vite-app-planificacion')))
  test('bloquea rm -rf .', () => deny(bash('rm -rf .')))
  test('bloquea rm -rf src', () => deny(bash('rm -rf src')))
  test('bloquea rm -rf .git', () => deny(bash('rm -rf .git')))
  test('permite rm -rf dist', () => pasa(bash('rm -rf dist')))
  test('permite rm -rf node_modules', () => pasa(bash('rm -rf node_modules')))
  test('bloquea ssh', () => deny(bash('ssh user@host')))
  test('bloquea scp', () => deny(bash('scp a user@host:b')))
})

describe('autoprotección por la terminal', () => {
  test('bloquea sed sobre el guard', () => deny(bash("sed -i 's/deny/x/' .claude/hooks/guard.cjs")))
  test('bloquea git add del guard', () => deny(bash('git add .claude/hooks/guard.cjs')))
  test('bloquea node -e que escribe el pre-push', () =>
    deny(bash("node -e \"require('fs').writeFileSync('.githooks/pre-push', '')\"")))
  test('bloquea rm del settings', () => deny(ps('Remove-Item .claude\\settings.json')))
  test('permite leer el guard', () => pasa(bash('cat .claude/hooks/guard.cjs')))
  test('permite correr sus tests', () => pasa(bash('node --test .claude/hooks/guard.spec.cjs .githooks/pre-push.spec.cjs')))
  test('permite npm run check:hooks', () => pasa(bash('npm run check:hooks')))
  test('permite git diff del guard', () => pasa(bash('git diff master -- .claude/hooks/guard.cjs')))
})

// Un test por hallazgo de la revisión de MAT-37 (Rita). El id va en el nombre.
describe('hallazgos MAT-37', () => {
  const conHooks = (command, hooks) => evaluar({ tool_name: 'Bash', tool_input: { command }, cwd: PROJECT }, ctx('feature/x', true, hooks))
  // B2: valor pegado a la flag (gh lo manda igual como POST).
  test('B2 bloquea gh api -fevent=APPROVE', () => deny(bash('gh api repos/o/r/pulls/12/reviews -fevent=APPROVE')))
  test('B2 bloquea gh api -Fevent=APPROVE', () => deny(bash('gh api repos/o/r/pulls/12/reviews -Fevent=APPROVE')))
  test('B2 bloquea gh api --raw-field=event=APPROVE', () => deny(bash('gh api repos/o/r/pulls/12/reviews --raw-field=event=APPROVE')))
  test('B2 bloquea gh api graphql con mutation', () =>
    deny(bash("gh api graphql -fquery='mutation{mergePullRequest(input:{pullRequestId:\"x\"}){clientMutationId}}'")))
  test('B2 bloquea gh api graphql mutation aunque diga -X GET', () => deny(bash("gh api graphql -X GET -f query='mutation{x}'")))
  // B3: reglaGh y reglaGit con comandoEfectivo.
  test('B3 bloquea gh.exe pr merge (PowerShell)', () => deny(ps('gh.exe pr merge 12')))
  test('B3 bloquea C:\\...\\gh.exe pr ready', () => deny(ps('C:\\GitHubCLI\\gh.exe pr ready 12')))
  test('B3 bloquea X=1 gh pr merge', () => deny(bash('X=1 gh pr merge 5')))
  test('B3 bloquea "gh" pr merge', () => deny(bash('"gh" pr merge 5')))
  test('B3 bloquea gh.exe pr review --approve', () => deny(ps('gh.exe pr review 12 --approve')))
  test('B3 bloquea X=1 git push --no-verify', () => deny(bash('X=1 git push --no-verify origin HEAD:master')))
  test('B3 bloquea X=1 git push --force a una rama', () => deny(bash('X=1 git push --force origin feature/x')))
  test('B3 bloquea "git" push --force', () => deny(bash('"git" push --force origin feature/x')))
  // B4: lectura con redirección sobre una ruta del guard.
  test('B4 bloquea cat /dev/null > guard', () => deny(bash('cat /dev/null > .claude/hooks/guard.cjs')))
  test('B4 bloquea git show … > settings.json', () => deny(bash('git show HEAD~3:.claude/settings.json > .claude/settings.json')))
  test('B4 bloquea >> al pre-push', () => deny(bash('cat x >> .githooks/pre-push.cjs')))
  test('B4 bloquea git show --output=', () => deny(bash('git show HEAD:x --output=.claude/hooks/guard.cjs')))
  test('B4 bloquea node --test > guard', () => deny(bash('node --test .claude/hooks/guard.spec.cjs > .claude/hooks/guard.cjs')))
  test('B4 bloquea Get-Content | Set-Content', () => deny(ps('Get-Content x | Set-Content .claude\\hooks\\guard.cjs')))
  test('B4 bloquea Get-Content | Out-File', () => deny(ps('Get-Content x | Out-File .claude\\settings.json')))
  test('B4 bloquea cat | tee', () => deny(bash('cat x | tee .githooks/pre-push')))
  test('B4 permite leer el guard con 2>&1 y 2>/dev/null', () =>
    pasa(bash('git diff -- .claude/hooks/guard.cjs 2>&1 && cat .claude/hooks/guard.cjs 2>/dev/null')))
  // B5: prefijos de opciones largas, comillas y heads/.
  for (const f of ['--no-v', '--no-verif', '--forc', '--for', '--force-w', '--mir', '--mi', '--al', '--del', '--de', '--pru', '--pr', '--ta', '--br'])
    test(`B5 bloquea git push ${f}`, () => deny(bash(`git push ${f} origin feature/x`)))
  test('B5 bloquea -fu combinado', () => deny(bash('git push -fu origin feature/x')))
  test('B5 bloquea HEAD:"master"', () => deny(bash('git push origin HEAD:"master"')))
  test("B5 bloquea 'HEAD:master'", () => deny(bash("git push origin 'HEAD:master'")))
  test('B5 bloquea heads/master', () => deny(bash('git push origin HEAD:heads/master')))
  test('B5 bloquea "+feature/x"', () => deny(bash('git push origin "+feature/x"')))
  test('B5 permite --progress y --dry-run', () => pasa(bash('git push --progress --dry-run -u origin feature/x')))
  // I · pre-push activo.
  test('I niega git push si core.hooksPath está vacío', () => deny(conHooks('git push -u origin feature/x', '')))
  test('I niega git push si core.hooksPath apunta a otro lado', () => deny(conHooks('git push -u origin feature/x', '/dev/null')))
  test('I niega git push si no se puede leer core.hooksPath', () =>
    deny(
      evaluar(
        { tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: PROJECT },
        {
          projectDir: PROJECT,
          esAgente: true,
          ramaActual: () => 'feature/x',
          hooksPath: () => {
            throw new Error('sin git')
          },
        },
      ),
    ))
  test('I acepta core.hooksPath ./.githooks/', () => pasa(conHooks('git push', './.githooks/')))
  test('I package.json activa el pre-push en prepare', () =>
    assert.match(require('../../package.json').scripts.prepare, /core\.hooksPath','\.githooks/))
  // I · opciones globales de git con valor.
  test('I bloquea git --work-tree . push a master', () => deny(bash('git --work-tree . push origin HEAD:master')))
  test('I bloquea git --git-dir .git push --no-verify', () => deny(bash('git --git-dir .git push --no-verify origin feature/x')))
  test('I bloquea git --namespace x push --force', () => deny(bash('git --namespace x push --force origin feature/x')))
  // I · CI en Linux (guard.cjs:49-51, spec:80): path.posix no corta por `\`, el guard sí.
  test('I nombreDeComando corta por \\ también con path.posix', () => {
    assert.equal(path.posix.basename('.\\node_modules\\.bin\\vercel.cmd'), '.\\node_modules\\.bin\\vercel.cmd')
    assert.equal(nombreDeComando('.\\node_modules\\.bin\\vercel.cmd'), 'vercel')
    assert.equal(nombreDeComando('C:\\Program Files\\GitHub CLI\\gh.exe'), 'gh')
    assert.equal(nombreDeComando('./node_modules/.bin/vite'), 'vite')
  })
  // I · Edit/Write sin distinguir mayúsculas.
  test('I bloquea Write a .CLAUDE/Hooks/guard.cjs', () => deny(tool('Write', { file_path: '.CLAUDE/Hooks/guard.cjs' })))
  test('I bloquea Edit a .Claude/Settings.json', () => deny(tool('Edit', { file_path: '.Claude/Settings.json' })))
  test('I bloquea Edit a .GITHOOKS/pre-push', () => deny(tool('Edit', { file_path: '.GITHOOKS/pre-push' })))
  test('I bloquea Write a .GIT/HOOKS/pre-push', () => deny(tool('Write', { file_path: path.join(PROJECT, '.GIT', 'HOOKS', 'pre-push') })))
  // I · segunda capa en settings.json.
  test('I settings.json niega merge/ready/approve/--no-verify/--force/deploy', () => {
    const reglas = require('../settings.json').permissions.deny
    for (const r of ['Bash(gh pr merge:*)', 'Bash(gh pr ready:*)', 'Bash(gh pr review --approve:*)', 'Bash(git push --no-verify:*)', 'Bash(git push --force:*)', 'Bash(vercel:*)', 'Bash(firebase deploy:*)'])
      assert.ok(reglas.includes(r), r)
  })
  // Menores.
  for (const c of ['export', 'export -p', 'declare -x', 'declare -p', 'typeset -x', 'node -p process.env', 'node -e "console.log(process.env)"', 'node -e "console.log(JSON.stringify(process.env))"'])
    test(`menor bloquea ${c}`, () => deny(bash(c)))
  test('menor permite export FOO=1, declare -a x y process.env.X', () =>
    pasa(bash('export FOO=1 && declare -a lista && node -e "console.log(process.env.NODE_ENV)"')))
  test('menor bloquea ALLOW_MASTER_PUSH con comillas', () => deny(bash('"ALLOW_MASTER_"PUSH=1 git push origin master')))
  test('menor Monitor pasa por las reglas de Bash', () => deny(tool('Monitor', { command: 'gh pr merge 12', description: 'x' })))
  test('menor settings.json registra el hook para Monitor', () => {
    const pre = require('../settings.json').hooks.PreToolUse
    assert.ok(pre.some(h => h.matcher.split('|').includes('Monitor')))
  })
})

// Un test por hallazgo de la re-revisión de MAT-43 (Rita). El id va en el nombre.
describe('hallazgos MAT-43', () => {
  // N1: `-R`/`--repo` antes (o en medio) de `pr` no saltea la regla.
  for (const c of [
    'gh -R o/r pr merge 1',
    'gh --repo o/r pr merge 1',
    'gh --repo=o/r pr merge 1',
    'gh -Ro/r pr merge 1',
    'gh pr --repo o/r merge 1',
    'gh -R o/r pr ready 1',
    'gh --repo=o/r pr ready 1',
    'gh -R o/r pr review 1 --approve',
    'gh --repo=o/r pr review 1 -a',
    'gh -R o/r pr create --fill',
    'gh --repo=o/r pr create --title x --body y',
    'gh -R o/r workflow run deploy.yml',
  ])
    test(`N1 bloquea ${c}`, () => deny(bash(c)))
  test('N1 bloquea gh.exe -R o/r pr merge (PowerShell)', () => deny(ps('gh.exe -R o/r pr merge 1')))
  test('N1 permite gh -R o/r pr create --draft', () => pasa(bash('gh -R o/r pr create --draft --title x --body y')))
  test('N1 permite gh --repo=o/r pr view 1', () => pasa(bash('gh --repo=o/r pr view 1')))
  test('N1 permite gh pr create --draft -R o/r', () => pasa(bash('gh pr create --draft -R o/r --fill')))
  // process.env: solo cuando el tramo evalúa código.
  test('menor permite rg -n process.env src', () => pasa(bash('rg -n process.env src')))
  test('menor permite grep "process.env" src', () => pasa(bash('grep "process.env" src')))
  test('menor permite grep -rn process.env src (PowerShell)', () => pasa(ps('grep -rn process.env src')))
  for (const c of ['node -pe process.env', 'node --print process.env', 'bun -e "console.log(process.env)"', 'deno eval "console.log(process.env)"', 'npx node -p process.env', 'X=1 node -p process.env'])
    test(`menor sigue bloqueando ${c}`, () => deny(bash(c)))
  // git con opciones globales sobre el guard.
  test('menor permite git -C . diff <guard>', () => pasa(bash('git -C . diff .claude/hooks/guard.cjs')))
  test('menor permite git --no-pager log <guard>', () => pasa(bash('git --no-pager log --oneline -- .claude/hooks/guard.cjs')))
  test('menor bloquea git -c core.pager=… log <guard>', () => deny(bash('git -c core.pager=tee log -- .claude/hooks/guard.cjs')))
  test('menor bloquea git -C . add <guard>', () => deny(bash('git -C . add .claude/hooks/guard.cjs')))
  // Asignaciones al frente en reglaSecretos.
  test('menor bloquea X=1 printenv', () => deny(bash('X=1 printenv')))
  test('menor bloquea X=1 Y=2 env', () => deny(bash('X=1 Y=2 env')))
  test('menor bloquea LANG=C printenv PATH', () => deny(bash('LANG=C printenv PATH')))
  test('menor permite X=1 npx vitest run', () => pasa(bash('X=1 npx vitest run')))
  // firebase hosting:* como en vendedores.
  test('menor bloquea firebase hosting:disable', () => deny(bash('firebase hosting:disable')))
  test('menor bloquea npx firebase-tools -P prod hosting:disable -f', () => deny(bash('npx firebase-tools -P prod hosting:disable -f')))
  test('menor permite firebase --version', () => pasa(bash('firebase --version')))
  // gh api graphql de solo lectura: -f hace POST, se niega igual (documentado en guard.md).
  test("menor gh api graphql -f query='query{…}' se niega (documentado)", () => deny(bash("gh api graphql -f query='query{viewer{login}}'")))
  test('menor docs/agentes/guard.md documenta gh api graphql', () =>
    assert.match(require('node:fs').readFileSync(path.join(PROJECT, 'docs', 'agentes', 'guard.md'), 'utf8'), /gh api graphql -f query/))
})

// Un test por hallazgo de la revisión de MAT-49 (Rita). El id va en el nombre.
// `denyPor` además mira el motivo: que niegue la regla que corresponde y no otra de rebote.
const denyPor = (r, motivo) => {
  deny(r)
  assert.match(r.permissionDecisionReason, motivo)
}
const GUARD = '.claude/hooks/guard.cjs'

describe('hallazgos MAT-49', () => {
  // I1: `&` / `.` de PowerShell delante del comando, y `&` suelto de bash.
  test('I1 bloquea & gh pr merge (PowerShell)', () => denyPor(ps('& gh pr merge 1'), /gh pr merge/))
  test('I1 bloquea & "C:\\x\\gh.exe" pr merge (PowerShell)', () => denyPor(ps('& "C:\\x\\gh.exe" pr merge 1'), /gh pr merge/))
  test('I1 bloquea &"C:\\x\\gh.exe" pegado (PowerShell)', () => denyPor(ps('&"C:\\x\\gh.exe" pr merge 1'), /gh pr merge/))
  test('I1 bloquea & git push --force (PowerShell)', () => denyPor(ps('& git push --force origin feature/x'), /--force/))
  test('I1 bloquea & vercel (PowerShell)', () => denyPor(ps('& vercel'), /Vercel/))
  test('I1 bloquea . gh pr merge (PowerShell)', () => denyPor(ps('. gh pr merge 1'), /gh pr merge/))
  test('I1 bloquea x & gh pr merge', () => denyPor(bash('x & gh pr merge 1'), /gh pr merge/))
  test('I1 permite … 2>&1, >&2 y &>', () => pasa(bash('npm run build 2>&1 && echo x >&2 && npm test &> salida.txt')))
  // Punto 4: `tokens` saca el `(` como en app-vendedores.
  test('bloquea (gh pr merge 1)', () => denyPor(bash('(gh pr merge 1)'), /gh pr merge/))
  test('bloquea (vercel --prod)', () => denyPor(bash('(vercel --prod)'), /Vercel/))
  // Envoltorios: niega la regla de gh, no otra.
  for (const c of ['env gh pr merge 1', 'env -i X=1 gh pr merge 1', 'command gh pr merge 1', 'time gh pr merge 1', 'nohup gh pr merge 1'])
    test(`wrapper bloquea ${c}`, () => denyPor(bash(c), /gh pr merge/))
  test('wrapper bloquea env git push --force', () => denyPor(bash('env git push --force origin feature/x'), /--force/))
  test('wrapper bloquea env printenv', () => denyPor(bash('env printenv'), /volcar/))
  test('wrapper bloquea time npm run dev', () => denyPor(bash('time npm run dev'), /runtime service/))
  test('wrapper permite command -v vercel', () => pasa(bash('command -v vercel')))
  test('wrapper permite time npm test', () => pasa(bash('time npm test')))
  // Deno.env.
  test("menor bloquea deno eval 'console.log(Deno.env.toObject())'", () =>
    denyPor(bash("deno eval 'console.log(Deno.env.toObject())'"), /volcar/))
  test("menor permite deno eval 'Deno.env.get(\"X\")'", () => pasa(bash("deno eval 'console.log(Deno.env.get(\"NODE_ENV\"))'")))
  // Entorno delante de git sobre el guard: niega por el entorno, no de rebote.
  for (const c of [
    `GIT_PAGER=tee git log ${GUARD}`,
    `GIT_EXTERNAL_DIFF=./x.sh git diff ${GUARD}`,
    `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.pager GIT_CONFIG_VALUE_0=tee git log ${GUARD}`,
    `GIT_CONFIG_PARAMETERS="'core.pager'='tee'" git log ${GUARD}`,
    `env GIT_PAGER=tee git log ${GUARD}`,
  ])
    test(`entorno bloquea ${c}`, () => denyPor(bash(c), /variables de entorno/))
  test('entorno permite git --no-pager log <guard>', () => pasa(bash(`git --no-pager log --oneline -- ${GUARD}`)))
  test('entorno permite git diff <guard> 2>&1', () => pasa(bash(`git diff -- ${GUARD} 2>&1`)))
  test('guard.md documenta la limitación del entorno en otro tramo', () =>
    assert.match(require('node:fs').readFileSync(path.join(PROJECT, 'docs', 'agentes', 'guard.md'), 'utf8'), /tramo anterior/))
})

describe('el dueño (sin PAPERCLIP_*) no cambia nada', () => {
  for (const c of [
    'cat .env.test',
    'cat .env.local',
    'vercel --prod',
    'firebase deploy',
    'npm run dev',
    'npm run preview',
    'npm run e2e',
    'git push origin master',
    'git push --force',
    'git reset --hard',
    'gh pr merge 12',
    'rm -rf ../otra-cosa',
    'printenv',
  ])
    test(`permite ${c}`, () => pasa(humano(c)))
  test('permite editar el guard', () => pasa(tool('Edit', { file_path: '.claude/hooks/guard.cjs' }, false)))
  test('permite Read de .env.test', () => pasa(tool('Read', { file_path: '.env.test' }, false)))
  test('un ctx roto tampoco niega', () => pasa(evaluar({ tool_name: 'Edit', tool_input: { file_path: 'x' } }, { projectDir: null })))
})

describe('robustez', () => {
  test('input sin tool_input no rompe', () => pasa(evaluar({ tool_name: 'Bash' }, ctx())))
  test('input vacío no rompe', () => pasa(evaluar({}, ctx())))
  test('tool desconocida pasa', () => pasa(tool('WebFetch', { url: 'https://example.com' })))
  test('en modo agente, si una regla explota se niega', () =>
    deny(evaluar({ tool_name: 'Edit', tool_input: { file_path: 'x' }, cwd: PROJECT }, { projectDir: null, esAgente: true })))
})

describe('el hook de punta a punta (proceso real)', () => {
  const correr = (command, env) =>
    spawnSync(process.execPath, [path.join(__dirname, 'guard.cjs')], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: PROJECT }),
      encoding: 'utf8',
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, CLAUDE_PROJECT_DIR: PROJECT, ...env },
    })

  for (const c of ['cat .env.test', 'vercel', 'git push --force', 'gh pr review 12 --approve'])
    test(`con PAPERCLIP_RUN_ID niega ${c}`, () => {
      const r = correr(c, { PAPERCLIP_RUN_ID: 'simulado' })
      assert.equal(r.status, 0)
      assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny')
    })
  for (const c of ['cat .env.test', 'vercel', 'git push --force', 'gh pr review 12 --approve'])
    test(`sin PAPERCLIP_* no dice nada sobre ${c}`, () => {
      const r = correr(c, {})
      assert.equal(r.status, 0)
      assert.equal(r.stdout, '')
    })
  // I · uncaughtException: un input `null` sin CLAUDE_PROJECT_DIR rompe fuera de `evaluar`
  // (`input.cwd` sobre null).
  const crudo = (input, env) =>
    spawnSync(process.execPath, [path.join(__dirname, 'guard.cjs')], {
      input,
      encoding: 'utf8',
      cwd: PROJECT,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
    })
  test('I con PAPERCLIP_RUN_ID, si el hook revienta sale con 2 (bloquea)', () => {
    const r = crudo('null', { PAPERCLIP_RUN_ID: 'simulado' })
    assert.equal(r.status, 2)
    assert.match(r.stderr, /se niega por precaución/)
  })
  test('I sin PAPERCLIP_*, si el hook revienta sale con 0 y no dice nada', () => {
    const r = crudo('null', {})
    assert.equal(r.status, 0)
    assert.equal(r.stdout, '')
  })
  // MAT-43 · JSON roto por stdin.
  test('menor con PAPERCLIP_RUN_ID, JSON roto por stdin → deny', () => {
    const r = crudo('{"tool_name":"Bash","tool_input":{"command":"gh pr merge 1"', { PAPERCLIP_RUN_ID: 'simulado' })
    assert.equal(r.status, 0, r.stderr)
    deny(JSON.parse(r.stdout).hookSpecificOutput)
  })
  test('menor sin PAPERCLIP_*, JSON roto por stdin no dice nada', () => {
    const r = crudo('{roto', {})
    assert.equal(r.status, 0)
    assert.equal(r.stdout, '')
  })
})
