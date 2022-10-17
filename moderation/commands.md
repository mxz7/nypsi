# commands

## multi-user

every punishment command (`$warn`, `$mute`, `$kick`, etc.) allows you to affect multiple users with one command use. to be
able to affect multiple users, each user must be mentioned, otherwise it will not work. note: this does not work when using
slash commands.

the example below shows how you would mute 3 members for the same length and reason

```
$mute @member1 @member2 @member3 3h spamming
```

member1, member2 and member3 will each be muted for 3 hours, with the reason of spamming.

## targetting users

to target a user, you can either tag them, use their user ID, or their username and tag (username#tag). only mentions are
supported for targetting multiple users at a time.

## unban

in some cases, you can use the user's username to unban a member, although this shouldn't be counted on, as it depends on the
user still being cached by nypsi. if the username does not work, you must use the user's ID.
