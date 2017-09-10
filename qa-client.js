
var Discord = require('discord.js')
var http = require('http')

var backendConnector = {
    host: 'quizbe-locoescp.rhcloud.com',
    request: function (method, path, json) {
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
    },
    regist: function (user) {
        return this.request('POST', '/user.json', user)
    },
    getQuestion: function (uid) {
        return this.request('GET', '/question.json?user=' + uid)
            .then((question) => {
                this.userPrevQuestion[uid] = question.id
                return question
            })
    },
    answerQuestion: function (answer) {
        return this.request('POST', '/answer.json', answer)
    },
    userPrevQuestion: {}
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
            var uid = message.author.id
            console.log('%s: "%s"', message.author.username, message.content)
            if (uid == this.client.user.id) ;
            else if (message.content.match('/')) this.routeCommand(message)
            else {
                this.answerQuestion(message)
                    .then(() => this.responseQuestion(message))
            }
        })

        this.then = promiseClient.then.bind(promiseClient)
        client.login(token)
    }
    answerQuestion(message) {
        var backendConnector = this.backendConnector
        var uid = message.author.id
        return backendConnector.answerQuestion({
            user: uid,
            id: backendConnector.userPrevQuestion[uid],
            answer: message.content.charAt(0)
        }).then((correct) => {
            message.reply(correct)
        })
    }
    routeCommand(message) {
        if (message.content.match('start')) {
            var user = message.author
            backendConnector.regist({
                user: user.id,
                nickname: user.username,
                platform: 'discord'
            }).then(
                () => this.responseQuestion(message)
            ).catch(error => {
                console.error(error)
            })
        }
    }
    responseQuestion(message) {
        this.backendConnector
            .getQuestion(message.author.id)
            .then((question) => {
                message.reply(question.question)
                message.reply(
                    question.option.map(
                        (text, index) => index + '. ' + text
                    ).join('\n')
                )
            })
    }
}

exports.MyClient = MyClient
exports.Discord = Discord
exports.backendConnector = backendConnector
