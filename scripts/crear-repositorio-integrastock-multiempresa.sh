#!/usr/bin/env bash
# INTEGRASTOCK Multiempresa — crear repositorio independiente en GitHub.
# Ejecutar desde un equipo con git y GitHub CLI ("gh auth login").
# Esta operación NO escribe en el repositorio original ni en Contemar.
set -euo pipefail
OWNER="Normajel"
SOURCE="${OWNER}/bodegapro"
TARGET="${OWNER}/integrastock-multiempresa"
BRANCH="multiempresa-desarrollo"
if ! command -v gh >/dev/null || ! command -v git >/dev/null; then
  echo "Se requiere Git y GitHub CLI (gh)." >&2
  exit 1
fi
gh auth status >/dev/null
if gh repo view "${TARGET}" >/dev/null 2>&1; then
  echo "El repositorio ${TARGET} ya existe. Se detiene para evitar sobreescrituras." >&2
  exit 1
fi
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
git clone --single-branch --branch "${BRANCH}" "https://github.com/${SOURCE}.git" "${WORK}/integrastock"
cd "${WORK}/integrastock"
EXPECTED="$(git rev-parse HEAD)"
echo "Origen: ${SOURCE}@${BRANCH}, commit ${EXPECTED}"
echo "Destino: ${TARGET} (PRIVADO)"
# Crear vacío: NO inicializar README, .gitignore o licencia en el remoto.
gh repo create "${TARGET}" --private --description "INTEGRASTOCK ERP Multiempresa — aplicación independiente"
git remote add integrastock "https://github.com/${TARGET}.git"
# Todo el historial de la rama se conserva, sin alterar la rama de Contemar.
git push integrastock "HEAD:refs/heads/main"
REMOTE_HEAD="$(gh api "repos/${TARGET}/git/ref/heads/main" --jq .object.sha)"
if [ "${REMOTE_HEAD}" != "${EXPECTED}" ]; then
  echo "ERROR: el commit remoto no coincide. Local=${EXPECTED}, remoto=${REMOTE_HEAD}" >&2
  exit 1
fi
echo "Repositorio privado creado y validado: https://github.com/${TARGET}"
echo "Commit original y nuevo: ${EXPECTED}"
echo "Paso siguiente: reconectar proyecto Vercel integrastock-multiempresa al repositorio nuevo."
