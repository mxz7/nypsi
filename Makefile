.PHONY: build watch run dev clean

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

dev: build
	$(MAKE) watch & \
		$(MAKE) run
