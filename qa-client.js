
var Discord = require('discord.js')
var http = require('http')

function sleep(minisecond) {
    return new Promise((wakeup) => {
        setTimeout(wakeup, minisecond)
    })
}

class BackendConnector {
    constructor(host, port) {
        this.host = host
        this.port = port
        this.userPrevQuestion = {}
        this.userMap = {}
    }
    alias(discordUid, customUid) {
        this.userMap[discordUid] = customUid
    }
    request(method, path, json) {
        return new Promise((routeResponse, routeError) => {
            var request = http.request(
                {
                    host: this.host,
                    port: this.port,
                    method: method,
                    path: path,
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
        return this.request('POST', '/user.json', user)
    }
    getQuestion(uid) {
        var backendId
        if (this.userMap[uid]) backendId = this.userMap[uid]
        else backendId = uid
        return this.request('GET', `/question.json?user=${backendId}`)
            .then((question) => {
                this.userPrevQuestion[uid] = question.id
                return question
            })
    }
    getStatus(uid) {
        if (this.userMap[uid] != undefined) uid = this.userMap[uid]
        return this.request('GET', `/user.json?user=${uid}`)
    }
    answerQuestion(answer) {
        var prevQuestion = this.userPrevQuestion[answer.user]
        if (prevQuestion == undefined) {
            return Promise.reject(
                new Error('you have no question to answer now')
            )
        }
        else {
            if (!answer.id) answer.id = prevQuestion
            if (this.userMap[answer.user] != undefined) {
                answer.user = this.userMap[answer.user]
            }
            return this.request('POST', '/answer.json', answer)
        }
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
            if (this.isSelf(message)) ;
            else if (this.isMention(message)) {
                this.routeCommand(message)
            }
            else if (message.channel.type == 'dm') {
                this.routeCommand(message)
            }
        })

        this.then = promiseClient.then.bind(promiseClient)
        client.login(token)
    }
    isMention(message) {
        return message.mentions.users.has(this.client.user.id)
    }
    isSelf(message) {
        return message.author.id == this.client.user.id
    }
    isAnswer(message) {
        return /^[0-3A-Da-d]/.test(message.content)
    }
    answerQuestion(answer, user) {
        var backendConnector = this.backendConnector
        return backendConnector.answerQuestion({
            user: user.id,
            answer: answer
        }).then((correct) => {
            function responseCorrect(emoji, responseBase) {
                var i = Math.floor(responseBase.length * Math.random())
                return user.send(`${emoji} ${responseBase[i]}`)
            }
            var base = this.responseBase
            return correct ?
                responseCorrect(base.emoji.right, base.right) :
                responseCorrect(base.emoji.wrong, base.wrong)
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
        else if (commandIs('start')) {
            var user = message.author
            var matchUid = message.content.match(/\/start\s+(\S+)/)
            if (matchUid && matchUid[1]) {
                this.backendConnector.alias(user.id, matchUid[1])
            }
            return this.backendConnector.regist({
                user: user.id,
                nickname: user.username,
                platform: 'discord'
            }).catch((registError) => message
                .reply(registError.message)
                .then(() => this.backendConnector.getStatus(user.id))
            ).then(
                (userJson) => user.send(
                    this.richifyStatus(userJson)
                )
            ).then(
                () => this.responseQuestion(user)
            ).then(
                () => message.reply('quiz already start in your private chat')
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
        var isAnswer = (reaction) => {
            var emoji = reaction.emoji
            var number = this.responseBase.emoji.number
            return reaction.count == 2 &&
                number.some((emojiString) => emojiString == emoji.name)
        }
        return this.backendConnector
            .getQuestion(user.id)
            .then((question) => {
                var rich = new Discord.RichEmbed({
                    title: question.category || 'CCNS',
                    description: question.question
                })
                rich.setColor('RANDOM')
                rich.setAuthor(question.author)
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
                return this.answerQuestion(answer, user)
            }).catch((questionError) => {
                user.send(questionError.message)
            }).then(() => sleep(1000))
            .then(() => this.responseQuestion(user))
    }
}

exports.MyClient = MyClient
exports.Discord = Discord
exports.BackendConnector = BackendConnector
exports.run = function (host, port, token, responseDatabase) {
    var backendConnector = new this.BackendConnector(host, port)
    var myClient = new this.MyClient(token, backendConnector, responseDatabase)
    return myClient
}
