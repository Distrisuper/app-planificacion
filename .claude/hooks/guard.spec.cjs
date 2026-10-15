// Tests del guard. Se corren con `npm run check:hooks` (node:test, sin Vitest: el guard
// tiene que poder probarse con `node` pelado, igual que se ejecuta).
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const guard = require('./guard.cjs')
const { evaluar, nombreDeComando } = guard

const PROJECT = path.resolve(__dirname, '..', '..')

// El ctx no tiene ningún "modo": el guard aplica siempre.
function ctx(rama = 'feature/algo', hooks = '.githooks') {
  return { projectDir: PROJECT, ramaActual: () => rama, hooksPath: () => hooks }
}

const bash = (command, rama) => evaluar({ tool_name: 'Bash', tool_input: { command }, cwd: PROJECT }, ctx(rama))
const ps = command => evaluar({ tool_name: 'PowerShell', tool_input: { command }, cwd: PROJECT }, ctx())
const tool = (tool_name, tool_input) => evaluar({ tool_name, tool_input, cwd: PROJECT }, ctx('feature/algo'))

const deny = r => assert.equal(r && r.permissionDecision, 'deny', JSON.stringify(r))
const pasa = r => assert.equal(r, null, JSON.stringify(r))

describe('aplica siempre, sin PAPERCLIP_* ni ningún otro modo', () => {
  test('el módulo ya no exporta esAgente', () => assert.equal(guard.esAgente, undefined))
  test('el código no menciona PAPERCLIP', () =>
    assert.doesNotMatch(require('node:fs').readFileSync(path.join(__dirname, 'guard.cjs'), 'utf8'), /PAPERCLIP/))
  for (const c of ['cat .env', 'vercel --prod', 'git push origin master', 'git push --force', 'gh pr merge 12', 'rm -rf ../otra-cosa', 'printenv'])
    test(`niega ${c} con un ctx sin ninguna marca de agente`, () =>
      deny(evaluar({ tool_name: 'Bash', tool_input: { command: c }, cwd: PROJECT }, { projectDir: PROJECT, ramaActual: () => 'master', hooksPath: () => '.githooks' })))
  test('niega editar el guard', () => deny(tool('Edit', { file_path: '.claude/hooks/guard.cjs' })))
  test('niega Read de .env.test', () => deny(tool('Read', { file_path: '.env.test' })))
  test('un ctx roto niega (falla cerrado)', () => deny(evaluar({ tool_name: 'Edit', tool_input: { file_path: 'x' } }, { projectDir: null })))
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
  test('bloquea env | grep', () => deny(bash('env | grep TOKEN')))
  test('bloquea Get-ChildItem env:', () => deny(ps('Get-ChildItem env:')))
  test('bloquea GetEnvironmentVariables', () => deny(ps('[Environment]::GetEnvironmentVariables()')))
  test('bloquea ALLOW_MASTER_PUSH', () => deny(bash('ALLOW_MASTER_PUSH=1 git push origin master')))
  test('bloquea ALLOW_BASE_PUSH', () => deny(bash('ALLOW_BASE_PUSH=1 git push origin master')))
  test('bloquea $env:ALLOW_BASE_PUSH (PowerShell)', () => deny(ps('$env:ALLOW_BASE_PUSH=1; git push origin master')))
  for (const f of ['.env.bak', '.env-prod', '.env-staging', '.env.tunnel', '.env.production', 'agente.env', 'agente-local.env'])
    test(`bloquea cat ${f}`, () => deny(bash(`cat ${f}`)))
  test('permite .env-example', () => pasa(bash('cat .env-example')))
  test('permite .env.example', () => pasa(bash('cat .env.example')))
  test('permite .env.local.example', () => pasa(bash('cat .env.local.example')))
  test('permite copiar la plantilla a otra plantilla', () => pasa(bash('cp .env-example .env.example')))
  test('permite env con comando', () => pasa(bash('env NODE_ENV=test npx vitest run')))
  test('permite leer una variable puntual', () => pasa(ps('echo $env:VITE_API_URL')))
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
  test('permite Read de .env.example', () => pasa(tool('Read', { file_path: '.env.example' })))
  test('permite Edit de .env-example', () => pasa(tool('Edit', { file_path: '.env-example' })))
  test('permite Write de .env.local.example', () => pasa(tool('Write', { file_path: '.env.local.example' })))
  test('bloquea Read de .env.bak', () => deny(tool('Read', { file_path: '.env.bak' })))
  test('bloquea Read de agente.env', () => deny(tool('Read', { file_path: 'agente.env' })))
  test('permite leer settings.json', () => pasa(tool('Read', { file_path: '.claude/settings.json' })))
  test('permite leer el pre-push', () => pasa(tool('Read', { file_path: '.githooks/pre-push.cjs' })))
  test('permite Grep en el guard', () => pasa(tool('Grep', { pattern: 'deny', path: '.claude/hooks' })))
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

// Los servidores de desarrollo no se bloquean (AGENTS.md dice que no hacen falta para
// verificar: la verificación es `npm run check`). Antes los levantaba solo Paperclip.
describe('servidores de desarrollo (permitidos)', () => {
  test('permite npm run dev', () => pasa(bash('npm run dev')))
  test('permite npm run preview', () => pasa(bash('npm run preview')))
  test('permite npm start', () => pasa(bash('npm start')))
  test('permite pnpm dev', () => pasa(bash('pnpm dev')))
  test('permite npm run e2e', () => pasa(bash('npm run e2e')))
  test('permite npx playwright test', () => pasa(bash('npx playwright test')))
  test('permite vite pelado', () => pasa(bash('vite')))
  test('permite npx vite --port', () => pasa(bash('npx vite --port 5174')))
  test('permite npm run build', () => pasa(bash('npm run build')))
  test('permite npm run check', () => pasa(bash('npm run check')))
  test('permite npx vite build', () => pasa(bash('npx vite build')))
  test('permite npm test', () => pasa(bash('npm test')))
  test('permite npm run test', () => pasa(bash('npm run test')))
  test('permite npx vitest run', () => pasa(bash('npx vitest run src/lib')))
  test('permite npm run lint', () => pasa(bash('npm run lint')))
  test('permite npx playwright install', () => pasa(bash('npx playwright install chromium')))
})

describe('docker', () => {
  for (const c of [
    'docker ps',
    'docker ps -a',
    'docker --version',
    'docker version',
    'docker logs api',
    'docker logs -f api',
    'docker inspect api',
    'docker compose ps',
    'docker compose -f docker-compose.local.yml ps',
    'docker compose logs api',
    'docker-compose ps',
    'docker images',
  ])
    test(`permite ${c} (solo lectura)`, () => pasa(bash(c)))
  for (const c of [
    'docker compose up -d',
    'docker compose -f docker-compose.local.yml up -d',
    'docker compose down',
    'docker compose down -v',
    'docker compose rm -f',
    'docker-compose up',
    'docker-compose up -d',
    'docker-compose down',
    'docker run -it node',
    'docker rm api',
    'docker stop api',
    'docker kill api',
    'docker container rm api',
    'docker container stop api',
    'docker volume rm datos',
    'docker volume prune',
    'docker system prune -af',
    'docker --context prod compose up -d',
    'npx docker-compose up',
  ])
    test(`bloquea ${c}`, () => deny(bash(c)))
  test('bloquea docker compose up en PowerShell', () => deny(ps('docker.exe compose up -d')))
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
  test('permite head del guard', () => pasa(bash('head -40 .claude/hooks/guard.cjs')))
  test('permite grep en el guard', () => pasa(bash('grep -n deny .claude/hooks/guard.cjs')))
  test("permite sed -n '1,40p' del guard", () => pasa(bash("sed -n '1,40p' .claude/hooks/guard.cjs")))
  test("permite sed -n '/regla/p' del guard", () => pasa(bash("sed -n '/regla/p' .claude/hooks/guard.cjs")))
  test('permite cat del settings', () => pasa(bash('cat .claude/settings.json')))
  test('permite Select-String sobre el pre-push (PowerShell)', () => pasa(ps('Select-String -Path .githooks\\pre-push.cjs -Pattern master')))
  test('bloquea sed -n con w (escribe)', () => deny(bash("sed -n '1,5w salida' .claude/hooks/guard.cjs")))
  test('bloquea sed -n -i', () => deny(bash("sed -n -i '1p' .claude/hooks/guard.cjs")))
  test('bloquea sed sin -n sobre el guard', () => deny(bash("sed 's/a/b/' .claude/hooks/guard.cjs")))
  test('permite correr sus tests', () => pasa(bash('node --test .claude/hooks/guard.spec.cjs .githooks/pre-push.spec.cjs')))
  test('permite npm run check:hooks', () => pasa(bash('npm run check:hooks')))
  test('permite git diff del guard', () => pasa(bash('git diff master -- .claude/hooks/guard.cjs')))
})

// Casos de borde que encontraron revisiones anteriores del guard (MAT-37). El id va en el nombre.
describe('hallazgos MAT-37', () => {
  const conHooks = (command, hooks) => evaluar({ tool_name: 'Bash', tool_input: { command }, cwd: PROJECT }, ctx('feature/x', hooks))
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

// Casos de borde de la segunda revisión (MAT-43). El id va en el nombre.
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

// Casos de borde de la tercera revisión (MAT-49). El id va en el nombre.
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
  test('wrapper permite time npm run dev', () => pasa(bash('time npm run dev')))
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

describe('settings.json', () => {
  const settings = require('../settings.json')
  test('apaga el plugin superpowers', () => assert.equal(settings.enabledPlugins['superpowers@superpowers-marketplace'], false))
  test('deny enumera los .env reales y no usa comodines que tapen las plantillas', () => {
    const deny = settings.permissions.deny
    for (const f of ['.env', '.env.local', '.env.bak', '.env.production', '.env-prod', '.env-staging', '.env.tunnel'])
      assert.ok(deny.includes(`Read(/${f})`) && deny.includes(`Edit(/${f})`), f)
    assert.ok(!deny.some(r => /\.env\.\*|\.env\*/.test(r)), 'un Read(.env.*) bloquearía .env.example')
  })
  test('ask frena roles, auth, workflows y vercel.json', () => {
    const ask = settings.permissions.ask
    for (const r of ['Edit(/src/lib/roles.ts)', 'Edit(/src/context/AuthContext.tsx)', 'Edit(/src/api/apiClient.ts)', 'Edit(/.github/workflows/**)', 'Edit(/vercel.json)'])
      assert.ok(ask.includes(r), r)
  })
  test('sin restos de Paperclip', () => assert.doesNotMatch(JSON.stringify(settings), /paperclip|agente:|__agente/i))
  test('el guard cubre los tools de archivo', () => {
    const pre = settings.hooks.PreToolUse
    for (const t of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
      assert.ok(pre.some(h => h.matcher.split('|').includes(t)), t)
  })
})

describe('robustez', () => {
  test('input sin tool_input no rompe', () => pasa(evaluar({ tool_name: 'Bash' }, ctx())))
  test('input vacío no rompe', () => pasa(evaluar({}, ctx())))
  test('tool desconocida pasa', () => pasa(tool('WebFetch', { url: 'https://example.com' })))
  test('si una regla explota se niega', () =>
    deny(evaluar({ tool_name: 'Edit', tool_input: { file_path: 'x' }, cwd: PROJECT }, { projectDir: null })))
})

describe('el hook de punta a punta (proceso real)', () => {
  const correr = (command, env) =>
    spawnSync(process.execPath, [path.join(__dirname, 'guard.cjs')], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: PROJECT }),
      encoding: 'utf8',
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, CLAUDE_PROJECT_DIR: PROJECT, ...env },
    })

  // El entorno de los procesos no tiene ninguna PAPERCLIP_*: el guard niega igual.
  for (const c of ['cat .env.test', 'vercel', 'git push --force', 'gh pr review 12 --approve', 'docker compose up -d'])
    test(`niega ${c} sin ninguna variable de agente`, () => {
      const r = correr(c, {})
      assert.equal(r.status, 0)
      assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny')
    })
  for (const c of ['npm run check', 'git status', 'npm run dev', 'cat .env-example'])
    test(`no dice nada sobre ${c}`, () => {
      const r = correr(c, {})
      assert.equal(r.status, 0)
      assert.equal(r.stdout, '')
    })
  // uncaughtException: un input `null` sin CLAUDE_PROJECT_DIR rompe fuera de `evaluar`
  // (`input.cwd` sobre null).
  const crudo = (input, env) =>
    spawnSync(process.execPath, [path.join(__dirname, 'guard.cjs')], {
      input,
      encoding: 'utf8',
      cwd: PROJECT,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
    })
  test('si el hook revienta sale con 2 (bloquea), sin ninguna variable de agente', () => {
    const r = crudo('null', {})
    assert.equal(r.status, 2)
    assert.match(r.stderr, /se niega por precaución/)
  })
  test('JSON roto por stdin → deny, sin ninguna variable de agente', () => {
    const r = crudo('{"tool_name":"Bash","tool_input":{"command":"gh pr merge 1"', {})
    assert.equal(r.status, 0, r.stderr)
    deny(JSON.parse(r.stdout).hookSpecificOutput)
  })
})
