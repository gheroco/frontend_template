.PHONY: install setup dev test validate build compose-up compose-down kind-create kind-install kind-delete

install:
	npm ci

setup:
	npm run setup

dev:
	npm run dev

test:
	npm run test:unit

validate:
	npm run validate

build:
	npm run build

compose-up:
	npm run compose:up

compose-down:
	npm run compose:down

kind-create:
	npm run kind:create

kind-install:
	npm run kind:install

kind-delete:
	npm run kind:delete

