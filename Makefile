# Tender Front — Makefile
# Тонкая обёртка над npm-скриптами: одни и те же команды локально и в CI.
# Бэкенд живёт в отдельном репозитории (tender) — поднимать его там, `make up`.

NPM := npm

.DEFAULT_GOAL := help
.PHONY: help install dev build preview lint check gen ui outdated audit clean distclean

help: ## Показать список доступных команд
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

# ---------- Зависимости ----------

install: ## Установить зависимости строго по package-lock.json (как в CI)
	$(NPM) ci

# ---------- Разработка ----------

dev: ## Vite dev-сервер на :5173, /api проксируется на 127.0.0.1:8080
	$(NPM) run dev

build: ## Прод-сборка в dist/ (tsc -b && vite build — тайпчек входит в билд)
	$(NPM) run build

preview: ## Отдать собранный dist/ локально
	$(NPM) run preview

# ---------- Проверки ----------

lint: ## oxlint
	$(NPM) run lint

check: lint build ## Всё, что гоняет CI: lint + тайпчек + сборка
	@echo "OK: lint + typecheck + build"

# ---------- Контракт ----------

gen: ## Перегенерировать src/api/schema.d.ts из живой спеки (нужен API на :8080)
	$(NPM) run gen

# ---------- Утилиты ----------

ui: ## Добавить компонент shadcn/ui: make ui ARGS="add dialog"
	npx shadcn@latest $(ARGS)

outdated: ## Показать устаревшие зависимости
	$(NPM) outdated || true

audit: ## Аудит зависимостей на известные уязвимости
	$(NPM) audit

clean: ## Удалить сборку
	rm -rf dist

distclean: clean ## Удалить сборку и node_modules
	rm -rf node_modules
