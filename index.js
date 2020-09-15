#!/usr/bin/env node

var Discord = require('discord.js')
var http = require('http')
var crypto = require('crypto')

function sleep(minisecond) {
    return new Promise((wakeup) => {
        setTimeout(wakeup, minisecond)
    })
}

class BackendConnector {
    constructor(apiUrl) {
        this.apiUrl = apiUrl
        this.userProperty = {}
    }
    request(method, path, json) {
        return new Promise((routeResponse, routeError) => {
            var request = http.request(
                `${this.apiUrl}/${path}`,
                {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'quiz-chatbot-discord QA bot (node.js)'
                    }
                },
                (response) => {
                    var responseData = ''
                    response.on('data', (segment) => responseData += segment)
                    response.on('end', () => {
                        var json
                        try {
                            json = JSON.parse(responseData)
                        }
                        catch (parseError) {
                            routeError(parseError)
                        }
                        if (json) routeResponse(json)
                    })
                }
            )
            request.on('timeout', (timeoutError) => routeError(timeoutError))
            if (json) request.write(JSON.stringify(json))
            request.end()
        })
    }
    async regist(user) {
        const response = await this.request('POST', 'players', user)
        if (response.status.status_code == 409) {
            // this should be duplicate user
            throw new Error(response.status.message)
        }
        else if (response.status.status_code != 201) {
            throw response
        }
        else return response.data
    }
    isUserFinishQuestion(uid) {
        var db = this.userProperty
        return db[`${uid}.finish_question`]
    }
    setUserFinishQuestion(uid, finish = true) {
        var db = this.userProperty
        db[`${uid}.finish_question`] = true
    }
    async getQuestionFeed(uid) {
        if (this.isUserFinishQuestion(uid)) {
            return await this.getQuestionRandom(uid)
        }

        const response = await this.request('GET', `players/${uid}/feed`)
        if (response.data) return response.data
        else if (response.status.status_code == 200) {
            this.setUserFinishQuestion(uid)
            return await this.getQuestionRandom(uid)
        }
        else if (response.status.status_code == 500) {
            var message = '你尚未註冊，請先使用 /start 命令註冊才會開始計分'
            throw new Error(message)
        }
        else throw response.status
    }
    async getQuestionRandom(uid) {
        const response = await this.request('GET', `players/${uid}/rand`)
        return response.data
    }
    async getStatus(uid) {
        var response = await this.request('GET', `players/${uid}`)
        if (response.status.status_code == 200) return response.data
        else throw new Error(`player ${uid} not found`)
    }
    async answerQuestion(answer) {
        const uid = answer.player_name
        if (this.isUserFinishQuestion(uid)) return null
        const response = await this.request('POST', 'answers', answer)
        if (response.status.status_code == 409) {
            throw new Error('this question is already answered')
        }
        else return response.data
    }
}

