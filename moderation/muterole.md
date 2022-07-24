# mute role

## default value

by default, the mute role will be set to `default`. this means that nypsi will attempt to use the a role with the name of
`muted` for muting, unmuting and updating channel permissions.

## changing the mute role

you change the muterole using the command below

```
$muterole set <new role>
```

replace `<new role>` with the new role. this can either be mentioning the role, using the role ID, or the role name.

you should also use the `$muterole update` command to set mute permissions for the new role.

with a custom mute role, if the bot at some point isn't able to find the role, the mute role will be reset back to `default`.

## fixing mute role permissions

by default, nypsi removes the permission for users with the mute role to be able to send a message in any server. of course,
this could be overridden by another role's permissions.

if the mute role isnt working as expected, use the command below to reset permissions for the current mute role

```
$muterole update
```

this will disable the send messages permission for the current muterole in every channel. if there is still problems with the
mute role, the problem is most likely with other role permissions.

## resetting mute role

you can reset the mute role back to `default`, meaning that the bot will look for a role with the name of `muted` to use. the
command for this is below.

```
$muterole reset
```

## viewing current mute role

you can view the current muterole by using the `$muterole` command without any arguments, it will be shown at the bottom of
the message.
