
var Discord = require('discord.js')
var http = require('http')

function sleep(minisecond) {
    return new Promise((wakeup) => {
        setTimeout(wakeup, minisecond)
    })
}

class BackendConnector {
    constructor(host) {
        this.host = host
        this.userPrevQuestion = {}
    }
    request(method, path, json) {
        return new Promise((routeResponse, routeError) => {
            var request = http.request({
                host: this.host,
                method: method,
                path: path,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'discord QA bot (node.js)'
                }
            }, (response) => {
                var responseData = ''
                response.on('data', (segment) => responseData += segment)
                response.on('end', () => {
                    var json = JSON.parse(responseData)
                    if (response.statusCode == 200) {
                        routeResponse(json)
                    }
                    else routeError(json)
                })
            })
            if (json) request.write(JSON.stringify(json))
            request.end()
        })
    }
    regist(user) {
        return this.request('POST', '/user.json', user)
    }
    getQuestion(uid) {
        return this.request('GET', `/question.json?user=${uid}`)
            .then((question) => {
                this.userPrevQuestion[uid] = question.id
                return question
            })
    }
    getStatus(uid) {
        return this.request('GET', `/user.json?user=${uid}`)
    }
    answerQuestion(answer) {
        var prevQuestion = this.userPrevQuestion[answer.user]
        if (!prevQuestion) {
            return Promise.reject(
                new Error('you have no question to answer now')
            )
        }
        else {
            if (!answer.id) answer.id = prevQuestion
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
                if (this.isAnswer(message)) {
                    this.answerQuestion(message)
                        .then(() => sleep(1000))
                        .then(() => this.responseQuestion(message.author))
                        .catch((answerError) =>
                            message.reply(answerError.message)
                        )
                }
                else this.routeCommand(message)
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
        var answer = Number(message.content.charAt(0))
        return answer >= 0 && answer <= 3
    }
    answerQuestion(message) {
        var backendConnector = this.backendConnector
        var user = message.author
        return backendConnector.answerQuestion({
            user: user.id,
            answer: message.content.charAt(0)
        }).then((correct) => {
            function responseCorrect(emoji, responseBase) {
                var i = Math.floor(responseBase.length * Math.random())
                return Promise.all([
                    message.react(emoji),
                    message.reply(responseBase[i])
                ])
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
            return this.backendConnector.regist({
                user: user.id,
                nickname: user.username,
                platform: 'discord'
            }).catch(
                (registError) => message.reply(registError.message)
            ).then(
                () => this.responseQuestion(user)
            ).then(
                () => message.reply('quiz already start in your private chat')
            )
        }
        else if (commandIs('status')) {
            return this.backendConnector
                .getStatus(message.author.id)
                .then((user) => {
                    var rich = new Discord.RichEmbed({
                        title: `status`,
                        description: `${user.nickname} quiz status`
                    })
                    rich.setColor(responseBase.command.color)

                    var remainder = user.questionStatus
                        .reduce((s, c) => c == 0 ? s+1 : s, 0)
                    rich.addField('point', user.point)
                    rich.addField('order', `${user.order} / ${user.total}`)
                    rich.addField('remainder', remainder)
                        
                    message.channel.send(rich)
                }).catch((userError) => {
                    message.reply(userError.message)
                })
        }
        else {
            return Promise.reject(new Error('no this command  QQ'))
        }
    }
    responseQuestion(user) {
        this.backendConnector
            .getQuestion(user.id)
            .then((question) => {
                var rich = new Discord.RichEmbed({
                    title: 'Q ' + question.id,
                    description: question.question
                })
                rich.setColor('RANDOM')
                var inline = true
                question.option.forEach(
                    (text, index) => rich.addField(index, text, inline)
                )
                return user.send(rich)
            }).catch((questionError) => {
                this.sendError(questionError.message)
            })
    }
}

exports.MyClient = MyClient
exports.Discord = Discord
exports.BackendConnector = BackendConnector
exports.run = function (host, token, responseDatabase) {
    var backendConnector = new this.BackendConnector(host)
    var myClient = new this.MyClient(token, backendConnector, responseDatabase)
    return myClient
}