class MyClient {
    constructor(token, backendConnector, responseBase) {
        var client = new Discord.Client()
        this.client = client
        this.backendConnector = backendConnector
        this.responseBase = responseBase
        this.platform = 'discord'
        
        var promiseClient = new Promise((afterLogin) => {
            client.once('ready', afterLogin)
        })

        client.on('message', (message) => {
            if (this.isSelf(message)) return false
            else if (this.isMention(message) || message.channel.type == 'dm') {
                if (message.content.match(/\/\w+/)) {
                    return this.routeCommand(message)
                        .catch((commandError) => {
                            return message.reply(commandError.message)
                                .then(() => console.log(commandError))
                        })
                }
                else {
                    // this is a easy delay echo system,
                    // it will echo your message after you send next message
                    return message.channel.awaitMessages(
                        (newMessage) => !this.isSelf(newMessage),
                        {max: 1}
                    ).then((collection) => {
                        return collection.first().reply(message.content)
                    })
                }
            }
            else return false
        })

        this.then = promiseClient.then.bind(promiseClient)
        client.login(token)
    }
    userToApiName(user) {
        return `${this.platform}-${user.id}`
    }
    isMention(message) {
        return message.mentions.has(this.client.user)
    }
    isSelf(message) {
        return message.author.id == this.client.user.id
    }
    answerQuestion(answer, user, question) {
        var backendConnector = this.backendConnector
        var apiName = this.userToApiName(user)
        // map A-D to 0-3
        var correct = answer == (question.answer.charCodeAt() - 65)
        return backendConnector.answerQuestion({
            player_name: apiName,
            correct,
            quiz_number: question.number
        }).catch(scoreError => {
            return user.send(scoreError.message || String(scoreError))
        }).then(() => {
            function responseCorrect(emoji, responseBase) {
                var i = Math.floor(responseBase.length * Math.random())
                return user.send(`${emoji} ${responseBase[i]}`)
            }
            var base = this.responseBase
            
            if (correct) return responseCorrect(base.emoji.right, base.right)
            else return responseCorrect(base.emoji.wrong, base.wrong)
        })
    }
    routeCommand(message) {
        function commandIs(command) {
            return Boolean((message.content.match(`/${command}`)))
        }
        var responseBase = this.responseBase
        if (commandIs('help')) {
            var rich = new Discord.MessageEmbed(responseBase.command.help)
            rich.setColor(responseBase.command.color)
            return message.channel.send(rich)
        } else if (commandIs('statistic')) {
            return message.reply(responseBase.command.statistic)
        }
        else if (commandIs('next')) {
            return this.responseQuestion(message.author)
        }
        else if (commandIs('start')) {
            var user = message.author
            var nickname
            var matchUid = message.content.match(/\/start\s+(\S+)/)
            if (matchUid && matchUid[1]) nickname = matchUid[1]
            else nickname = user.username

            var apiName = this.userToApiName(user)
            return this.backendConnector.regist({
                name: apiName,
                nickname,
                platform: this.platform
            }).catch((registError) => {
                var message = registError.message || String(registError)
                return user.send(message)
                    .then(() => this.backendConnector.getStatus(apiName))
            }).then(
                (userJson) => user.send(
                    this.richifyStatus(userJson)
                )
            ).then(
                () => message.reply('quiz already start in your private chat')
            ).then(
                () => this.responseQuestion(user)
            )
        }
        else if (commandIs('status')) {
            return this.backendConnector
                .getStatus(this.userToApiName(message.author))
                .then((user) => {
                    return message.channel.send(this.richifyStatus(user))
                }).catch((userError) => {
                    return message.reply(userError.message)
                })
        }
        else {
            return Promise.reject(new Error('no this command  TT'))
        }
    }
    richifyStatus(user) {
        var responseBase = this.responseBase
        var rich = new Discord.MessageEmbed({
            title: 'status',
            description: `${user.nickname} quiz status`
        })
        rich.setColor(responseBase.command.color)

        rich.addField('暱稱', user.nickname)
        rich.addField('id', user.name)
        rich.addField('平台', user.platform)
        rich.addField('分數', user.score)
        rich.addField('名次', user.rank)
        rich.addField('剩餘題數', user.last)
        return rich
    }
    stringToColor(string) {
        const hash = crypto.createHash('sha256')
        hash.update(string)
        const buffer = hash.digest()
        return Array.from(buffer.slice(0, 3))
    }
    responseQuestion(user) {
        var isAnswer = (reaction) => { // TODO move to static method
            var emoji = reaction.emoji
            var number = this.responseBase.emoji.number
            return reaction.count == 2 &&
                number.some((emojiString) => emojiString == emoji.name)
        }
        var apiName = this.userToApiName(user)
        var question
        return this.backendConnector
            .getQuestionFeed(apiName)
            .then((q) => {
                question = q
                var category = question.tags.join(' ') || '其它'
                var rich = new Discord.MessageEmbed({
                    title: category,
                    description: question.description,
                    color: this.stringToColor(category)
                    // author: question.author
                })
                
                var numberToEmoji =
                    (number) => this.responseBase.emoji.number[number]
                var empty = '\u200B'
                question.options.forEach(
                    (text, index) => rich.addField(
                        empty,
                        `${numberToEmoji(index)} ${text}`
                    )
                )
                if (question.hint) {
                    rich.addField('提示', `||${question.hint}||`)
                }

                return user.send(rich)
            }).then((message) => {
                var number = this.responseBase.emoji.number
                var reaction = Promise.resolve(true)
                for (let i=0; i<=3; i++) {
                    reaction = reaction.then(
                        () => message.react(number[i])
                    )
                }
                return reaction.then(() => message)
            }).then((message) => message.awaitReactions(
                isAnswer,
                {max: 1}
            )).then((reactionCollection) => {
                var emoji = reactionCollection.first().emoji
                var answer = this.responseBase.emoji.number.indexOf(emoji.name)
                return this.answerQuestion(answer, user, question)
            }).then(() => sleep(1000))
            .then(() => this.responseQuestion(user))
            .catch((questionError) => {
                user.send(questionError.message)
            })
    }
}

exports.MyClient = MyClient
exports.Discord = Discord
exports.BackendConnector = BackendConnector
exports.run = function (apiUrl, token, responseDatabase) {
    var backendConnector = new this.BackendConnector(apiUrl)
    var myClient = new this.MyClient(token, backendConnector, responseDatabase)
    return myClient
}
exports.runArgvFile = function () {
    const fs = require('fs')
    const process = require('process')
    const [apiFile, tokenFile, responseDatabaseFile] = process.argv.slice(2)
    const apiUrl = fs.readFileSync(apiFile, 'utf8').trim()
    const token = fs.readFileSync(tokenFile, 'utf8').trim()
    const responseDatabase =
          JSON.parse(fs.readFileSync(responseDatabaseFile, 'utf8'))

    return this.run(apiUrl, token, responseDatabase)
}

if (require.main == module) {
    exports.runArgvFile()
}
