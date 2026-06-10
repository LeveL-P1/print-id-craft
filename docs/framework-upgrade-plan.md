# Framework and Auth Upgrade Plan

Planned window — do not run npm audit fix --force.

## Targets

- next 14.2.35 -> 15.x (dedicated branch)
- next-auth 4.24.x patch only short term; Auth.js v5 later

## Verify after upgrade

npm test
npm run build
LOAD_TARGET=staging LOAD_TOKEN=token LOAD_TOTAL=100 npm run load:full
