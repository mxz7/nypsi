# setup

pls note that if you come to me for help even with these instructions, i wont help you

### 🪟 windows (WSL)

install and enable WSL on your system [tutorial](https://pureinfotech.com/install-wsl-windows-11/) - i recommend you go for ubuntu

install nodejs on your WSL [tutorial](https://www.digitalocean.com/community/tutorials/how-to-install-node-js-on-ubuntu-20-04)

now in your WSL thingy, do the following:

-   run `git clone https://github.com/tekoh/nypsi`
-   run `cd nypsi`
-   run the ./setup.sh file
-   run `npm install` this will install all packages needed for nypsi
-   run `npx tsc` this will compile the typescript into javascript
-   run `sudo apt install redis-server` and install the package
-   fill out the .env file with your api keys / tokens
-   run `sudo service redis-server start` to start the local redis server
-   if all went well, `node .` should start your version of nypsi (:

### 🐧 linux/macos

follow the above except from WSL and it should work the same
