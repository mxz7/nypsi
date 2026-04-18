.PHONY: build watch run dev clean check

build:
	npx tsc --incremental

watch:
	npx tsc --build --watch --preserveWatchOutput

run: 
	node .

clean:
	rm -rf dist
	rm -rf node_modules
	rm tsconfig.tsbuildinfo
	rm .prettiercache

run-worker-mentions:
	node dist/worker-queues/mentions.js

run-worker-dms:
	node dist/worker-queues/dms.js

dev: build
	trap 'kill 0' EXIT; \
	$(MAKE) watch & \
	$(MAKE) run & \
	$(MAKE) run-worker-mentions & \
	$(MAKE) run-worker-dms

check:
	pnpm lint
	pnpm format:check
	$(MAKE) build