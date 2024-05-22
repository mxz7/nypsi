# setup

pls note that if you come to me for help even with these instructions, i wont help you

## requirements

- [postgresql database](#postgresql)
- redis
- node 18+

### windows

i strongly recommend against using windows for running nypsi. however, if your computer is relatively modern, you should be able to set up a WSL instance on your system.

### instructions

- `git clone https://github.com/mxz7/nypsi`
- `cd nypsi`
- configure .env.example with your tokens/keys etc. (most of these will cause issues if not given)
- `./setup.sh`
- `npm install -g pnpm`
- `pnpm install`
- `npx tsc`
- `npx prisma migrate deploy`
- `node .`

### postgresql

if you're just planning on running nypsi for testing, i strongly recommend using [railway.app](https://railway.app) to easily deploy a postgresql server.
this service is free for low usage and makes your life a lot easier. the only downside is that it will typically run a lot slower, unless you live on the west coast of america, which is railway's only region.

if you like to make your own life more difficult or want to run nypsi properly, you'll need to pay for a managed database, or set up your own (or modify the code to run a different database, ur choice). i found [this](https://www.youtube.com/watch?v=CaxpuKwOs2w) tutorial to be very helpful for setting up & hosting a local postgresql server
