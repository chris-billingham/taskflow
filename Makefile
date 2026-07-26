.PHONY: install start stop restart logs status backup restore upgrade \
        build shell-api shell-db shell-redis clean migrate

-include .env
export

# Pin the production compose file explicitly. Without -f, docker compose also
# merges docker-compose.override.yml (a DEV override: dev servers, NODE_ENV=development,
# self-signed TLS, exposed ports), silently turning `make start` into a dev stack.
COMPOSE = docker compose -f docker-compose.yml

install:
	@bash scripts/install.sh

start:
	$(COMPOSE) up -d

stop:
	$(COMPOSE) down

restart:
	$(COMPOSE) restart

logs:
	$(COMPOSE) logs -f

status:
	$(COMPOSE) ps

build:
	$(COMPOSE) build --parallel

backup:
	@bash scripts/backup.sh

restore:
	@bash scripts/restore.sh $(file)

upgrade:
	@bash scripts/upgrade.sh

migrate:
	$(COMPOSE) run --rm \
		-e DATABASE_URL="postgresql://$${POSTGRES_USER:-taskflow}:$${POSTGRES_PASSWORD}@postgres:5432/$${POSTGRES_DB:-taskflow}" \
		api sh -c "npx prisma migrate deploy --schema prisma/schema.prisma"

shell-api:
	$(COMPOSE) exec api sh

shell-db:
	$(COMPOSE) exec postgres psql -U $${POSTGRES_USER:-taskflow} -d $${POSTGRES_DB:-taskflow}

shell-redis:
	$(COMPOSE) exec redis redis-cli -a $${REDIS_PASSWORD}

clean:
	@echo "WARNING: This will delete all data volumes."
	@printf "Type 'yes' to confirm: "; read CONFIRM; \
	[ "$$CONFIRM" = "yes" ] && $(COMPOSE) down -v || echo "Aborted."
