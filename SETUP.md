# setup

pls note that if you come to me for help even with these instructions, i wont help you

you will also need a [postgresql server running](#postgresql)

### for windows

install and enable WSL on your system. [tutorial](https://pureinfotech.com/install-wsl-windows-11/) - i recommend you go for ubuntu

install nodejs on your WSL. [tutorial](https://www.digitalocean.com/community/tutorials/how-to-install-node-js-on-ubuntu-20-04)

### instructions

-   run `git clone https://github.com/tekoh/nypsi`
-   run `cd nypsi`
-   run the ./setup.sh file
-   run `npm install` this will install all packages needed for nypsi
-   run `npx tsc` this will compile the typescript into javascript
-   run `sudo apt install redis-server` and install the package
-   fill out the .env file with your own info
-   run `sudo service redis-server start` to start the local redis server
-   if all went well, `node .` should start your version of nypsi (:

### postgresql

if you're just planning on running nypsi for testing, i strongly recommend using [railway.app](https://railway.app) to easily deploy a postgresql server.
this service is free for low usage and makes your life a lot easier. the only downside is that it will typically run a lot slower, unless you live on the west coast of america, which is railway's only region.

if you like to make your own life more difficult or want to run nypsi properly, you'll need to pay for a managed database, or set up your own (or modify the code to run a different database, ur choice). i found [this](https://www.youtube.com/watch?v=CaxpuKwOs2w) tutorial to be very helpful for setting up & hosting a local postgresql server
