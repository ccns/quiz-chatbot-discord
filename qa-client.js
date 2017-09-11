
var Discord = require('discord.js')
var http = require('http')

class BackendConnector {
    constructor(host) {
        this.host = host
        this.userPrevQuestion = {}
    }
    request(method, path, json) {
        return new Promise((routeResponse) => {
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
                response.on('end',
                    () => routeResponse(JSON.parse(responseData))
                )
            })
            if (json) request.write(JSON.stringify(json))
            request.end()
        })
    }
    regist(user) {
        return this.request('POST', '/user.json', user)
    }
    getQuestion(uid) {
        return this.request('GET', '/question.json?user=' + uid)
            .then((question) => {
                this.userPrevQuestion[uid] = question.id
                return question
            })
    }
    answerQuestion(answer) {
        return this.request('POST', '/answer.json', answer)
    }
}

class MyClient {
    constructor(token, backendConnector) {
        var client = new Discord.Client()
        this.client = client
        this.backendConnector = backendConnector
        
        var promiseClient = new Promise((afterLogin) => {
            client.on('ready', afterLogin)
        })

        client.on('message', (message) => {
            console.log('%s: "%s"', message.author.username, message.content)
            if (this.isSelf(message)) ;
            else if (this.isMention(message)) {
                this.routeCommand(message)
            }
            else if (message.channel.type == 'dm') {
                if (this.isAnswer(message)) {
                    this.answerQuestion(message)
                        .then(() => this.responseQuestion(message.author))
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
        var answer = Number(message)
        return answer >= 0 && answer <= 3
    }
    answerQuestion(message) {
        var backendConnector = this.backendConnector
        var user = message.author
        return backendConnector.answerQuestion({
            user: user.id,
            id: backendConnector.userPrevQuestion[user.id],
            answer: message.content.charAt(0)
        }).then((correct) => {
            if (correct) message.react('👍')
            else message.react('👎')
        })
    }
    routeCommand(message) {
        if (message.content.match('/start')) {
            var user = message.author
            this.backendConnector.regist({
                user: user.id,
                nickname: user.username,
                platform: 'discord'
            }).then(
                () => this.responseQuestion(user)
            ).catch(error => {
                console.error(error)
            })
        }
    }
    responseQuestion(user) {
        this.backendConnector
            .getQuestion(user.id)
            .then((question) => {
                user.send(question.question)
                user.send(
                    question.option.map(
                        (text, index) => index + '. ' + text
                    ).join('\n')
                )
            })
    }
}

exports.MyClient = MyClient
exports.Discord = Discord
exports.BackendConnector = BackendConnector
exports.run = function (host, token) {
    var backendConnector = new this.BackendConnector(host)
    var myClient = new this.MyClient(token, backendConnector)
    return myClient
}
