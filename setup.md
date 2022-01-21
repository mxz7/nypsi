---
layout: default
title: quick setup
nav_order: 2
description: quick setup for nypsi
permalink: /setup
---

# quick setup

## 1. setting custom prefix

by default, nypsi uses `$` as the prefix, if you are unsure what the current prefix is, tag nypsi to be reminded of the current prefix.

to change the prefix, you can use the prefix command

example:

```
$prefix !
```

this would change the prefix to `!`

## 2. qualifying your server for $pings

you can see if your server is eligible to track mentions by using the `$ping` command.

requirements:

-   your server **must** have less than 150k members
-   your server owner must have an economy profile

the quick fix for this is to simply check the server owner's balance using the `$bal` command, if you need further help, feel free to join the [support server](https://discord.gg/hJTDNST)

## 3. setting up christmas countdown

the christmas countdown is a utility that sends messages counting down to christmas.

you can quickly set this up by using the command format below

```
$christmas enable [channel]
```

if you'd like to use an existing channel, you can replace [channel] with the channel you'd like to use. (**do not** include the brackets)
