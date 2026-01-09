set shell := ["bash", "-cu"]

FRONTEND_DIR := "frontend"
BACKEND_DIR := "backend"

default: dev

deps:
  if [ -f {{FRONTEND_DIR}}/package.json ]; then (cd {{FRONTEND_DIR}} && bun install); else echo "skip: {{FRONTEND_DIR}}/package.json not found"; fi
  if [ -f {{BACKEND_DIR}}/package.json ]; then (cd {{BACKEND_DIR}} && bun install); else echo "skip: {{BACKEND_DIR}}/package.json not found"; fi

dev:
  just --parallel dev-frontend dev-backend

dev-frontend:
  if [ -f {{FRONTEND_DIR}}/package.json ]; then (cd {{FRONTEND_DIR}} && bun run dev); else echo "skip: {{FRONTEND_DIR}}/package.json not found"; fi

dev-backend:
  if [ -f {{BACKEND_DIR}}/package.json ]; then (cd {{BACKEND_DIR}} && bun run dev); else echo "skip: {{BACKEND_DIR}}/package.json not found"; fi

build:
  just build-frontend
  just build-backend

build-frontend:
  if [ -f {{FRONTEND_DIR}}/package.json ]; then (cd {{FRONTEND_DIR}} && bun run build); else echo "skip: {{FRONTEND_DIR}}/package.json not found"; fi

build-backend:
  if [ -f {{BACKEND_DIR}}/package.json ]; then (cd {{BACKEND_DIR}} && bun run build); else echo "skip: {{BACKEND_DIR}}/package.json not found"; fi

test:
  just test-frontend
  just test-backend

test-frontend:
  if [ -f {{FRONTEND_DIR}}/package.json ]; then (cd {{FRONTEND_DIR}} && bun run test); else echo "skip: {{FRONTEND_DIR}}/package.json not found"; fi

test-backend:
  if [ -f {{BACKEND_DIR}}/package.json ]; then (cd {{BACKEND_DIR}} && bun run test); else echo "skip: {{BACKEND_DIR}}/package.json not found"; fi

lint:
  just lint-frontend
  just lint-backend

lint-frontend:
  if [ -f {{FRONTEND_DIR}}/package.json ]; then (cd {{FRONTEND_DIR}} && bun run lint); else echo "skip: {{FRONTEND_DIR}}/package.json not found"; fi

lint-backend:
  if [ -f {{BACKEND_DIR}}/package.json ]; then (cd {{BACKEND_DIR}} && bun run lint); else echo "skip: {{BACKEND_DIR}}/package.json not found"; fi

deploy:
  just deploy-frontend
  just deploy-backend

deploy-frontend:
  echo "TODO: configure frontend deploy (e.g., Vercel)"

deploy-backend:
  echo "TODO: configure backend deploy (e.g., Railway/Render/Fly)"
