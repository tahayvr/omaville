data := "dev/snapshot.json"

# list the recipes
default:
	@just --list

# the city on :8080: scans the org with GITHUB_TOKEN, else from dev/snapshot.json (the relay inside, unsigned hooks)
dev:
	pnpm dev

# the members' city on :8080 from an invented sample (wards, a private repository), signed in as you
members:
	pnpm dev:members

# draw all 4 flat angles and both 3D recordings; fails on NaN or undefined
check data=data:
	node scripts/check.mjs --data {{data}}

# build the app (build/; run it with: node build)
build:
	pnpm build

# screenshots: 3D and flat, light and dark, all four angles (needs Chrome and a build)
shots: build
	pnpm shots

# fire signed sample webhooks at the local app, e.g. just fire push,merge,release
fire kinds="push,merge,release":
	pnpm fire --kinds {{kinds}}

# the relay's tests, the build, then the end-to-end privacy test
test:
	pnpm test

# load test: 200 pages, one event a second (the local dev app only)
load url="http://localhost:8080":
	pnpm load --relay {{url}}

# register the Basecamp webhook on every project (dry run unless --apply), e.g. just basecamp-hooks <url> --apply
basecamp-hooks url *flags:
	node scripts/basecamp-hooks.mjs --url {{url}} {{flags}}

# refresh the dev snapshot from a scan of the org (needs GITHUB_TOKEN)
collect:
	pnpm collect
