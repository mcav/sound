#!/usr/bin/env sh
node_modules/.bin/watchify -t [ babelify --presets [ es2015 ] ] index.js -o index.min.js
