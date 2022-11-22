# auto mute

auto mute will be configured by default to mute members for an increasing amount of time when they violate the chat filter

## configuring auto mute

auto mute can be configured using the `$automute` command, values of '0' will not mute the user at that violation level,
however setting a value of 'none', will use the next lowest available time.

## how do violation levels work

each hour, a member's violation level will be reset. everytime they violate the chat filter they vl (violations) will go up
by one.

if their vl has a hit against the auto mute configuration, they will be muted for that amount of time. if there is no value
associated with their current vl level, nypsi will use the next lowest available option.
