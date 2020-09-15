#!/usr/bin/env node
const lib = require('./index.js')
const process = require('process')
const fs = require('fs')
const token = fs.readFileSync(process.argv[2], 'utf8').trim()
const myClient = lib.run('', token, {})
myClient.then(_ => {
    const [message, ...uidList] = process.argv.slice(3)
    const Discord = lib.Discord
    const broadcasting = uidList
        .map(uid => new Discord.User(myClient.client, {id: uid}))
        .map(user => user.send(message))
    Promise.all(broadcasting).then(_ => process.exit(0))
})
