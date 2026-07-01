param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [string]$User = "root",
  [string]$AppDir = "/opt/todesk",
  [string]$RepoUrl = "git@github.com:SSQLQIANBB/toDesk.git",
  [string]$Branch = "master"
)

$ErrorActionPreference = "Stop"

$remote = "$User@$HostName"
$script = @"
set -euo pipefail
export APP_DIR="$AppDir"
export REPO_URL="$RepoUrl"
export BRANCH="$Branch"

if [ ! -d "`$APP_DIR/.git" ]; then
  git clone --branch "`$BRANCH" "`$REPO_URL" "`$APP_DIR"
fi

cd "`$APP_DIR"
git fetch origin "`$BRANCH"
git checkout "`$BRANCH"
git pull --ff-only origin "`$BRANCH"

if [ ! -f .env ]; then
  cp .env.production.example .env
  echo "Created `$APP_DIR/.env. Edit it with strong secrets, then rerun docker compose up -d --build."
  exit 2
fi

docker compose up -d --build
docker compose ps
"@

$script | ssh $remote "bash -s"
