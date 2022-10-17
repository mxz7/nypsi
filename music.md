# last.fm integration

## getting started

first, you must create a [last.fm](https://last.fm) account. you can then follow
[this](https://community.spotify.com/t5/FAQs/How-can-I-connect-Spotify-to-Last-fm/ta-p/4795301) guide to connect your spotify
to last.fm

you then need to link your last.fm username to nypsi. to do this, run `/settings me lastfm`

## tracking music

nypsi doesn't track your music. last.fm does. if you are having trouble with this, checkout
[this](https://support.last.fm/t/spotify-has-stopped-scrobbling-what-can-i-do/3184) guide

## now playing

you can view your currently playing song by using the `/nowplaying`

## top tracks / artists

you can view your top tracks / artists by using the respective commands (`/toptracks` / `/topartists`)

by default, nypsi will show the last week of data. you can change this to view alltime, last year or month. an example of
this can be seen below

`/toptracks length:year`

## recent songs

to view your recently played songs, use `$recentsongs`
