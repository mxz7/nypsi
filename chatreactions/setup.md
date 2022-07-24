# chat reactions setup

## enabling automatic start

running the command below will enable automatic chat reactions in the current channel, if you have not changed any of the
settings, it will use the default settings.

```
$cr settings enable
```

## starting a chat reaction manually

you can start a chat reaction manually with `$cr start`. this will still track towards statistics and the chat reactions
leaderboard (`$cr lb`)

## setting the channel(s)

_to use multiple channels for chat reactions you must have a premium membership_

you can use the command below to enable/disable it for a channel. it acts as a toggle

```
$cr settings channel #cmds
```

## changing the cooldown

the cooldown is the **base** delay in seconds between chat reactions happening across your server.

default: 300

```
$cr settings cooldown 300
```

## changing the offset

the offset is the maximum amount of seconds that can be added or subtracted from the base delay.

default: 60

```
$cr settings offset 60
```

## changing the max game length

the max game length is how long it will take in seconds without any response for the game to end

default: 60

```
$cr settings length 60
```
