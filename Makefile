.PHONY: install start stop restart logs status backup restore upgrade \
        build shell-api shell-db shell-redis clean migrate

-include .env
export

install:
	@bash scripts/install.sh

start:
	docker compose up -d

stop:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f

status:
	docker compose ps

build:
	docker compose build --parallel

backup:
	@bash scripts/backup.sh

restore:
	@bash scripts/restore.sh $(file)

upgrade:
	@bash scripts/upgrade.sh

migrate:
	docker compose run --rm \
		-e DATABASE_URL="postgresql://$${POSTGRES_USER:-taskflow}:$${POSTGRES_PASSWORD}@postgres:5432/$${POSTGRES_DB:-taskflow}" \
		api sh -c "npx prisma migrate deploy --schema prisma/schema.prisma"

shell-api:
	docker compose exec api sh

shell-db:
	docker compose exec postgres psql -U $${POSTGRES_USER:-taskflow} -d $${POSTGRES_DB:-taskflow}

shell-redis:
	docker compose exec redis redis-cli -a $${REDIS_PASSWORD}

clean:
	@echo "WARNING: This will delete all data volumes."
	@read -p "Type 'yes' to confirm: " CONFIRM; \
	[ "$$CONFIRM" = "yes" ] && docker compose down -v || echo "Aborted."
