
// var Discord = require('discord.js')
// var https = require('https')
var Discord, https

function sleep(minisecond) {
    return new Promise((wakeup) => {
        setTimeout(wakeup, minisecond)
    })
}

class BackendConnector {
    constructor(apiUrl) {
        this.apiUrl = apiUrl
        this.userMap = {}
    }
    alias(discordUid, customUid) {
        this.userMap[discordUid] = customUid
    }
    request(method, path, json) {
        return new Promise((routeResponse, routeError) => {
            var request = https.request(
                `${this.apiUrl}/${path}`,
                {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'discord QA bot (node.js)'
                    }
                },
                (response) => {
                    var responseData = ''
                    response.on('data', (segment) => responseData += segment)
                    response.on('end', () => {
                        var json = JSON.parse(responseData)
                        if (response.statusCode == 200) {
                            routeResponse(json)
                        }
                        else routeError(json)
                    })
                }
            )
            if (json) request.write(JSON.stringify(json))
            request.end()
        })
    }
    regist(user) {
        if (this.userMap[user.user]) user.user = this.userMap[user.user]
        return this.request('POST', 'players', user)
    }
    getQuestion(uid) {
        var backendId
        if (this.userMap[uid]) backendId = this.userMap[uid]
        else backendId = uid
        return this.request('GET', `/question.json?user=${backendId}`)
    }
    getStatus(uid) {
        if (this.userMap[uid] != undefined) uid = this.userMap[uid]
        return this.request('GET', `/user.json?user=${uid}`)
    }
    answerQuestion(answer) {
        if (this.userMap[answer.user] != undefined) {
            answer.user = this.userMap[answer.user]
        }
        return this.request('POST', '/answer.json', answer)
    }
}

class MyClient {
    constructor(token, backendConnector, responseBase) {
        var client = new Discord.Client()
        this.client = client
        this.backendConnector = backendConnector
        this.responseBase = responseBase
        
        var promiseClient = new Promise((afterLogin) => {
            client.on('ready', afterLogin)
        })

        client.on('message', (message) => {
            if (this.isSelf(message)) return false
            else if (this.isMention(message) || message.channel.type == 'dm') {
                if (message.content.match(/\/\w+/)) {
                    return this.routeCommand(message)
                        .catch((commandError) => {
                            return message.reply(commandError.message)
                        })
                }
                else {
                    return message.channel.awaitMessages(
                        (newMessage) => !this.isSelf(newMessage),
                        {maxMatches: 1}
                    ).then((collector) => {
                        return collector.first().reply(message.content)
                    })
                }
            }
            else return false
        })

        this.then = promiseClient.then.bind(promiseClient)
        client.login(token)
    }
    userToApiName(user) {
        return `${user.username}#${user.id}@discord`
    }
    isMention(message) {
        return message.mentions.has(this.client.user)
    }
    isSelf(message) {
        return message.author.id == this.client.user.id
    }
    answerQuestion(answer, user, questionId) {
        var backendConnector = this.backendConnector
        var apiName = this.userToApiName(user)
        return backendConnector.answerQuestion({
            user: apiName,
            answer: answer,
            id: questionId
        }).then((correct) => {
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
            var rich = new Discord.RichEmbed(responseBase.command.help)
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
            var apiName = this.userToApiName(user)
            return this.backendConnector.regist({
                name: apiName
            }).catch((registError) => user
                .send(registError.message)
                .then(() => this.backendConnector.getStatus(apiName))
            ).then(
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
                .getStatus(message.author.id)
                .then((user) => message.channel.send(
                    this.richifyStatus(user)
                )).catch((userError) => {
                    message.reply(userError.message)
                })
        }
        else {
            return Promise.reject(new Error('no this command  TT'))
        }
    }
    richifyStatus(user) {
        var responseBase = this.responseBase
        var rich = new Discord.RichEmbed({
            title: 'status',
            description: `${user.nickname} quiz status`
        })
        rich.setColor(responseBase.command.color)

        var remainder =
            user.questionStatus.reduce((s, c) => c == 0 ? s+1 : s, 0)
        rich.addField('nickname', user.nickname)
        rich.addField('id', user.name)
        rich.addField('platform', user.platform)
        rich.addField('point', user.point)
        rich.addField('order', `${user.order} / ${user.total}`)
        rich.addField('remainder', remainder)
        return rich
    }
    responseQuestion(user) {
        var isAnswer = (reaction) => { // TODO move to static method
            var emoji = reaction.emoji
            var number = this.responseBase.emoji.number
            return reaction.count == 2 &&
                number.some((emojiString) => emojiString == emoji.name)
        }
        var apiName = this.userToApiName(user)
        var questionId
        return this.backendConnector
            .getQuestion(apiName)
            .then((question) => {
                questionId = question.id // pass question id to answer
                var rich = new Discord.MessageEmbed({
                    title: question.category || 'CCNS',
                    description: question.question,
                    color: 'RANDOM',
                    author: question.author // TODO map category to color
                })
                if (question.hint) rich.setFooter(question.hint)
                
                var numberToEmoji =
                    (number) => this.responseBase.emoji.number[number]
                var empty = '\u200B'
                question.option.forEach(
                    (text, index) => rich.addField(
                        empty,
                        `${numberToEmoji(index)} ${text}`
                    )
                )
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
                return this.answerQuestion(answer, user, questionId)
            }).catch((questionError) => {
                user.send(questionError.message)
            }).then(() => sleep(1000))
            .then(() => this.responseQuestion(user))
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
    const apiUrl = fs.readFileSync(apiFile, 'utf8')
    const token = fs.readFileSync(tokenFile, 'utf8')
    const responseDatabase = require(responseDatabaseFile)
    return this.run(apiUrl, token, responseDatabase)
}

if (require.main == module) {
    exports.runArgvFile()
}
